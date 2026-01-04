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

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("❌ Stripe keys faltantes en Netlify.");
    return json(500, { ok: false });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("❌ Firma Stripe inválida:", err.message);
    return json(400, { error: "Invalid signature" });
  }

  // Solo eventos que confirman dinero real
  const validEvents = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded"
  ];

  if (!validEvents.includes(stripeEvent.type)) {
    return json(200, { ignored: true });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      stripeEvent.data.object.id,
      {
        expand: ["line_items", "customer_details", "shipping_details"]
      }
    );

    const shippingMode = session.metadata?.shipping_mode || "pickup";
    const promo = session.metadata?.promo || "";

    console.log("💰 ORDEN CONFIRMADA");
    console.log("ID:", session.id);
    console.log("Email:", session.customer_details?.email);
    console.log("Total:", session.amount_total / 100, "MXN");
    console.log("Modo:", shippingMode);
    console.log("Promo:", promo);

    // ⚠️ Aquí iría persistencia (DB / Sheet)
    // ⚠️ Aquí NO se genera guía automáticamente todavía

  } catch (err) {
    console.error("❌ Error procesando orden:", err);
    // IMPORTANTE: Stripe ya cobró → responder 200
  }

  return json(200, { received: true });
};