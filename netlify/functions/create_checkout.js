const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { cart } = JSON.parse(event.body);
        
        // Validar carrito
        if (!cart || cart.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Carrito vacío" }) };
        }

        // Crear Items para Stripe
        // NOTA: Confiamos en el precio que envía el front para simplificar, 
        // pero idealmente deberíamos recalcularlo aquí usando catalog.json para seguridad total.
        // Asumimos que cart.price ya trae el markup del 20% aplicado en main.js
        
        const line_items = cart.map(item => ({
            price_data: {
                currency: 'mxn',
                product_data: {
                    name: item.name,
                    images: item.image ? [item.image.startsWith('http') ? item.image : `${process.env.URL_SCORE}/${item.image}`] : [],
                },
                unit_amount: Math.round(item.price * 100), // Stripe usa centavos
            },
            quantity: item.qty,
        }));

        // Añadir costo de envío fijo (Ejemplo $150 MXN) - Opcional, ajustar según lógica
        // line_items.push({ ... }) 

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], // Oxxo se puede agregar aquí
            line_items,
            mode: 'payment',
            success_url: `${process.env.URL_SCORE}/?status=success`,
            cancel_url: `${process.env.URL_SCORE}/?status=cancel`,
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ url: session.url })
        };

    } catch (error) {
        console.error("Stripe Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
