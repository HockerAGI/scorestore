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
      qty = body.items.reduce((acc, item) => acc + normalizeQty(item.quantity || item.qty), 0);
    } else {
      qty = normalizeQty(body.items || body.qty || 1);
    }

    if (!zip || zip.length < 5) return jsonResponse(400, { error: "Código postal inválido" });

    const quote = await getEnviaQuote(zip, qty, country);

    if (quote) {
      return jsonResponse(200, { ok: true, cost: quote.mxn, label: `${quote.carrier} (${quote.days} días)` });
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