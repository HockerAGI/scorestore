// netlify/functions/stripe_webhook.js
// Stripe webhook handler for SCORE Store
//
// Requiere env:
// - STRIPE_SECRET_KEY
// - STRIPE_WEBHOOK_SECRET
//
// Opcional:
// - TELEGRAM_BOT_TOKEN
// - TELEGRAM_CHAT_ID
// - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (guardar orders)
// - ENVIA_API_KEY (crear guía automática)
//
// Maneja:
// - checkout.session.completed
//
// Importante: verifica firma con RAW body (soporta base64 de Netlify)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const { jsonResponse, supabaseAdmin, createEnviaLabel } = require("./_shared");

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
      { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true },
      { timeout: 12000 }
    );
  } catch (e) {
    console.error("[telegram] error:", e?.message || e);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"] ||
    event.headers["STRIPE-SIGNATURE"];

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe_webhook] Missing STRIPE_WEBHOOK_SECRET");
    return jsonResponse(500, { error: "Missing webhook secret" });
  }

  // RAW body (Netlify puede mandar base64)
  let rawBody = event.body || "";
  if (event.isBase64Encoded) {
    rawBody = Buffer.from(rawBody, "base64").toString("utf8");
  }

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

      const amountTotal = (Number(session.amount_total || 0) / 100).toFixed(2);
      const currency = String(session.currency || "mxn").toUpperCase();
      const paymentStatus = escapeHtml(session.payment_status || "paid");

      const meta = session.metadata || {};
      const mode = String(meta.shipping_mode || meta.score_mode || "pickup").toLowerCase();
      const cp = String(meta.customer_cp || "");
      const itemsQty = String(meta.score_items || "—");
      const promo = String(meta.promo_code || "");

      const customerName = escapeHtml(session.customer_details?.name || "Cliente");
      const customerEmail = escapeHtml(session.customer_details?.email || "");
      const customerPhone = escapeHtml(session.customer_details?.phone || "");

      // --- OPTIONAL: generar guía Envia (SAFE) ---
      let trackingInfo = "N/A";
      let labelUrl = "";
      let carrierName = "—";

      const shippingDetails = session.shipping_details;

      if (mode !== "pickup" && shippingDetails?.address) {
        try {
          const customerData = {
            name: shippingDetails?.name || session.customer_details?.name || "Cliente",
            email: session.customer_details?.email || "cliente@scorestore.com",
            phone: session.customer_details?.phone || "0000000000",
            address: shippingDetails.address,
          };

          // itemsQty viene como string; lo normalizamos aquí:
          const qtyNum = Math.max(1, Number(String(itemsQty).replace(/\D+/g, "")) || 1);

          const shipment = await createEnviaLabel(customerData, qtyNum);
          if (shipment) {
            trackingInfo = shipment.tracking || "N/A";
            labelUrl = shipment.labelUrl || "";
            carrierName = shipment.carrier || "Envia";
          }
        } catch (e) {
          console.error("[envia label] error:", e?.message || e);
        }
      }

      // --- OPTIONAL: guardar en Supabase (SAFE) ---
      if (supabaseAdmin) {
        try {
          await supabaseAdmin.from("orders").insert([
            {
              stripe_session_id: session.id,
              total: Number(session.amount_total || 0) / 100,
              currency: String(session.currency || "mxn"),
              status: "paid",

              shipping_mode: mode,
              customer_cp: cp || null,
              promo_code: promo || null,
              items_qty: itemsQty || null,

              customer_name: session.customer_details?.name || null,
              customer_email: session.customer_details?.email || null,
              customer_phone: session.customer_details?.phone || null,

              tracking_number: trackingInfo !== "N/A" ? trackingInfo : null,
              label_url: labelUrl || null,
              carrier: carrierName !== "—" ? carrierName : null,
            },
          ]);
        } catch (e) {
          console.error("[supabase] insert error:", e?.message || e);
        }
      }

      // --- Telegram notify (HTML) ---
      const msg =
        `🏁 <b>SCORE STORE · PAGO CONFIRMADO</b>\n\n` +
        `💳 Estado: <b>${paymentStatus}</b>\n` +
        `💰 Total: <b>${amountTotal} ${currency}</b>\n` +
        `📦 Items: <b>${escapeHtml(itemsQty)}</b>\n` +
        `🚚 Envío: <b>${escapeHtml(mode)}</b>\n` +
        `${cp ? `📍 CP/ZIP: <b>${escapeHtml(cp)}</b>\n` : ""}` +
        `${promo ? `🏷️ Promo: <b>${escapeHtml(promo)}</b>\n` : ""}` +
        `${trackingInfo !== "N/A" ? `📦 Guía: <b>${escapeHtml(trackingInfo)}</b>\n` : ""}` +
        `${carrierName !== "—" ? `🚛 Carrier: <b>${escapeHtml(carrierName)}</b>\n` : ""}` +
        `${labelUrl ? `📄 Etiqueta: ${escapeHtml(labelUrl)}\n` : ""}` +
        `\n👤 ${customerName}\n` +
        `${customerEmail ? `✉️ ${customerEmail}\n` : ""}` +
        `${customerPhone ? `📱 ${customerPhone}\n` : ""}` +
        `\n🔗 Session: <code>${escapeHtml(session.id)}</code>`;

      await notifyTelegramHTML(msg);
    }

    return jsonResponse(200, { received: true });
  } catch (err) {
    console.error("[stripe_webhook] handler error:", err);
    return jsonResponse(500, { error: err?.message || "Webhook error" });
  }
};