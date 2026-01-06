const { jsonResponse, safeJsonParse, digitsOnly, getEnviaQuote } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const zip = digitsOnly(body.zip);
    const qty = Math.max(1, parseInt(body.items || 1));

    if (!zip || zip.length < 5) return jsonResponse(400, { error: "CP inválido" });

    const quote = await getEnviaQuote(zip, qty);
    
    if (quote) {
      return jsonResponse(200, { ok: true, cost: quote.mxn, label: `${quote.carrier} (${quote.days})` });
    }

    return jsonResponse(200, { ok: true, cost: 250, label: "Envío Nacional Estándar" });

  } catch (err) {
    console.error(err);
    return jsonResponse(200, { ok: true, cost: 250, label: "Envío Nacional Estándar" });
  }
};
