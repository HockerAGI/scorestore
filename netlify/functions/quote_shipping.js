const { jsonResponse, safeJsonParse, digitsOnly, getEnviaQuote } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const body = safeJsonParse(event.body, {});
  const zip = digitsOnly(body.postal_code);
  const items = Math.max(1, parseInt(body.items, 10) || 1);

  if (zip.length !== 5) return jsonResponse(400, { error: "CP Inválido" });

  const quote = await getEnviaQuote(zip, items);

  if (quote) {
    return jsonResponse(200, { ok: true, mxn: quote.mxn, label: quote.label, days: quote.days });
  }

  return jsonResponse(200, { ok: true, mxn: 250, label: "Envío Nacional", fallback: true });
};