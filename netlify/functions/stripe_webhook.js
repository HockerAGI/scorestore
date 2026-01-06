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

// Crucial: Stripe firma el cuerpo crudo
function getRawBody(event) {
  const rawBody = event.body || "";
  if (event.isBase64Encoded) return Buffer.from(rawBody, "base64");
  return rawBody;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("❌ Faltan llaves Stripe: STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET");
    return json(500, { error: "Server Configuration Error" });
  }

  const sig = getHeader(event.headers, "stripe-signature");
  if (!sig) {
    console.error("⚠️ Falta header stripe-signature");
    return json(400, { error: "Missing Stripe-Signature header" });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️ Firma inválida: ${err.message}`);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  const validEvents = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ];

  if (!validEvents.includes(stripeEvent.type)) {
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

    console.log(`✅ PAGO CONFIRMADO [${session.id}]`);
    console.log(`   Cliente: ${customerName} (${customerEmail})`);
    console.log(`   Total: $${amount} ${currency}`);
    console.log(`   Modo Entrega: ${String(shippingMode).toUpperCase()}`);

    if (shippingMode === "mx") {
      console.log("   🚚 Generar Guía Nacional a CP:", customerZip);
      // TODO: comprar guía Envia.com y notificar
    } else if (shippingMode === "tj") {
      console.log("   🛵 Programar entrega local TJ");
    } else {
      console.log("   🏭 Pickup en fábrica");
    }

    // TODO: Persistencia (Sheets / DB) + notificación
  } catch (err) {
    console.error("❌ Error interno procesando orden:", err);
    // Respondemos 200 para evitar reintentos infinitos
  }

  return json(200, { received: true });
};