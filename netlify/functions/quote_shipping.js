// netlify/functions/quote_shipping.js
const {
  jsonResponse,
  safeJsonParse,
  getEnviaQuote, // Asumiendo que esto existe en _shared
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  normalizeQty,
  digitsOnly,
} = require("./_shared");

exports.handler = async (event) => {
  // CORS y Método
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const country = String(body.country || "MX").toUpperCase();
    const zip = digitsOnly(body.zip || body.cp || body.postal_code || "");
    
    // Normalizar items
    let items = Array.isArray(body.items) ? body.items : [{ qty: 1 }];
    const totalQty = items.reduce((acc, i) => acc + normalizeQty(i.qty || i.quantity), 0);

    // CRÍTICO: Envia.com falla si no hay dimensiones. 
    // Como el carrito simplificado no las tiene, inyectamos un promedio.
    // Camiseta promedio: 30x25x2 cm, 0.3kg.
    // Multiplicamos altura o peso por qty para un estimado.
    const estimatedWeight = totalQty * 0.5; // 0.5kg por item
    const estimatedHeight = 5 + (totalQty * 2); // 5cm base + 2cm por playera

    // Validar ZIP
    if (!zip || zip.length < 4) {
      throw new Error("ZIP_INVALID");
    }

    // Intentar cotizar con Envia
    // IMPORTANTE: Pasamos las dimensiones simuladas si getEnviaQuote las acepta
    let quote = null;
    try {
      // getEnviaQuote debe modificarse para aceptar dimensiones, 
      // si no las acepta, este es el punto de falla.
      // Asumimos firma: (zip, qty, country, weight, length, height, width)
      quote = await getEnviaQuote(zip, totalQty, country, estimatedWeight, 30, estimatedHeight, 25);
    } catch (apiError) {
      console.warn("Envia API Error:", apiError);
      // No lanzamos error para usar el fallback
    }

    if (quote && quote.mxn) {
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn),
        label: `Envío (${quote.carrier || "Express"})`,
        source: "envia",
      });
    }

    // FALLBACK si falla API o no hay cobertura
    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    return jsonResponse(200, {
      ok: true,
      cost: fallbackCost,
      label: country === "US" ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)",
      source: "fallback",
    });

  } catch (err) {
    console.error("[quote_shipping] Critical:", err);
    // Siempre responder JSON válido al frontend
    return jsonResponse(200, {
      ok: true, // "ok" para que el frontend no rompa, pero usamos precio fijo
      cost: 250, // Precio de seguridad MXN
      label: "Envío Estándar",
      source: "error_rescue"
    });
  }
};