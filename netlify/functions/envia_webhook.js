// netlify/functions/envia_webhook.js
// BLINDADO: Anti-spam + verificación Stripe + dedupe warm + intento de guía Envia

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

// WhatsApp (AHORITA NO TIENES WHATSAPP_TOKEN en tus vars; queda opcional)
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TO = process.env.WHATSAPP_TO || "";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try { stripe = require("stripe")(STRIPE_SECRET_KEY); } catch { stripe = null; }
}

const ENVIA_BASE = "https://api.envia.com";

// Rate limit (warm)
const WINDOW_MS = 60 * 1000;
const MAX_REQ = 25;
const rate = new Map();

// Dedupe warm
const recent = new Map();
const RECENT_TTL_MS = 15 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }

function hit(ip) {
  const t = Date.now();
  const cur = rate.get(ip) || { ts: t, n: 0 };
  if (t - cur.ts > WINDOW_MS) { rate.set(ip, { ts: t, n: 1 }); return true; }
  if (cur.n >= MAX_REQ) return false;
  cur.n += 1; rate.set(ip, cur); return true;
}

function remember(key) {
  const now = Date.now();
  recent.set(key, now);
  for (const [k, ts] of recent.entries()) if (now - ts > RECENT_TTL_MS) recent.delete(k);
}
function seen(key) {
  const ts = recent.get(key);
  if (!ts) return false;
  if (Date.now() - ts > RECENT_TTL_MS) { recent.delete(key); return false; }
  return true;
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoneyMXN(v) {
  const n = safeNum(v, 0);
  try { return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`; }
  catch { return `$${n.toFixed(2)} MXN`; }
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } catch (e) { console.error("Telegram error:", e.message); }
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
  try {
    await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: WHATSAPP_TO,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });
  } catch (e) { console.error("WhatsApp error:", e.message); }
}

function buildAddress(shipping) {
  const a = shipping?.address || {};
  const parts = [toStr(a.line1), toStr(a.line2), toStr(a.city), toStr(a.state), toStr(a.postal_code)].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

function formatMessage(payload, extra = {}) {
  const lines = [];
  const orderId = toStr(payload.orderId);
  const total = safeNum(payload.total, 0);
  const currency = upper(payload.currency || "MXN");

  const promoCode = toStr(payload.promoCode || payload.metadata?.promo_code || "");
  const discountMXN = safeNum(payload.discountMXN ?? payload.metadata?.discount_mxn, 0);
  const shippingMXN = safeNum(payload.shippingMXN ?? payload.metadata?.shipping_mxn, 0);
  const shippingMode = toStr(payload.shippingMode ?? (payload.metadata?.shipping_mode ?? ""));

  const customerName = toStr(payload.customerName || "Cliente");
  const email = toStr(payload.email || "");
  const phone = toStr(payload.phone || "");

  const addr = buildAddress(payload.shipping || {});
  const items = Array.isArray(payload.items) ? payload.items : [];

  lines.push("✅ PAGO CONFIRMADO — SCORE STORE");
  lines.push(`🧾 Orden: ${orderId || "N/A"}`);
  if (customerName) lines.push(`👤 ${customerName}`);
  if (phone) lines.push(`📱 ${phone}`);
  if (email) lines.push(`📧 ${email}`);
  lines.push(`💰 Total: ${formatMoneyMXN(total)} (${currency})`);

  if (shippingMode || shippingMXN) {
    const modeLabel =
      shippingMode === "pickup" ? "RECOGER" :
      shippingMode ? shippingMode.toUpperCase() : "ENVÍO";
    lines.push(`🚚 Envío (${modeLabel}): ${formatMoneyMXN(shippingMXN)}`);
  }

  if (promoCode) lines.push(`🏷️ Cupón: ${promoCode}`);
  if (discountMXN > 0) lines.push(`🔻 Descuento: ${formatMoneyMXN(discountMXN)}`);
  if (addr) lines.push(`📍 Dirección: ${addr}`);

  if (items.length) {
    lines.push("🛒 Items:");
    for (const it of items.slice(0, 25)) {
      const name = toStr(it.name || it.title || "Item");
      const qty = safeNum(it.qty || it.quantity || 1, 1);
      lines.push(`• ${qty}x ${name}`);
    }
  }

  // Facturación manual (siempre visible)
  lines.push("");
  lines.push("🧾 FACTURACIÓN (manual):");
  lines.push("Si requieres factura, envía tus datos fiscales a:");
  lines.push("ventas.unicotextil@gmail.com");
  lines.push("Incluye: RFC, Razón Social, Uso CFDI, correo, constancia fiscal (PDF).");

  if (extra?.envia) {
    lines.push("");
    lines.push("📦 ENVIA:");
    lines.push(extra.envia);
  }

  return lines.join("\n");
}

// Verificación Stripe (debe estar pagado)
async function verifyPaid(orderId) {
  if (!stripe) return { ok: false, reason: "stripe_not_configured" };
  if (!orderId) return { ok: false, reason: "missing_orderId" };

  try {
    const session = await stripe.checkout.sessions.retrieve(orderId);
    const paid = toStr(session.payment_status) === "paid" || toStr(session.status) === "complete";
    if (!paid) return { ok: false, reason: "session_not_paid" };
    return { ok: true, session };
  } catch (e) {
    return { ok: false, reason: `stripe_error:${toStr(e.message)}` };
  }
}

function hasCompleteMXAddress(shipping) {
  const a = shipping?.address || {};
  const line1 = toStr(a.line1);
  const city = toStr(a.city);
  const state = toStr(a.state);
  const postal = toStr(a.postal_code);
  return Boolean(line1 && city && state && /^\d{5}$/.test(postal));
}

function buildPackages(items) {
  const qty = (Array.isArray(items) ? items : []).reduce((a, it) => a + Number(it.qty || it.quantity || 1), 0);
  const weight = Math.max(0.5, qty * 0.5); // kg
  return [{
    content: "Merch",
    amount: 1,
    type: "box",
    weight,
    length: 30,
    width: 25,
    height: 10,
  }];
}

// ORIGEN (temporal, pero realista): AJÚSTALO cuando quieras.
// Sin meter nuevas variables, lo dejamos aquí fijo.
// Si tu guía falla, el error queda en logs y lo afinamos.
const ORIGIN = {
  name: "SCORE Store",
  company: "ÚNICO UNIFORMES",
  email: "ventas.unicotextil@gmail.com",
  phone: "0000000000",
  street: "ORIGEN_PENDIENTE",
  number: "S/N",
  district: "Centro",
  city: "Tijuana",
  state: "BCN",
  country_code: "MX",
  postal_code: "22000",
};

// Crear guía Envia (best-effort)
async function tryCreateEnviaLabel({ orderId, carrier, service_code, shipping, items }) {
  if (!ENVIA_API_KEY) return { ok: false, reason: "missing_envia_api_key" };
  if (!hasCompleteMXAddress(shipping)) return { ok: false, reason: "missing_shipping_address" };

  // Dedupe persistente: si ya existe etiqueta en PI metadata, nos detenemos.
  // (esto evita crear 2 guías si Stripe reintenta)
  try {
    const session = await stripe.checkout.sessions.retrieve(orderId);
    const piId = toStr(session.payment_intent);
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId);
      const meta = pi.metadata || {};
      if (toStr(meta.envia_label_status) === "created" && toStr(meta.envia_label_url)) {
        return { ok: true, deduped: true, label_url: toStr(meta.envia_label_url) };
      }
    }
  } catch {}

  const destA = shipping.address;
  const destination = {
    name: toStr(shipping.name) || "Cliente",
    company: "",
    email: "",
    phone: "",
    street: toStr(destA.line1),
    number: "S/N",
    district: toStr(destA.line2) || "",
    city: toStr(destA.city),
    state: toStr(destA.state),
    country_code: "MX",
    postal_code: toStr(destA.postal_code),
    reference: "",
  };

  const payload = {
    origin: ORIGIN,
    destination,
    packages: buildPackages(items),
    // Estos campos pueden variar por cuenta/servicio; los mandamos si vienen.
    ...(carrier ? { carrier: toStr(carrier) } : {}),
    ...(service_code ? { service: toStr(service_code) } : {}),
  };

  try {
    const res = await fetch(`${ENVIA_BASE}/ship/generate/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("Envia generate non-ok:", res.status, data);
      return { ok: false, reason: `envia_non_ok:${res.status}` };
    }

    // Extraemos label url flexible
    const label_url =
      toStr(data?.label) ||
      toStr(data?.label_url) ||
      toStr(data?.data?.label) ||
      toStr(data?.data?.label_url) ||
      "";

    // Persistimos status en PI metadata si podemos
    try {
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(orderId);
        const piId = toStr(session.payment_intent);
        if (piId) {
          await stripe.paymentIntents.update(piId, {
            metadata: {
              envia_label_status: "created",
              envia_label_url: label_url || "created_no_url",
              envia_last_ts: new Date().toISOString(),
            },
          });
        }
      }
    } catch (e) {
      console.warn("PI metadata update fail:", e.message);
    }

    return { ok: true, label_url, raw: data };
  } catch (e) {
    console.error("Envia generate error:", e.message);
    return { ok: false, reason: `envia_error:${toStr(e.message)}` };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204 };
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Método no permitido" });

  const ip =
    event.headers["x-nf-client-connection-ip"] ||
    (toStr(event.headers["x-forwarded-for"]).split(",")[0] || "unknown");

  if (!hit(ip)) return json(429, { ok: false, error: "Rate limit" });

  let payload = null;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return json(400, { ok: false, error: "JSON inválido" }); }

  const orderId = toStr(payload?.orderId);
  if (!orderId) return json(400, { ok: false, error: "Falta orderId" });

  const warmKey = `${orderId}:${toStr(payload?.eventId || "noevent")}`;
  if (seen(warmKey)) return json(200, { ok: true, deduped: "warm" });
  remember(warmKey);

  // Verificación Stripe (pago real)
  const v = await verifyPaid(orderId);
  if (!v.ok) return json(401, { ok: false, error: "Unauthorized", reason: v.reason });

  // Si total inválido, no hacemos ruido
  const total = safeNum(payload?.total, 0);
  if (total <= 0) return json(200, { ok: true, skipped: "invalid_total" });

  // Intentar guía Envia si es envío
  let enviaInfo = "";
  const shippingMode = toStr(payload?.shippingMode || payload?.metadata?.shipping_mode || "");
  if (shippingMode && shippingMode !== "pickup") {
    const created = await tryCreateEnviaLabel({
      orderId,
      carrier: toStr(payload?.shipCarrier || payload?.metadata?.ship_carrier || ""),
      service_code: toStr(payload?.shipServiceCode || payload?.metadata?.ship_service_code || ""),
      shipping: payload?.shipping || {},
      items: payload?.items || [],
    });

    if (created.ok && created.label_url) {
      enviaInfo = `Guía creada ✅\nLabel: ${created.label_url}`;
    } else if (created.ok && created.deduped) {
      enviaInfo = `Guía ya existía ✅\nLabel: ${toStr(created.label_url)}`;
    } else {
      enviaInfo = `No se pudo crear guía automáticamente (${toStr(created.reason || "sin motivo")}). Revisa logs / origen.`;
    }
  } else {
    enviaInfo = "Pickup: no aplica guía.";
  }

  const msg = formatMessage(payload, { envia: enviaInfo });

  await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);
  return json(200, { ok: true, sent: true, envia: Boolean(enviaInfo) });
};