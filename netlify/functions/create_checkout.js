const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const promos = require("../../data/promos.json"); // Archivo unificado
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
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    
    // 1. Validar Items
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 2. Construir Line Items (Productos)
    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      // Nota: Asegúrate de que tu data/catalog.json tenga las rutas de img completas o relativas
      const imgUrl = p.img.startsWith("http") ? p.img : `https://scorestore.netlify.app${p.img}`;
      
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${i.size}`,
            images: [imgUrl]
          },
          unit_amount: p.baseMXN * 100 // a centavos
        },
        quantity: i.qty
      };
    });

    // 3. Configurar Envío (Shipping Options)
    let shipping_options = [];
    const mode = body.mode || "pickup";
    const zip = digitsOnly(body.customer?.postal_code);

    if (mode === "pickup") {
      // Opción de costo 0 pero explícita
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'mxn' },
          display_name: 'Recoger en Fábrica (Tijuana)'
        }
      });
    } else if (mode === "tj") {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 20000, currency: 'mxn' }, // $200.00
          display_name: 'Entrega Local Express',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      });
    } else if (mode === "mx") {
      // Cotizar en tiempo real para asegurar el precio final en Stripe
      const totalQty = cartCheck.items.reduce((s, i) => s + i.qty, 0);
      const quote = await getEnviaQuote(zip, totalQty);
      const cost = quote ? quote.mxn : 250; // Fallback
      
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: cost * 100, currency: 'mxn' },
          display_name: 'Envío Nacional Estándar',
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
        }
      });
    }

    // 4. Pre-llenado de Cliente (Customer Details)
    // Usamos los datos que el usuario llenó en TU carrito
    const customer_details = {};
    if (body.customer?.name) customer_details.name = body.customer.name;
    // La dirección se pasa en metadata o intentamos pre-llenar si Stripe lo permite en esa sesión
    // Stripe Checkout prefiere recolectar la dirección billing ellos mismos para validar fraude.
    // Pasaremos el ZIP como pre-llenado si es posible o en metadata.

    // 5. Crear Sesión
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      shipping_options,
      
      // Forzamos colección de dirección en Stripe para que la etiqueta de envío sea válida
      // pero podemos intentar pasar el email si lo tuviéramos.
      shipping_address_collection: { allowed_countries: ["MX"] },
      
      success_url: "https://scorestore.netlify.app/?status=success",
      cancel_url: "https://scorestore.netlify.app/?status=cancel",
      
      metadata: {
        score_mode: mode,
        customer_provided_zip: zip,
        customer_provided_addr: body.customer?.address // Guardar para referencia interna
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: err.message });
  }
};
