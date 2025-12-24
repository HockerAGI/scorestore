/**
 * netlify/functions/envia_webhook.js
 * Recibe la confirmación de pago desde stripe_webhook y notifica al Admin.
 * Canales: Telegram y WhatsApp (Meta Cloud API).
 */

const fetch = require("node-fetch"); // Agregado para compatibilidad robusta

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
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
    console.log("Telegram enviado OK.");
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
    console.log("WhatsApp enviado OK.");
  } catch (err) {
    console.error("Error al enviar WhatsApp:", err.message);
  }
}

function formatOrder(o) {
  const lines = [];

  lines.push("🚨 **NUEVA VENTA CONFIRMADA**");
  lines.push("--------------------------------");

  if (o.customerName) lines.push(`👤 **Cliente:** ${o.customerName}`);
  if (o.email) lines.push(`📧 **Email:** ${o.email}`); // Corregido key a 'email' estandar
  else if (o.customerEmail) lines.push(`📧 **Email:** ${o.customerEmail}`);

  if (o.phone) lines.push(`📱 **Tel:** ${o.phone}`);

  lines.push(""); // Espacio

  if (o.total != null) { // Usualmente 'total' es más común en payload procesado
     // Asumimos que viene ya en decimales (ej: 250.00)
     lines.push(`💰 **TOTAL:** $${Number(o.total).toFixed(2)} MXN`);
  } else if (o.amountTotal != null) {
     lines.push(`💰 **TOTAL:** $${o.amountTotal} ${String(o.currency || "MXN").toUpperCase()}`);
  }

  lines.push(`✅ **Estado:** PAGADO`); // Si llegó aquí, es porque ya pagó.

  lines.push(""); // Espacio

  // Manejo flexible de dirección (Stripe a veces cambia estructura)
  const shipping = o.shipping || {};
  const addr = shipping.address || {};

  if (addr.line1 || addr.city) {
    lines.push("🚚 **Dirección de Envío:**");
    if (shipping.name) lines.push(shipping.name);
    
    const calle = `${addr.line1 || ""} ${addr.line2 || ""}`.trim();
    if (calle) lines.push(calle);
    
    const ciudad = `${addr.city || ""}, ${addr.state || ""} ${addr.postal_code || ""}`.trim();
    if (ciudad) lines.push(ciudad);
    
    if (addr.country) lines.push(addr.country);
  }

  // Items (si existen)
  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length) {
    lines.push(""); // Espacio
    lines.push("🛒 **Carrito:**");
    for (const it of items) {
      // Intentar sacar precio unitario si existe
      const priceStr = it.price ? `($${it.price})` : ""; 
      const name = it.description || it.name || "Producto";
      const qty = it.quantity || it.qty || 1;
      lines.push(`• ${qty}x ${name} ${priceStr}`);
    }
  }

  if (o.orderId) {
      lines.push("");
      lines.push(`🆔 ID: ${o.orderId.slice(-8)}`); // Solo últimos 8 para no saturar
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

    console.log("Recibido payload de webhook:", JSON.stringify(body)); // Log para debug en Netlify

    // Formatear mensaje
    const msg = formatOrder(body);

    // Enviar notificaciones paralelas
    await Promise.all([sendTelegram(msg), sendWhatsApp(msg)]);

    return jsonResponse(200, { ok: true, msg: "Notificaciones enviadas." });

  } catch (err) {
    console.error("Error en webhook de notificaciones:", err);
    // Retornamos 200 siempre para que Stripe no reintente infinitamente si falla Telegram
    return jsonResponse(200, { ok: false, error: err.message });
  }
};