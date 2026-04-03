// api/chat.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  readPublicSiteSettings,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
} = require("./_shared");

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";
const MAX_MESSAGE_LEN = 1200;
const MAX_CONTEXT_LEN = 220;
const MAX_REPLY_LEN = 5000;

const sanitizeContext = (str) =>
  String(str || "Ninguno")
    .replace(/[\[\]{}<>\\\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, MAX_CONTEXT_LEN);

const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));

function send(res, resp) {
  const out = resp || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";

  if (out.headers) {
    Object.keys(out.headers).forEach((key) => res.setHeader(key, out.headers[key]));
  }
  res.status(out.statusCode || 200).send(out.body);
}

function getBody(req) {
  const raw = req?.body;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeGeminiError(e) {
  const msg = String(e?.message || e || "");
  if (/model.*not found|404/i.test(msg)) {
    return "El modelo de IA configurado no está disponible. Revisa GEMINI_MODEL en Vercel.";
  }
  if (/api key|unauth|permission|denied|401|403/i.test(msg)) {
    return "El asistente no tiene permiso o llave válida en este momento.";
  }
  return "El asistente no pudo completar la solicitud.";
}

function extractActions(text) {
  const raw = String(text || "");
  const actions = [];

  const regex = /\[ACTION:([A-Z_]+)(?::([^\]]+))?\]/g;
  for (const match of raw.matchAll(regex)) {
    actions.push({
      action: safeStr(match[1]).toUpperCase(),
      value: safeStr(match[2]).trim(),
    });
  }

  return actions;
}

