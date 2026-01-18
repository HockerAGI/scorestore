/**
 * quote_shipping.js — FINAL MASTER (unificado)
 * - Envia.com quote (si ENVIA_API_KEY existe)
 * - Fallbacks seguros (MX=250, US=800)
 * - ZIP MX/US validación real
 */

const {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getEnviaQuote,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
} = require("./_shared");

// US ZIP: 12345 o 12345-6789
function cleanUSZip(v) {
  if (!v) return "";
  const s = String(v).trim();
  const m = s.match(/^(\d{5})(?:-?(\d{4}))?$/);
  if (!m) return "";
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

function toInt(n, fallback = 1) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.floor(x) : fallback;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);

    const countryRaw = String(body.country || "MX").trim().toUpperCase();
    const country = countryRaw === "US" ? "US" : "MX";

    const rawZip = body.zip ?? body.postal_code ?? "";
    const zip = country === "MX" ? digitsOnly(rawZip) : cleanUSZip(rawZip);

    const qty = Math.max(1, toInt(body.items ?? 1, 1));

    if (!zip || String(zip).length < 5) {
      return jsonResponse(400, { error: country === "US" ? "ZIP inválido" : "CP inválido" });
    }

    // Intentar cotizar con Envia (si hay ENVIA_API_KEY)
    const quote = await getEnviaQuote(zip, qty, country);

    if (quote && Number.isFinite(Number(quote.mxn)) && Number(quote.mxn) > 0) {
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn),
        label: `${quote.carrier || "Envío"} (${quote.days || "N/A"})`,
      });
    }

    // Fallbacks seguros del manifiesto
    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    const fallbackLabel = country === "US" ? "Envío USA Estándar" : "Envío Nacional Estándar";
    return jsonResponse(200, { ok: true, cost: fallbackCost, label: fallbackLabel });
  } catch (err) {
    // Fallback final de emergencia (no romper flujo)
    const countryRaw = (() => {
      try {
        const b = safeJsonParse(event.body);
        return String(b.country || "MX").toUpperCase();
      } catch {
        return "MX";
      }
    })();
    const isUS = countryRaw === "US";
    return jsonResponse(200, {
      ok: true,
      cost: isUS ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE,
      label: "Envío Estándar",
    });
  }
};