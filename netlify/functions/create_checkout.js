const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { 
  jsonResponse, safeJsonParse, loadCatalog, productMapFromCatalog, validateCartItems, getEnviaQuote, digitsOnly 
} = require("./_shared");

exports.handler = async (event) => {
  // CORS Preflight
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Método no permitido" });

  try {
    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    
    // URL base dinámica para las imágenes
    const SITE_URL = process.env.URL || "http://localhost:8888";

    // 1. Validar Carrito
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 2. Construir Items para Stripe
    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto ID inválido: ${i.id}`);
      
      // Asegurar URL absoluta para la imagen
      let imgUrl = p.img;
      if (imgUrl && !imgUrl.startsWith("http")) {
        imgUrl = `${SITE_URL}${imgUrl.startsWith('/') ? '' : '/'}${imgUrl}`;
      }

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${i.size}`,
            images: [imgUrl]
          },
          unit_amount: Math.round(p.baseMXN * 100)
        },
        quantity: i.qty
      };
    });

    // 3. Configurar Envío
    const mode = body.mode || "pickup";
    const zip = digitsOnly(body.customer?.postal_code);
    let shipping_options = [];
    let shipping_address_collection = undefined;

    if (mode === "pickup") {
      // Pickup: No pedimos dirección, costo 0
      shipping_options = [];
      shipping_address_collection = undefined; 
    } else {
      // Envíos: Pedimos dirección MX
      shipping_address_collection = { allowed_countries: ["MX"] };
      
      if (mode === "tj") {
        shipping_options.push({
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 20000, currency: 'mxn' },
            display_name: 'Entrega Local Express (Tijuana)',
            delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
          }
        });
      } else if (mode === "mx") {
        // Cotización dinámica o Fallback
        const totalQty = cartCheck.items.reduce((s, i) => s + i.qty, 0);
        const quote = await getEnviaQuote(zip, totalQty);
        
        const cost = quote ? quote.mxn : 250;
        const label = quote ? `Envío Nacional (${quote.carrier})` : 'Envío Nacional Estándar';

        shipping_options.push({
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: cost * 100, currency: 'mxn' },
            display_name: label,
            delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
          }
        });
      }
    }

    // 4. Crear Sesión Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection,
      success_url: `${SITE_URL}/?status=success`,
      cancel_url: `${SITE_URL}/?status=cancel`,
      metadata: {
        score_mode: mode,
        customer_provided_zip: zip
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: "Error al procesar el pago. Intenta de nuevo." });
  }
};
