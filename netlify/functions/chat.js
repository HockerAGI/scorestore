/* netlify/functions/chat.js */
/* =========================================================
   SCORE STORE — CHAT (Gemini) (2026_PROD_UNIFIED · Option B)
   - Alineado a main.js: endpoints.ai = "/.netlify/functions/chat"
   - Respuesta estándar: { reply }
   - CORS + OPTIONS
   - Timeout + validación robusta
   - GEMINI_API_KEY desde ENV (NO hardcode)
   ========================================================= */

const { jsonResponse, safeJsonParse } = require("./_shared");

// Modelo recomendado (puedes cambiarlo sin romper el front)
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-1.5-flash";

// KEY SOLO por ENV (producción real)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Endpoint oficial Gemini
function geminiUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
}

// Contexto SCORE STORE (ventas + soporte, corto y persuasivo)
const SYSTEM_PROMPT = `
Eres SCORE AI (SCORE STORE). Tu rol: ventas + soporte.
Contexto real:
- Tienda oficial de mercancía SCORE International.
- Operación / fabricación / logística: Único Uniformes (BAJATEX S. de R.L. de C.V.) en Tijuana, BC.
- Envíos: cotización en vivo cuando está disponible (Envia.com). También pickup local Tijuana cuando aplique.
- Pagos: Stripe (tarjeta) y OXXO en México cuando esté disponible.
Reglas de respuesta:
- Español (es-MX), tono profesional, directo y con intención de cierre.
- Responde corto (1–5 líneas) salvo que el usuario pida detalle.
- Si preguntan por precios: recomienda revisar catálogo y ofrecer guía por talla/estilo.
- Si preguntan por envíos: pide CP/ZIP y país, y explica que se cotiza en vivo.
- Nunca inventes datos (stock exacto, tiempos exactos, políticas legales); usa lenguaje de "estimado" cuando aplique.
`;

// Safe string
function safeText(s, max = 1200) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

// Extrae reply de Gemini con tolerancia a variaciones
function extractGeminiReply(data) {
  try {
    const c = data?.candidates?.[0];
    const parts = c?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p?.text).filter(Boolean).join("\n") : "";
    const out = safeText(text, 1500);
    return out || "";
  } catch {
    return "";
  }
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  try {
    if (!GEMINI_API_KEY) {
      // No rompemos el front: devolvemos reply usable
      return jsonResponse(200, {
        reply:
          "Estoy en modo offline: falta configurar GEMINI_API_KEY en el servidor. Dime tu CP/ZIP y qué quieres comprar y te guío igual.",
      });
    }

    const body = safeJsonParse(event.body);
    const userMsg = safeText(body?.message, 900);

    if (!userMsg) return jsonResponse(400, { error: "Empty message" });

    // Payload Gemini v1beta (generateContent)
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `${SYSTEM_PROMPT}\n\n` +
                `Usuario: ${userMsg}\n` +
                `SCORE AI:`,
            },
          ],
        },
      ],
      // Suave y “ventas”: no demasiado creativo, pero convincente
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,
        maxOutputTokens: 220,
      },
    };

    // Timeout real (evita colgar function)
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

      // Si Gemini responde error, no tronamos: devolvemos reply útil
      if (!response.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          `Gemini HTTP ${response.status}`;
        console.error("[chat] Gemini error:", msg);
        return jsonResponse(200, {
          reply:
            "Ahorita tengo alta demanda y no pude consultar el asistente en vivo. Dime qué producto te gustó y tu CP/ZIP y te ayudo a cerrar la compra.",
        });
      }
    } finally {
      clearTimeout(t);
    }

    const reply = extractGeminiReply(data) ||
      "Listo. Dime tu talla y tu CP/ZIP y te digo la mejor opción de envío.";

    return jsonResponse(200, { reply });
  } catch (error) {
    console.error("[chat] Critical:", error?.message || error);
    // Nunca regreses 500 si puedes mantener UX: main espera {reply}
    return jsonResponse(200, {
      reply:
        "Estoy en modo offline por un tema técnico. Dime qué quieres comprar y tu CP/ZIP y te guío paso a paso.",
    });
  }
};