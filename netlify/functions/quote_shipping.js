/* =========================================================
   SCORE STORE — SHIPPING QUOTER (ENDPOINT)
   ========================================================= */

const { 
  jsonResponse, 
  handleOptions, 
  getEnviaQuote, 
  digitsOnly,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE 
} = require("./_shared");

exports.handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = JSON.parse(event.body);
    const zip = digitsOnly(body.zip);
    const country = (body.country || "MX").toUpperCase();
    const qty = body.items ? body.items.reduce((a,b)=>a+(b.qty||1),0) : 1;

    if (zip.length < 4) return jsonResponse(200, { ok: false, error: "CP Inválido" });

    // 1. Intentar cotización real
    const quote = await getEnviaQuote(zip, qty, country);

    if (quote) {
      return jsonResponse(200, {
        ok: true,
        cost: quote.cost,
        currency: quote.currency,
        label: `Envío Express ${quote.carrier.toUpperCase()} (${quote.days} días)`,
        source: "envia"
      });
    }

    // 2. Fallback (Si falla Envia, usamos tarifa plana)
    const fallbackPrice = country === "MX" ? FALLBACK_MX_PRICE : FALLBACK_US_PRICE;
    
    return jsonResponse(200, {
      ok: true,
      cost: fallbackPrice,
      currency: "MXN",
      label: country === "MX" ? "Envío Nacional Estándar" : "USA International Shipping",
      source: "fallback"
    });

  } catch (error) {
    console.error(error);
    // En caso de error crítico, regresamos fallback para no bloquear venta
    return jsonResponse(200, { 
      ok: true, 
      cost: 250, 
      label: "Envío Estándar",
      source: "emergency" 
    });
  }
};