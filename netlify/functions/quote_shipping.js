// netlify/functions/quote_shipping.js
const {
  jsonResponse,
  safeJsonParse,
  getEnviaQuote,
  validateZip,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  normalizeQty,
  digitsOnly,
} = require("./_shared");

// country puede venir como "MX"/"US" o modo "mx"/"us"
function countryFromBody(body) {
  const c = String(body?.country || body?.cc || body?.mode || "MX").toUpperCase();
  if (c === "US" || c === "USA" || c === "UNITEDSTATES") return "US";
  return "MX";
}

// Label neutro (sin mencionar carrier/paquetería)
function buildLabel(country, days, source) {
  const isUS = country === "US";
  const eta = Number(days) ? ` · ${Number(days)} días` : "";

  if (source === "envia") return `Envío estimado${eta}`;
  return isUS ? `Envío internacional${eta}` : `Envío nacional${eta}`;
}

exports.handler = async (event) => {
  // CORS + Método
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = safeJsonParse(event.body);
    const country = countryFromBody(body);

    // zip/cp/postal_code/postalCode
    const zip = digitsOnly(body?.zip || body?.cp || body?.postal_code || body?.postalCode || "");

    // items: [{qty}] o [{quantity}] — si no viene, simulamos 1
    const items = Array.isArray(body?.items) && body.items.length ? body.items : [{ qty: 1 }];
    const totalQty = items.reduce((acc, i) => acc + normalizeQty(i?.qty || i?.quantity || 1), 0);

    // Validación rápida
    if (!zip || zip.length < 4) {
      return jsonResponse(200, { ok: false, error: "ZIP_INVALID" });
    }

    // 1) Validar ZIP real con Geocodes
    // Si NO hay ENVIA_API_KEY, validateZip debe devolver {ok:true, source:"no_key"} y no bloquear.
    const v = await validateZip(country, zip);
    if (!v?.ok) {
      return jsonResponse(200, { ok: false, error: v?.error || "ZIP_NOT_FOUND" });
    }

    // 2) Cotización real (Ship Rate)
    // Estimación simple por pieza:
    // - 0.5 kg por item
    // - caja 30x25 y altura escalable
    const qty = Math.max(1, totalQty);
    const estWeightKg = Math.max(0.5, qty * 0.5);
    const L = 30;
    const W = 25;
    const H = Math.min(30, 5 + qty * 2);

    const quote = await getEnviaQuote(zip, qty, country, estWeightKg, L, H, W);

    if (quote?.mxn && Number(quote.mxn) > 0) {
      const cost = Number(quote.mxn);
      return jsonResponse(200, {
        ok: true,
        cost,
        label: buildLabel(country, quote.days, "envia"),
        source: "envia",
        meta: {
          days: quote.days || null,
          zip_validated: v.source || "geocodes",
          qty,
        },
      });
    }

    // 3) Fallback (SOLO si ZIP fue validado)
    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;

    return jsonResponse(200, {
      ok: true,
      cost: fallbackCost,
      label: buildLabel(country, null, "fallback"),
      source: "fallback",
      meta: {
        zip_validated: v.source || "geocodes",
        qty,
      },
    });
  } catch (err) {
    console.error("[quote_shipping] Critical:", err);
    return jsonResponse(200, { ok: false, error: "QUOTE_FAILED" });
  }
};