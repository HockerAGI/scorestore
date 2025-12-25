const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;

    const payload = {
      orderId: session.id,
      customerName: session.customer_details?.name || "Cliente",
      email: session.customer_details?.email || "",
      phone: session.customer_details?.phone || "",
      total: (session.amount_total || 0) / 100,
      shipping: session.shipping_details || {},
      items: session.display_items || []
    };

    const siteUrl =
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      "http://localhost:8888";

    try {
      await fetch(`${siteUrl}/.netlify/functions/envia_webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Error enviando a envia_webhook:", e.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true })
  };
};