const { getEnviaQuote, jsonResponse, safeJsonParse, normalizeZip, normalizeQty } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const zip = normalizeZip(body.zip);
    const country = body.country || "MX";
    
    const items = Array.isArray(body.items) ? body.items : [];
    const totalQty = items.reduce((acc, it) => acc + normalizeQty(it.qty), 0);

    if (!zip) return jsonResponse(400, { error: "Falta CP" });

    const quote = await getEnviaQuote(zip, totalQty, country);

    if (!quote) {
      return jsonResponse(200, { ok: false, fallback: true });
    }

    return jsonResponse(200, { 
      ok: true, 
      cost: quote.mxn, 
      label: `${quote.carrier} (${quote.days} días)` 
    });

  } catch (err) {
    return jsonResponse(500, { error: "Server Error" });
  }
};
