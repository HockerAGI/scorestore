// netlify/functions/quote_shipping.js
// Cotizador de Envíos (MXN).
// Sincronizado con index.html (FrontEnd Maestro v4.0).

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
  // 1. CORS Preflight
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

  // 2. Leer datos del cliente
  const body = safeJsonParse(event.body, {});
  const items = body?.items || [];
  const to = body?.to || {};
  
  // Normalizar modo de envío (esto faltaba)
  let rawMode = toStr(body?.mode || "auto").toLowerCase();
  let mode = "auto";

  if (rawMode === "pickup") mode = "pickup";
  else if (rawMode === "tj" || rawMode === "tijuana_delivery") mode = "tijuana_delivery";
  else if (rawMode === "mx" || rawMode === "envia") mode = "envia";

  // Validar carrito
  const v = validateCartItems(items);
  if (!v.ok) return jsonResponse(400, { ok: false, error: v.error });

  // Datos de dirección
  const postal = toStr(to?.postal_code);
  const state = upper(to?.state_code || to?.state || "");
  const city = toStr(to?.city);

  // 3. Lógica Tijuana / Pickup
  if (mode === "pickup") {
    return jsonResponse(200, {
      ok: true,
      mxn: 0,
      carrier: "TIJUANA",
      service: "Recolección en fábrica",
      note: "Gratis",
      min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
    }, { "Access-Control-Allow-Origin": "*" });
  }

  // Auto-detección de Tijuana si el modo es "auto" o explícito "tijuana_delivery"
  const isLikelyTijuana = (isTijuanaPostal(postal) && state === "BC") || (looksLikeTijuana(city) && state === "BC");

  if (mode === "tijuana_delivery" || (mode === "auto" && isLikelyTijuana)) {
    // Si seleccionó TJ pero no parece TJ, forzamos nacional (seguridad)
    if (mode === "tijuana_delivery" && !isLikelyTijuana && postal.length === 5) {
      // Dejamos que caiga al bloque de Envia/Nacional
    } else {
      return jsonResponse(200, {
        ok: true,
        mxn: TIJUANA_DELIVERY_MXN,
        carrier: "TIJUANA",
        service: "Envío Local",
        days: 1,
        note: "Entrega local (24-48h)",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      }, { "Access-Control-Allow-Origin": "*" });
    }
  }

  // 4. Lógica Nacional (Envia.com)
  try {
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    // Si falta dirección completa, damos el mínimo estimado
    const address1 = toStr(to?.address1);
    if (!isMxPostal(postal) || !address1) {
      return jsonResponse(200, {
        ok: true,
        mxn: MIN_OUTSIDE_TJ_MXN,
        carrier: "ESTIMADO",
        service: "Envío Nacional",
        note: "Tarifa base (se ajustará con dirección completa).",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      }, { "Access-Control-Allow-Origin": "*" });
    }

    // Cotización real
    const q = await quoteEnviaMXN({
      to: { postal_code: postal, state_code: state, city, address1 },
      items,
      productMap,
    });

    if (!q.ok) {
      return jsonResponse(200, {
        ok: true,
        mxn: MIN_OUTSIDE_TJ_MXN,
        carrier: "ESTIMADO",
        service: "Envío Nacional",
        note: `Mínimo aplicado. (${q.error})`,
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      }, { "Access-Control-Allow-Origin": "*" });
    }

    const raw = Number(q.quote.mxn || 0);
    const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05)); // +5% buffer

    return jsonResponse(200, {
      ok: true,
      mxn,
      carrier: q.quote.provider || "ENVIA",
      service: q.quote.service || "Standard",
      days: q.quote.days || 3,
      min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
    }, { "Access-Control-Allow-Origin": "*" });

  } catch (e) {
    console.error("Quote Error:", e);
    return jsonResponse(200, {
      ok: true,
      mxn: MIN_OUTSIDE_TJ_MXN,
      carrier: "ESTIMADO",
      service: "Envío Nacional",
      note: "Error interno, tarifa base aplicada.",
      min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
    }, { "Access-Control-Allow-Origin": "*" });
  }
};
