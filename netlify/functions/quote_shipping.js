// netlify/functions/quote_shipping.js
/* =========================================================
   SCORE STORE — Shipping Quote (Envia.com) v2026
   - Entrada:
      { zip, country: "MX"|"US", items:[{qty:number}] }
   - Salida:
      { ok:true, cost:number, label:string, country, zip, source }
   ✅ Envia PRIORIDAD
   ✅ Fallback seguro si no hay key / falla Envia
   ========================================================= */

const {
  handleOptions,
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  digitsOnly,
  getFallbackShipping,
  validateZip,
  getEnviaQuote,
} = require("./_shared");

function sumQty(items) {
  if (!Array.isArray(items) || !items.length) return 1;
  return items.reduce((a, b) => a + normalizeQty(b?.qty), 0);
}

exports.handler = async (event) => {
  // Preflight
  const opt = handleOptions(event);
  if (opt) return opt;

  try {
    const body = safeJsonParse(event.body);
    const country = String(body.country || "MX").toUpperCase();
    const zip = digitsOnly(body.zip || "");
    const items = body.items || [];
    const qty = sumQty(items);

    if (!zip || zip.length < 4) {
      return jsonResponse(400, { ok: false, error: "ZIP_INVALID" });
    }

    // Validación zip (si hay key)
    const zipCheck = await validateZip(country, zip);
    if (zipCheck?.ok === false) {
      return jsonResponse(404, { ok: false, error: zipCheck.error || "ZIP_NOT_FOUND" });
    }

    // Envia quote real (si hay key)
    const quote = await getEnviaQuote(zip, qty, country);
    if (quote?.ok && quote?.mxn > 0) {
      const daysTxt =
        Number.isFinite(quote.days) && quote.days > 0 ? ` · ${quote.days}d` : "";

      const carrierTxt = quote.carrier ? String(quote.carrier).toUpperCase() : "ENVIA";
      const serviceTxt = quote.service ? ` ${quote.service}` : "";

      return jsonResponse(200, {
        ok: true,
        country,
        zip,
        cost: Number(quote.mxn),
        label: `${carrierTxt}${serviceTxt}${daysTxt}`.trim(),
        source: "envia",
      });
    }

    // Fallback seguro
    const fallback = getFallbackShipping(country);
    return jsonResponse(200, {
      ok: true,
      country,
      zip,
      cost: fallback,
      label: "Envío (Estimación)",
      source: "fallback",
    });
  } catch (e) {
    console.error("[quote_shipping] error:", e?.message || e);

    // Respuesta robusta
    return jsonResponse(500, {
      ok: false,
      error: "QUOTE_ERROR",
    });
  }
};