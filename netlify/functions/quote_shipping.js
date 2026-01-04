const {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getEnviaQuote
} = require("./_shared");

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, {});
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method Not Allowed" });
    }

    const body = safeJsonParse(event.body, {});
    const zip = digitsOnly(body.postal_code);

    // qty total de items en carrito (no solo líneas)
    const qty = Math.max(1, parseInt(body.qty, 10) || 1);

    if (!zip || zip.length !== 5) {
      return jsonResponse(400, { error: "CP inválido" });
    }

    let quote = null;
    try {
      quote = await getEnviaQuote(zip, qty);
    } catch {
      quote = null;
    }

    if (quote && quote.mxn) {
      return jsonResponse(200, {
        ok: true,
        mxn: quote.mxn,
        label: quote.label,
        days: quote.days,
        source: "envia"
      });
    }

    // Fallback controlado
    return jsonResponse(200, {
      ok: true,
      mxn: 250,
      label: "Envío Nacional",
      days: null,
      source: "fallback"
    });

  } catch (err) {
    return jsonResponse(500, { error: "Error cotizando envío" });
  }
};