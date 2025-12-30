// netlify/functions/envia_webhook.js
// WORKER — ejecuta procesos post-pago

const {
  TELEGRAM_BOT_TOKEN = "",
  TELEGRAM_CHAT_ID = "",
  WHATSAPP_TOKEN = "",
  WHATSAPP_PHONE_NUMBER_ID = "",
  WHATSAPP_TO = "",
  INTERNAL_WEBHOOK_SECRET = "",
} = process.env;

/* ================= HELPERS ================= */
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function toStr(v) {
  return (v ?? "").toString().trim();
}

function moneyMXN(v) {
  const n = Number(v || 0);
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

/* ================= NOTIFY ================= */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
  try {
    await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
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
  } catch (e) {
    console.error("WhatsApp error:", e.message);
  }
}

/* ================= HANDLER ================= */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // Seguridad interna
  if (INTERNAL_WEBHOOK_SECRET) {
    const got = toStr(event.headers["x-internal-secret"]);
    if (got !== INTERNAL_WEBHOOK_SECRET) {
      return json(401, { error: "Unauthorized" });
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const {
    orderRef,
    orderId,
    total,
    currency = "MXN",
    customerName = "Cliente",
    email = "",
  } = payload;

  if (!orderId || !total) {
    return json(400, { error: "Payload incompleto" });
  }

  const msg = [
    "✅ NUEVA ORDEN — SCORE STORE",
    `🧾 Orden: ${orderRef || orderId}`,
    `👤 ${customerName}`,
    email ? `📧 ${email}` : "",
    `💰 Total: ${moneyMXN(total)} (${currency.toUpperCase()})`,
    "",
    "Estado: PAGADO",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.all([
    sendTelegram(msg),
    sendWhatsApp(msg),
  ]);

  console.log("Notificaciones enviadas:", orderRef || orderId);

  return json(200, { ok: true, notified: true });
};