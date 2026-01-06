const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  };
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

// Stripe firma el cuerpo CRUDO
function getRawBody(event) {
  const raw = event.body || "";
  if (event.isBase64Encoded) return Buffer.from(raw, "base64");
  return raw;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("❌ Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return json(500, { error: "Server configuration error" });
  }

  const sig = getHeader(event.headers, "stripe-signature");
  if (!sig) return json(400, { error: "Missing Stripe-Signature header" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, webhookSecret);
  } catch (err) {
    console.error("⚠️ Invalid signature:", err.message);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  const allowed = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]);

  if (!allowed.has(stripeEvent.type)) {
    return json(200, { received: true, ignored: true });
  }

  try {
    const session = stripeEvent.data.object;

    const shippingMode = session.metadata?.score_mode || "pickup";
    const customerZip = session.metadata?.customer_provided_zip || "";
    const customerName = session.customer_details?.name || session.metadata?.customer_name || "Cliente";
    const customerEmail = session.customer_details?.email || "";
    const amount = (session.amount_total || 0) / 100;
    const currency = String(session.currency || "mxn").toUpperCase();

    console.log(`✅ ORDER PAID [${session.id}]`);
    console.log(`   Cliente: ${customerName} (${customerEmail})`);
    console.log(`   Total: $${amount} ${currency}`);
    console.log(`   Entrega: ${String(shippingMode).toUpperCase()}`);

    if (shippingMode === "mx") {
      console.log("   🚚 Nacional (CP):", customerZip);
      // TODO: comprar guía Envia.com + notificar
    } else if (shippingMode === "tj") {
      console.log("   🛵 Entrega local TJ");
    } else {
      console.log("   🏭 Pickup en fábrica");
    }

    // TODO: Persistencia (Sheets/DB) + notificación por email/WhatsApp
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    // Respondemos 200 para evitar reintentos infinitos por un bug interno
  }

  return json(200, { received: true });
};