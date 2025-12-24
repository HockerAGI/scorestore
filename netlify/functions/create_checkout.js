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
        const body = JSON.parse(event.body);
        const cart = body.cart;

        // Validar carrito
        if (!cart || cart.length === 0) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Carrito vacío" }) };
        }

        // Crear Items para Stripe
        const line_items = cart.map(item => {
            // Construir URL absoluta de la imagen para que aparezca en Stripe
            // Si la imagen ya es http (ej. externa) la deja, si no, le pega tu dominio.
            let imageUrl = '';
            if (item.image) {
                imageUrl = item.image.startsWith('http') 
                    ? item.image 
                    : `${process.env.URL_SCORE}/${item.image.replace(/^\//, '')}`; // Quita slash inicial si existe para evitar dobles
            }

            // Crear descripción con Talla (Vital para logística)
            // Asumimos que item.name ya trae el nombre, y si hay talla en el objeto, la agregamos.
            let description = item.name;
            if (item.size) {
                description += ` (Talla: ${item.size})`;
            }

            return {
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: description, // Ponemos el nombre con talla aquí para que se vea claro
                        images: imageUrl ? [imageUrl] : [],
                        metadata: {
                            id: item.id,
                            size: item.size || "Única"
                        }
                    },
                    unit_amount: Math.round(item.price * 100), // Stripe usa centavos
                },
                quantity: item.qty,
            };
        });

        // Crear Sesión de Checkout con DATOS DE ENVÍO REQUERIDOS
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], 
            line_items,
            mode: 'payment',
            
            // 🚨 VITAL: Pedir teléfono para WhatsApp y Envia.com
            phone_number_collection: {
                enabled: true,
            },

            // 🚨 VITAL: Pedir dirección de envío (Limitado a MX y US por ejemplo)
            shipping_address_collection: {
                allowed_countries: ['MX', 'US'], 
            },

            // Opciones de envío (opcional, si quieres cobrar envío fijo en Stripe)
            // shipping_options: [
            //   { shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: 15000, currency: 'mxn' }, display_name: 'Envío Estándar' } }
            // ],

            success_url: `${process.env.URL_SCORE}/?status=success`,
            cancel_url: `${process.env.URL_SCORE}/?status=cancel`,
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ url: session.url })
        };

    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};