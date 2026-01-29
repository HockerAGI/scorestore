// SCORE STORE — Stripe Webhook (PROD · UNIFIED)
// - Verifica firma con RAW body (soporta base64 de Netlify)
// - Maneja: checkout.session.completed
// - Opcional: crea guía Envia.com
// - Opcional: guarda order en Supabase (service role)
// - Opcional: notifica a Telegram (HTML)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");

const {
  jsonResponse,
  supabaseAdmin,
  createEnviaLabel,
  normalizeQty,
  digitsOnly,
} = require("./_shared");

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function notifyTelegramHTML(html) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      { timeout: 12000 }
    );
  } catch (e) {
    console.error("[telegram] error:", e?.message || e);
  }
}

function getRawBody(event) {
  let rawBody = event?.body || "";
  if (event?.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, "base64").toString("utf8");
  }
  return rawBody;
}

async function getItemsQtyFromStripe(sessionId) {
  try {
    const li = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    const qty = (li?.data || []).reduce((acc, row) => acc + normalizeQty(row?.quantity || 1), 0);
    return Math.max(1, qty);
  } catch (e) {
    console.warn("[stripe] listLineItems failed:", e?.message || e);
    return 1;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const sig =
    event.headers?.["stripe-signature"] ||
    event.headers?.["Stripe-Signature"] ||
    event.headers?.["STRIPE-SIGNATURE"];

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return jsonResponse(500, { error: "Missing webhook secret" });
  if (!sig) return jsonResponse(400, { error: "Missing Signature" });

  const rawBody = getRawBody(event);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe_webhook] signature verify failed:", err?.message || err);
    return jsonResponse(400, { error: "Invalid signature" });
  }

  try {
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      const meta = session.metadata || {};
      const mode = String(meta.shipping_mode || meta.score_mode || "pickup").toLowerCase();
      const zip = digitsOnly(meta.customer_zip || meta.customer_cp || "");
      const promo = String(meta.promo_code || "").trim();

      let itemsQty = Number(String(meta.items_qty || meta.score_items || "").replace(/\D+/g, "")) || 0;
      if (!itemsQty) itemsQty = await getItemsQtyFromStripe(session.id);

      const customerName = escapeHtml(
        session.customer_details?.name || session.shipping_details?.name || "Cliente"
      );
      const customerEmail = escapeHtml(session.customer_details?.email || "");
      const customerPhone = escapeHtml(session.customer_details?.phone || "");

      const amountTotal = (Number(session.amount_total || 0) / 100).toFixed(2);
      const currency = String(session.currency || "mxn").toUpperCase();
      const paymentStatus = escapeHtml(session.payment_status || "paid");

      let trackingInfo = "";
      let labelUrl = "";
      let carrierName = "";
      const shippingDetails = session.shipping_details;

      if (mode !== "pickup" && createEnviaLabel && shippingDetails?.address) {
        try {
          const customerData = {
            name: shippingDetails?.name || session.customer_details?.name || "Cliente",
            email: session.customer_details?.email || "cliente@scorestore.com",
            phone: session.customer_details?.phone || "0000000000",
            address: shippingDetails.address,
          };

          const qtyNum = Math.max(1, Number(itemsQty) || 1);
          const shipment = await createEnviaLabel(customerData, qtyNum);

          if (shipment) {
            trackingInfo = shipment.tracking || "";
            labelUrl = shipment.labelUrl || "";
            carrierName = shipment.carrier || "";
          }
        } catch (e) {
          console.error("[envia label] error:", e?.message || e);
        }
      }

      if (supabaseAdmin) {
        try {
          await supabaseAdmin.from("orders").insert([
            {
              stripe_session_id: session.id,
              total: Number(session.amount_total || 0) / 100,
              currency: String(session.currency || "mxn"),
              status: "paid",

              shipping_mode: mode,
              customer_cp: zip || null,
              promo_code: promo || null,
              items_qty: Number(itemsQty) || null,

              customer_name: session.customer_details?.name || shippingDetails?.name || null,
              customer_email: session.customer_details?.email || null,
              customer_phone: session.customer_details?.phone || null,

              tracking_number: trackingInfo || null,
              label_url: labelUrl || null,
              carrier: carrierName || null,

              raw_meta: meta ? JSON.stringify(meta) : null,
            },
          ]);
        } catch (e) {
          console.error("[supabase] insert error:", e?.message || e);
        }
      }

      const emojiMode = mode === "pickup" ? "🏪 PICKUP" : "🚛 ENVÍO";
      const trackingMsg = trackingInfo ? `\n📦 <b>Guía:</b> ${escapeHtml(trackingInfo)}` : "";
      const labelMsg = labelUrl ? `\n📄 <b>Etiqueta:</b> ${escapeHtml(labelUrl)}` : "";
      const cpMsg = zip ? `\n📍 <b>CP/ZIP:</b> ${escapeHtml(zip)}` : "";
      const promoMsg = promo ? `\n🏷️ <b>Promo:</b> ${escapeHtml(promo)}` : "";

      const msg =
        `<b>🏆 NUEVA VENTA - SCORE STORE</b>\n` +
        `➖➖➖➖➖➖➖➖➖➖\n` +
        `👤 <b>${customerName}</b>\n` +
        `💰 <b>$${escapeHtml(amountTotal)} ${escapeHtml(currency)}</b>\n` +
        `${emojiMode}\n` +
        `💳 Estado: <b>${paymentStatus}</b>\n` +
        `📦 Items: <b>${escapeHtml(itemsQty)}</b>` +
        `${cpMsg}` +
        `${promoMsg}` +
        `${trackingMsg}` +
        `${labelMsg}` +
        `\n➖➖➖➖➖➖➖➖➖➖\n` +
        `${customerEmail ? `✉️ ${customerEmail}\n` : ""}` +
        `${customerPhone ? `📱 ${customerPhone}\n` : ""}` +
        `🔗 Session: <code>${escapeHtml(session.id)}</code>`;

      await notifyTelegramHTML(msg);
    }

    return jsonResponse(200, { received: true });
  } catch (err) {
    console.error("[stripe_webhook] handler error:", err);
    return jsonResponse(500, { error: err?.message || "Webhook error" });
  }
};