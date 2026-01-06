const {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getEnviaQuote
} = require("./_shared");

exports.handler = async (event) => {
  // CORS Pre-flight
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const zip = digitsOnly(body.zip || body.postal_code);
    const qty = Math.max(1, parseInt(body.items || 1, 10));

    if (!zip || zip.length < 5) {
      return jsonResponse(400, { error: "CP inválido" });
    }

    const quote = await getEnviaQuote(zip, qty);

    if (quote) {
      return jsonResponse(200, {
        ok: true,
        cost: quote.mxn,
        label: `${quote.carrier} (${quote.days || "3-7 días"})`,
        carrier: quote.carrier,
        source: "envia"
      });
    }

    // Fallback (sin API key o sin respuesta)
    return jsonResponse(200, {
      ok: true,
      cost: 250,
      label: "Envío Nacional Estándar",
      source: process.env.ENVIA_API_KEY ? "fallback_no_rate" : "fallback_no_envia_key"
    });

  } catch (err) {
    console.error("Shipping Quote Error:", err);
    // Recuperación de error para no bloquear la UI
    return jsonResponse(200, {
      ok: true,
      cost: 250,
      label: "Envío Nacional Estándar",
      source: "error_rescue"
    });
  }
};