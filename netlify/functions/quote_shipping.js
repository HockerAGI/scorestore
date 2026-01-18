const {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getEnviaQuote,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
} = require("./_shared");

// US ZIP: 12345 o 12345-6789 (solo dígitos y guion)
function cleanUSZip(v) {
  if (!v) return "";
  const s = String(v).trim();
  const m = s.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!m) return "";
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);

    const countryRaw = (body.country || "MX").toString().trim().toUpperCase();
    const country = countryRaw === "US" ? "US" : "MX";

    const rawZip = body.zip ?? body.postal_code ?? "";
    const zip = country === "MX" ? digitsOnly(rawZip) : cleanUSZip(rawZip);

    const qtyRaw = Number(body.items ?? 1);
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.floor(qtyRaw)) : 1;

    if (!zip || String(zip).length < 5) {
      return jsonResponse(400, { error: "CP inválido" });
    }

    // Intentar cotizar con Envia
    const quote = await getEnviaQuote(zip, qty, country);

    // Si Envia responde, asumimos quote.mxn = MXN (pesos)
    if (quote && Number.isFinite(Number(quote.mxn)) && Number(quote.mxn) > 0) {
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn),
        label: `${quote.carrier || "Envío"} (${quote.days || "N/A"})`,
      });
    }

    // Fallbacks seguros
    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    const fallbackLabel = country === "US" ? "Envío USA Estándar" : "Envío Nacional Estándar";

    return jsonResponse(200, { ok: true, cost: fallbackCost, label: fallbackLabel });
  } catch (err) {
    // Fallback final de emergencia (no romper checkout)
    return jsonResponse(200, { ok: true, cost: 250, label: "Envío Estándar" });
  }
};