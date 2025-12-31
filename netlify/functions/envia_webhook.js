// netlify/functions/stripe_webhook.js
// PRODUCCIÓN — Stripe como fuente única de verdad

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function getRawBody(event) {
  if (!event?.body) return Buffer.from("");
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false });
  }

  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) return json(400, { error: "Missing stripe signature" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe signature error:", err.message);
    return json(400, { error: "Invalid signature" });
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true });
  }

  const session = stripeEvent.data.object;

  // Traer sesión completa
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["customer_details"],
  });

  // Line items reales
  const itemsRes = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });

  const payload = {
    orderId: session.id,
    total: session.amount_total / 100,
    currency: session.currency,
    customer: {
      name: fullSession.customer_details?.name || "",
      email: fullSession.customer_details?.email || "",
      phone: fullSession.customer_details?.phone || "",
    },
    shipping: fullSession.shipping_details || {},
    items: itemsRes.data.map((i) => ({
      name: i.description,
      qty: i.quantity,
      price: i.amount_total / 100,
    })),
    metadata: session.metadata || {},
  };

  try {
    await fetch(`${process.env.URL_SCORE}/.netlify/functions/envia_webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Error calling envia_webhook:", e.message);
  }

  return json(200, { ok: true });
};