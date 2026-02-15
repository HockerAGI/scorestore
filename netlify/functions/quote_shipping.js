const { jsonResponse, handleOptions, safeJsonParse, getEnviaQuote } = require("./_shared");

// /.netlify/functions/quote_shipping
// Input (frontend v2026_PROD_UNIFIED_401):
//  { mode:"pickup"|"mx"|"us", zip:"22000", cart:[{qty,price,sku}], items:[{quantity,...}] }
//
// Output (frontend expects):
//  { ok:true, amount:<mxn>, label, carrier }
//
// Compat extra:
//  also returns: cost + amount_mxn

function normalizeMode(body) {
  const m = String(body?.mode || body?.shippingMode || body?.shipping_mode || "").toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "us" || m === "usa") return "us";
  if (m === "mx" || m === "mex" || m === "mexico") return "mx";
  // fallback by country
  const c = String(body?.country || body?.shippingCountry || "MX").toUpperCase();
  return c === "US" ? "us" : "mx";
}

function sumQtyFromBody(body) {
  // Prefer cart qty (es lo que manda tu front)
  if (Array.isArray(body?.cart) && body.cart.length) {
    const s = body.cart.reduce((a, it) => a + (Number(it?.qty) || 1), 0);
    return Math.max(1, Math.round(s || 1));
  }
  // else items array
  if (Array.isArray(body?.items) && body.items.length) {
    const s = body.items.reduce((a, it) => a + (Number(it?.quantity ?? it?.qty) || 1), 0);
    return Math.max(1, Math.round(s || 1));
  }
  // else explicit
  if (Number(body?.items_qty)) return Math.max(1, Math.round(Number(body.items_qty)));
  return 1;
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = safeJsonParse(event.body || "{}") || {};

    const mode = normalizeMode(body);
    if (mode === "pickup") {
      return jsonResponse(200, {
        ok: true,
        amount: 0,
        cost: 0,
        amount_mxn: 0,
        label: "Pickup Gratis",
        carrier: "pickup",
        provider: "pickup",
      });
    }

    const zip = String(body.zip || body.postal_code || body.cp || body.shippingData?.zip || "").trim();
    const country = mode === "us" ? "US" : "MX";

    const items_qty = sumQtyFromBody(body);

    const q = await getEnviaQuote({ zip, country, items_qty });

    // q ya trae amount + carrier + label, con fallback interno
    const amount = Number(q?.amount ?? q?.amount_mxn ?? q?.cost ?? 0) || 0;

    return jsonResponse(200, {
      ok: true,
      amount,
      cost: amount,
      amount_mxn: amount,
      label: q?.label || (country === "US" ? "Internacional Estándar" : "Nacional Estándar"),
      carrier: q?.carrier || null,
      provider: q?.mode || "fallback",
    });
  } catch (err) {
    // fallback duro (no romper checkout)
    const amount = 250;
    return jsonResponse(200, {
      ok: true,
      amount,
      cost: amount,
      amount_mxn: amount,
      label: "Nacional Estándar",
      carrier: null,
      provider: "fallback",
      note: err?.message || String(err),
    });
  }
};
