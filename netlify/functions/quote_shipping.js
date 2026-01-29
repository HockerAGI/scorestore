/* netlify/functions/quote_shipping.js */
const {
  jsonResponse,
  safeJsonParse,
  getEnviaQuote,
  validateZip,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  normalizeQty,
  digitsOnly,
  handleOptions,
} = require("./_shared");

function countryFromBody(body) {
  const raw = String(body?.country || body?.cc || body?.mode || "MX").trim();
  const c = raw.toUpperCase();
  if (c === "US" || c === "USA" || c === "UNITEDSTATES") return "US";
  return "MX";
}

function buildLabel(country, days, source) {
  const d = Number(days);
  const eta = Number.isFinite(d) && d > 0 ? ` · ${d} días` : "";
  if (source === "envia") return `Envío estimado${eta}`;
  return country === "US" ? `Envío internacional${eta}` : `Envío nacional${eta}`;
}

function zipFromBody(body) {
  return digitsOnly(body?.zip || body?.cp || body?.postal_code || body?.postalCode || "");
}

function totalQtyFromBody(body) {
  const items = Array.isArray(body?.items) && body.items.length ? body.items : [{ qty: 1 }];
  return items.reduce((acc, i) => acc + normalizeQty(i?.qty || i?.quantity || 1), 0);
}

exports.handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const country = countryFromBody(body);
    const zip = zipFromBody(body);
    const qty = Math.max(1, totalQtyFromBody(body));

    if (!zip || zip.length < 4) return jsonResponse(200, { ok: false, error: "ZIP_INVALID" });

    const v = await validateZip(country, zip);
    if (!v?.ok) return jsonResponse(200, { ok: false, error: v?.error || "ZIP_NOT_FOUND" });

    const estWeightKg = Math.max(1, qty * 0.6);
    const L = 30, W = 20, H = Math.min(60, 5 + Math.ceil(qty * 3));

    const quote = await getEnviaQuote(zip, qty, country, estWeightKg, L, H, W);

    if (quote?.mxn && Number(quote.mxn) > 0) {
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn),
        label: buildLabel(country, quote.days, "envia"),
        source: "envia",
        meta: { days: quote.days || null, zip_validated: v.source || "geocodes", qty },
      });
    }

    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    return jsonResponse(200, {
      ok: true,
      cost: fallbackCost,
      label: buildLabel(country, null, "fallback"),
      source: "fallback",
      meta: { zip_validated: v.source || "geocodes", qty },
    });
  } catch (err) {
    console.error("[quote_shipping] Critical:", err?.message || err);
    return jsonResponse(200, { ok: false, error: "QUOTE_FAILED" });
  }
};