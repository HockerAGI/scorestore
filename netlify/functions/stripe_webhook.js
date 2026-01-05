const Stripe = require("stripe");
const { corsHeaders, ok, bad } = require("./_shared");

function getSignatureHeader(headers) {
  // Netlify suele normalizar headers a lowercase
  return (
    headers["stripe-signature"] ||
    headers["Stripe-Signature"] ||
    headers["STRIPE-SIGNATURE"] ||
    null
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  if (event.httpMethod !== "POST") {
    return bad(405, { error: "Method not allowed" });
  }

  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET_KEY) return bad(500, { error: "Missing STRIPE_SECRET_KEY env var" });
    if (!STRIPE_WEBHOOK_SECRET) return bad(500, { error: "Missing STRIPE_WEBHOOK_SECRET env var" });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const sig = getSignatureHeader(event.headers || {});
    if (!sig) return bad(400, { error: "Missing Stripe-Signature header" });

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    const stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);

    // Manejo mínimo (puedes ampliar después)
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        // Aquí puedes registrar en DB, mandar correo, etc.
        break;
      default:
        break;
    }

    return ok({ received: true });
  } catch (err) {
    console.error("[stripe_webhook] error:", err);
    return bad(400, { error: "Webhook signature failed", detail: String(err.message || err) });
  }
};