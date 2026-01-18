const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createEnviaLabel } = require("./_shared");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  if (!sig || !webhookSecret) return json(400, { error: "Missing Signature" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const mode = session.metadata?.score_mode;
    const details = session.shipping_details || session.customer_details;
    
    if ((mode === "mx" || mode === "us") && details) {
        await createEnviaLabel({
          name: details.name,
          email: session.customer_details?.email,
          phone: details.phone,
          address: details.address
        }, 2);
    }
  }

  return json(200, { received: true });
};