/**
 * quote_shipping.js — FINAL MASTER
 */
const { jsonResponse, safeJsonParse, getEnviaQuote, FALLBACK_MX_PRICE, FALLBACK_US_PRICE } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  
  try {
    const body = safeJsonParse(event.body);
    const country = (body.country || "MX").toUpperCase();
    const zip = body.zip || "";
    const qty = body.items || 1;

    if (!zip || zip.length < 5) {
      return jsonResponse(400, { error: "Código postal inválido" });
    }

    // Intento de cotización real
    const quote = await getEnviaQuote(zip, qty, country);

    if (quote) {
      return jsonResponse(200, { 
        ok: true, 
        cost: quote.mxn, 
        label: `${quote.carrier} (${quote.days} días)` 
      });
    }

    // Fallbacks si falla la API
    const isUS = country === "US";
    return jsonResponse(200, {
      ok: true,
      cost: isUS ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE,
      label: isUS ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)"
    });

  } catch (err) {
    return jsonResponse(200, { 
      ok: true, 
      cost: FALLBACK_MX_PRICE, 
      label: "Envío Estándar" 
    });
  }
};
