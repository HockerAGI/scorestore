// netlify/functions/create_checkout.js
// Crea una sesión de Stripe Checkout (PRODUCCIÓN) incluyendo: envío + cupón.
// Node 18+ (fetch nativo).

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  isMxPostal,
  isTijuanaPostal,
  looksLikeTijuana,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeSubtotalMXN,
  applyPromoToTotals,
  getBaseUrlFromEnv,
  quoteEnviaMXN,
} = require("./_shared");

const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

function baseUrlFromEvent(event) {
  const env = toStr(getBaseUrlFromEnv());
  if (env) return env.replace(/\/+$/, "");
  const proto = toStr(event.headers?.["x-forwarded-proto"] || "https");
  const host = toStr(event.headers?.host);
  if (!host) return "";
  return `${proto}://${host}`;
}

function normalizeMode(mode) {
  const m = toStr(mode).toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "tj" || m === "tijuana_delivery") return "tijuana_delivery";
  if (m === "mx" || m === "envia") return "envia";
  return "auto";
}

function sanitizeCustomer(to) {
  return {
    name: toStr(to?.name),
    email: toStr(to?.email),
    phone: toStr(to?.phone),
  };
}

function sanitizeTo(to) {
  return {
    postal_code: toStr(to?.postal_code),
    state_code: upper(to?.state_code || to?.state || ""),
    city: toStr(to?.city),
    address1: toStr(to?.address1),
  };
}

function isLikelyTJ(to) {
  const postal = toStr(to?.postal_code);
  const state = upper(to?.state_code || "");
  const city = toStr(to?.city);
  const postalOk = isTijuanaPostal(postal) && (state === "BC" || !state);
  const cityOk = looksLikeTijuana(city) && (state === "BC" || !state);
  return postalOk || cityOk;
}

async function computeShipping({ mode, to, items, productMap }) {
  if (mode === "pickup") {
    return { ok: true, mxn: 0, carrier: "TIJUANA", service: "Recolección en fábrica", note: "Gratis" };
  }

  const postal = toStr(to?.postal_code);
  const address1 = toStr(to?.address1);

  const likelyTJ = isLikelyTJ(to);

  if (mode === "tijuana_delivery" || (mode === "auto" && likelyTJ)) {
    if (mode === "tijuana_delivery" && !likelyTJ && postal.length === 5) {
      // forzó TJ pero no parece TJ -> cae a nacional
    } else {
      return { ok: true, mxn: TIJUANA_DELIVERY_MXN, carrier: "TIJUANA", service: "Envío Local", note: "Entrega local (24-48h)" };
    }
  }

  if (!isMxPostal(postal) || !address1) {
    return {
      ok: true,
      mxn: MIN_OUTSIDE_TJ_MXN,
      carrier: "ENVÍA",
      service: "Estimado",
      note: "Cotización estimada (completa tu dirección para mejor precio).",
    };
  }

  const q = await quoteEnviaMXN({ to, items, productMap });
  if (!q.ok) {
    return {
      ok: true,
      mxn: MIN_OUTSIDE_TJ_MXN,
      carrier: "ENVÍA",
      service: "Estimado",
      note: "No se pudo cotizar en vivo, se usó mínimo estimado.",
    };
  }

  const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, Number(q.quote?.mxn || 0));
  return {
    ok: true,
    mxn,
    carrier: toStr(q.quote?.provider || "ENVÍA"),
    service: toStr(q.quote?.service || "Nacional"),
    note: q.quote?.days ? `Entrega estimada: ${Number(q.quote.days)} días` : "",
  };
}

