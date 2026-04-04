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

const { rateLimit } = require("./_rate_limit");
const { checkIdempotency, saveIdempotency } = require("./_idempotency");

const DEFAULT_CURRENCY = "MXN";
const MAX_ITEMS = 120;
const MAX_QTY_PER_ITEM = 99;

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

function buildItemsSummary(items) {
  return items
    .map((it) => {
      const size = it.size ? ` / ${it.size}` : "";
      return `${it.qty}x ${it.title || it.sku}${size}`;
    })
    .join(" · ");
}

function computeSubtotalCents(items) {
  return items.reduce((sum, it) => sum + clampInt(it.priceCents, 0, 100000000, 0) * clampInt(it.qty, 1, MAX_QTY_PER_ITEM, 1), 0);
}

function readPromoRules() {
  const raw = readJsonFile("data/promos.json");
  const rules = Array.isArray(raw?.rules) ? raw.rules : [];
  return rules
    .map((r) => ({
      code: normalizeText(r?.code || "").toUpperCase(),
      type: normalizeText(r?.type || "").toLowerCase(),
      value: Number(r?.value || r?.value_mxn || 0),
      active: r?.active !== false,
      min_amount_mxn: Number(r?.min_amount_mxn || 0),
      expires_at: r?.expires_at || null,
      description: normalizeText(r?.description || ""),
    }))
    .filter((r) => r.code);
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  return Number.isFinite(d.getTime()) ? d.getTime() < Date.now() : false;
}

function applyPromo(promoCode, subtotalCents, shippingCents) {
  const code = normalizeText(promoCode).toUpperCase();
  if (!code) {
    return {
      promo: null,
      discount_cents: 0,
      shipping_cents: shippingCents,
      free_shipping: false,
    };
  }

  const rules = readPromoRules();
  const promo = rules.find((r) => r.code === code) || null;

  if (!promo || !promo.active || isExpired(promo.expires_at)) {
    return {
      promo: null,
      discount_cents: 0,
      shipping_cents: shippingCents,
      free_shipping: false,
    };
  }

  const minSubtotal = moneyToCents(promo.min_amount_mxn || 0);
  if (subtotalCents < minSubtotal) {
    return {
      promo: null,
      discount_cents: 0,
      shipping_cents: shippingCents,
      free_shipping: false,
    };
  }

  const type = promo.type;
  if (type === "free_shipping" || type === "freeshipping") {
    return {
      promo,
      discount_cents: 0,
      shipping_cents: 0,
      free_shipping: true,
    };
  }

  if (type === "fixed" || type === "fixed_mxn" || type === "fixed_off") {
    const discount = Math.min(subtotalCents, moneyToCents(promo.value));
    return {
      promo,
      discount_cents: discount,
      shipping_cents: shippingCents,
      free_shipping: false,
    };
  }

  if (type === "percent" || type === "percentage" || type === "percent_off") {
    const rate = promo.value > 1 ? promo.value / 100 : promo.value;
    const discount = Math.min(subtotalCents, Math.max(0, Math.round(subtotalCents * rate)));
    return {
      promo,
      discount_cents: discount,
      shipping_cents: shippingCents,
      free_shipping: false,
    };
  }

  return {
    promo: null,
    discount_cents: 0,
    shipping_cents: shippingCents,
    free_shipping: false,
  };
}

function getShippingMode(country, quote, shippingAmountCents) {
  const c = normalizeCountry(country);
  if (quote?.provider === "pickup") return "pickup";
  if (shippingAmountCents <= 0) return "pickup";

  if (quote?.provider === "envia") {
    if (c === "US") return "envia_us";
    return "envia_mx";
  }

  return c === "US" ? "envia_us" : "envia_mx";
}

async function fetchProductPrices(sb, orgId, items) {
  const skuList = uniq(items.map((i) => normalizeText(i.sku)).filter(Boolean));

  if (!skuList.length) return items;

  const { data, error } = await sb
    .from("products")
    .select("sku,name,title,price_cents,price_mxn,base_mxn,active,is_active,deleted_at")
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .in("sku", skuList);

  if (error) {
    throw error;
  }

  const bySku = new Map(
    (Array.isArray(data) ? data : []).map((p) => [normalizeText(p.sku), p])
  );

  return items.map((item) => {
    const product = bySku.get(normalizeText(item.sku));
    if (!product) return item;

    const title = normalizeText(product.title || product.name || item.title || item.sku);
    const priceCents =
      Number.isFinite(Number(product.price_cents))
        ? Math.round(Number(product.price_cents))
        : Number.isFinite(Number(product.price_mxn))
          ? Math.round(Number(product.price_mxn) * 100)
          : Number.isFinite(Number(product.base_mxn))
            ? Math.round(Number(product.base_mxn) * 100)
            : item.priceCents;

    return {
      ...item,
      title,
      priceCents: Math.max(0, priceCents),
    };
  });
}

