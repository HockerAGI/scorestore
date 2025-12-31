// netlify/functions/stripe_webhook.js
// FUENTE ÚNICA DE VERDAD: Webhook de Stripe -> Automatización de Envíos

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createEnviaLabel } = require("./_shared");

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
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("Faltan llaves de Stripe en Netlify.");
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
    console.error(`Webhook Signature Error: ${err.message}`);
    return json(400, { error: "Webhook signature verification failed" });
  }

  // Procesamos solo pagos completados
  if (
    stripeEvent.type === "checkout.session.completed" ||
    stripeEvent.type === "checkout.session.async_payment_succeeded"
  ) {
    const sessionRaw = stripeEvent.data.object;

    try {
      // Traemos datos completos para envío
      const session = await stripe.checkout.sessions.retrieve(sessionRaw.id, {
        expand: ["line_items", "customer_details", "shipping_details"],
      });

      const mode = session.metadata?.shipping_mode || "pickup";
      console.log(`💰 PAGO RECIBIDO: ${session.id} | Modo: ${mode}`);

      // AUTOMATIZACIÓN ENVIA.COM
      // Solo generamos guía si el modo es envío nacional ("mx")
      if (mode === "mx") {
        console.log("🚚 Iniciando generación de guía en Envia...");
        const label = await createEnviaLabel(session);
        
        if (label) {
          // Opcional: Aquí podrías guardar el tracking en Stripe metadata si quisieras
          // await stripe.checkout.sessions.update(session.id, { metadata: { tracking: label.tracking_number }});
          console.log("✨ Automatización completada.");
        } else {
          console.error("⚠️ No se pudo generar la guía automática.");
        }
      }

    } catch (err) {
      console.error("Error procesando orden:", err);
      // Retornamos 200 para no bloquear a Stripe, pero logueamos el error
      return json(200, { ok: false, error: err.message });
    }
  }

  return json(200, { received: true });
};