/**
 * netlify/functions/envia_webhook.js
 * Recibe la confirmación de pago desde stripe_webhook y notifica al Admin.
 * Canales: Telegram y WhatsApp (Meta Cloud API).
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
    console.error("Error al enviar Telegram:", err.message);
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
    console.error("Error al enviar WhatsApp:", err.message);
  }
}

function formatOrder(o) {
  const lines = [];

  lines.push("🚨 **NUEVA VENTA CONFIRMADA**");
  lines.push("--------------------------------");

  if (o.customerName) lines.push(`👤 **Cliente:** ${o.customerName}`);
  if (o.customerEmail) lines.push(`📧 **Email:** ${o.customerEmail}`);
  if (o.phone) lines.push(`📱 **Tel:** ${o.phone}`);
  
  lines.push(""); // Espacio
  
  if (o.amountTotal != null) {
    lines.push(`💰 **TOTAL:** $${o.amountTotal} ${String(o.currency || "MXN").toUpperCase()}`);
  }
  if (o.paymentStatus) lines.push(`✅ **Estado:** ${o.paymentStatus.toUpperCase()}`);

  lines.push(""); // Espacio

  if (o.shipping?.address) {
    const a = o.shipping.address;
    lines.push("🚚 **Dirección de Envío:**");
    lines.push(`${o.shipping.name || ""}`);
    const calle = `${a.line1 || ""} ${a.line2 || ""}`.trim();
    if (calle) lines.push(calle);
    const ciudad = `${a.city || ""}, ${a.state || ""} ${a.postal_code || ""}`.trim();
    if (ciudad) lines.push(ciudad);
    if (a.country) lines.push(a.country);
  }

  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length) {
    lines.push(""); // Espacio
    lines.push("🛒 **Carrito:**");
    for (const it of items) {
      // (Total item) -> formateo simple
      const price = it.amount_total ? `$${it.amount_total}` : ""; 
      lines.push(`• ${it.qty}x ${it.name} ${price}`);
    }
  }

  const promo = o.metadata?.promoCode;
  if (promo && promo !== "NA") {
    lines.push("");
    lines.push(`🎟️ **Cupón usado:** ${promo}`);
  }

  return lines.filter(Boolean).join("\n");
}

exports.handler = async (event) => {
  try {
    // Manejo de CORS (Preflight)
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
      return jsonResponse(400, { ok: false, error: "JSON inválido." });
    }

    // Formatear mensaje
    const msg = formatOrder(body);

    // Enviar notificaciones paralelas (sin esperar una a la otra)
    await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);

    return jsonResponse(200, { ok: true, msg: "Notificaciones enviadas." });

  } catch (err) {
    console.error("Error en webhook de notificaciones:", err);
    // Retornamos 200 aunque falle la notificación para no romper el flujo de Stripe
    return jsonResponse(200, { ok: false, error: err.message });
  }
};
