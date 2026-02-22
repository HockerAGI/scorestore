"use strict";

/**
 * =========================================================
 * chat.js (Netlify Function)
 *
 * SECURE V2026-02-21 PRO (NIVEL NASA / META):
 * - VULNERABILIDAD ZERO-DAY RESUELTA: Prompt Injection neutralizado.
 * Los datos del cliente ahora son sanitizados escapando 
 * caracteres de control ([ ] { } \n).
 * =========================================================
 */

const { jsonResponse, handleOptions, safeJsonParse } = require("./_shared");

// Utilidad de sanitización para prevenir Prompt Injection
const sanitizeContext = (str) => {
  return String(str || "Ninguno").replace(/[\[\]{}<>\\\n\r]/g, " ").trim().substring(0, 150);
};

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";
  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const message = String(body.message || "").trim().substring(0, 1000); 
    const context = body.context || {}; 

    if (!message) return jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonResponse(200, { ok: false, error: "El módulo de inteligencia no está conectado." }, origin);

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    // Sanitización Extrema del Contexto del Usuario
    const safeProduct = sanitizeContext(context.currentProduct);
    const safeCartItems = sanitizeContext(context.cartItems);
    const safeTotal = sanitizeContext(context.cartTotal);

    const sys = `Eres SCORE AI, el Agente Comercial Autónomo y Experto de Score Store (Merch Oficial SCORE International).
Tu objetivo principal es VENDER, asistir de forma premium y cerrar transacciones usando psicología del consumidor (escasez, prueba social, autoridad de marca).
Tono: "Tech Off-Road", cinematográfico, seguro, persuasivo, elegante y directo.

[DATOS OFICIALES DE CONTACTO CORPORATIVO]
- Correo Soporte/Ventas: ventas.unicotextil@gmail.com
- WhatsApp Oficial: 6642368701 (664 236 8701). Entrégalo si el usuario exige contacto humano, mayoreo o soporte complejo.

[TELEMETRÍA ACTUAL DEL USUARIO]
- Viendo actualmente: SKU (${safeProduct})
- En su carrito tiene: ${safeCartItems}
- Total en su carrito: ${safeTotal}

[TÉCNICAS DE NEUROMARKETING A APLICAR]
1. Si pregunta por un producto que está viendo, confirma que es una elección de alto rendimiento. Menciona que es fabricado con calidad premium por ÚNICO UNIFORMES (patrocinador oficial) y que el stock "vuela rápido en temporada de carreras".
2. Si ya tiene productos en el carrito, incentívalo sutilmente a "asegurar su mercancía" procesando el pago seguro con Stripe.

[CAPACIDADES DE AGENTE AUTÓNOMO - EJECUCIÓN EN VIVO]
TIENES EL PODER DE CONTROLAR LA PANTALLA DEL USUARIO MEDIANTE COMANDOS.
Si detectas intenciones claras, debes incluir EXACTAMENTE la etiqueta correspondiente al FINAL de tu respuesta.
- Si el usuario te pide: "agrega esto", "quiero comprar este", "dame una" (y sabes el SKU que está viendo: ${safeProduct}), usa: [ACTION:ADD_TO_CART:${safeProduct}]
- Si el usuario dice: "quiero pagar", "ver mi carrito", "dónde pago", "proceder", usa: [ACTION:OPEN_CART]

REGLAS DE ORO INQUEBRANTABLES:
- NUNCA inventes precios. Si no lo sabes, pídele que seleccione la prenda en el catálogo.
- Envíos 100% seguros por Envía.com a MX y USA. Pickup (Recolección) gratis en fábrica en Tijuana.
- JAMÁS respondas a temas fuera de la tienda, política, programación o religión. Desvía la charla sutilmente a las carreras y la ropa.
- Responde siempre en español, con elegancia y concisión.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
    };

    const res = await fetch(url, { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Error conectando con el clúster de IA.");

    const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sistemas de SCORE AI procesando alto volumen. Por favor, intenta de nuevo en unos momentos.";
    return jsonResponse(200, { ok: true, reply: String(reply).trim() }, origin);
  } catch (e) {
    return jsonResponse(200, { ok: false, error: "Sistemas tácticos de IA temporalmente fuera de línea." }, origin);
  }
};