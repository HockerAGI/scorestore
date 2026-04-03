// api/create_checkout.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  normalizeQty,
  itemsQtyFromAny,
  getBaseUrl,
  readJsonFile,
  validateZip,
  isUuid,
  safeStr,
  getEnviaQuote,
  getFallbackShipping,
  initStripe,
  makeCheckoutIdempotencyKey,
  resolveScoreOrgId,
  readPublicSiteSettings,
  sendTelegram,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
} = require("./_shared");

const DEFAULT_CURRENCY = "MXN";
const MAX_ITEMS = 120;
const MAX_QTY_PER_ITEM = 99;
const { rateLimit } = require("./_rate_limit");
const { checkIdempotency, saveIdempotency } = require("./_idempotency");

function send(res, payload) {
  res.statusCode = payload.statusCode || 200;
  for (const [key, value] of Object.entries(payload.headers || {})) {
    res.setHeader(key, value);
  }
  res.end(payload.body || "");
}

function getOrigin(req) {
  return (
    req?.headers?.origin ||
    req?.headers?.Origin ||
    ""
  );
}

function getBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === "object") return body;

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return {};
}

function clampInt(v, min, max, fallback = min) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function moneyToCents(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(n));
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizePhone(v) {
  return String(v || "").replace(/[^\d+]/g, "").trim();
}

function normalizeCountry(v) {
  return String(v || "MX").trim().toUpperCase() || "MX";
}

function normalizeText(v, fallback = "") {
  const s = typeof v === "string" ? v : v == null ? fallback : String(v);
  return s.trim();
}

function uniq(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean)));
}

function sanitizeItems(rawItems) {
  const items = normalizeQty(rawItems).slice(0, MAX_ITEMS);

  return items
    .map((it) => ({
      sku: normalizeText(it.sku),
      qty: clampInt(it.qty, 1, MAX_QTY_PER_ITEM, 1),
      size: normalizeText(it.size),
      priceCents: clampInt(it.priceCents, 0, 100000000, 0),
      title: normalizeText(it.title),
    }))
    .filter((it) => it.sku || it.title);
}

function itemsSummary(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((it) => {
      const qty = clampInt(it.qty, 1, MAX_QTY_PER_ITEM, 1);
      const base = it.title || it.sku || "Producto";
      const size = it.size ? ` [${it.size}]` : "";
      return `${qty}x ${base}${size}`;
    })
    .join(" | ")
    .slice(0, 500);
}

function readPromos() {
  const file = readJsonFile("data/promos.json");
  if (!file) return { rules: [] };
  if (Array.isArray(file?.rules)) return file;
  if (Array.isArray(file)) return { rules: file };
  return { rules: [] };
}

function resolvePromoVerdict({ promoCode, subtotalCents, itemsCount }) {
  const code = normalizeText(promoCode).toUpperCase();
  if (!code) {
    return {
      applied: false,
      discount_cents: 0,
      promo: null,
    };
  }

  const promos = readPromos();
  const now = new Date();

  const rule = (promos.rules || []).find((r) => {
    const active = r?.active !== false;
    const matches = normalizeText(r?.code).toUpperCase() === code;
    if (!active || !matches) return false;

    if (r?.expires_at) {
      const exp = new Date(r.expires_at);
      if (!Number.isNaN(exp.getTime()) && exp < now) return false;
    }

    const minAmount = Number(r?.min_amount_mxn || 0);
    if (Number.isFinite(minAmount) && minAmount > 0) {
      if ((subtotalCents / 100) < minAmount) return false;
    }

    return true;
  });

  if (!rule) {
    return {
      applied: false,
      discount_cents: 0,
      promo: null,
    };
  }

  let discountCents = 0;

  if (rule.type === "percent") {
    const pct = Number(rule.value || 0);
    if (Number.isFinite(pct) && pct > 0) {
      discountCents = Math.round(subtotalCents * pct);
    }
  } else if (rule.type === "fixed_mxn") {
    discountCents = Math.round(Number(rule.value || 0) * 100);
  }

  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  return {
    applied: discountCents > 0,
    discount_cents: discountCents,
    promo: {
      code: rule.code || code,
      type: rule.type || "fixed_mxn",
      value: rule.value || 0,
      description: rule.description || "",
      itemsCount,
    },
  };
}

