const {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getEnviaQuote
} = require("./_shared");

exports.handler = async (event) => {
  try {
    // 1. Permitir CORS (para que el navegador no bloquee)
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, {});
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method Not Allowed" });
    }

    // 2. Leer datos (Alineado con main.js)
    const body = safeJsonParse(event.body, {});
    
    // Aquí estaba el detalle: main.js envía 'zip', no 'postal_code'
    const zip = digitsOnly(body.zip || body.postal_code); 
    
    // main.js envía 'items', aseguramos que sea mínimo 1
    const qty = Math.max(1, parseInt(body.items || body.qty, 10) || 1);

    // 3. Validación rápida
    if (!zip || zip.length < 5) {
      return jsonResponse(400, { error: "CP inválido (debe ser 5 dígitos)" });
    }

    // 4. Intentar cotizar en Envia.com
    let quote = null;
    try {
      console.log(`Cotizando envío a CP: ${zip}, Items: ${qty}`);
      quote = await getEnviaQuote(zip, qty);
    } catch (error) {
      console.error("Error conectando con Envia:", error);
      quote = null;
    }

    // 5. Respuesta Exitosa (Si hubo cotización real)
    if (quote && quote.mxn) {
      return jsonResponse(200, {
        ok: true,
        cost: quote.mxn,       // main.js espera 'cost'
        label: quote.label,
        days: quote.days,
        carrier: quote.carrier,
        source: "envia"
      });
    }

    // 6. Fallback (Si falla Envia, cobramos tarifa estándar $250)
    console.log("Usando tarifa fallback ($250)");
    return jsonResponse(200, {
      ok: true,
      cost: 250,
      label: "Envío Nacional Estándar",
      days: "3-7",
      source: "fallback"
    });

  } catch (err) {
    console.error("Error crítico en shipping:", err);
    // Último recurso: devolver error 200 con costo default para no romper el carrito
    return jsonResponse(200, {
      ok: true,
      cost: 250,
      label: "Envío Nacional",
      source: "error_rescue"
    });
  }
};
