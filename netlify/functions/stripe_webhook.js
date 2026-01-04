const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Helper para respuestas consistentes
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Helper para obtener el cuerpo crudo (Crucial para validar firma en Netlify)
function getRawBody(event) {
  const headers = event.headers || {};
  const rawBody = event.body;
  
  if (event.isBase64Encoded) {
    return Buffer.from(rawBody, 'base64');
  }
  return rawBody;
}

exports.handler = async (event) => {
  // 1. Solo aceptar POST
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  // 2. Validar configuración
  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("❌ Faltan llaves de Stripe en Netlify (Environment Variables).");
    return json(500, { error: "Server Configuration Error" });
  }

  // 3. Verificar Firma de Stripe (Seguridad)
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error(`⚠️ Firma inválida: ${err.message}`);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  // 4. Filtrar eventos relevantes (Pago exitoso inmediato o diferido/OXXO)
  const validEvents = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded"
  ];

  if (!validEvents.includes(stripeEvent.type)) {
    // Respondemos 200 a eventos que no nos interesan para que Stripe no reintente
    return json(200, { received: true, ignored: true });
  }

  // 5. Procesar la Orden
  try {
    const session = stripeEvent.data.object;

    // Expandir datos si es necesario (generalmente el objeto session ya trae lo vital)
    // Nota: 'line_items' requiere una llamada extra a la API si los necesitas aquí,
    // pero para confirmar la orden básica, con metadata basta.
    
    // ALINEACIÓN DE METADATOS (CRÍTICO)
    // En create_checkout.js usamos 'score_mode', no 'shipping_mode'
    const shippingMode = session.metadata?.score_mode || "pickup"; 
    const customerZip = session.metadata?.customer_provided_zip || "";
    const customerName = session.customer_details?.name || "Cliente";
    const customerEmail = session.customer_details?.email || "";
    
    console.log(`✅ PAGO CONFIRMADO [${session.id}]`);
    console.log(`   Cliente: ${customerName} (${customerEmail})`);
    console.log(`   Total: $${session.amount_total / 100} ${session.currency.toUpperCase()}`);
    console.log(`   Modo Entrega: ${shippingMode.toUpperCase()}`);

    if (shippingMode === "mx") {
      console.log("   🚚 Generar Guía Nacional a CP:", customerZip);
      // AQUÍ: Llamar a función para comprar guía en Envia.com automáticamente
      // await comprarGuia(...);
    } else if (shippingMode === "tj") {
      console.log("   🛵 Programar Chofer Local");
    } else {
      console.log("   🏭 Apartar en Fábrica (Pickup)");
    }

    // Aquí podrías guardar en Base de Datos (Supabase, Firebase, Google Sheets)

  } catch (err) {
    console.error("❌ Error procesando orden interna:", err);
    // Respondemos 200 aunque falle nuestra lógica interna para evitar bucle de Stripe
    // (Opcional: responder 500 si quieres que Stripe reintente más tarde)
  }

  return json(200, { received: true });
};