function stripActions(text) {
  return String(text || "")
    .replace(/\[ACTION:[A-Z_]+(?::[^\]]+)?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function callGemini({ apiKey, model, systemText, userText }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const payload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.45,
      maxOutputTokens: 550,
    },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function buildSystemText(site, context) {
  const contact = site?.contact || {};
  const home = site?.home || {};
  const socials = site?.socials || {};

  const email =
    String(contact.email || SUPPORT_EMAIL || "ventas.unicotextil@gmail.com").trim() ||
    "ventas.unicotextil@gmail.com";
  const whatsappDisplay =
    String(contact.whatsapp_display || SUPPORT_WHATSAPP_DISPLAY || "664 236 8701").trim() ||
    "664 236 8701";
  const supportHours = String(home.support_hours || "").trim();
  const shippingNote = String(home.shipping_note || "").trim();
  const returnsNote = String(home.returns_note || "").trim();
  const footerNote = String(home.footer_note || "").trim();
  const heroTitle = String(site?.hero_title || "SCORE STORE").trim();

  const safeProduct = sanitizeContext(context.currentProduct || context.currentSku || context.product || "Ninguno");
  const safeCartItems = sanitizeContext(context.cartItems || context.cart || "Sin productos detectados");
  const safeTotal = sanitizeContext(context.cartTotal || context.total || "No disponible");
  const safeShipMode = sanitizeContext(context.shipMode || context.shippingMode || "No definido");
  const safeCategory = sanitizeContext(context.category || context.section || "No definida");

  return `
Eres SCORE AI, la agente comercial y operativa de Score Store.

OBJETIVO:
- Resolver dudas.
- Guiar a compra.
- Explicar el proceso de forma clara.
- Ayudar con carrito, pago, envío, tallas, promociones visibles y contacto.

TONO:
- Seguro.
- Claro.
- Comercial.
- Corto pero útil.
- Nada de tecnicismos.
- Nada de texto robótico.
- Sonido premium y confiable.

REGLAS DURAS:
- Nunca inventes precios, stock, promos ni tiempos exactos si no vienen en contexto.
- Si no sabes un dato, dilo directo y ofrece el siguiente paso útil.
- Si el usuario pide ayuda humana, usa solo estos datos vigentes:
  Correo: ${email}
  WhatsApp: ${whatsappDisplay}
  Horario: ${supportHours || "No especificado"}
- Si preguntan cómo comprar, explica el flujo real: elegir producto, talla, carrito, envío, pago y confirmación.
- Si preguntan por pagos, explica solo lo que sí está disponible: Stripe, tarjeta y OXXO Pay cuando aplique.
- Si preguntan por envíos, explica que se calculan según destino y que hay MX, USA y pickup cuando corresponda.
- Si hay notas públicas activas sobre envíos o cambios, puedes usarlas:
  Nota de envíos: ${shippingNote || "No disponible"}
  Nota de cambios o devoluciones: ${returnsNote || "No disponible"}
- Si preguntas por el sitio, referencia pública: ${heroTitle}
- Si preguntas por redes o contacto, no inventes: usa solo datos del contexto.
- Nunca prometas acciones del sistema que no fueron confirmadas por el backend.

CONTEXTO ACTUAL DEL USUARIO:
- Producto actual: ${safeProduct}
- Carrito actual: ${safeCartItems}
- Total visible: ${safeTotal}
- Modo de envío visible: ${safeShipMode}
- Categoría/Sección visible: ${safeCategory}
- Footer note pública: ${footerNote || "Sin nota"}

COMANDOS DE ACCIÓN:
Si detectas intención clarísima de compra sobre el producto actual, agrega exactamente al final:
[ACTION:ADD_TO_CART:${safeProduct}]

Si detectas intención clarísima de abrir carrito o pagar, agrega exactamente al final:
[ACTION:OPEN_CART]

Usa comandos solo cuando de verdad ayuden.
`.trim();
}

function normalizeReply(reply) {
  return String(reply || "").trim().slice(0, MAX_REPLY_LEN);
}

async function answerWithModel({ apiKey, systemText, message }) {
  const preferredModel = DEFAULT_MODEL;
  const fallbackModel = FALLBACK_MODEL;

  let r = await callGemini({
    apiKey,
    model: preferredModel,
    systemText,
    userText: message,
  });

  if (!r.ok) {
    const errMsg = String(r?.data?.error?.message || "");
    const looksLikeModelIssue = r.status === 404 || /model.*not found/i.test(errMsg);

    if (looksLikeModelIssue && preferredModel !== fallbackModel) {
      r = await callGemini({
        apiKey,
        model: fallbackModel,
        systemText,
        userText: message,
      });
    }
  }

  if (!r.ok) {
    const msg = r?.data?.error?.message || "El asistente no pudo responder.";
    return { ok: false, error: String(msg) };
  }

  const data = r.data || {};
  const reply =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No pude generar una respuesta en este momento.";

  return { ok: true, reply: normalizeReply(reply) };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "*";

  const sendResponse = (statusCode, data) => {
    const response = jsonResponse(statusCode, data, origin);
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(response.statusCode).send(response.body);
  };

  try {
    if (req.method === "OPTIONS") {
      const response = handleOptions({ headers: req.headers });
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(response.statusCode).send(response.body);
      return;
    }

    if (req.method !== "POST") {
      sendResponse(405, { ok: false, error: "Method not allowed" });
      return;
    }

    const body = getBody(req);
    const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LEN);
    const context = body.context && typeof body.context === "object" ? body.context : {};

    if (!message) {
      sendResponse(400, { ok: false, error: "Se requiere un mensaje válido." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      sendResponse(200, { ok: false, error: "El asistente no está conectado en este momento." });
      return;
    }

    const site = await readPublicSiteSettings().catch(() => null);
    const systemText = buildSystemText(site, context);

    let result = await answerWithModel({
      apiKey,
      systemText,
      message,
    });

    if (!result.ok) {
      sendResponse(200, { ok: false, error: normalizeGeminiError(result.error) });
      return;
    }

    const actions = extractActions(result.reply);
    const reply = stripActions(result.reply);

    sendResponse(200, {
      ok: true,
      reply,
      actions,
    });
  } catch (error) {
    sendResponse(500, {
      ok: false,
      error: "El asistente está temporalmente fuera de línea.",
    });
  }
};