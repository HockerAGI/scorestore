const {
  jsonResponse,
  safeJsonParse,
  getEnviaQuote,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  normalizeQty,
  digitsOnly,
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const country = String(body.country || "MX").toUpperCase();

    const rawZip = String(body.zip || body.postal_code || "").trim();
    const zip = country === "MX" ? digitsOnly(rawZip) : rawZip;

    let qty = 1;
    if (Array.isArray(body.items)) {
      qty = body.items.reduce((a, b) => a + normalizeQty(b.qty), 0);
    }

    const quote = await getEnviaQuote(zip, qty, country);

    if (quote && quote.mxn) {
      const floor = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
      const cost = Math.max(Number(quote.mxn), Number(floor));
      return jsonResponse(200, { ok: true, cost, label: `${quote.carrier} (${quote.days} días)` });
    }

    const isUS = country === "US";
    return jsonResponse(200, {
      ok: true,
      cost: isUS ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE,
      label: isUS ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)",
    });
  } catch (error) {
    return jsonResponse(200, { ok: true, cost: FALLBACK_MX_PRICE, label: "Envío Estándar" });
  }
};