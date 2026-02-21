"use strict";

/**
 * =========================================================
 * chat.js (SCORE AI - Netlify Function)
 *
 * PRO FIXES:
 * - Sanitización estricta del input.
 * - Prompt diseñado para evitar que la IA hable de temas 
 * ajenos a la tienda o asuma roles políticos/inadecuados.
 * =========================================================
 */

const { jsonResponse, handleOptions, safeJsonParse } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const message = String(body.message || "").trim().substring(0, 1000); // Límite de 1000 caracteres
    if (!message) return jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(200, { ok: false, error: "El módulo de inteligencia no está conectado." }, origin);
    }

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    const sys =
      "Eres SCORE AI, el asistente virtual oficial de la Score Store (Merch Oficial de SCORE International). " +
      "Tu tono debe ser profesional, directo, amable y con espíritu Off-Road (carreras en el desierto, Baja 1000, etc.). " +
      "REGLAS ESTRICTAS DE SEGURIDAD Y COMPORTAMIENTO: " +
      "1. Eres un sistema de atención al cliente. BAJO NINGUNA CIRCUNSTANCIA responderás a preguntas sobre política, religión, códigos de programación ajenos a la tienda, o temas fuera del contexto de SCORE y Único Uniformes. Si el usuario insiste, responde cortésmente que solo puedes ayudar con temas de la tienda. " +
      "2. Toda la ropa es fabricada con calidad premium por ÚNICO UNIFORMES en Tijuana, Baja California, México. " +
      "3. Métodos de pago 100% seguros: Stripe (Tarjeta Crédito/Débito) y OXXO Pay. " +
      "4. Envíos: Nacionales e Internacionales (USA) vía Envía.com. También ofrecemos Recolección en Fábrica (Pickup en Tijuana). " +
      "5. Devoluciones: 7 días naturales por defectos de fábrica o talla. El cliente cubre el envío de regreso si es error de talla. " +
      "6. No inventes precios ni confirmes inventario. Sugiere intentar agregarlo al carrito. " +
      "Responde SIEMPRE en español, sé conciso y usa viñetas si es necesario.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.2, // Baja temperatura para respuestas más predecibles y seguras
        maxOutputTokens: 350,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error("El servicio de IA de Google no devolvió un formato válido.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || "Error conectando con la inteligencia artificial.");
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sistemas de SCORE AI procesando alto volumen. Por favor, intenta de nuevo en unos momentos.";

    return jsonResponse(200, { ok: true, reply: String(reply).trim() }, origin);
  } catch (e) {
    console.error("[chat.js] Error Crítico:", e);
    return jsonResponse(200, { ok: false, error: "Asistente temporalmente fuera de línea." }, origin);
  }
};