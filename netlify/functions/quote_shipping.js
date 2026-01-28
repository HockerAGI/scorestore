// netlify/functions/quote_shipping.js
// Returns best-effort shipping quote using Envia (fallback if fails)
//
// POST body (tolerante):
// { zip|cp|postal_code: "...", country:"MX"|"US", items: 3 }
// o también:
// { zip:"...", country:"MX", items:[{qty:1},{qty:2}] }
//
// Respuesta estable:
// { ok:true, cost:<MXN>, label:"...", source:"envia|fallback|..." }

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
    const zip = digitsOnly(body.zip || body.cp || body.postal_code || "");

    // items puede venir como número o como array
    let qty = 1;
    if (Array.isArray(body.items)) {
      qty = body.items.reduce(
        (acc, item) => acc + normalizeQty(item.quantity || item.qty || 1),
        0
      );
    } else {
      qty = normalizeQty(body.items || body.qty || 1);
    }

    if (!zip || zip.length < 4) {
      const cost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
      return jsonResponse(200, {
        ok: true,
        cost,
        label: country === "US" ? "Envío USA (Estimado)" : "Envío Nacional (Estimado)",
        source: "fallback_no_zip",
      });
    }

    const quote = await getEnviaQuote(zip, qty, country);

    if (quote?.mxn) {
      const daysTxt = quote.days ? ` · ${quote.days} días` : "";
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn || 0),
        label: `Envío (${quote.carrier || "Envia"})${daysTxt}`,
        source: "envia",
      });
    }

    const cost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    return jsonResponse(200, {
      ok: true,
      cost,
      label: country === "US" ? "Envío USA (Estimado)" : "Envío Nacional (Estimado)",
      source: "fallback",
    });
  } catch (err) {
    console.error("[quote_shipping] error:", err);
    return jsonResponse(200, {
      ok: true,
      cost: FALLBACK_MX_PRICE,
      label: "Envío (Estimado)",
      source: "error_fallback",
    });
  }
};