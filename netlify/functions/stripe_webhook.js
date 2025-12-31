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

// HELPER CRÍTICO: Netlify a veces entrega el body ya parseado o como buffer.
// Esta función asegura que tengamos el RAW body necesario para validar la firma de Stripe.
function getRawBody(event) {
  if (!event?.body) return Buffer.from("");
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");
}

exports.handler = async (event) => {
  // Solo aceptamos POST
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("❌ Faltan llaves de Stripe (Secret o Webhook) en Netlify.");
    return json(500, { ok: false });
  }

  let stripeEvent;
  try {
    // Validación criptográfica de que el evento viene realmente de Stripe
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error(`⚠️ Error de Firma Webhook: ${err.message}`);
    return json(400, { error: "Webhook signature verification failed" });
  }

  // Procesamos pagos completados (Síncronos y Asíncronos como OXXO)
  if (
    stripeEvent.type === "checkout.session.completed" ||
    stripeEvent.type === "checkout.session.async_payment_succeeded"
  ) {
    const sessionRaw = stripeEvent.data.object;

    try {
      // Expandimos para obtener dirección y detalles del cliente
      const session = await stripe.checkout.sessions.retrieve(sessionRaw.id, {
        expand: ["line_items", "customer_details", "shipping_details"],
      });

      const mode = session.metadata?.shipping_mode || "pickup";
      console.log(`💰 PAGO RECIBIDO: ${session.id} | Modo: ${mode} | Total: ${session.amount_total / 100} MXN`);

      // AUTOMATIZACIÓN ENVIA.COM
      if (mode === "mx") {
        console.log("🚚 Iniciando generación de guía con Envia...");
        const label = await createEnviaLabel(session);
        
        if (label) {
          console.log(`✅ Guía generada: ${label.tracking_number}`);
          // Opcional: Podríamos guardar el tracking en Stripe metadata
          // await stripe.checkout.sessions.update(session.id, { metadata: { tracking: label.tracking_number }});
        } else {
          console.error("⚠️ No se pudo generar la guía automática (Revisar logs de _shared).");
        }
      } else {
        console.log("ℹ️ Pedido Local/Pickup. No requiere guía.");
      }

    } catch (err) {
      console.error("❌ Error lógico procesando orden:", err);
      // Retornamos 200 intencionalmente para evitar bucles infinitos de reintentos de Stripe
      return json(200, { ok: false, error: err.message });
    }
  }

  return json(200, { received: true });
};
