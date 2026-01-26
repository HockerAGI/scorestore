const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const { createEnviaLabel, supabaseAdmin, jsonResponse } = require("./_shared");

async function notifyTelegram(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text, parse_mode: "HTML"
    });
  } catch (e) { console.error("Telegram error"); }
}

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) { return { statusCode: 400, body: `Webhook Error: ${err.message}` }; }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const mode = session.metadata?.shipping_mode;
    const customer = session.customer_details;
    const shipping = session.shipping_details;

    let envia = null;
    if (mode !== "pickup" && shipping) {
      envia = await createEnviaLabel({
        name: shipping.name,
        email: customer.email,
        phone: customer.phone || "6640000000",
        address: shipping.address
      }, 2);
    }

    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert([{
        stripe_id: session.id,
        total: session.amount_total / 100,
        status: "paid",
        tracking: envia?.tracking || "N/A",
        label_url: envia?.labelUrl || null,
        shipping_mode: mode
      }]);
    }

    const msg = `🏁 <b>NUEVA VENTA - SCORE STORE</b>\n👤 Cliente: ${customer.name}\n💰 Total: $${session.amount_total/100} MXN\n🚚 Envío: ${mode.toUpperCase()}\n📦 Guía: <code>${envia?.tracking || "N/A"}</code>`;
    await notifyTelegram(msg);
  }

  return jsonResponse(200, { received: true });
};