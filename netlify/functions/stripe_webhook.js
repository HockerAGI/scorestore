const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const { supabaseAdmin, createEnviaLabel, jsonResponse } = require('./_shared');

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' });

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    return jsonResponse(400, { error: `Webhook Error: ${err.message}` });
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const meta = session.metadata || {};
    
    const customerName = session.customer_details?.name || 'Cliente';
    const customerEmail = session.customer_details?.email || '';
    const shippingMode = meta.shipping_mode || 'pickup';
    
    let trackingInfo = null;
    let shippingLabel = null;

    if (shippingMode !== 'pickup' && session.shipping_details) {
        const enviaResult = await createEnviaLabel({
            name: customerName,
            email: customerEmail,
            address: session.shipping_details.address,
            phone: session.customer_details.phone
        }, 1);

        if (enviaResult) {
            trackingInfo = enviaResult.tracking;
            shippingLabel = enviaResult.labelUrl;
        }
    }

    const orderData = {
        stripe_session_id: session.id,
        created_at: new Date().toISOString(),
        customer_email: customerEmail,
        customer_name: customerName,
        amount_total: session.amount_total / 100,
        currency: session.currency,
        status: 'paid',
        shipping_mode: shippingMode,
        shipping_address: session.shipping_details,
        tracking_number: trackingInfo,
        label_url: shippingLabel
    };

    if (supabaseAdmin) {
        await supabaseAdmin.from('orders').insert([orderData]);
    }

    if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
        let msg = `🏁 *NUEVA ORDEN SCORE* 🏁\n\n`;
        msg += `👤 *Cliente:* ${customerName}\n`;
        msg += `💰 *Total:* $${orderData.amount_total} ${orderData.currency.toUpperCase()}\n`;
        msg += `🚚 *Modo:* ${shippingMode.toUpperCase()}\n`;
        
        if (trackingInfo) {
            msg += `📦 *Tracking:* \`${trackingInfo}\`\n`;
            msg += `📄 *Etiqueta:* [Ver PDF](${shippingLabel})\n`;
        }
        
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: msg,
                parse_mode: 'Markdown'
            });
        } catch (e) {
            console.error('Telegram Error:', e.message);
        }
    }
  }

  return jsonResponse(200, { received: true });
};