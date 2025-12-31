// netlify/functions/quote_shipping.js
const { jsonResponse, safeJsonParse, digitsOnly, getEnviaQuote } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const body = safeJsonParse(event.body, {});
  const postalCode = digitsOnly(body.postal_code);
  const itemsCount = body.items || 1;

  if (postalCode.length !== 5) {
    return jsonResponse(400, { error: "Código postal inválido" });
  }

  // Llamamos a la lógica compartida
  const quote = await getEnviaQuote(postalCode, itemsCount);

  if (quote) {
    return jsonResponse(200, { 
      ok: true, 
      mxn: quote.mxn, 
      label: quote.label,
      days: quote.days 
    });
  } else {
    // Si falla la API, devolvemos fallback pero avisando al frontend
    return jsonResponse(200, { 
      ok: true, 
      mxn: 250, 
      label: "Envío Nacional (Estándar)",
      fallback: true
    });
  }
};
