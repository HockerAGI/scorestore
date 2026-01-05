const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    
    // URL Base dinámica (fallback a localhost para pruebas)
    const SITE_URL = process.env.URL || "http://localhost:8888";

    // 1. Validar Carrito
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 2. Construir Line Items para Stripe
    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto ID inválido: ${i.id}`);
      
      // Construir URL absoluta para la imagen
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
          unit_amount: Math.round(p.baseMXN * 100) // Centavos
        },
        quantity: i.qty
      };
    });

    // 3. Configurar Envío
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
          fixed_amount: { amount: 20000, currency: 'mxn' }, // $200.00
          display_name: 'Entrega Local Express',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      });
    } else if (mode === "mx") {
      // Calcular envío real
      const totalQty = cartCheck.items.reduce((acc, item) => acc + item.qty, 0);
      const quote = await getEnviaQuote(zip, totalQty);
      
      const finalCost = quote ? quote.mxn : 250;
      const label = quote ? `Envío Nacional (${quote.carrier})` : 'Envío Nacional Estándar';
      
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: finalCost * 100, currency: 'mxn' },
          display_name: label,
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
        }
      });
    }

    // 4. Crear Sesión
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
        customer_name: body.customer?.name || ""
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: "Error interno al procesar pago." });
  }
};