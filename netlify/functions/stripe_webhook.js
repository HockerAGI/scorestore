const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createEnviaLabel } = require("./_shared");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  if (!sig || !webhookSecret) {
    console.error("Webhook Error: Missing signature or STRIPE_WEBHOOK_SECRET");
    return json(400, { error: "Missing Signature" });
  }

  // 🔥 CRÍTICO EN NETLIFY: Stripe necesita el RAW body (Buffer) si viene base64
  const payload = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  try {
    // ✅ Pago exitoso
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      const mode = (session.metadata?.score_mode || "").toLowerCase(); // pickup | tj | mx | us
      console.log(`💰 Pago confirmado: ${session.id} | mode=${mode}`);

      // Solo generamos guía si es mx o us
      if (mode === "mx" || mode === "us") {
        // 1) Obtener line items reales y sumar qty
        let itemsQty = 1;
        try {
          const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
          itemsQty = (li.data || []).reduce((acc, x) => acc + Number(x.quantity || 0), 0);
          itemsQty = Math.max(1, itemsQty);
        } catch (e) {
          console.warn("⚠️ No se pudo leer line_items, usando qty=1 fallback:", e.message);
          itemsQty = 1;
        }

        // 2) Datos del cliente (shipping_details es el bueno cuando hay envío)
        const shipping = session.shipping_details || null;
        const customer = session.customer_details || null;

        const name = shipping?.name || customer?.name || "Cliente";
        const email = customer?.email || "cliente@scorestore.com";
        const phone =
          customer?.phone ||
          shipping?.phone ||
          "0000000000";

        const address = shipping?.address || customer?.address || null;

        if (!address || !address.postal_code) {
          console.error("⚠️ Sin address/postal_code. No se puede generar guía.");
          return json(200, { received: true });
        }

        // 3) Crear guía Envia
        const shipment = await createEnviaLabel(
          {
            name,
            email,
            phone,
            address, // { line1,line2,city,state,country,postal_code }
          },
          itemsQty
        );

        if (shipment) {
          console.log(`✅ GUÍA CREADA: ${shipment.tracking} (${shipment.carrier})`);
          // Si luego quieres guardar en orders, lo conectamos aquí con supabase.
        } else {
          console.error("⚠️ No se pudo generar la guía automática (Envia API / datos incompletos).");
        }
      } else {
        console.log("ℹ️ Pedido pickup/tj: no requiere guía.");
      }
    }

    return json(200, { received: true });
  } catch (err) {
    console.error("Webhook Handler Error:", err);
    // Importante: Stripe reintenta si no devuelves 2xx, pero aquí preferimos 200 para evitar loops por fallos de Envia
    return json(200, { received: true, warning: "handled_with_error" });
  }
};