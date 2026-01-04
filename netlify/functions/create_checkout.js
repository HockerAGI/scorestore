const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const promos = require("../../data/promos.json"); // Usa .json, borra el .js
const {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly
} = require("./_shared");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Método no permitido" });

    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    
    // 1. Validar Productos
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 2. Construir Line Items
    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto no encontrado: ${i.id}`);
      
      // Url absoluta para que Stripe muestre la foto
      const imgUrl = p.img.startsWith("http") ? p.img : `https://scorestore.netlify.app${p.img}`;
      
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${i.size}`,
            images: [imgUrl]
          },
          unit_amount: p.baseMXN * 100
        },
        quantity: i.qty
      };
    });

    // 3. Configurar Envío (Shipping Options)
    let shipping_options = [];
    const mode = body.mode || "pickup";
    const zip = digitsOnly(body.customer?.postal_code);

    if (mode === "pickup") {
      // Opción de costo 0 para Recoger en Tienda
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'mxn' },
          display_name: 'Recoger en Fábrica (Tijuana)'
        }
      });
    } else if (mode === "tj") {
      // Costo fijo local
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 20000, currency: 'mxn' }, // $200.00
          display_name: 'Entrega Local Express',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      });
    } else if (mode === "mx") {
      // Cotización dinámica Envia.com
      const totalQty = cartCheck.items.reduce((s, i) => s + i.qty, 0);
      const quote = await getEnviaQuote(zip, totalQty); // Usa la función de _shared.js
      const cost = quote ? quote.mxn : 250; // Fallback seguro
      
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: cost * 100, currency: 'mxn' },
          display_name: quote ? `Envío Nacional (${quote.carrier})` : 'Envío Nacional Estándar',
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
        }
      });
    }

    // 4. Crear Sesión Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      shipping_options,
      
      // Permitimos que el usuario edite la dirección en Stripe si es necesario, 
      // pero restringimos a México.
      shipping_address_collection: { allowed_countries: ["MX"] },
      
      success_url: "https://scorestore.netlify.app/?status=success",
      cancel_url: "https://scorestore.netlify.app/?status=cancel",
      
      metadata: {
        score_mode: mode,
        customer_provided_zip: zip,
        customer_name: body.customer?.name
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: err.message });
  }
};
