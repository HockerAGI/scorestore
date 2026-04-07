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
  safeStr,
  getEnviaQuote,
  getFallbackShipping,
  initStripe,
  makeCheckoutIdempotencyKey,
  resolveScoreOrgId,
  sendTelegram,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
} = require("./_shared");

const { rateLimit } = require("./_rate_limit");
const { checkIdempotency, saveIdempotency } = require("../idempotency");

const DEFAULT_CURRENCY = "MXN";
const MAX_ITEMS = 120;
const MAX_QTY_PER_ITEM = 99;
const DEFAULT_SUCCESS_PATH = "/success.html";
const DEFAULT_CANCEL_PATH = "/cancel.html";

function send(res, payload) {
  res.statusCode = payload.statusCode || 200;
  for (const [key, value] of Object.entries(payload.headers || {})) {
    res.setHeader(key, value);
  }
  res.end(payload.body || "");
}

function getOrigin(req) {
  return req?.headers?.origin || req?.headers?.Origin || "";
}

function getBody(req) {
  const body = req?.body;
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

function buildItemsSummary(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const qty = clampInt(item.qty, 1, MAX_QTY_PER_ITEM, 1);
      const title = normalizeText(item.title || item.sku || "Producto");
      const size = normalizeText(item.size || "");
      return `${qty}x ${title}${size ? ` [${size}]` : ""}`;
    })
    .join(" · ")
    .slice(0, 500);
}

function readPromos() {
  const raw = readJsonFile("data/promos.json");
  if (!raw) return { store: {}, rules: [] };

  if (Array.isArray(raw)) {
    return { store: {}, rules: raw };
  }

  return {
    store: raw.store || raw.meta || {},
    rules: Array.isArray(raw.rules)
      ? raw.rules
      : Array.isArray(raw.promos)
        ? raw.promos
        : [],
  };
}

function cleanCode(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

function computePromoVerdict(promo, subtotalCents, shippingCents) {
  if (!promo) {
    return {
      valid: false,
      promo: null,
      discount_cents: 0,
      free_shipping: false,
    };
  }

  const now = Date.now();
  const expiresAt = promo.expires_at ? Date.parse(promo.expires_at) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt < now) {
    return {
      valid: false,
      promo: null,
      discount_cents: 0,
      free_shipping: false,
    };
  }

  const minAmountMxn = Number(promo.min_amount_mxn || promo.min_amount || 0);
  const minAmountCents = Number.isFinite(minAmountMxn) ? Math.round(minAmountMxn * 100) : 0;
  if (minAmountCents > 0 && subtotalCents < minAmountCents) {
    return {
      valid: false,
      promo: null,
      discount_cents: 0,
      free_shipping: false,
    };
  }

  const type = cleanCode(promo.type || promo.kind || "");
  const value = Number(promo.value || promo.amount || promo.percent || 0);

  let discountCents = 0;
  let freeShipping = false;

  if (type === "FREE_SHIPPING") {
    freeShipping = true;
    discountCents = 0;
  } else if (type === "PERCENT" || type === "PERCENTAGE" || type === "PCT") {
    const pct = Number.isFinite(value) ? value : 0;
    discountCents = Math.max(0, Math.round((subtotalCents * pct) / 100));
  } else if (type === "FIXED" || type === "AMOUNT" || type === "DISCOUNT") {
    const fixed = Number.isFinite(value) ? value : 0;
    discountCents = Math.max(0, Math.round(fixed * 100));
  } else if (type === "SHIPPING") {
    freeShipping = true;
  }

  discountCents = Math.min(Math.max(0, discountCents), subtotalCents);

  return {
    valid: true,
    promo: {
      code: cleanCode(promo.code),
      type: promo.type || promo.kind || "fixed",
      value: promo.value ?? 0,
      description: promo.description || "",
      min_amount_mxn: promo.min_amount_mxn ?? null,
      expires_at: promo.expires_at ?? null,
    },
    discount_cents: discountCents,
    free_shipping: freeShipping,
    shipping_cents_override: freeShipping ? 0 : Math.max(0, shippingCents),
  };
}

function resolveCustomer(body = {}) {
  const name = normalizeText(
    body.customer_name ||
      body.name ||
      body.full_name ||
      body.checkout_name ||
      ""
  );

  const email = normalizeEmail(
    body.customer_email ||
      body.email ||
      body.checkout_email ||
      ""
  );

  const phone = normalizePhone(
    body.customer_phone ||
      body.phone ||
      body.checkout_phone ||
      ""
  );

  return {
    name: name || "Cliente SCORE",
    email,
    phone: phone || "0000000000",
  };
}

