// netlify/functions/quote_shipping.js
// Quotes shipping in MXN.
// Rules (as requested):
// - Outside Tijuana: shipping starts at $250 MXN (minimum). If Envia quotes higher, we charge higher.
// - Tijuana: pickup in factory (free) OR local delivery ($200 MXN).

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
  quoteEnviaMXN,
} = require("./_shared");

const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

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
  const mode = toStr(body?.mode || "auto"); // auto | pickup | tijuana_delivery | envia

  const v = validateCartItems(items);
  if (!v.ok) return jsonResponse(400, { ok: false, error: v.error });

  const postal = toStr(to?.postal_code);
  const state = upper(to?.state_code || to?.state || "");
  const city = toStr(to?.city);

  // Handle local Tijuana choices
  if (mode === "pickup") {
    return jsonResponse(
      200,
      {
        ok: true,
        mxn: 0,
        carrier: "TIJUANA",
        service: "Recolección en fábrica",
        note: "Gratis (Tijuana)",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  }

  const isLikelyTijuana =
    (isTijuanaPostal(postal) && state === "BC") || (looksLikeTijuana(city) && state === "BC");

  if (mode === "tijuana_delivery" || (mode === "auto" && isLikelyTijuana)) {
    return jsonResponse(
      200,
      {
        ok: true,
        mxn: TIJUANA_DELIVERY_MXN,
        carrier: "TIJUANA",
        service: "Envío local Tijuana",
        days: 1,
        note: "Entrega local (24-48h)",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  }

  // Outside Tijuana: quote via Envia (if configured), apply min.
  // If Envia not configured or fails, fall back to minimum.
  try {
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    // For Envia we need address1. If missing, still return minimum with message.
    const address1 = toStr(to?.address1);
    if (!isMxPostal(postal) || !state || !city || !address1) {
      return jsonResponse(
        200,
        {
          ok: true,
          mxn: MIN_OUTSIDE_TJ_MXN,
          carrier: "ESTIMADO",
          service: "Envío fuera de Tijuana",
          note: "Falta dirección completa para cotizar; se muestra mínimo.",
          min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const q = await quoteEnviaMXN({
      to: { postal_code: postal, state_code: state, city, address1 },
      items,
      productMap,
    });

    if (!q.ok) {
      return jsonResponse(
        200,
        {
          ok: true,
          mxn: MIN_OUTSIDE_TJ_MXN,
          carrier: "ESTIMADO",
          service: "Envío fuera de Tijuana",
          note: `No se pudo cotizar con Envia. Mínimo aplicado. (${q.error})`,
          min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const raw = Number(q.quote.mxn || 0);
    const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05)); // +5% buffer
    return jsonResponse(
      200,
      {
        ok: true,
        mxn,
        carrier: q.quote.provider || "ENVIA",
        service: q.quote.service || "Tarifa",
        days: q.quote.days || null,
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  } catch (e) {
    return jsonResponse(
      200,
      {
        ok: true,
        mxn: MIN_OUTSIDE_TJ_MXN,
        carrier: "ESTIMADO",
        service: "Envío fuera de Tijuana",
        note: "Fallback por error interno. Se muestra mínimo.",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  }
};