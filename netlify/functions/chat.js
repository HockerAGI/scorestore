/* =========================================================
   SCORE STORE — CHAT (Gemini) v2026 PROD (UNIFIED)
   - Endpoint: /.netlify/functions/chat
   - Respuesta: { reply }
   - GEMINI_API_KEY desde ENV (NO hardcode)
   - Lee estado público desde Supabase view:
     public.site_public_content (security_invoker=true)
   ========================================================= */

const axios = require("axios");
const { jsonResponse, safeJsonParse, handleOptions, supabase, DEFAULT_ORG_ID, isUuid } = require("./_shared");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Org default (Score Store).
const DEFAULT_ORG =
  process.env.SCORE_STORE_ORG_ID ||
  process.env.DEFAULT_ORG_ID ||
  DEFAULT_ORG_ID ||
  "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

// (Opcional) candado anti-abuso
const CHAT_TOKEN = process.env.CHAT_TOKEN || "";

function pickHeader(headers, key) {
  if (!headers) return "";
  return headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || "";
}

function getProvidedToken(event) {
  const qp = event.queryStringParameters || {};
  const hdr = event.headers || {};
  return (
    qp.token ||
    pickHeader(hdr, "x-chat-token") ||
    pickHeader(hdr, "authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

function safeText(s, max = 1200) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function geminiUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
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

async function getPublicContent(orgId) {
  try {
    if (!supabase || !isUuid(orgId)) return null;

    const { data, error } = await supabase
      .from("site_public_content")
      .select("hero_title, promo_text, promo_active, maintenance_mode")
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(publicContent) {
  const hero = safeText(publicContent?.hero_title, 120) || "SCORE STORE";
  const promoActive = !!publicContent?.promo_active;
  const promoText = safeText(publicContent?.promo_text, 120);
  const maintenance = !!publicContent?.maintenance_mode;

  const statusLines = [
    `Título público actual: "${hero}".`,
    promoActive ? `Promo activa: SÍ${promoText ? ` (${promoText})` : ""}.` : "Promo activa: NO.",
    maintenance
      ? "Modo mantenimiento: ACTIVO (no prometer compras inmediatas)."
      : "Modo mantenimiento: OFF.",
  ].join("\n");

  return `
Eres SCORE AI (SCORE STORE). Tu rol: ventas + soporte.

Contexto real:
- Tienda oficial de mercancía SCORE International.
- Fabricación/operación/logística: Único Uniformes (BAJATEX S. de R.L. de C.V.) en Tijuana, BC.
- Envíos: cotización en vivo cuando está disponible (Envia.com). También pickup local Tijuana cuando aplique.
- Pagos: Stripe (tarjeta) y OXXO (México) cuando esté disponible.

Estado público (desde UnicOs / site_settings):
${statusLines}

Reglas:
- Español (es-MX), profesional, directo, orientado a cierre.
- Respuestas cortas (1–5 líneas) salvo que pidan detalle.
- Si preguntan por envío: pide país + CP/ZIP.
- Si preguntan por precios: guía por catálogo + talla/estilo.
- Nunca inventes stock exacto, tiempos exactos o políticas legales: usa “estimado”.
- Si maintenance está activo: pide datos y promete seguimiento, no “compra ya”.
`.trim();
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (CHAT_TOKEN) {
    const provided = getProvidedToken(event);
    if (!provided || provided !== CHAT_TOKEN) {
      return jsonResponse(401, { reply: "Unauthorized" });
    }
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { reply: "Method Not Allowed" });
  }

  try {
    const body = safeJsonParse(event.body || "{}") || {};
    const userMsg = safeText(body?.message, 900);
    if (!userMsg) return jsonResponse(400, { reply: "Mensaje vacío." });

    const orgIdRaw =
      body?.org_id ||
      (event.queryStringParameters || {}).org_id ||
      DEFAULT_ORG;

    const orgId = isUuid(orgIdRaw) ? String(orgIdRaw) : DEFAULT_ORG;

    const publicContent = await getPublicContent(orgId);
    const SYSTEM_PROMPT = buildSystemPrompt(publicContent);

    if (!GEMINI_API_KEY) {
      return jsonResponse(200, {
        reply:
          "Estoy en modo offline (falta GEMINI_API_KEY). Dime qué producto quieres y tu CP/ZIP + país y te guío para cerrar la compra.",
      });
    }

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

    const timeoutMs = 12000;

    let data = null;
    try {
      const r = await axios.post(geminiUrl(), payload, {
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
      });
      data = r.data || {};
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Gemini error";

      console.error("[chat] Gemini error:", status, msg);

      return jsonResponse(200, {
        reply:
          "Ahorita no pude consultar el asistente en vivo. Dime tu talla y tu CP/ZIP + país y te digo la mejor opción de envío y compra.",
      });
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
