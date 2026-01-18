const { jsonResponse, safeJsonParse, digitsOnly, getEnviaQuote, FALLBACK_MX_PRICE, FALLBACK_US_PRICE } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const country = body.country || "MX";
    const rawZip = body.zip || body.postal_code;
    const zip = (country === "MX") ? digitsOnly(rawZip) : rawZip; 
    const qty = Math.max(1, parseInt(body.items || 1));

    if (!zip || zip.length < 5) return jsonResponse(400, { error: "CP inválido" });

    const quote = await getEnviaQuote(zip, qty, country);
    if (quote) {
      return jsonResponse(200, { ok: true, cost: quote.mxn, label: `${quote.carrier} (${quote.days})` });
    }

    const fallbackCost = (country === "US") ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    const fallbackLabel = (country === "US") ? "Envío USA Estándar" : "Envío Nacional Estándar";
    return jsonResponse(200, { ok: true, cost: fallbackCost, label: fallbackLabel });

  } catch (err) {
    return jsonResponse(200, { ok: true, cost: 250, label: "Envío Estándar" });
  }
};