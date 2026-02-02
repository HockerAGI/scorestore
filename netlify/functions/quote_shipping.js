const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  getEnviaQuote,
} = require("./_shared");

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  const body = safeJsonParse(event.body || "{}") || {};
  const zip = (body.zip || "").toString();
  const country = (body.country || "MX").toString();
  const items = Array.isArray(body.items) ? body.items : [];

  const items_qty = items.reduce((acc, it) => acc + Number(it.qty || 0), 0) || 1;

  const q = await getEnviaQuote({ zip, country, items_qty });

  return jsonResponse(200, {
    ok: true,
    mode: q.mode,
    amount: q.amount,
    label: q.label,
    carrier: q.carrier || null,
  });
};