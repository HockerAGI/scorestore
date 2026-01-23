const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");

const { jsonResponse, createEnviaLabel, supabaseAdmin, normalizeQty } = require("./_shared");

/**
 * Stripe Webhook (Netlify Function)
 */

function getSig(headers) {
  return headers["stripe-signature"] || headers["Stripe-Signature"] || headers["STRIPE-SIGNATURE"] || "";
}

// Sanitizar inputs para evitar que el bot de Telegram crashee por HTML inválido
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error("telegram notify error:", e?.response?.data || e.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const sig = getSig(event.headers || {});
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) return jsonResponse(500, { error: "Missing STRIPE_WEBHOOK_SECRET" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error("webhook signature error:", err.message);
    return jsonResponse(400, { error: "Invalid signature" });
  }

  try {
    if (stripeEvent.type !== "checkout.session.completed") {
      return jsonResponse(200, { received: true });
    }

    const session = stripeEvent.data.object;
    const sessionId = session.id;
    const total = session.amount_total ? session.amount_total / 100 : 0;

    const mode = String(session.metadata?.shipping_mode || session.metadata?.score_mode || "pickup").toLowerCase();
    const promoCode = String(session.metadata?.promo_code || "").trim();

    // CUSTOMER DATA: Prioritize Shipping Details for Logistics
    // Ahora que activamos phone_collection, session.customer_details.phone vendrá lleno.
    const shipping = session.shipping_details || session.customer_details || {};
    const addressSource = shipping.address || {};

    const customer = {
      name: shipping.name || session.customer_details?.name || "",
      email: session.customer_details?.email || "", 
      phone: session.customer_details?.phone || "",
      address: {
        line1: addressSource.line1 || "",
        line2: addressSource.line2 || "",
        city: addressSource.city || "",
        state: addressSource.state || "",
        country: addressSource.country || "",
        postal_code: addressSource.postal_code || "",
      },
    };

    // Pull line items
    const li = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    const lineItems = (li.data || []).map((x) => ({
      description: x.description || "",
      quantity: x.quantity || 1,
      amount_total: x.amount_total ? x.amount_total / 100 : null,
      price_id: x.price?.id || null,
    }));

    const itemsQty = lineItems.reduce((acc, x) => acc + normalizeQty(x.quantity), 0);

    // Label Generation
    let envia = null;
    let labelError = null;
    
    // Validar que tengamos datos suficientes
    if ((mode === "mx" || mode === "us") && customer.address.postal_code) {
      envia = await createEnviaLabel(customer, itemsQty);
      if (!envia) {
        labelError = "Error generando guía (Check Logs)";
        console.warn("Label generation failed for session:", sessionId);
      }
    }

    // Persist to Supabase
    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert([
        {
          stripe_id: sessionId,
          total_mxn: total,
          status: "paid",
          shipping_mode: mode,
          promo_code: promoCode || null,
          customer_json: customer,
          items_json: lineItems,
          tracking_number: envia?.tracking || null,
          label_url: envia?.labelUrl || null,
          carrier: envia?.carrier || null,
          delivery_status: "created",
          created_at: new Date().toISOString(),
        },
      ]);
    }

    const cleanName = escapeHtml(customer.name);
    const cleanPhone = escapeHtml(customer.phone);
    const cleanPromo = escapeHtml(promoCode);

    const msg =
      `<b>✅ NUEVA ORDEN PAGADA</b>\n` +
      `SCORE Store\n` +
      `Total: <b>$${total.toFixed(2)} MXN</b>\n` +
      `Modo: <b>${mode}</b>\n` +
      (cleanPromo ? `Cupón: <b>${cleanPromo}</b>\n` : "") +
      (cleanName ? `Cliente: ${cleanName}\n` : "") +
      (cleanPhone ? `Tel: ${cleanPhone}\n` : "") +
      (envia?.tracking ? `Tracking: <b>${envia.tracking}</b>\n` : "") +
      (labelError ? `⚠️ <b>${labelError}</b>\n` : "");

    await notifyTelegram(msg);

    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error("stripe_webhook error:", err);
    return jsonResponse(500, { error: "Webhook handling failed" });
  }
};