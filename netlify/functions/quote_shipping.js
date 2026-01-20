/**
 * quote_shipping.js — COTIZADOR REAL ENVIA.COM
 */
const { jsonResponse, safeJsonParse, getEnviaQuote, FALLBACK_MX_PRICE, FALLBACK_US_PRICE } = require("./_shared");

exports.handler = async (event) => {
  // CORS Preflight
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const country = (body.country || "MX").toUpperCase();
    const zip = body.zip || "";
    const qty = parseInt(body.items || 1);

    if (!zip || zip.length < 5) {
      return jsonResponse(400, { error: "Código postal inválido" });
    }

    // 1. INTENTO DE COTIZACIÓN REAL (API)
    const quote = await getEnviaQuote(zip, qty, country);
    
    if (quote) {
      return jsonResponse(200, { 
        ok: true, 
        cost: quote.mxn, 
        label: `${quote.carrier} (${quote.days} días hábiles)` 
      });
    }

    // 2. FALLBACK SI FALLA API (Precios fijos para no perder venta)
    const isUS = country === "US";
    return jsonResponse(200, {
      ok: true,
      cost: isUS ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE,
      label: isUS ? "Envío USA Estándar" : "Envío Nacional Estándar"
    });

  } catch (err) {
    console.error("Quote Error:", err);
    // Fallback de emergencia
    return jsonResponse(200, { 
      ok: true, 
      cost: FALLBACK_MX_PRICE, 
      label: "Envío Estándar" 
    });
  }
};
