const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fetch = require('node-fetch');

exports.handler = async (event) => {
    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            event.body, 
            sig, 
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error(`Webhook Signature Error: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    if (stripeEvent.type === 'checkout.session.completed') {
        const session = stripeEvent.data.object;
        
        // Preparar mensaje para WhatsApp/Telegram
        const customerName = session.customer_details.name || "Cliente";
        const amount = session.amount_total / 100;
        
        const payload = {
            orderId: session.id,
            customer: customerName,
            total: amount,
            email: session.customer_details.email
        };

        // LLAMADA INTERNA AL WEBHOOK DE ENVIO (Corregido)
        // Usamos process.env.URL que provee Netlify automáticamente
        const siteUrl = process.env.URL || 'http://localhost:8888';
        
        try {
            await fetch(`${siteUrl}/.netlify/functions/envia_webhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("Notificación enviada internamente.");
        } catch (e) {
            console.error("Error llamando a envia_webhook:", e);
        }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
