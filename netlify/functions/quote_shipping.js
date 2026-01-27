const { jsonResponse, safeJsonParse, normalizeQty, quoteShipping } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const body = safeJsonParse(event.body);
  const zip = String(body.zip || "").trim();
  const country_code = String(body.country || "MX").trim().toUpperCase();
  const qty = normalizeQty(body.qty);

  if (!zip) return jsonResponse(400, { error: "CP requerido" });

  const quote = await quoteShipping({ postal_code: zip, country_code, qty });
  if (!quote) return jsonResponse(200, { ok: false, note: "Sin cotización (token o cobertura)" });

  return jsonResponse(200, { ok: true, quote });
};