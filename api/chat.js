// api/chat.js
"use strict";

const shared = require("./_shared");
const { rateLimit } = require("./_rate_limit");

const jsonResponse = shared.jsonResponse;
const handleOptions = shared.handleOptions;
const supabaseAdmin = shared.supabaseAdmin;
const safeStr = shared.safeStr || ((v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v)));
const readJsonFile = shared.readJsonFile || null;
const resolveScoreOrgId = shared.resolveScoreOrgId || (async () => process.env.DEFAULT_SCORE_ORG_ID || "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6");
const readPublicSiteSettings = shared.readPublicSiteSettings || null;
const sendTelegram = shared.sendTelegram || null;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_SCORE_ORG_ID = process.env.DEFAULT_SCORE_ORG_ID || "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";

  res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body || "");
}

function getOrigin(req) {
  return req?.headers?.origin || req?.headers?.Origin || "*";
}

function normalizeText(v) {
  return safeStr(v).trim();
}

function clampText(v, max = 1800) {
  return String(v ?? "").trim().slice(0, max);
}

function safeJsonParse(raw, fallback = null) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseBody(req) {
  const body = req?.body;

  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    return safeJsonParse(body, {});
  }

  return {};
}

function parseOrgId(body, req) {
  const fromBody = normalizeText(body?.org_id || body?.orgId || body?.organization_id || "");
  if (fromBody) return fromBody;

  try {
    const url = new URL(req.url, "http://localhost");
    const fromQuery = normalizeText(url.searchParams.get("org_id") || url.searchParams.get("orgId") || "");
    if (fromQuery) return fromQuery;
  } catch {}

  return "";
}

function parseMessage(body) {
  return clampText(body?.message ?? body?.prompt ?? body?.text ?? body?.input ?? "");
}

function parseContext(body) {
  const ctx = body?.context && typeof body.context === "object" ? body.context : {};

  return {
    currentProduct: normalizeText(ctx.currentProduct || ctx.product || ctx.currentSku || body?.currentProduct || ""),
    currentSku: normalizeText(ctx.currentSku || ctx.sku || body?.currentSku || ""),
    cartItems: normalizeText(ctx.cartItems || ctx.cart || body?.cartItems || ""),
    cartTotal: normalizeText(ctx.cartTotal || ctx.total || body?.cartTotal || ""),
    shipMode: normalizeText(ctx.shipMode || ctx.shippingMode || body?.shipMode || ""),
    orderId: normalizeText(ctx.orderId || ctx.order_id || body?.orderId || ""),
    actionHint: normalizeText(ctx.actionHint || ctx.action || body?.actionHint || ""),
    category: normalizeText(ctx.category || ctx.section || body?.category || ""),
  };
}

