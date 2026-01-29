/* =========================================================
   SCORE STORE — STRIPE WEBHOOK (MASTER)
   - Valida firma
   - Genera Guía (Envia.com)
   - Guarda en Supabase
   - Notifica Telegram
   ========================================================= */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const { 
  jsonResponse, 
  supabaseAdmin, 
  createEnviaLabel, 
  normalizeQty 
} = require("./_shared");

// Helper Telegram
async function notifyTelegram(htmlMsg) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: htmlMsg,
      parse_mode: "HTML"
    });
  } catch (e) { console.error("Telegram Error:", e.message); }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, "Method Not Allowed");

  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook Sig Error", err.message);
    return jsonResponse(400, `Webhook Error: ${err.message}`);
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    
    // 1. Extraer Datos
    const shipping = session.shipping_details;
    const meta = session.metadata || {};
    const mode = meta.shipping_mode || "pickup";
    const total = session.amount_total / 100;
    
    // Calcular cantidad total de items
    // (Stripe a veces requiere llamar a listLineItems, aquí simplificamos si pasamos items_qty en meta)
    const itemsQty = normalizeQty(meta.items_qty || 1); 

    let trackingInfo = null;
    let labelUrl = null;
    let carrierName = null;

    // 2. Generar Guía Automática (Si es envío)
    if (mode !== "pickup" && shipping?.address) {
      const customerData = {
        name: shipping.name,
        email: session.customer_details?.email,
        phone: session.customer_details?.phone,
        address: shipping.address
      };
      
      console.log("Generando guía para:", customerData.name);
      const label = await createEnviaLabel(customerData, itemsQty);
      
      if (label.ok) {
        trackingInfo = label.tracking;
        labelUrl = label.labelUrl;
        carrierName = label.carrier;
      }
    }

    // 3. Guardar en Supabase (Historial)
    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert([{
        stripe_id: session.id,
        amount: total,
        currency: session.currency,
        customer_email: session.customer_details?.email,
        customer_name: shipping?.name || session.customer_details?.name,
        shipping_mode: mode,
        tracking_number: trackingInfo,
        label_url: labelUrl,
        status: "paid",
        items_summary: meta.items_summary || "Varios"
      }]);
    }

    // 4. Notificar Telegram
    const icon = mode === 'pickup' ? '🏪' : '🚚';
    const trackingHtml = trackingInfo 
      ? `\n📦 <b>Guía:</b> <code>${trackingInfo}</code>\n📄 <a href="${labelUrl}">Ver Etiqueta</a>` 
      : (mode !== 'pickup' ? '\n⚠️ <b>Error Guía:</b> Generar manual' : '');

    const msg = `
<b>${icon} NUEVA VENTA DETECTADA</b>
➖➖➖➖➖➖➖➖➖➖
👤 <b>${shipping?.name || 'Cliente'}</b>
💰 <b>$${total} ${session.currency.toUpperCase()}</b>
📍 ${mode.toUpperCase()}
🛒 Items: ${itemsQty}
${trackingHtml}
➖➖➖➖➖➖➖➖➖➖
📧 ${session.customer_details?.email}
    `;

    await notifyTelegram(msg);
  }

  return jsonResponse(200, { received: true });
};