function resolveShipping(body = {}) {
  const shippingCountry = normalizeCountry(
    body.shipping_country || body.country || "MX"
  );

  const shippingZip = normalizeText(
    body.shipping_zip ||
      body.postal_code ||
      body.zip ||
      body.postal ||
      ""
  );

  const validatedZip = validateZip(shippingZip, shippingCountry);
  if (!validatedZip) {
    throw new Error("CP/ZIP inválido");
  }

  return {
    shippingCountry,
    shippingZip: validatedZip,
  };
}

function resolveItems(body = {}) {
  const raw = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.cart)
      ? body.cart
      : [];

  const items = sanitizeItems(raw);

  if (!items.length) {
    throw new Error("El carrito está vacío");
  }

  if (items.length > MAX_ITEMS) {
    throw new Error("Demasiados artículos en el carrito");
  }

  for (const item of items) {
    if (!item.sku && !item.title) {
      throw new Error("Hay artículos inválidos en el carrito");
    }
    if (item.qty < 1) {
      throw new Error("Cantidad inválida en el carrito");
    }
    if (item.qty > MAX_QTY_PER_ITEM) {
      throw new Error("Cantidad por artículo excedida");
    }
  }

  return items;
}

function calcSubtotalCents(items) {
  return items.reduce((sum, item) => {
    const qty = clampInt(item.qty, 1, MAX_QTY_PER_ITEM, 1);
    const unit = clampInt(item.priceCents, 0, 100000000, 0);
    return sum + qty * unit;
  }, 0);
}

function buildLineItems(items) {
  return items.map((item) => ({
    quantity: clampInt(item.qty, 1, MAX_QTY_PER_ITEM, 1),
    price_data: {
      currency: "mxn",
      product_data: {
        name: item.title || item.sku,
        description: item.size ? `Talla: ${item.size}` : undefined,
        metadata: {
          sku: item.sku,
          size: item.size || "",
        },
      },
      unit_amount: clampInt(item.priceCents, 0, 100000000, 0),
    },
  }));
}

function buildMetadata({
  orgId,
  customer,
  shippingCountry,
  shippingZip,
  shippingMode,
  promoVerdict,
  subtotalCents,
  discountCents,
  finalShippingCents,
  totalCents,
  items,
}) {
  return {
    org_id: orgId,
    organization_id: orgId,
    customer_email: customer.email,
    customer_phone: customer.phone,
    shipping_country: shippingCountry,
    shipping_zip: shippingZip,
    shipping_mode: shippingMode,
    promo_code: promoVerdict.promo?.code || "",
    subtotal_cents: String(subtotalCents),
    discount_cents: String(discountCents),
    shipping_cents: String(finalShippingCents),
    total_cents: String(totalCents),
    items_summary: buildItemsSummary(items),
    items_qty: String(itemsQtyFromAny(items)),
  };
}

