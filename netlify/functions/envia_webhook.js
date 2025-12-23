/**
 * Netlify Function: envia_webhook
 * Envía notificaciones de pedidos a Telegram y WhatsApp (Meta Cloud API)
 *
 * Requiere en entorno (.env):
 *  TELEGRAM_BOT_TOKEN
 *  TELEGRAM_CHAT_ID
 *  WHATSAPP_TOKEN
 *  WHATSAPP_PHONE_NUMBER_ID
 *  WHATSAPP_TO
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TO = process.env.WHATSAPP_TO;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("Error al enviar Telegram:", err);
  }
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: WHATSAPP_TO,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    });
  } catch (err) {
    console.error("Error al enviar WhatsApp:", err);
  }
}

function formatOrder(o) {
  const lines = [];

  lines.push("🧾 NUEVO PEDIDO — SCORE Store");

  if (o.sessionId) lines.push(`Session: ${o.sessionId}`);
  if (o.paymentStatus) lines.push(`Pago: ${o.paymentStatus}`);
  if (o.amountTotal != null) lines.push(`Total: $${o.amountTotal} ${String(o.currency || "mxn").toUpperCase()}`);
  if (o.customerName) lines.push(`Cliente: ${o.customerName}`);
  if (o.customerEmail) lines.push(`Email: ${o.customerEmail}`);
  if (o.phone) lines.push(`Tel: ${o.phone}`);

  if (o.shipping?.address) {
    const a = o.shipping.address;
    lines.push("📦 Envío:");
    lines.push(`${o.shipping.name || "Cliente"}`);
    if (a.line1 || a.line2) lines.push(`${a.line1 || ""} ${a.line2 || ""}`.trim());
    if (a.city || a.state || a.postal_code) lines.push(`${a.city || ""}, ${a.state || ""} ${a.postal_code || ""}`.trim());
    if (a.country) lines.push(`${a.country}`);
  }

  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length) {
    lines.push("🛒 Productos:");
    for (const it of items) {
      lines.push(`- ${it.qty} x ${it.name} (${it.amount_total || ""})`);
    }
  }

  const promo = o.metadata?.promoCode;
  if (promo) lines.push(`🏷️ Promo: ${promo}`);

  return lines.filter(Boolean).join("\n");
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Método no permitido" });
    }

    const body = JSON.parse(event.body || "{}");
    if (!body || typeof body !== "object") {
      return jsonResponse(400, { ok: false, error: "Cuerpo de solicitud inválido." });
    }

    const msg = formatOrder(body);

    await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);

    return jsonResponse(200, { ok: true, msg: "Notificación enviada." });
  } catch (err) {
    console.error("Error webhook:", err);
    return jsonResponse(500, { ok: false, error: err.message || String(err) });
  }
};