function buildLineItemsAdjusted({ items, productMap, targetSubtotalMXN, baseUrl }) {
  const targetCents = Math.round(Number(targetSubtotalMXN || 0) * 100);

  const baseSubtotalMXN = computeSubtotalMXN(items, productMap);
  const baseCents = Math.round(baseSubtotalMXN * 100);

  const ratio = baseCents > 0 ? Math.min(1, targetCents / baseCents) : 1;

  const lineItems = items.map((it) => {
    const p = productMap.get(toStr(it.id));
    const baseUnitCents = Math.round(Number(p.baseMXN || 0) * 100);
    const qty = Number(it.qty || 1);

    let unit = Math.floor(baseUnitCents * ratio);
    if (unit < 1) unit = 1;

    return {
      price_data: {
        currency: "mxn",
        product_data: {
          name: `${p.name}${toStr(it.size) ? ` — Talla ${toStr(it.size)}` : ""}`,
          images: (() => {
            const raw = toStr(p.img);
            if (!raw) return [];
            const abs = raw.startsWith("http")
              ? raw
              : `${toStr(baseUrl).replace(/\/+$/, "")}/${raw.replace(/^\//, "")}`;
            return [abs];
          })(),
        },
        unit_amount: unit,
      },
      quantity: qty,
    };
  });

  let sum = lineItems.reduce((acc, li) => acc + li.price_data.unit_amount * Number(li.quantity || 1), 0);
  let diff = targetCents - sum;

  if (diff > 0) {
    for (const li of lineItems) {
      if (diff <= 0) break;
      const qty = Number(li.quantity || 1);
      const steps = Math.floor(diff / qty);
      if (steps <= 0) continue;
      li.price_data.unit_amount += steps;
      diff -= steps * qty;
    }
  }

  if (diff > 0) {
    lineItems.push({
      price_data: {
        currency: "mxn",
        product_data: { name: "Ajuste de redondeo", images: [] },
        unit_amount: diff,
      },
      quantity: 1,
    });
  }

  return lineItems;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {}, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
  }

  try {
    const body = safeJsonParse(event.body, {});
    const items = body?.items || [];
    const promoCode = toStr(body?.promoCode);
    const mode = normalizeMode(body?.mode || body?.shippingMode || "auto");

    const to = sanitizeTo(body?.to || {});
    const customer = sanitizeCustomer(body?.to || body?.customer || {});

    const v = validateCartItems(items);
    if (!v.ok) return jsonResponse(400, { ok: false, error: v.error });

    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    const sizeOk = validateSizes(items, productMap);
    if (!sizeOk.ok) return jsonResponse(400, { ok: false, error: sizeOk.error });

    const subtotalMXN = computeSubtotalMXN(items, productMap);

    const ship = await computeShipping({ mode, to, items, productMap });
    if (!ship.ok) return jsonResponse(400, { ok: false, error: ship.error || "No se pudo calcular envío." });

    const promo = await applyPromoToTotals({
      promoCode,
      subtotalMXN,
      shippingMXN: Number(ship.mxn || 0),
    });

    if (!promo.ok) return jsonResponse(400, { ok: false, error: promo.error || "Cupón inválido." });
    if (Number(promo.totalMXN || 0) <= 0) {
      return jsonResponse(400, { ok: false, error: "Total en $0 no permitido para pago con Stripe." });
    }

    const adjustedSubtotalMXN = Math.max(0, Number(promo.totalMXN || 0) - Number(promo.shippingMXN || 0));
    const baseUrl = baseUrlFromEvent(event) || "https://example.com";

    const line_items = buildLineItemsAdjusted({
      items,
      productMap,
      targetSubtotalMXN: adjustedSubtotalMXN,
      baseUrl,
    });

    const shippingMXN = Number(promo.shippingMXN || 0);
    if (shippingMXN > 0) {
      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: { name: "Envío", images: [] },
          unit_amount: Math.round(shippingMXN * 100),
        },
        quantity: 1,
      });
    }

    const metadata = {
      promo_code: promoCode ? (promo.promoCode || promoCode) : "",
      discount_mxn: String(Number(promo.discountMXN || 0)),
      shipping_mxn: String(Number(promo.shippingMXN || 0)),
      shipping_mode: mode,
      ship_postal: to.postal_code,
      ship_state: to.state_code,
      ship_city: to.city,
      ship_address1: to.address1,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      line_items,
      success_url: `${baseUrl}/?status=success`,
      cancel_url: `${baseUrl}/?status=cancel`,
      metadata,
      customer_email: customer.email || undefined,
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
    });

    return jsonResponse(200, { ok: true, url: session.url }, { "Access-Control-Allow-Origin": "*" });
  } catch (e) {
    console.error("create_checkout error:", e);
    return jsonResponse(500, { ok: false, error: "Error interno creando checkout." }, { "Access-Control-Allow-Origin": "*" });
  }
};