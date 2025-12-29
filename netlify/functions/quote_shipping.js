// netlify/functions/quote_shipping.js
const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  isMxPostal,
  isTijuanaPostal,
  looksLikeTijuana,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  quoteEnviaMXN,
  FEATURE_ENVIADOTCOM,
} = require("./_shared");

const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

function normalizeMode(raw) {
  const m = toStr(raw).toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "tj") return "tj";
  if (m === "mx") return "mx";
  return "pickup";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido." }, { Allow: "POST" });
  }

  const body = safeJsonParse(event.body, {});
  const items = body?.items || [];
  const to = body?.to || {};
  const mode = normalizeMode(body?.mode);

  const v = validateCartItems(items);
  if (!v.ok) return jsonResponse(400, { ok: false, error: v.error }, { "Access-Control-Allow-Origin": "*" });

  const postal = digitsOnly(to?.postal_code);
  const state = upper(to?.state_code || to?.state || "");
  const city = toStr(to?.city);
  const address1 = toStr(to?.address1);

  // PICKUP
  if (mode === "pickup") {
    return jsonResponse(
      200,
      { ok: true, mxn: 0, carrier: "TIJUANA", service: "Pickup" },
      { "Access-Control-Allow-Origin": "*" }
    );
  }

  // TJ
  const isLikelyTijuana =
    isTijuanaPostal(postal) ||
    (looksLikeTijuana(city) && (!state || state === "BC"));

  if (mode === "tj" || isLikelyTijuana) {
    return jsonResponse(
      200,
      { ok: true, mxn: TIJUANA_DELIVERY_MXN, carrier: "TIJUANA", service: "Entrega local (24–48h)" },
      { "Access-Control-Allow-Origin": "*" }
    );
  }

  // MX (Envia)
  if (!FEATURE_ENVIADOTCOM) {
    return jsonResponse(
      200,
      { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, carrier: "ESTIMADO", service: "Envío nacional (estimado)" },
      { "Access-Control-Allow-Origin": "*" }
    );
  }

  try {
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);
    const markupPct = Number(catalog?.pricing?.markup_pct ?? 0) || 0;

    // Si falta dirección completa, devolvemos base
    if (!isMxPostal(postal) || !address1 || !state || !city) {
      return jsonResponse(
        200,
        { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, carrier: "ESTIMADO", service: "Completa dirección para cotizar en vivo" },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const q = await quoteEnviaMXN({
      to: { postal_code: postal, state_code: state, city, address1, name: toStr(to?.name) },
      items,
      productMap,
      markupPct
    });

    if (!q.ok) {
      return jsonResponse(
        200,
        { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, carrier: "ESTIMADO", service: "Envío nacional (mínimo aplicado)" },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const raw = Number(q.quote.mxn || 0);
    const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05));

    return jsonResponse(
      200,
      { ok: true, mxn, carrier: q.quote.provider || "ENVIA", service: q.quote.service || "Standard" },
      { "Access-Control-Allow-Origin": "*" }
    );
  } catch (e) {
    console.error("quote_shipping error:", e);
    return jsonResponse(
      200,
      { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, carrier: "ESTIMADO", service: "Envío nacional (fallback)" },
      { "Access-Control-Allow-Origin": "*" }
    );
  }
};