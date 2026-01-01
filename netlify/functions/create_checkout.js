const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { 
  jsonResponse, safeJsonParse, loadCatalog, productMapFromCatalog, 
  validateCartItems, getEnviaQuote, digitsOnly 
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body, {});
    const { mode, to } = body; // 'pickup' | 'tj' | 'mx'

    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const cartCheck = validateCartItems(body.items);
    
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // Construir Items
    const line_items = cartCheck.items.map(item => {
      const product = map[item.id];
      if (!product) throw new Error(`Producto ${item.id} no encontrado`);
      
      // Asegurar URL absoluta para imagen en Stripe
      const imgUrl = product.img.startsWith("http") ? product.img : `https://scorestore.netlify.app${product.img}`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: [imgUrl],
            metadata: { id: item.id, size: item.size }
          },
          unit_amount: Math.round(product.baseMXN * 100),
        },
        quantity: item.qty
      };
    });

    // Calcular Envío
    let shipping_options = [];
    
    if (mode === "tj") {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 20000, currency: 'mxn' }, // $200.00
          display_name: 'Envío Local Express (TJ)',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      });
    } else if (mode === "mx") {
      let cost = 250; // Fallback
      const zip = digitsOnly(to?.postal_code);
      if (zip.length === 5) {
        const quote = await getEnviaQuote(zip, cartCheck.items.length);
        if (quote) cost = quote.mxn;
      }
      
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: cost * 100, currency: 'mxn' },
          display_name: 'Envío Nacional Estándar',
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      success_url: "https://scorestore.netlify.app/?success=true",
      cancel_url: "https://scorestore.netlify.app/?cancel=true",
      shipping_options: shipping_options.length > 0 ? shipping_options : undefined,
      shipping_address_collection: (mode !== "pickup") ? { allowed_countries: ["MX"] } : undefined,
      metadata: { shipping_mode: mode }
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: e.message });
  }
};
