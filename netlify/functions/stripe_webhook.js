// netlify/functions/stripe_webhook.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createEnviaLabel } = require("./_shared");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("❌ Faltan llaves de Stripe (Secret o Webhook) en Netlify.");
    return json(500, { ok: false });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8"),
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error(`⚠️ Webhook Signature Error: ${err.message}`);
    return json(400, { error: "Webhook signature verification failed" });
  }

  // Procesamos pagos completados
  if (
    stripeEvent.type === "checkout.session.completed" ||
    stripeEvent.type === "checkout.session.async_payment_succeeded"
  ) {
    const sessionRaw = stripeEvent.data.object;

    try {
      // Recuperar sesión completa con detalles de envío
      const session = await stripe.checkout.sessions.retrieve(sessionRaw.id, {
        expand: ["line_items", "customer_details", "shipping_details"],
      });

      const mode = session.metadata?.shipping_mode || "pickup";
      console.log(`💰 PAGO RECIBIDO: ${session.id} | Modo: ${mode} | Total: ${session.amount_total/100} MXN`);

      // AUTOMATIZACIÓN ENVIA.COM
      if (mode === "mx") {
        const label = await createEnviaLabel(session);
        if (label) {
            console.log(`✨ TRACKING: ${label.tracking_number}`);
            // Aquí podrías guardar el tracking en una DB o enviar email extra
        }
      } else {
        console.log("ℹ️ No requiere envío nacional (Pickup/Local).");
      }

    } catch (err) {
      console.error("❌ Error procesando orden en Webhook:", err);
      // Retornar 200 es importante para que Stripe no reintente infinitamente si es un error lógico nuestro
      return json(200, { ok: false, error: err.message });
    }
  }

  return json(200, { received: true });
};