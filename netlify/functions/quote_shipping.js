/* =========================================================
   SCORE STORE — Netlify Function: quote_shipping
   Route: /api/quote  ->  /.netlify/functions/quote_shipping

   ✅ Alineado a BLOQUE 1/2/3:
   Frontend espera (main.js):
     { ok:true, quote:{ total_cents:number } }

   Mantengo compat con versiones viejas:
     { ok:true, quote:{ amount_mxn:number, provider:string, ... } }

   ENV opcional:
   - ENVIA_API_KEY (si existe, cotiza real con Envia; si no, fallback)
   ========================================================= */

const {
  handleOptions,
  json,
  clampInt,
  getEnviaQuote,
  getFallbackShipping,
  isUSZip,
} = require("./_shared");

function normalizeShippingMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "delivery") return "delivery";
  return "pickup";
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" }, event);
    }

    const body = JSON.parse(event.body || "{}");
    const shipping_mode = normalizeShippingMode(body.shipping_mode);
    const postal_code = String(body.postal_code || "").trim();
    const itemsIn = Array.isArray(body.items) ? body.items : [];

    const items = itemsIn
      .map((it) => ({
        sku: String(it.sku || "").trim(),
        qty: clampInt(it.qty, 1, 99),
        size: String(it.size || "").trim(),
      }))
      .filter((it) => it.sku);

    if (shipping_mode === "pickup") {
      return json(200, { ok: true, quote: { total_cents: 0, amount_mxn: 0, provider: "pickup" } }, event);
    }

    if (!/^\d{5}$/.test(postal_code)) {
      return json(400, { ok: false, error: "postal_code invalid (5 digits)" }, event);
    }

    const to_country = isUSZip(postal_code) ? "US" : "MX";

    let quote = null;
    let provider = "fallback";

    if (process.env.ENVIA_API_KEY) {
      quote = await getEnviaQuote({
        to_postal_code: postal_code,
        to_country,
        items,
      });
      provider = quote ? "envia" : "fallback";
    }

    if (!quote) quote = getFallbackShipping({ postal_code, items });

    const amount_mxn = Math.round(quote?.amount_mxn ?? 0);
    const total_cents = amount_mxn * 100;

    return json(200, { ok: true, quote: { ...quote, amount_mxn, provider, total_cents } }, event);
  } catch (err) {
    console.error("quote_shipping error:", err);
    return json(500, { ok: false, error: "Quote failed" }, event);
  }
};
