// netlify/functions/stripe_webhook.js
// Webhook Stripe — PRODUCCIÓN REAL (Node 18+)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    console.error("Stripe signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true });
  }

  const session = stripeEvent.data.object;

  // Obtener items reales desde Stripe
  const itemsRes = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });

  const items = itemsRes.data.map((li) => ({
    name: toStr(li.description),
    qty: Number(li.quantity || 1),
    amount: Number(li.amount_total || 0) / 100,
  }));

  const payload = {
    orderId: session.id,
    customerName: toStr(session.customer_details?.name) || "Cliente",
    email: toStr(session.customer_details?.email),
    phone: toStr(session.customer_details?.phone),
    total: Number(session.amount_total || 0) / 100,
    currency: toStr(session.currency || "mxn").toUpperCase(),
    shipping: session.shipping_details || {},
    items,
  };

  const siteUrl =
    toStr(process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/+$/, "");

  if (siteUrl) {
    try {
      await fetch(`${siteUrl}/.netlify/functions/envia_webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("envia_webhook error:", e.message);
    }
  }

  return json(200, { ok: true });
};