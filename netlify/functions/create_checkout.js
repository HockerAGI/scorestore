const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse, safeJsonParse, loadCatalog, productMapFromCatalog, validateCartItems, digitsOnly, getEnviaQuote
} = require("./_shared");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Método no permitido" });
    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    
    // URL DINÁMICA: Netlify inyecta process.env.URL automáticamente
    const SITE_URL = process.env.URL || "http://localhost:8888";

    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto no encontrado: ${i.id}`);
      
      // Aseguramos URL absoluta para imágenes en Stripe
      const imgUrl = p.img.startsWith("http") ? p.img : `${SITE_URL}${p.img}`;
      
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

    let shipping_options = [];
    const mode = body.mode || "pickup";
    const zip = digitsOnly(body.customer?.postal_code);

    if (mode === "pickup") {
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
          fixed_amount: { amount: 20000, currency: 'mxn' },
          display_name: 'Entrega Local Express',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      });
    } else if (mode === "mx") {
      const totalQty = cartCheck.items.reduce((s, i) => s + i.qty, 0);
      const quote = await getEnviaQuote(zip, totalQty);
      const cost = quote ? quote.mxn : 250;
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: cost * 100, currency: 'mxn' },
          display_name: quote ? `Envío Nacional (${quote.carrier})` : 'Envío Nacional Estándar',
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      shipping_options,
      shipping_address_collection: { allowed_countries: ["MX"] },
      success_url: `${SITE_URL}/?status=success`,
      cancel_url: `${SITE_URL}/?status=cancel`,
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