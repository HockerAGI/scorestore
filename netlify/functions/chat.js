"use strict";

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  readPublicSiteSettings,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
} = require("./_shared");

const sanitizeContext = (str) => {
  return String(str || "Ninguno")
    .replace(/[\[\]{}<>\\\n\r]/g, " ")
    .trim()
    .substring(0, 220);
};

async function callGemini({ apiKey, model, systemText, userText }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const payload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.45, maxOutputTokens: 550 },
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

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);
    }

    const body = safeJsonParse(event.body) || {};
    const message = String(body.message || "").trim().substring(0, 1200);
    const context = body.context || {};

    if (!message) {
      return jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(200, { ok: false, error: "El asistente no está conectado en este momento." }, origin);
    }

    const site = await readPublicSiteSettings().catch(() => null);
    const contact = site?.contact || {};
    const currentEmail = String(contact.email || SUPPORT_EMAIL || "").trim();
    const currentWhatsapp = String(contact.whatsapp_display || SUPPORT_WHATSAPP_DISPLAY || "").trim();
    const currentSupportHours = String(site?.home?.support_hours || "").trim();
    const currentShippingNote = String(site?.home?.shipping_note || "").trim();
    const currentReturnsNote = String(site?.home?.returns_note || "").trim();

    const preferredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const fallbackModel = "gemini-2.5-flash";

    const safeProduct = sanitizeContext(
      context.currentProduct || context.currentSku || context.product || "Ninguno"
    );
    const safeCartItems = sanitizeContext(
      context.cartItems || context.cart || "Sin productos detectados"
    );
    const safeTotal = sanitizeContext(
      context.cartTotal || context.total || "No disponible"
    );
    const safeShipMode = sanitizeContext(
      context.shipMode || context.shippingMode || "No definido"
    );

    const sys = `Eres SCORE AI, la agente comercial y operativa de Score Store.

OBJETIVO:
- Resolver dudas
- Guiar a compra
- Explicar pasos del proceso de forma clara
- Ayudar con carrito, pago, envío, tallas, promociones visibles y contacto

TONO:
- Seguro
- Claro
- Comercial
- Corto pero útil
- Nada de tecnicismos
- Nada de texto robótico
- Sonido premium y confiable

REGLAS DURAS:
- Nunca inventes precios, stock, promos ni tiempos exactos si no vienen en contexto.
- Si no sabes un dato, dilo directo y ofrece el siguiente paso útil.
- Si el usuario pide ayuda humana, usa solo estos datos vigentes:
  Correo: ${currentEmail || "No disponible"}
  WhatsApp: ${currentWhatsapp || "No disponible"}
  Horario: ${currentSupportHours || "No especificado"}
- Si preguntan cómo comprar, explica el flujo real: elegir producto, talla, carrito, envío, pago y confirmación.
- Si preguntan por pagos, explica solo lo que sí está disponible: Stripe, tarjeta y OXXO Pay cuando aplique.
- Si preguntan por envíos, explica que se calculan según destino y que hay MX, USA y pickup cuando corresponda.
- Si hay notas públicas activas sobre envíos o cambios, puedes usarlas:
  Nota de envíos: ${currentShippingNote || "No disponible"}
  Nota de cambios o devoluciones: ${currentReturnsNote || "No disponible"}

CONTEXTO ACTUAL DEL USUARIO:
- Producto actual: ${safeProduct}
- Carrito actual: ${safeCartItems}
- Total visible: ${safeTotal}
- Modo de envío visible: ${safeShipMode}

COMANDOS DE ACCIÓN:
Si detectas intención clarísima de compra sobre el producto actual, agrega EXACTAMENTE al final:
[ACTION:ADD_TO_CART:${safeProduct}]

Si detectas intención clarísima de abrir carrito o pagar, agrega EXACTAMENTE al final:
[ACTION:OPEN_CART]

Usa comandos solo cuando de verdad ayuden.`;

    let r = await callGemini({
      apiKey,
      model: preferredModel,
      systemText: sys,
      userText: message,
    });

    if (!r.ok) {
      const errMsg = String(r?.data?.error?.message || "");
      const looksLikeModelIssue = r.status === 404 || /model.*not found/i.test(errMsg);

      if (looksLikeModelIssue && preferredModel !== fallbackModel) {
        r = await callGemini({
          apiKey,
          model: fallbackModel,
          systemText: sys,
          userText: message,
        });
      }
    }

    if (!r.ok) {
      const msg = r?.data?.error?.message || "El asistente no pudo responder.";
      return jsonResponse(200, { ok: false, error: String(msg) }, origin);
    }

    const data = r.data || {};
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No pude generar una respuesta en este momento.";

    return jsonResponse(200, { ok: true, reply: String(reply).trim() }, origin);
  } catch {
    return jsonResponse(200, { ok: false, error: "El asistente está temporalmente fuera de línea." }, origin);
  }
};