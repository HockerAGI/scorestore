const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createEnviaLabel } = require("./_shared");

// Función simple para respuestas JSON
const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  if (!sig || !webhookSecret) {
    console.error("Webhook Error: Falta firma o secreto.");
    return json(400, { error: "Missing Signature" });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  // PROCESAR PAGO EXITOSO
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const mode = session.metadata?.score_mode; // pickup, tj, mx, us
    
    // Obtener datos del cliente (Shipping Address viene de Stripe)
    const shippingDetails = session.shipping_details;
    const customerDetails = session.customer_details; // Email suele venir aquí
    
    console.log(`💰 Pago confirmado: ${session.id} | Modo: ${mode}`);

    // Solo generamos guía si es Nacional (mx) o USA (us)
    if (mode === "mx" || mode === "us") {
      if (shippingDetails) {
        // Combinar datos para la guía
        const customerData = {
          name: shippingDetails.name,
          email: customerDetails?.email || "cliente@scorestore.com",
          phone: customerDetails?.phone || shippingDetails.phone || "0000000000",
          address: shippingDetails.address
        };

        // Generar guía (Asumimos 2 items promedio para peso si no consultamos line_items)
        const shipment = await createEnviaLabel(customerData, 2);

        if (shipment) {
          console.log(`✅ GUÍA CREADA: ${shipment.tracking} (${shipment.carrier})`);
          // Aquí podrías guardar el tracking en Supabase si quisieras:
          // await supabase.from('orders').insert({ ... })
        } else {
          console.error("⚠️ No se pudo generar la guía automática (Revisar Envia API).");
        }
      }
    } else {
      console.log("ℹ️ Pedido Local/Pickup. No requiere guía.");
    }
  }

  return json(200, { received: true });
};
