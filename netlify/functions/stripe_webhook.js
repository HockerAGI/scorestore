// netlify/functions/stripe_webhook.js
// AUTOMATIZACIÓN POST-VENTA
// 1. Verifica pago
// 2. Crea guía FedEx (Envia.com)
// 3. Guarda en DB
// 4. Notifica a Telegram

import Stripe from "stripe";
import { 
  env, 
  corsHeaders, 
  getSupabaseService, 
  createEnviaLabel 
} from "./_shared.js";

const stripe = new Stripe(env("STRIPE_SECRET_KEY"));

export async function handler(event) {
  // Webhooks siempre son POST
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const sig = event.headers["stripe-signature"];
  const endpointSecret = env("STRIPE_WEBHOOK_SECRET"); // ¡NUEVA VARIABLE REQUERIDA!

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook Signature Error: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Solo nos interesa si el pago fue exitoso
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    
    console.log(`💰 Pago confirmado: ${session.id}`);

    // Datos del cliente y envío
    const shippingDetails = session.shipping_details;
    const customerDetails = session.customer_details;
    const metadata = session.metadata || {};
    const shippingMode = metadata.shipping_mode || "pickup";
    
    let trackingInfo = "N/A - Recoger en Tienda";
    let labelUrl = "";
    let carrierName = "Pickup";

    // 1. GENERAR GUÍA AUTOMÁTICA (Si no es pickup)
    if (shippingMode !== "pickup" && shippingDetails) {
      console.log("🚚 Generando guía automática...");
      
      // Calculamos items totales aproximados basado en el monto o metadata
      // (Stripe sessions no siempre traen line_items expandidos aqui sin otra llamada, 
      //  asumimos 1-2 items por el peso promedio o usamos un default)
      const labelData = await createEnviaLabel({
        name: shippingDetails.name,
        email: customerDetails.email,
        phone: customerDetails.phone || "0000000000",
        address: shippingDetails.address
      }, 2); // Default 2 items para peso seguro

      if (labelData) {
        trackingInfo = labelData.tracking;
        labelUrl = labelData.labelUrl;
        carrierName = labelData.carrier;
        console.log(`✅ GUÍA CREADA: ${trackingInfo}`);
      } else {
        console.error("❌ Falló la creación de guía automática");
        trackingInfo = "PENDIENTE - Error API";
      }
    }

    // 2. GUARDAR EN SUPABASE (Historial de órdenes)
    const supabase = getSupabaseService();
    if (supabase) {
      const { error } = await supabase.from('orders').insert([{
        stripe_session_id: session.id,
        amount_total: session.amount_total / 100,
        currency: session.currency,
        status: 'paid',
        customer_email: customerDetails.email,
        shipping_mode: shippingMode,
        tracking_number: trackingInfo,
        label_url: labelUrl
      }]);
      
      if(error) console.error("Error Supabase:", error);
    }

    // 3. NOTIFICAR A TELEGRAM (Feature recuperada)
    const telegramToken = "7893882322:AAFFjrL0cfLl0AOAHMiNwbwrjX4E-1c58Bk"; // Tu token
    const chatId = "8554886422"; // Tu ID

    if (telegramToken && chatId) {
      const amount = (session.amount_total / 100).toFixed(2);
      const currency = session.currency.toUpperCase();
      const customerName = customerDetails?.name || "Cliente";
      
      let msg = `🏁 *NUEVA VENTA - SCORE STORE* 🏁\n\n`;
      msg += `👤 *Cliente:* ${customerName}\n`;
      msg += `💰 *Monto:* $${amount} ${currency}\n`;
      msg += `🚚 *Modo:* ${shippingMode.toUpperCase()}\n`;
      
      if (shippingMode !== "pickup") {
        msg += `📦 *Guía:* \`${trackingInfo}\`\n`;
        if(labelUrl) msg += `📄 [Ver Etiqueta](${labelUrl})\n`;
      }

      try {
        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: msg,
            parse_mode: "Markdown"
          })
        });
      } catch (e) {
        console.error("Error Telegram:", e);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}