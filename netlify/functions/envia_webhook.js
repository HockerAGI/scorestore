// /netlify/functions/envia_webhook.js
// Envia webhook -> Telegram/WhatsApp (status updates)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TO = process.env.WHATSAPP_TO;

const ENVIA_WEBHOOK_SECRET = process.env.ENVIA_WEBHOOK_SECRET; // agrega esta en Netlify

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }) }).catch(() => {});
}

async function sendWhatsApp(text) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_TO) return;
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: WHATSAPP_TO, type: "text", text: { body: text } }),
  }).catch(() => {});
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  // Seguridad simple
  if (ENVIA_WEBHOOK_SECRET) {
    const token = event.headers["x-webhook-token"];
    if (!token || token !== ENVIA_WEBHOOK_SECRET) return json(401, { ok: false, error: "Unauthorized" });
  }

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch {}

  const status = payload?.status || payload?.event || "UPDATE";
  const tracking = payload?.tracking || payload?.tracking_number || payload?.guide || "N/A";
  const carrier = payload?.carrier || "Envia";

  const msg = `📦 ENVÍO ACTUALIZADO\nCarrier: ${carrier}\nTracking: ${tracking}\nStatus: ${status}`;

  await sendTelegram(msg);
  await sendWhatsApp(msg);

  return json(200, { ok: true });
};