async function main(req, res) {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
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
        jsonResponse(429, { ok: false, error: "rate_limited" }, origin)
      );
    }

    const body = getBody(req);
    const idempotencyKey = makeCheckoutIdempotencyKey
      ? makeCheckoutIdempotencyKey(req, body)
      : normalizeText(req.headers["idempotency-key"] || "");

    const idem = checkIdempotency(idempotencyKey);
    if (!idem.ok && idem.cached) {
      return send(res, idem.cached);
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return send(
        res,
        jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin)
      );
    }

    const stripe = initStripe();
    if (!stripe) {
      return send(
        res,
        jsonResponse(500, { ok: false, error: "Stripe not configured" }, origin)
      );
    }

    const orgId = await resolveScoreOrgId(sb).catch(() => null);
    if (!orgId) {
      return send(
        res,
        jsonResponse(500, { ok: false, error: "No se pudo resolver la organización" }, origin)
      );
    }

    const customer = {
      name: normalizeText(body.customer_name || body.name || ""),
      email: normalizeEmail(body.customer_email || body.email || ""),
      phone: normalizePhone(body.customer_phone || body.phone || ""),
    };

    const shippingCountry = normalizeCountry(body.shipping_country || body.country || "MX");
    const shippingZip = normalizeText(body.shipping_zip || body.postal_code || body.zip || "");

    let items = sanitizeItems(body.items || body.cart || []);
    if (!items.length) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "El carrito está vacío." }, origin)
      );
    }

    items = await fetchProductPrices(sb, orgId, items);

    const subtotalCents = computeSubtotalCents(items);
    const itemsQty = itemsQtyFromAny(items);

    const promoCode = normalizeText(body.promo_code || body.promoCode || "").toUpperCase();
    const baseShippingCents = clampInt(body.shipping_amount_cents || body.shippingCents || 0, 0, 100000000, 0);

    let shippingQuote = null;
    let shippingCents = baseShippingCents;

    if (shippingZip) {
      const validatedZip = validateZip(shippingZip, shippingCountry);
      if (!validatedZip) {
        return send(
          res,
          jsonResponse(400, { ok: false, error: "Código postal inválido." }, origin)
        );
      }

      try {
        shippingQuote = await getEnviaQuote({
          zip: validatedZip,
          country: shippingCountry,
          items_qty: itemsQty,
        });
        shippingCents = clampInt(shippingQuote?.amount_cents || shippingQuote?.amountCents || 0, 0, 100000000, baseShippingCents);
      } catch {
        const fb = getFallbackShipping(shippingCountry, itemsQty);
        shippingQuote = fb;
        shippingCents = clampInt(fb?.amount_cents || 0, 0, 100000000, baseShippingCents);
      }
    }

    const promoVerdict = applyPromo(promoCode, subtotalCents, shippingCents);
    const discountCents = clampInt(promoVerdict.discount_cents || 0, 0, subtotalCents, 0);
    const finalShippingCents = promoVerdict.free_shipping ? 0 : shippingCents;
    const totalCents = Math.max(0, subtotalCents - discountCents + finalShippingCents);

    if (totalCents <= 0) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "El total debe ser mayor a cero." }, origin)
      );
    }

    const baseUrl = getBaseUrl({ headers: req.headers });
    const successUrl = `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/cancel.html`;

    const shippingMode = getShippingMode(shippingCountry, shippingQuote, finalShippingCents);

    const lineItems = items.map((item) => ({
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

    const metadata = {
      org_id: orgId,
      organization_id: orgId,
      customer_email: customer.email,
      customer_phone: customer.phone,
      shipping_country: shippingCountry,
      shipping_zip: shippingZip,
      shipping_mode: shippingMode,
      promo_code: promoVerdict.promo?.code || promoCode || "",
      subtotal_cents: String(subtotalCents),
      discount_cents: String(discountCents),
      shipping_cents: String(finalShippingCents),
      total_cents: String(totalCents),
      items_summary: buildItemsSummary(items),
      items_qty: String(itemsQty),
    };

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
        shipping_options: finalShippingCents > 0
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
          : [],
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
      items: items,
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