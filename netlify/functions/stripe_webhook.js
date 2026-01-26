const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const { createEnviaLabel, supabaseAdmin } = require("./_shared");

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) { return { statusCode: 400, body: err.message }; }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const mode = session.metadata?.shipping_mode;
    const customer = session.customer_details;
    const shipping = session.shipping_details;

    let tracking = "N/A - Recoger en Fábrica";
    if (mode !== "pickup" && shipping) {
      const label = await createEnviaLabel({
        name: shipping.name,
        email: customer.email,
        phone: customer.phone || "0000000000",
        address: shipping.address
      }, 2);
      if (label) tracking = label.tracking_number;
    }

    if (supabaseAdmin) {
      await supabaseAdmin.from('orders').insert([{
        stripe_id: session.id,
        total: session.amount_total / 100,
        status: 'paid',
        tracking: tracking,
        shipping_mode: mode
      }]);
    }

    // Telegram Alerta
    const msg = `🏁 <b>NUEVA VENTA SCORE STORE</b>\n👤 Cliente: ${customer.name}\n💰 Total: $${session.amount_total/100} MXN\n🚚 Envío: ${mode.toUpperCase()}\n📦 Guía: <code>${tracking}</code>`;
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: msg,
      parse_mode: "HTML"
    });
  }
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};