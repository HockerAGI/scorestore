const { jsonResponse, safeJsonParse, normalizeQty, getEnviaQuote } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const zip = String(body.zip || "").trim();
    const country = String(body.country || "MX").toUpperCase();
    const qty = normalizeQty(body.qty);

    if (!zip) return jsonResponse(400, { error: "CP requerido" });

    const quote = await getEnviaQuote(zip, qty, country);
    if (!quote) {
      return jsonResponse(200, {
        ok: false,
        note: "No se pudo cotizar con Envia (token faltante o CP sin cobertura).",
      });
    }

    return jsonResponse(200, { ok: true, quote });
  } catch (e) {
    console.error("quote_shipping error:", e);
    return jsonResponse(500, { error: "Error al cotizar envío." });
  }
};
