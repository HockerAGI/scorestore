// netlify/functions/stripe_webhook.js
// Stripe webhook seguro + idempotente + dispara envia_webhook

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}
function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }

function getRawBody(event) {
  if (!event?.body) return Buffer.from("");
  return event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
}

exports.handler = async (event) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) return json(500, { ok: false });

  const stripe = require("stripe")(stripeKey);
  const sig = event.headers["stripe-signature"];
  if (!sig) return json(400, { ok: false });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      webhookSecret
    );
  } catch (e) {
    return json(400, { ok: false });
  }

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(stripeEvent.type)) {
    return json(200, { received: true });
  }

  const session = stripeEvent.data.object;

  const payload = {
    eventId: stripeEvent.id,
    orderId: session.id,
    total: Number(session.amount_total || 0) / 100,
    currency: upper(session.currency),
    shippingMode: session.metadata?.shipping_mode || "pickup",
    shipping: session.shipping_details || {},
    items: [],
  };

  const siteUrl = process.env.URL_SCORE || process.env.URL || "";
  if (!siteUrl) return json(200, { ok: true });

  await fetch(`${siteUrl}/.netlify/functions/envia_webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});

  return json(200, { ok: true });
};