const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const { supabase, jsonResponse } = require("./_shared");

// Función Helper para notificar a Telegram
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID;
    if(!token || !chat) return;
    try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chat, text, parse_mode: "HTML"
        });
    } catch(e) { console.error("Telegram Error", e.message); }
}

exports.handler = async (event) => {
    const sig = event.headers["stripe-signature"];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return jsonResponse(400, { error: `Webhook Error: ${err.message}` });
    }

    if (stripeEvent.type === "checkout.session.completed") {
        const session = stripeEvent.data.object;
        const meta = session.metadata || {};
        const customer = session.customer_details;
        const total = session.amount_total / 100; // Stripe viene en centavos

        // 1. Guardar en Supabase (Base de datos)
        if (supabase) {
            await supabase.from("orders").insert([{
                stripe_id: session.id,
                customer_name: customer.name,
                email: customer.email,
                phone: customer.phone,
                total: total,
                currency: "mxn",
                status: "paid",
                shipping_mode: meta.shipping_mode,
                items_summary: JSON.stringify(meta) // Guardamos metadata técnica
            }]);
        }

        // 2. Mensaje a Telegram (Único Uniformes)
        const emojiEnvio = meta.shipping_mode === 'pickup' ? '🏪' : '🚛';
        const msg = `
<b>🏆 NUEVA VENTA SCORE STORE</b>
➖➖➖➖➖➖➖➖➖➖➖
👤 <b>Cliente:</b> ${customer.name}
💰 <b>Total:</b> $${total} MXN
${emojiEnvio} <b>Entrega:</b> ${meta.shipping_mode.toUpperCase()}
📧 <b>Email:</b> ${customer.email}
📱 <b>Tel:</b> ${customer.phone || 'N/A'}
➖➖➖➖➖➖➖➖➖➖➖
<i>Verifica panel de Stripe para dirección completa.</i>
`;
        await sendTelegram(msg);
    }

    return jsonResponse(200, { received: true });
};