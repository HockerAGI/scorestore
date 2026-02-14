const { jsonResponse, handleOptions, safeJsonParse, getEnviaQuote } = require("./_shared");

// /.netlify/functions/quote_shipping
// Accepts:
//  - { zip, country, items:[{qty}] }
//  - { zip, country, items_qty: 3 }
// Returns:
//  - { ok:true, cost:<mxn>, amount_mxn:<mxn>, label }

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = safeJsonParse(event.body || "{}") || {};

    const zip = String(body.zip || body.postal_code || body.cp || "").trim();
    const country = String(body.country || "MX").toUpperCase();

    let qty = 1;
    if (Array.isArray(body.items) && body.items.length) {
      qty = body.items.reduce((a, it) => a + (Number(it.qty) || 1), 0);
    } else if (Number(body.items_qty)) {
      qty = Math.max(1, Number(body.items_qty));
    }

    // Envia quote expects items array w/ qty
    const enviaItems = [{ qty }];

    const q = await getEnviaQuote({ zip, country, items: enviaItems });

    if (q?.ok) {
      const cost = Number(q.amount_mxn || 0);
      return jsonResponse(200, {
        ok: true,
        cost,
        amount_mxn: cost,
        label: q.label || "Envío",
        provider: q.provider || "envia",
      });
    }

    // Fallback (should be rare)
    const fallback = country === "US" ? 800 : 250;
    return jsonResponse(200, {
      ok: true,
      cost: fallback,
      amount_mxn: fallback,
      label: country === "US" ? "Internacional Estándar" : "Nacional Estándar",
      provider: "fallback",
    });
  } catch (err) {
    const fallback = 250;
    return jsonResponse(200, {
      ok: true,
      cost: fallback,
      amount_mxn: fallback,
      label: "Nacional Estándar",
      provider: "fallback",
      note: err?.message || String(err),
    });
  }
};