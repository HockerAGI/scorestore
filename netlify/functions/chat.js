// netlify/functions/chat.js
/* =========================================================
   SCORE STORE — CHAT (Gemini) v2026 PROD (UNIFIED)
   - Endpoint: /.netlify/functions/chat
   - Respuesta: { reply }
   - GEMINI_API_KEY desde ENV (NO hardcode)
   ========================================================= */

const { jsonResponse, safeJsonParse, handleOptions } = require("./_shared");

// Modelo recomendado (cámbialo por ENV si quieres)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function geminiUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
}

// Prompt corto, ventas + soporte, SIN inventar datos
const SYSTEM_PROMPT = `
Eres SCORE AI (SCORE STORE). Tu rol: ventas + soporte.
Contexto real:
- Tienda oficial de mercancía SCORE International.
- Fabricación/operación/logística: Único Uniformes (BAJATEX S. de R.L. de C.V.) en Tijuana, BC.
- Envíos: cotización en vivo cuando está disponible (Envia.com). También pickup local Tijuana cuando aplique.
- Pagos: Stripe (tarjeta) y OXXO (México) cuando esté disponible.
Reglas:
- Español (es-MX), profesional, directo, orientado a cierre.
- Respuestas cortas (1–5 líneas) salvo que pidan detalle.
- Si preguntan por envío: pide país + CP/ZIP.
- Si preguntan por precios: remite a catálogo y guía por talla/estilo.
- Nunca inventes stock exacto, tiempos exactos o políticas legales: usa “estimado”.
`.trim();

function safeText(s, max = 1200) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function extractGeminiReply(data) {
  try {
    const c = data?.candidates?.[0];
    const parts = c?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p) => p?.text).filter(Boolean).join("\n")
      : "";
    return safeText(text, 1500) || "";
  } catch {
    return "";
  }
}

exports.handler = async (event) => {
  // Preflight CORS
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { reply: "Method Not Allowed" });
  }

  try {
    // Si no está configurada la key, no rompemos el front
    if (!GEMINI_API_KEY) {
      return jsonResponse(200, {
        reply:
          "Estoy en modo offline (falta GEMINI_API_KEY). Dime qué producto quieres y tu CP/ZIP + país y te guío para cerrar la compra.",
      });
    }

    const body = safeJsonParse(event.body);
    const userMsg = safeText(body?.message, 900);
    if (!userMsg) return jsonResponse(400, { reply: "Mensaje vacío." });

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\nUsuario: ${userMsg}\nSCORE AI:`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        maxOutputTokens: 220,
      },
    };

    // Timeout real para no colgar función
    const ctrl = new AbortController();
    const timeoutMs = 12000;
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    let data = null;
    try {
      const response = await fetch(geminiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          `Gemini HTTP ${response.status}`;
        console.error("[chat] Gemini error:", msg);
        return jsonResponse(200, {
          reply:
            "Ahorita no pude consultar el asistente en vivo. Dime tu talla y tu CP/ZIP + país y te digo la mejor opción de envío y compra.",
        });
      }
    } finally {
      clearTimeout(t);
    }

    const reply =
      extractGeminiReply(data) ||
      "Listo. Dime tu talla y tu CP/ZIP + país y te digo la mejor opción de envío.";

    return jsonResponse(200, { reply });
  } catch (error) {
    console.error("[chat] Critical:", error?.message || error);
    return jsonResponse(200, {
      reply:
        "Estoy en modo offline por un tema técnico. Dime qué quieres comprar y tu CP/ZIP + país y te guío paso a paso.",
    });
  }
};