function extractActionMarkers(text) {
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

function stripActionMarkers(text) {
  return String(text || "")
    .replace(/\[ACTION:[A-Z_]+(?::[^\]]+)?\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeGeminiError(err) {
  const msg = String(err?.message || err || "");
  if (/model.*not found|404/i.test(msg)) {
    return "El modelo de IA configurado no está disponible.";
  }
  if (/api key|unauth|permission|denied|401|403/i.test(msg)) {
    return "La IA no tiene permiso o llave válida en este momento.";
  }
  return "La IA no pudo completar la solicitud.";
}

function buildPrompt({ settings, catalogSummary, context }) {
  const contact = settings?.contact || {};
  const home = settings?.home || {};
  const socials = settings?.socials || {};

  const email = safeStr(contact.email || process.env.SUPPORT_EMAIL || "ventas.unicotextil@gmail.com");
  const phone = safeStr(contact.phone || process.env.SUPPORT_PHONE || "6642368701");
  const whatsapp = safeStr(contact.whatsapp_display || process.env.SUPPORT_WHATSAPP_DISPLAY || "664 236 8701");
  const supportHours = safeStr(home.support_hours || "");
  const shippingNote = safeStr(home.shipping_note || "");
  const returnsNote = safeStr(home.returns_note || "");
  const footerNote = safeStr(home.footer_note || "");
  const promoText = safeStr(settings?.promo_text || "");
  const heroTitle = safeStr(settings?.hero_title || "SCORE STORE");
  const maintenanceMode = Boolean(settings?.maintenance_mode);

  const safeProduct = safeStr(context.currentProduct || "Ninguno");
  const safeSku = safeStr(context.currentSku || "Ninguno");
  const safeCartItems = safeStr(context.cartItems || "Sin datos");
  const safeTotal = safeStr(context.cartTotal || "Sin datos");
  const safeShipMode = safeStr(context.shipMode || "Sin datos");
  const safeOrderId = safeStr(context.orderId || "Ninguno");
  const safeActionHint = safeStr(context.actionHint || "Ninguna");
  const safeCategory = safeStr(context.category || "No definida");

  return `
Eres SCORE Store Chat, el asistente público de la tienda.

Tono:
- Claro, breve, premium y comercial.
- Responde en español.
- No uses tecnicismos innecesarios.
- Si faltan datos, dilo directo.

Reglas:
- Nunca inventes stock, precios, promos ni tiempos exactos.
- Si el usuario pregunta por pagos, habla solo de Stripe y OXXO Pay si aplica.
- Si pregunta por envíos, explica que dependen del destino y del método disponible.
- Si pregunta por tallas, guía con recomendaciones generales.
- Si pide contacto humano, usa estos datos:
  Correo: ${email}
  WhatsApp: ${whatsapp}
  Teléfono: ${phone}
  Horario: ${supportHours || "No especificado"}
- Si el modo mantenimiento está activo, menciónalo con prudencia.
- Si no sabes algo, ofrece el siguiente paso útil.

Contexto público:
- Sitio: ${heroTitle}
- Promo visible: ${promoText || "Sin promo activa"}
- Modo mantenimiento: ${maintenanceMode ? "sí" : "no"}
- Nota envíos: ${shippingNote || "No disponible"}
- Nota devoluciones: ${returnsNote || "No disponible"}
- Footer note: ${footerNote || "Sin nota"}
- Redes: Facebook=${safeStr(socials.facebook || "")}, Instagram=${safeStr(socials.instagram || "")}, YouTube=${safeStr(socials.youtube || "")}
- Catálogo activo: ${catalogSummary?.activeProducts ?? "No disponible"}
- Productos destacados: ${catalogSummary?.featuredProducts ?? "No disponible"}

Contexto del usuario:
- Producto actual: ${safeProduct}
- SKU actual: ${safeSku}
- Carrito: ${safeCartItems}
- Total visible: ${safeTotal}
- Envío visible: ${safeShipMode}
- Pedido en foco: ${safeOrderId}
- Sugerencia de acción: ${safeActionHint}
- Categoría/Sección: ${safeCategory}

Comandos:
- Si la intención de compra es clara y hay SKU/producto en contexto, termina exactamente con:
[ACTION:ADD_TO_CART:${safeSku || safeProduct}]
- Si la intención es revisar el carrito o pagar, termina exactamente con:
[ACTION:OPEN_CART]
`.trim();
}

async function loadPublicContext(sb, orgId) {
  let settings = null;

  if (typeof readPublicSiteSettings === "function") {
    try {
      settings = await readPublicSiteSettings(sb, orgId);
    } catch {}
  }

  if (!settings) {
    try {
      const { data } = await sb
        .from("site_settings")
        .select("organization_id, org_id, hero_title, promo_active, promo_text, maintenance_mode, home, socials, contact_email, contact_phone, whatsapp_e164, whatsapp_display, updated_at, created_at")
        .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
        .maybeSingle();

      settings = data || null;
    } catch {}
  }

  const contact = {
    email: safeStr(
      settings?.contact?.email ||
        settings?.contact_email ||
        process.env.SUPPORT_EMAIL ||
        "ventas.unicotextil@gmail.com"
    ),
    phone: safeStr(
      settings?.contact?.phone ||
        settings?.contact_phone ||
        process.env.SUPPORT_PHONE ||
        "6642368701"
    ),
    whatsapp_display: safeStr(
      settings?.contact?.whatsapp_display ||
        settings?.whatsapp_display ||
        process.env.SUPPORT_WHATSAPP_DISPLAY ||
        "664 236 8701"
    ),
  };

  const catalogSummary = {
    activeProducts: "N/D",
    featuredProducts: "N/D",
  };

  try {
    const { data: products } = await sb
      .from("products")
      .select("id, rank, active, is_active, deleted_at, stock")
      .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
      .is("deleted_at", null)
      .limit(50);

    const list = Array.isArray(products) ? products : [];
    catalogSummary.activeProducts = list.filter((p) => p.active !== false && p.is_active !== false).length;
    catalogSummary.featuredProducts = list.filter((p) => Number(p.rank || 0) <= 12).length;
  } catch {}

  return { settings, contact, catalogSummary };
}

async function callGemini({ message, prompt }) {
  if (!GEMINI_API_KEY) return null;

  const model = GEMINI_MODEL || "gemini-2.5-flash-lite";
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${prompt}\n\nUSUARIO:\n${message}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.25,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => safeStr(p?.text || ""))
      .join("")
      .trim() || "";

  return text || null;
}

function fallbackReply(message, settings, contact) {
  const m = normalizeText(message).toLowerCase();
  const email = safeStr(contact?.email || process.env.SUPPORT_EMAIL || "ventas.unicotextil@gmail.com");
  const whatsapp = safeStr(contact?.whatsapp_display || process.env.SUPPORT_WHATSAPP_DISPLAY || "664 236 8701");
  const phone = safeStr(contact?.phone || process.env.SUPPORT_PHONE || "6642368701");
  const shippingNote = safeStr(settings?.home?.shipping_note || "");
  const returnsNote = safeStr(settings?.home?.returns_note || "");
  const promoText = safeStr(settings?.promo_text || "");

  if (m.includes("envío") || m.includes("envio") || m.includes("ship")) {
    return `Puedo ayudarte con envíos. ${shippingNote || "Se calculan según destino y método disponible."} Si necesitas soporte humano: ${whatsapp} · ${email}`;
  }

  if (m.includes("promo") || m.includes("cupón") || m.includes("cupon") || m.includes("descuento")) {
    return promoText
      ? `Promoción visible: ${promoText}`
      : `No veo una promoción activa en este momento. Puedo ayudarte a revisar el carrito y aplicar un cupón válido.`;
  }

  if (m.includes("talla") || m.includes("size") || m.includes("medida")) {
    return `Las tallas se manejan por producto. Si me dices la prenda, te oriento con la mejor opción.`;
  }

  if (m.includes("devol") || m.includes("cambio") || m.includes("return")) {
    return returnsNote
      ? returnsNote
      : `Los cambios y devoluciones dependen del caso y del producto. Para soporte: ${phone} · ${email}`;
  }

  return `Estoy listo para ayudarte con catálogo, tallas, envío y checkout. Si prefieres soporte humano: ${whatsapp} · ${email}`;
}

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method !== "POST") {
      return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
    }

    const rl = rateLimit(req);
    if (!rl.ok) {
      return send(res, jsonResponse(429, { ok: false, error: "rate_limited" }, origin));
    }

    const body = parseBody(req);
    const message = parseMessage(body);
    if (!message) {
      return send(res, jsonResponse(400, { ok: false, error: "Se requiere un mensaje." }, origin));
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin));
    }

    let orgId = parseOrgId(body, req);
    if (!orgId) {
      try {
        orgId = await resolveScoreOrgId(sb);
      } catch {
        orgId = DEFAULT_SCORE_ORG_ID;
      }
    }

    const context = parseContext(body);
    const { settings, contact, catalogSummary } = await loadPublicContext(sb, orgId);

    const prompt = buildPrompt({ settings, catalogSummary, context });

    let reply = null;
    let usedModel = null;

    if (GEMINI_API_KEY) {
      try {
        reply = await callGemini({ message, prompt });
        usedModel = GEMINI_MODEL;
      } catch (e) {
        if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
          try {
            const prev = process.env.GEMINI_MODEL;
            process.env.GEMINI_MODEL = GEMINI_FALLBACK_MODEL;
            reply = await callGemini({ message, prompt });
            usedModel = GEMINI_FALLBACK_MODEL;
            process.env.GEMINI_MODEL = prev;
          } catch (fallbackErr) {
            reply = fallbackReply(message, settings, contact);
            usedModel = "fallback";
          }
        } else {
          reply = fallbackReply(message, settings, contact);
          usedModel = "fallback";
        }
      }
    } else {
      reply = fallbackReply(message, settings, contact);
      usedModel = "fallback";
    }

    const rawReply = safeStr(reply || fallbackReply(message, settings, contact));
    const actions = extractActionMarkers(rawReply);
    const cleanReply = stripActionMarkers(rawReply);

    if (typeof sendTelegram === "function" && actions.length) {
      try {
        await sendTelegram(
          [
            "💬 <b>Score Store Chat</b>",
            `Org: ${orgId}`,
            `Actions: ${actions.map((a) => `${a.action}${a.value ? `:${a.value}` : ""}`).join(", ")}`,
          ].join("\n")
        );
      } catch {}
    }

    return send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          org_id: orgId,
          reply: cleanReply,
          actions,
          model: usedModel || (GEMINI_API_KEY ? GEMINI_MODEL : "fallback"),
        },
        origin
      )
    );
  } catch (e) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: String(e?.message || e || "No fue posible procesar el chat."),
        },
        origin
      )
    );
  }
};