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
    console.error("❌ Faltan llaves de Stripe (Secret o Webhook) en Netlify.");
    return json(500, { ok: false });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, webhookSecret);
  } catch (err) {
    console.error(`⚠️ Error de Firma Webhook: ${err.message}`);
    return json(400, { error: "Webhook signature verification failed" });
  }

  if (
    stripeEvent.type === "checkout.session.completed" ||
    stripeEvent.type === "checkout.session.async_payment_succeeded"
  ) {
    const sessionRaw = stripeEvent.data.object;

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionRaw.id, {
        expand: ["line_items", "customer_details", "shipping_details"],
      });

      const mode = session.metadata?.shipping_mode || "pickup";
      const promo = session.metadata?.promo_code || "";
      console.log(
        `💰 PAGO RECIBIDO: ${session.id} | Modo: ${mode} | Total: ${session.amount_total / 100} MXN | Promo: ${promo}`
      );

      if (mode === "mx") {
        console.log("🚚 Iniciando generación de guía con Envia...");
        const label = await createEnviaLabel(session);

        if (label) {
          console.log(`✅ Guía generada: ${label.tracking_number}`);
        } else {
          console.error("⚠️ No se pudo generar la guía automática (Revisar logs de _shared).");
        }
      } else {
        console.log("ℹ️ Pedido Local/Pickup. No requiere guía.");
      }
    } catch (err) {
      console.error("❌ Error lógico procesando orden:", err);
      return json(200, { ok: false, error: err.message });
    }
  }

  return json(200, { received: true });
};