const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function getRawBody(event) {
  const rawBody = event.body || "";
  if (event.isBase64Encoded) return Buffer.from(rawBody, "base64");
  return rawBody;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = getHeader(event.headers, "stripe-signature");

  if (!sig || !webhookSecret) {
    return json(400, { error: "Missing Signature or Secret" });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, webhookSecret);
  } catch (err) {
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    console.log(`✅ Pago exitoso: ${session.id} | Cliente: ${session.customer_details?.email}`);
  }

  return json(200, { received: true });
};
