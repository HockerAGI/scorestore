const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios"); // Necesario para Telegram
const { createEnviaLabel, supabaseAdmin } = require("./_shared");

// Configuración Telegram desde Variables de Entorno
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const mode = session.metadata?.score_mode; // pickup, tj, mx, us
    const shippingDetails = session.shipping_details;
    const customerDetails = session.customer_details;
    
    console.log(`💰 Pago confirmado: ${session.id}`);

    // 1. Generar Guía (Solo si es envío)
    let trackingInfo = "N/A - Recoger en Tienda";
    let carrierName = "Local";
    
    if (mode === "mx" || mode === "us") {
      if (shippingDetails) {
        const customerData = {
          name: shippingDetails.name,
          email: customerDetails?.email || "cliente@scorestore.com",
          phone: customerDetails?.phone || shippingDetails.phone || "0000000000",
          address: shippingDetails.address
        };

        const shipment = await createEnviaLabel(customerData, 2); // 2 items promedio
        if (shipment) {
          trackingInfo = shipment.tracking;
          carrierName = shipment.carrier;
          console.log(`✅ GUÍA CREADA: ${trackingInfo}`);
        }
      }
    }

    // 2. Guardar en Supabase (Opcional, pero recomendado)
    if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from('orders').insert([{
            stripe_id: session.id,
            total: session.amount_total / 100,
            status: 'paid',
            tracking: trackingInfo,
            shipping_mode: mode
        }]);
        if(error) console.error("Error guardando en Supabase:", error);
    }

    // 3. Notificar a Telegram
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
        const amount = (session.amount_total / 100).toFixed(2);
        const currency = session.currency.toUpperCase();
        const customerName = customerDetails?.name || "Cliente";
        
        let msg = `🏁 *NUEVA VENTA - SCORE STORE* 🏁\n\n`;
        msg += `👤 *Cliente:* ${customerName}\n`;
        msg += `💰 *Monto:* $${amount} ${currency}\n`;
        msg += `🚚 *Envío:* ${mode.toUpperCase()} (${carrierName})\n`;
        
        if (trackingInfo !== "N/A - Recoger en Tienda") {
            msg += `📦 *Guía:* \`${trackingInfo}\`\n`;
        }

        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: msg,
                parse_mode: "Markdown"
            });
        } catch (e) {
            console.error("Telegram Error:", e.message);
        }
    }
  }

  return json(200, { received: true });
};