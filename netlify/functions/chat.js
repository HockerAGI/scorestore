"use strict";

const { jsonResponse, handleOptions, safeJsonParse } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const message = String(body.message || "").trim();
    if (!message) return jsonResponse(400, { ok: false, error: "message requerido" }, origin);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(200, { ok: false, error: "GEMINI_API_KEY no configurada en el servidor." }, origin);
    }

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    const sys =
      "Eres SCORE AI, el asistente virtual oficial de la Score Store (Merch Oficial de SCORE International). " +
      "Tu tono debe ser profesional, directo, amable y con espíritu Off-Road (carreras en el desierto, Baja 1000, etc.). " +
      "REGLAS ESTRICTAS: " +
      "1. Toda la ropa es fabricada con calidad premium por ÚNICO UNIFORMES en Tijuana, Baja California. " +
      "2. Los métodos de pago son 100% seguros mediante Stripe (Tarjeta de Crédito/Débito) y OXXO Pay. " +
      "3. Envíos: Ofrecemos entregas por Envia.com a todo México y USA. También existe la opción de Recoger en Fábrica (Pickup en Tijuana) sin costo. " +
      "4. Cambios y devoluciones: 7 días naturales por defectos de fábrica (costo cubierto por nosotros) o cambios de talla (costo de envío cubierto por el cliente). " +
      "5. No inventes precios ni inventario exacto. Si te piden algo fuera de la tienda o muy específico, sugiere contactar el correo de soporte que aparece en el footer de la tienda. " +
      "Responde siempre en español, con respuestas cortas y estructuradas en párrafos pequeños.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       throw new Error("El servicio de IA no devolvió un formato válido.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || "Error conectando con la inteligencia artificial.");
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sistemas de SCORE AI temporalmente ocupados. Intenta más tarde.";

    return jsonResponse(200, { ok: true, reply: String(reply).trim() }, origin);
  } catch (e) {
    console.error("[chat.js] Error:", e);
    return jsonResponse(200, { ok: false, error: String(e?.message || e) }, origin);
  }
};