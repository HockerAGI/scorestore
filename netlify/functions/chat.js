"use strict";

const { jsonResponse, handleOptions, safeJsonParse } = require("./_shared");
const axios = require("axios");

exports.handler = async (event) => {
  const origin = event?.headers?.origin;

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const message = String(body.message || "").trim();
    if (!message) return jsonResponse(400, { ok: false, error: "message requerido" }, origin);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Deja que el frontend haga fallback sin romper catálogo
      return jsonResponse(200, { ok: false, error: "GEMINI_API_KEY no configurada" }, origin);
    }

    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    const sys =
      "Eres SCORE AI para Score Store (Merch Oficial). Responde en español, directo y útil. " +
      "Ayuda con tallas, materiales, cambios, envíos (pickup en fábrica Tijuana / Envía México / Envía USA), y pagos (Stripe + OXXO). " +
      "Si te piden algo fuera de tienda, redirige a soporte.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: message }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 512,
      },
    };

    const res = await axios.post(url, payload, { headers: { "content-type": "application/json" }, timeout: 20000 });

    const reply =
      res?.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      res?.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Listo.";

    return jsonResponse(200, { ok: true, reply: String(reply || "Listo.").trim() }, origin);
  } catch (e) {
    return jsonResponse(200, { ok: false, error: String(e?.message || e) }, origin);
  }
};