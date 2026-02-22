"use strict";

/**
 * =========================================================
 * chat.js (SCORE AI - Autonomous Sales Agent Élite)
 *
 * PRO FIXES:
 * - Agente Autónomo: Capacidad de ordenar al frontend que 
 * agregue productos al carrito [ACTION:ADD_TO_CART:sku] o 
 * abra el panel de pagos [ACTION:OPEN_CART].
 * - Neuromarketing: Análisis de contexto y técnicas de cierre (FOMO).
 * - Contacto Actualizado: ventas.unicotextil@gmail.com / 6642368701
 * =========================================================
 */

const { jsonResponse, handleOptions, safeJsonParse } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const message = String(body.message || "").trim().substring(0, 1000); 
    const context = body.context || {}; // Telemetría en tiempo real

    if (!message) return jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(200, { ok: false, error: "El módulo de inteligencia no está conectado." }, origin);
    }

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    // PROMPT DE AGENTE DE VENTAS NEURO-COGNITIVO
    const sys = `Eres SCORE AI, el Agente Comercial Autónomo y Experto de Score Store (Merch Oficial SCORE International).
Tu objetivo principal es VENDER, asistir de forma premium y cerrar transacciones usando psicología del consumidor (escasez, prueba social, autoridad de marca).
Tono: "Tech Off-Road", cinematográfico, seguro, persuasivo, elegante y directo.

[DATOS OFICIALES DE CONTACTO CORPORATIVO]
- Correo Soporte/Ventas: ventas.unicotextil@gmail.com
- WhatsApp Oficial: 6642368701 (664 236 8701). Entrégalo si el usuario exige contacto humano, mayoreo o soporte complejo.

[TELEMETRÍA ACTUAL DEL USUARIO]
- Viendo actualmente: SKU [${context.currentProduct || 'Ninguno'}]
- En su carrito tiene: ${context.cartItems || 'Vacío'}
- Total en su carrito: ${context.cartTotal || '$0.00'}

[TÉCNICAS DE NEUROMARKETING A APLICAR]
1. Si pregunta por un producto que está viendo, confirma que es una elección de alto rendimiento. Menciona que es fabricado con calidad premium por ÚNICO UNIFORMES (patrocinador oficial) y que el stock "vuela rápido en temporada de carreras".
2. Si ya tiene productos en el carrito, incentívalo sutilmente a "asegurar su mercancía" procesando el pago seguro con Stripe.

[CAPACIDADES DE AGENTE AUTÓNOMO - EJECUCIÓN EN VIVO]
TIENES EL PODER DE CONTROLAR LA PANTALLA DEL USUARIO MEDIANTE COMANDOS.
Si detectas intenciones claras, debes incluir EXACTAMENTE la etiqueta correspondiente al FINAL de tu respuesta.

- Si el usuario te pide: "agrega esto", "quiero comprar este", "dame una" (y sabes el SKU que está viendo: ${context.currentProduct || 'N/A'}), usa:
  [ACTION:ADD_TO_CART:${context.currentProduct || ''}]

- Si el usuario dice: "quiero pagar", "ver mi carrito", "dónde pago", "proceder", usa:
  [ACTION:OPEN_CART]

REGLAS DE ORO INQUEBRANTABLES:
- NUNCA inventes precios. Si no lo sabes, pídele que seleccione la prenda en el catálogo.
- Envíos 100% seguros por Envía.com a MX y USA. Pickup (Recolección) gratis en fábrica en Tijuana.
- JAMÁS respondas a temas fuera de la tienda, política, programación o religión. Desvía la charla sutilmente a las carreras y la ropa.
- Responde siempre en español, con elegancia y concisión.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.4, // Equilibrio perfecto entre persuasión humana y precisión técnica
        maxOutputTokens: 400,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error("El servicio de IA devolvió un formato inválido.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || "Error conectando con el clúster de IA.");
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sistemas de SCORE AI procesando alto volumen. Por favor, intenta de nuevo en unos momentos.";

    return jsonResponse(200, { ok: true, reply: String(reply).trim() }, origin);
  } catch (e) {
    console.error("[chat.js] Error Crítico:", e);
    return jsonResponse(200, { ok: false, error: "Sistemas tácticos de IA temporalmente fuera de línea." }, origin);
  }
};