async function lookupProducts(sb, orgId, items) {
  const skus = uniq(
    items
      .map((it) => normalizeText(it.sku))
      .filter(Boolean)
  );

  if (!skus.length) return new Map();

  const { data, error } = await sb
    .from("products")
    .select(
      [
        "id",
        "name",
        "sku",
        "price_cents",
        "price_mxn",
        "stock",
        "active",
        "is_active",
        "deleted_at",
        "org_id",
        "organization_id",
      ].join(", ")
    )
    .in("sku", skus)
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`);

  if (error) throw error;

  const map = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const sku = normalizeText(row?.sku).toUpperCase();
    if (!sku) continue;
    map.set(sku, row);
  }
  return map;
}

function resolveItemPriceCents(item, productRow) {
  const fromProduct =
    Number(productRow?.price_cents) ||
    Math.round(Number(productRow?.price_mxn || 0) * 100) ||
    0;

  const fromItem =
    Number(item?.priceCents) ||
    Math.round(Number(item?.price_cents || 0)) ||
    0;

  return Math.max(0, fromProduct || fromItem || 0);
}

function buildLineItems(items, productMap) {
  const lineItems = [];

  for (const item of items) {
    const sku = normalizeText(item.sku).toUpperCase();
    const product = sku ? productMap.get(sku) : null;
    const qty = clampInt(item.qty, 1, MAX_QTY_PER_ITEM, 1);
    const priceCents = resolveItemPriceCents(item, product);

    const title =
      normalizeText(product?.name) ||
      normalizeText(item.title) ||
      normalizeText(item.sku) ||
      "Producto";

    if (!priceCents) continue;

    lineItems.push({
      quantity: qty,
      price_data: {
        currency: "mxn",
        product_data: {
          name: title.slice(0, 120),
          metadata: {
            sku: sku || normalizeText(item.sku),
            size: normalizeText(item.size),
          },
        },
        unit_amount: priceCents,
      },
    });
  }

  return lineItems;
}

function buildShippingLineItem(shippingCents) {
  const cents = Math.max(0, Math.round(Number(shippingCents || 0)));
  if (!cents) return null;

  return {
    quantity: 1,
    price_data: {
      currency: "mxn",
      product_data: {
        name: "Envío",
        metadata: {
          kind: "shipping",
        },
      },
      unit_amount: cents,
    },
  };
}

function getCheckoutBaseUrl(req) {
  try {
    return getBaseUrl(req);
  } catch {
    return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://scorestore.vercel.app";
  }
}

function normalizeCustomer(body = {}, site = {}) {
  const contact = site?.contact || {};
  return {
    name:
      normalizeText(body?.customer?.name) ||
      normalizeText(body?.name) ||
      "Cliente Final",
    email:
      normalizeEmail(body?.customer?.email) ||
      normalizeEmail(body?.email) ||
      normalizeEmail(contact?.email) ||
      normalizeEmail(SUPPORT_EMAIL) ||
      "cliente@scorestore.com",
    phone:
      normalizePhone(body?.customer?.phone) ||
      normalizePhone(body?.phone) ||
      normalizePhone(contact?.phone) ||
      "",
  };
}

function normalizeShipping(body = {}, site = {}) {
  const shipping = body?.shipping && typeof body.shipping === "object" ? body.shipping : body;

  return {
    mode: normalizeText(shipping?.mode || body?.shipping_mode || "delivery").toLowerCase(),
    country: normalizeCountry(shipping?.country || body?.shipping_country || "MX"),
    postal: normalizeText(shipping?.postal || shipping?.postal_code || body?.shipping_postal_code || ""),
    city: normalizeText(shipping?.city || ""),
    state: normalizeText(shipping?.state || ""),
    quote: shipping?.quote || null,
  };
}

async function resolveShippingQuote({ shipping, itemsQty }) {
  if (shipping.mode === "pickup") {
    return {
      ok: true,
      provider: "pickup",
      label: "Recoger en tienda",
      country: shipping.country,
      amount_cents: 0,
      amount_mxn: 0,
      raw: null,
    };
  }

  if (shipping.postal) {
    const validated = validateZip(shipping.postal, shipping.country);
    if (!validated) {
      throw new Error("CP / ZIP inválido para cotización de envío.");
    }
    shipping.postal = validated;
  }

  try {
    const quote = await getEnviaQuote({
      zip: shipping.postal,
      country: shipping.country,
      items_qty: itemsQty,
    });

    return quote;
  } catch (e) {
    const fallback = getFallbackShipping(shipping.country, itemsQty);
    return {
      ...fallback,
      warning: String(e?.message || e || "Cotización de envío no disponible"),
    };
  }
}

async function createStripeSession({
  stripe,
  baseUrl,
  customer,
  shipping,
  lineItems,
  orderMeta,
  totalCents,
}) {
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      currency: DEFAULT_CURRENCY.toLowerCase(),
      customer_email: customer.email,
      line_items: lineItems,
      shipping_address_collection:
        shipping.mode === "pickup"
          ? undefined
          : {
              allowed_countries: shipping.country === "US" ? ["US"] : ["MX", "US"],
            },
      phone_number_collection: {
        enabled: true,
      },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        ...orderMeta,
        total_cents: String(totalCents),
        currency: DEFAULT_CURRENCY,
      },
      payment_intent_data: {
        metadata: {
          ...orderMeta,
          total_cents: String(totalCents),
          currency: DEFAULT_CURRENCY,
        },
      },
    },
    {
      idempotencyKey: orderMeta.idempotency_key,
    }
  );

  return session;
}

async function insertOrder(sb, row) {
  const { error } = await sb.from("orders").insert([row]);
  if (error) throw error;
}

async function main(req, res) {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      const response = handleOptions({ headers: req.headers });
      send(res, response);
      return;
    }

    if (req.method !== "POST") {
      send(
        res,
        jsonResponse(405, { ok: false, error: "Method not allowed" }, origin)
      );
      return;
    }

    const body = getBody(req);
    const sb = supabaseAdmin();
    const stripe = initStripe();

    const baseUrl = getCheckoutBaseUrl(req);
    const site = await readPublicSiteSettings().catch(() => null);

    const orgId = await resolveScoreOrgId(sb, body?.org_id || body?.organization_id || body?.orgId || "");
    if (!isUuid(orgId)) {
      throw new Error("No se pudo resolver la organización activa.");
    }

    const rawItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.cart)
        ? body.cart
        : [];
    const items = sanitizeItems(rawItems);

    if (!items.length) {
      throw new Error("El carrito está vacío.");
    }

    const customer = normalizeCustomer(body, site);
    if (!customer.email || !customer.email.includes("@")) {
      throw new Error("Correo del cliente inválido.");
    }

    const shipping = normalizeShipping(body, site);
    const itemsQty = itemsQtyFromAny(items);
    const productMap = await lookupProducts(sb, orgId, items).catch(() => new Map());

    const subtotalCents = items.reduce((sum, item) => {
      const sku = normalizeText(item.sku).toUpperCase();
      const product = sku ? productMap.get(sku) : null;
      const priceCents = resolveItemPriceCents(item, product);
      return sum + priceCents * clampInt(item.qty, 1, MAX_QTY_PER_ITEM, 1);
    }, 0);

    if (subtotalCents <= 0) {
      throw new Error("No fue posible calcular el subtotal del carrito.");
    }

    const promoVerdict = resolvePromoVerdict({
      promoCode: body?.promo_code || body?.promoCode || body?.coupon || "",
      subtotalCents,
      itemsCount: items.length,
    });

    const shippingQuote = await resolveShippingQuote({
      shipping,
      itemsQty,
    });

    const shippingCents = moneyToCents(shippingQuote.amount_cents || 0);
    const discountCents = moneyToCents(promoVerdict.discount_cents || 0);
    const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

    const metadata = {
      org_id: orgId,
      organization_id: orgId,
      customer_email: customer.email,
      customer_phone: customer.phone || "",
      shipping_mode: shipping.mode,
      shipping_country: shipping.country,
      shipping_postal_code: shipping.postal || "",
      items_summary: itemsSummary(items),
      promo_code: normalizeText(promoVerdict?.promo?.code || body?.promo_code || body?.promoCode || "").toUpperCase(),
    };

    const lineItems = buildLineItems(items, productMap);
    const shippingLine = buildShippingLineItem(shippingCents);
    if (shippingLine) lineItems.push(shippingLine);

    if (!lineItems.length) {
      throw new Error("No se pudieron construir los productos del checkout.");
    }

    const idempotencyKey = makeCheckoutIdempotencyKey(
      {
        orgId,
        customer: customer.email,
        items,
        shipping,
        promo: promoVerdict?.promo?.code || "",
        subtotalCents,
        discountCents,
        shippingCents,
        totalCents,
      },
      body?.request_id || body?.requestId || req.headers["x-request-id"] || ""
    );

    const session = await createStripeSession({
      stripe,
      baseUrl,
      customer,
      shipping,
      lineItems,
      orderMeta: {
        ...metadata,
        idempotency_key: idempotencyKey,
      },
      totalCents,
    });

    const row = {
      stripe_session_id: session.id,
      checkout_session_id: session.id,
      status: session.status || "open",
      payment_status: session.payment_status || "unpaid",
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      shipping_mode: shipping.mode,
      shipping_country: shipping.country,
      shipping_postal_code: shipping.postal,
      subtotal_cents: subtotalCents,
      amount_subtotal_cents: subtotalCents,
      discount_cents: promoVerdict.discount_cents || 0,
      amount_discount_cents: promoVerdict.discount_cents || 0,
      shipping_cents: shippingCents,
      amount_shipping_cents: shippingCents,
      total_cents: totalCents,
      amount_total_cents: totalCents,
      amount_subtotal_mxn: subtotalCents / 100,
      amount_discount_mxn: (promoVerdict.discount_cents || 0) / 100,
      amount_shipping_mxn: shippingCents / 100,
      amount_total_mxn: totalCents / 100,
      currency: "MXN",
      promo_code: promoVerdict.promo?.code || "",
      items_summary: metadata.items_summary,
      items: items,
      items_json: items,
      customer_details: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      shipping_details: {
        mode: shipping.mode,
        country: shipping.country,
        postal: shipping.postal,
        quote: shippingQuote || null,
      },
      metadata,
      org_id: orgId,
      organization_id: orgId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await insertOrder(sb, row);
    } catch (e) {
      console.error("[create_checkout] order insert failed:", e?.message || e);
    }

    if (typeof sendTelegram === "function") {
      try {
        await sendTelegram(
          [
            "🛒 <b>Nuevo checkout creado</b>",
            `Cliente: ${customer.name}`,
            `Email: ${customer.email}`,
            `Total: $${(totalCents / 100).toFixed(2)} MXN`,
            `Pago: ${String(body?.payment_method || body?.paymentMethod || "stripe").toUpperCase()}`,
            `Sesión: ${session.id}`,
          ].join("\n")
        );
      } catch {}
    }

    send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          url: session.url,
          checkout_url: session.url,
          session_id: session.id,
          id: session.id,
          payment_status: session.payment_status || "unpaid",
          status: session.status || "open",
          currency: "MXN",
          subtotal_cents: subtotalCents,
          discount_cents: promoVerdict.discount_cents || 0,
          shipping_cents: shippingCents,
          total_cents: totalCents,
          customer_email: customer.email,
          shipping_mode: shipping.mode,
          shipping_country: shipping.country,
          shipping_postal_code: shipping.postal || "",
          promo_code: promoVerdict.promo?.code || "",
          items_summary: metadata.items_summary,
        },
        origin
      )
    );
  } catch (err) {
    send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: err?.message || "No fue posible crear el checkout.",
        },
        origin
      )
    );
  }
}

module.exports = main;
module.exports.default = main;