async function main(req, res) {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers || {} }));
  }

  if (req.method !== "POST") {
    return send(
      res,
      jsonResponse(405, { ok: false, error: "Method not allowed" }, origin)
    );
  }

  const rl = rateLimit(req);
  if (!rl.ok) {
    return send(
      res,
      jsonResponse(
        429,
        {
          ok: false,
          error: "rate_limited",
          retry_after_ms: Math.max(0, rl.resetAt - Date.now()),
        },
        origin
      )
    );
  }

  const body = getBody(req);

  try {
    const customer = resolveCustomer(body);
    if (!customer.email) {
      throw new Error("Correo del cliente requerido");
    }

    if (!/@/.test(customer.email)) {
      throw new Error("Correo inválido");
    }

    const { shippingCountry, shippingZip } = resolveShipping(body);
    const items = resolveItems(body);

    const shippingMode = normalizeText(body.shipping_mode || body.shippingMode || "envia")
      .toLowerCase() || "envia";

    const itemsQty = itemsQtyFromAny(items);
    const subtotalCents = calcSubtotalCents(items);
    const promoCode = cleanCode(body.promo_code || body.promoCode || "");

    const sb = supabaseAdmin();
    const orgId = await resolveScoreOrgId(sb);

    const promos = readPromos();
    const promo =
      promos.rules.find((r) => cleanCode(r.code) === promoCode) ||
      null;

    let shippingQuote = null;
    let finalShippingCents = 0;

    try {
      shippingQuote = await getEnviaQuote({
        zip: shippingZip,
        country: shippingCountry,
        items_qty: itemsQty,
      });
      finalShippingCents = clampInt(shippingQuote.amount_cents, 0, 100000000, 0);
    } catch {
      shippingQuote = getFallbackShipping(shippingCountry, itemsQty);
      finalShippingCents = clampInt(shippingQuote.amount_cents, 0, 100000000, 0);
    }

    const promoVerdict = computePromoVerdict(promo, subtotalCents, finalShippingCents);
    const discountCents = promoVerdict.discount_cents;
    finalShippingCents = promoVerdict.free_shipping ? 0 : finalShippingCents;

    const totalCents = Math.max(0, subtotalCents - discountCents + finalShippingCents);
    if (totalCents <= 0) {
      throw new Error("El total del checkout no es válido");
    }

    const stripe = initStripe();
    if (!stripe) {
      throw new Error("Stripe no está configurado");
    }

    const baseUrl = getBaseUrl(req);
    const successUrl = `${baseUrl}${DEFAULT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}${DEFAULT_CANCEL_PATH}`;

    const idempotencyKey =
      makeCheckoutIdempotencyKey(req, body) ||
      safeStr(req?.headers?.["idempotency-key"] || req?.headers?.["Idempotency-Key"] || "");

    const idemCheck = checkIdempotency(idempotencyKey);
    if (!idemCheck.ok && idemCheck.cached) {
      return send(res, idemCheck.cached);
    }

    const lineItems = buildLineItems(items);

    const metadata = buildMetadata({
      orgId,
      customer,
      shippingCountry,
      shippingZip,
      shippingMode,
      promoVerdict,
      subtotalCents,
      discountCents,
      finalShippingCents,
      totalCents,
      items,
    });

    const shippingOptions =
      finalShippingCents > 0
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: {
                  amount: finalShippingCents,
                  currency: "mxn",
                },
                display_name:
                  shippingQuote?.label ||
                  (shippingCountry === "US" ? "Envío USA" : "Envío MX"),
                delivery_estimate: shippingQuote?.eta
                  ? {
                      minimum: { unit: "business_day", value: 2 },
                      maximum: { unit: "business_day", value: 7 },
                    }
                  : undefined,
              },
            },
          ]
        : [];

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customer.email || undefined,
        locale: "es",
        allow_promotion_codes: false,
        billing_address_collection: "auto",
        shipping_address_collection: {
          allowed_countries: shippingCountry === "US" ? ["US"] : ["MX", "US"],
        },
        phone_number_collection: { enabled: true },
        line_items: lineItems,
        metadata,
        shipping_options: shippingOptions,
        payment_intent_data: {
          metadata,
        },
      },
      {
        idempotencyKey: idempotencyKey || undefined,
      }
    );

    const row = {
      id: session.id,
      checkout_session_id: session.id,
      stripe_session_id: session.id,
      org_id: orgId,
      organization_id: orgId,
      customer_email: customer.email,
      customer_phone: customer.phone,
      shipping_country: shippingCountry,
      shipping_postal_code: shippingZip,
      shipping_mode: shippingMode,
      payment_status: session.payment_status || "unpaid",
      status: session.status || "open",
      subtotal_cents: subtotalCents,
      discount_cents: discountCents,
      shipping_cents: finalShippingCents,
      total_cents: totalCents,
      amount_subtotal_cents: subtotalCents,
      amount_discount_cents: discountCents,
      amount_shipping_cents: finalShippingCents,
      amount_total_cents: totalCents,
      amount_total_mxn: totalCents / 100,
      currency: DEFAULT_CURRENCY,
      promo_code: promoVerdict.promo?.code || "",
      items_summary: metadata.items_summary,
      items,
      items_json: items,
      customer_details: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      shipping_details: {
        mode: shippingMode,
        country: shippingCountry,
        postal: shippingZip,
        quote: shippingQuote || null,
      },
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await sb.from("orders").upsert(row, {
        onConflict: "checkout_session_id",
      });
      if (error) throw error;
    } catch (e) {
      console.error("[create_checkout] order upsert failed:", e?.message || e);
    }

    if (typeof sendTelegram === "function") {
      try {
        await sendTelegram(
          [
            "🛒 <b>Nuevo checkout creado</b>",
            `Cliente: ${customer.name || "Sin nombre"}`,
            `Email: ${customer.email || "Sin email"}`,
            `Total: $${(totalCents / 100).toFixed(2)} MXN`,
            `Pago: STRIPE`,
            `Sesión: ${session.id}`,
          ].join("\n")
        );
      } catch {}
    }

    const response = jsonResponse(
      200,
      {
        ok: true,
        url: session.url,
        checkout_url: session.url,
        session_id: session.id,
        id: session.id,
        payment_status: session.payment_status || "unpaid",
        status: session.status || "open",
        currency: DEFAULT_CURRENCY,
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        shipping_cents: finalShippingCents,
        total_cents: totalCents,
        customer_email: customer.email,
        shipping_mode: shippingMode,
        shipping_country: shippingCountry,
        shipping_postal_code: shippingZip,
        promo_code: promoVerdict.promo?.code || "",
        items_summary: metadata.items_summary,
        support_email: SUPPORT_EMAIL,
        support_whatsapp_display: SUPPORT_WHATSAPP_DISPLAY,
      },
      origin
    );

    saveIdempotency(idempotencyKey, response);

    return send(res, response);
  } catch (err) {
    return send(
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