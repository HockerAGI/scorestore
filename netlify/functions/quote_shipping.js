// netlify/functions/quote_shipping.js
const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  isMxPostal,
  validateCartItems,
  computeShipping
} = require("./_shared");

exports.handler = async (event) => {
  // 1. Manejo de CORS (Preflight para navegadores)
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  // 2. Validar Método HTTP
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  try {
    const body = safeJsonParse(event.body, {});
    const mode = toStr(body.mode); // pickup, tj, mx
    const rawTo = body.to || {};

    // 3. Validar Carrito
    const vItems = validateCartItems(body.items);
    if (!vItems.ok) {
      return jsonResponse(400, { error: vItems.error });
    }

    // 4. Sanitizar Dirección de Destino
    const to = {
      postal_code: digitsOnly(rawTo.postal_code),
      state_code: upper(rawTo.state_code),
      city: toStr(rawTo.city),
      address1: toStr(rawTo.address1),
      name: toStr(rawTo.name)
    };

    // 5. Validación Temprana para UX (Solo si es nacional)
    // Si el usuario seleccionó envío nacional pero no ha llenado la dirección completa,
    // devolvemos un precio estimado visual para no gastar llamadas a la API de Envia.
    if (mode === 'mx' || mode === 'envia') {
       if (!isMxPostal(to.postal_code) || !to.state_code || !to.city || !to.address1) {
         return jsonResponse(200, {
           ok: true,
           mxn: 250, // Precio "visual" estimado
           carrier: "ESTIMADO",
           service: "Completa dirección para cotizar en vivo"
         });
       }
    }

    // 6. Cálculo Real (Llama a la lógica blindada de _shared.js)
    // Esto maneja automáticamente: Pickup, TJ Local, API Envia y Fallbacks.
    const result = await computeShipping({
      mode,
      to,
      items: vItems.items
    });

    // 7. Respuesta al Frontend
    return jsonResponse(200, {
      ok: true,
      mxn: result.mxn,
      carrier: result.carrier || "SCORE",
      service: result.label || result.service || "Estándar",
      days: result.days || 3
    });

  } catch (e) {
    console.error("Quote Error:", e);
    // Fallback de emergencia para no romper el carrito
    return jsonResponse(200, {
      ok: true,
      mxn: 280,
      carrier: "ESTIMADO",
      service: "Tarifa estándar (Error conexión)"
    });
  }
};
