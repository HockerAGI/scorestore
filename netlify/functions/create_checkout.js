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
  // 1. CORS y Método
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body, {});
    const { mode, to } = body; // mode: 'pickup' | 'tj' | 'mx'

    // 2. Cargar datos y validar
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const cartCheck = validateCartItems(body.items);
    
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 3. Construir Line Items (Productos) para Stripe
    // Usamos el precio del JSON (backend) para seguridad
    const line_items = cartCheck.items.map(item => {
      const product = map[item.id];
      if (!product) throw new Error(`Producto no encontrado: ${item.id}`);
      
      // Aseguramos URL absoluta para que la imagen aparezca en el checkout de Stripe
      const imgUrl = product.img.startsWith("http") 
        ? product.img 
        : `https://scorestore.netlify.app${product.img}`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: [imgUrl],
            metadata: { 
              id: item.id, 
              size: item.size,
              sku: product.sku || item.id 
            }
          },
          unit_amount: Math.round(product.baseMXN * 100), // Convertir a centavos
        },
        quantity: item.qty
      };
    });

    // 4. Calcular y Configurar Envío
    let shipping_options = [];
    
    if (mode === "pickup") {
      // No se cobra envío
    } else if (mode === "tj") {
      // Tarifa Fija Local
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 20000, currency: 'mxn' }, // $200.00
          display_name: 'Envío Local Express (Tijuana)',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 2 } }
        }
      });
    } else {
      // Nacional (MX)
      let cost = 250; // Fallback base
      const zip = digitsOnly(to?.postal_code);
      
      // Intentamos cotizar real (incluye regla mínima $250 desde _shared)
      if (zip.length === 5) {
        const quote = await getEnviaQuote(zip, cartCheck.items.length);
        if (quote) cost = quote.mxn;
      }
      
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: cost * 100, currency: 'mxn' }, // Centavos
          display_name: 'Envío Nacional Estándar',
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
        }
      });
    }

    // 5. Crear Sesión de Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      success_url: "https://scorestore.netlify.app/?success=true",
      cancel_url: "https://scorestore.netlify.app/?cancel=true",
      // Agregamos opciones de envío si no es Pickup
      shipping_options: shipping_options.length > 0 ? shipping_options : undefined,
      // Forzamos pedir dirección en Stripe si es envío a domicilio
      shipping_address_collection: (mode !== "pickup") ? { allowed_countries: ["MX"] } : undefined,
      metadata: { 
        shipping_mode: mode,
        customer_name: to?.name || ""
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "Error iniciando pago. Intente nuevamente." });
  }
};
