// netlify/functions/create_checkout.js
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

function normalizeMode(raw) {
  const m = toStr(raw).toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "tj" || m === "tijuana_delivery") return "tijuana_delivery";
  if (m === "mx" || m === "envia") return "envia";
  return "auto";
}

function sanitizeTo(to) {
  return {
    postal_code: toStr(to?.postal_code),
    state_code: upper(to?.state_code || to?.state || ""),
    city: toStr(to?.city),
    address1: toStr(to?.address1),
    name: toStr(to?.name),
    email: toStr(to?.email),
    phone: toStr(to?.phone),
  };
}

function isLikelyTJ(to) {
  const postal = toStr(to?.postal_code);
  const state = upper(to?.state_code || "");
  const city = toStr(to?.city);

  const postalOk = isTijuanaPostal(postal) && (!state || state === "BC");
  const cityOk = looksLikeTijuana(city) && (!state || state === "BC");
  return postalOk || cityOk;
}

async function computeShipping({ mode, to, items, productMap }) {
  if (mode === "pickup") {
    return { ok: true, mxn: 0, carrier: "TIJUANA", service: "Recolección en fábrica", note: "Gratis" };
  }

  const likelyTJ = isLikelyTJ(to);

  if (mode === "tijuana_delivery" || (mode === "auto" && likelyTJ)) {
    // si forzó TJ pero no parece TJ y hay CP, cae a nacional
    if (!(mode === "tijuana_delivery" && !likelyTJ && toStr(to?.postal_code).length === 5)) {
      return { ok: true, mxn: TIJUANA_DELIVERY_MXN, carrier: "TIJUANA", service: "Envío Local", note: "Entrega local (24-48h)" };
    }
  }

  // Nacional
  const postal = toStr(to?.postal_code);
  const state = upper(to?.state_code || "");
  const city = toStr(to?.city);
  const address1 = toStr(to?.address1);

  // Si incompleto, base
  if (!isMxPostal(postal) || !state || !city || !address1) {
    return { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, carrier: "ESTIMADO", service: "Envío Nacional", note: "Tarifa base (dirección incompleta)." };
  }

  const q = await quoteEnviaMXN({
    to: { postal_code: postal, state_code: state, city, address1 },
    items,
    productMap,
  });

  if (!q.ok) {
    return { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, carrier: "ESTIMADO", service: "Envío Nacional", note: `Mínimo aplicado. (${q.error})` };
  }

  const raw = Number(q.quote?.mxn || 0);
  const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05));
  return {
    ok: true,
    mxn,
    carrier: toStr(q.quote?.provider || "ENVIA"),
    service: toStr(q.quote?.service || "Standard"),
    note: q.quote?.days ? `Entrega estimada: ${Number(q.quote.days)} días` : "",
  };
}

function buildLineItemsAdjusted({ items, productMap, targetSubtotalMXN, baseUrl }) {
  const targetCents = Math.round(Number(targetSubtotalMXN || 0) * 100);

  const baseSubtotalMXN = computeSubtotalMXN(items, productMap);
  const baseCents = Math.round(Number(baseSubtotalMXN || 0) * 100);

  const ratio = baseCents > 0 ? Math.min(1, targetCents / baseCents) : 1;

  const lineItems = items.map((it) => {
    const p = productMap.get(toStr(it.id));
    const baseUnitCents = Math.round(Number(p.baseMXN || 0) * 100);
    const qty = Number(it.qty || 1);

    let unit = Math.floor(baseUnitCents * ratio);
    if (unit < 1) unit = 1;

    const rawImg = toStr(p.img);
    const absImg = rawImg
      ? rawImg.startsWith("http")
        ? rawImg
        : `${toStr(baseUrl).replace(/\/+$/, "")}/${rawImg.replace(/^\//, "")}`
      : "";

    return {
      price_data: {
        currency: "mxn",
        product_data: {
          name: `${p.name}${toStr(it.size) ? ` — Talla ${toStr(it.size)}` : ""}`,
          images: absImg ? [absImg] : [],
        },
        unit_amount: unit,
      },
      quantity: qty,
    };
  });

  let sum = lineItems.reduce((acc, li) => acc + li.price_data.unit_amount * Number(li.quantity || 1), 0);
  let diff = targetCents - sum;

  // Ajuste fino por redondeo
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
    return {
      statusCode: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido." }, { "Access-Control-Allow-Origin": "*" });
  }

  try {
    const body = safeJsonParse(event.body, {});
    const items = body?.items || [];
    const promoCode = toStr(body?.promoCode || body?.promo_code || "");
    const mode = normalizeMode(body?.mode || "auto");
    const to = sanitizeTo(body?.to || {});

    const v = validateCartItems(items);
    if (!v.ok) return jsonResponse(400, { ok: false, error: v.error }, { "Access-Control-Allow-Origin": "*" });

    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    const v2 = validateSizes(items, productMap);
    if (!v2.ok) return jsonResponse(400, { ok: false, error: v2.error }, { "Access-Control-Allow-Origin": "*" });

    const baseUrl = baseUrlFromEvent(event) || "https://example.com";

    const subtotalMXN = computeSubtotalMXN(items, productMap);
    const ship = await computeShipping({ mode, to, items, productMap });
    if (!ship.ok) return jsonResponse(400, { ok: false, error: ship.error || "No se pudo calcular envío." }, { "Access-Control-Allow-Origin": "*" });

    const promo = await applyPromoToTotals({
      promoCode,
      subtotalMXN,
      shippingMXN: Number(ship.mxn || 0),
    });

    if (Number(promo.totalMXN || 0) <= 0) {
      return jsonResponse(400, { ok: false, error: "Total en $0 no permitido para pago con Stripe." }, { "Access-Control-Allow-Origin": "*" });
    }

    const adjustedSubtotalMXN = Math.max(0, Number(promo.totalMXN || 0) - Number(promo.shippingMXN || 0));

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

    // Metadata (para stripe_webhook/envia_webhook)
    const metadata = {
      promo_code: promo.promoCode || normalizePromo(promoCode),
      discount_mxn: String(Number(promo.discountMXN || 0)),
      shipping_mxn: String(Number(promo.shippingMXN || 0)),
      shipping_mode: mode,

      ship_postal: to.postal_code,
      ship_state: to.state_code,
      ship_city: to.city,
      ship_address1: to.address1,

      customer_name: to.name,
      customer_email: to.email,
      customer_phone: to.phone,
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      line_items,

      success_url: `${baseUrl}/?status=success`,
      cancel_url: `${baseUrl}/?status=cancel`,

      metadata,
      customer_email: to.email || undefined,

      // opcional: Stripe vuelve a pedir teléfono, pero asegura captura
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
    });

    return jsonResponse(200, { ok: true, url: session.url }, { "Access-Control-Allow-Origin": "*" });
  } catch (e) {
    console.error("create_checkout error:", e);
    return jsonResponse(500, { ok: false, error: "Error interno creando checkout." }, { "Access-Control-Allow-Origin": "*" });
  }
};