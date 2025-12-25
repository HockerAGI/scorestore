/**
 * netlify/functions/envia_webhook.js
 * ELIMINADA LA DEPENDENCIA EXTERNA para evitar conflictos.
 */

// Variables de Entorno
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
    // Fetch nativo
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
    console.error("Error Telegram:", err.message);
  }
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    // Fetch nativo
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
    console.error("Error WhatsApp:", err.message);
  }
}

function formatOrder(o) {
  const lines = [];
  lines.push("🚨 **NUEVA VENTA**");
  if (o.customerName) lines.push(`👤 ${o.customerName}`);
  if (o.email || o.customerEmail) lines.push(`📧 ${o.email || o.customerEmail}`);
  if (o.phone) lines.push(`📱 ${o.phone}`);
  
  if (o.total != null) lines.push(`💰 **$${Number(o.total).toFixed(2)}**`);
  else if (o.amountTotal != null) lines.push(`💰 **$${o.amountTotal}**`);

  const shipping = o.shipping || {};
  const addr = shipping.address || {};
  if (addr.line1 || addr.city) {
    lines.push("🚚 **Envío:**");
    lines.push(`${addr.line1 || ""} ${addr.city || ""} ${addr.state || ""}`);
  }

  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length) {
    lines.push("🛒 **Carrito:**");
    items.forEach(it => {
      const name = it.description || it.name || "Item";
      const qty = it.quantity || it.qty || 1;
      lines.push(`• ${qty}x ${name}`);
    });
  }
  return lines.join("\n");
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"Access-Control-Allow-Origin": "*"} };
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false });

    const body = JSON.parse(event.body || "{}");
    const msg = formatOrder(body);

    await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);
    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    return jsonResponse(200, { ok: false, error: err.message });
  }
};
