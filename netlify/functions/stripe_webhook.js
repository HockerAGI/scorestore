/**
 * stripe_webhook.js — FINAL INTEGRATED
 */
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");
const { createEnviaLabel, supabase } = require("./_shared");

// CONFIG TELEGRAM REAL
const TELEGRAM_BOT_TOKEN = "7893882322:AAFFjrL0cfLl0AOAHMiNwbwrjX4E-1c58Bk";
const TELEGRAM_CHAT_ID = "8554886422";

async function sendTelegram(msg) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML' })
    });
  } catch (e) { console.error("Telegram Error:", e); }
}

const json = (statusCode, body) => ({
  statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const sig = event.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_qBcEPgzTWhq7iHraP5mhLt513gVPtA6R";

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body, sig, webhookSecret);
  } catch (err) {
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const mode = session.metadata?.score_mode || "pickup";
    const customer = session.customer_details || {};
    const shipping = session.shipping_details || {};
    const address = shipping.address || customer.address;
    const email = customer.email || "no-email";
    const name = customer.name || "Cliente";

    // 1. GUARDAR SUPABASE
    await supabase.from("orders").upsert({
      stripe_session_id: session.id,
      org_id: session.metadata?.org_id,
      customer_email: email,
      total: session.amount_total / 100,
      currency: "mxn",
      status: "paid",
      shipping_mode: mode,
      shipping_cost: (session.total_details?.amount_shipping || 0) / 100,
      address_json: address
    }, { onConflict: "stripe_session_id" });

    // 2. GENERAR GUÍA Y NOTIFICAR
    let msg = `<b>💰 VENTA: $${session.amount_total/100}</b>\n👤 ${name}\n🚚 ${mode.toUpperCase()}`;
    
    if ((mode === "mx" || mode === "us") && address) {
      const label = await createEnviaLabel({ name, email, phone: customer.phone, address }, 1);
      if (label) {
        msg += `\n✅ <b>Guía:</b> ${label.tracking}`;
        await supabase.from("orders").update({ 
          tracking_number: label.tracking, label_url: label.labelUrl, status: "shipped" 
        }).eq("stripe_session_id", session.id);
      }
    }
    
    await sendTelegram(msg);
  }

  return json(200, { received: true });
};
