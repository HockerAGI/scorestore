const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { jsonResponse, safeJsonParse, digitsOnly } = require("./_shared");

// Conexión Servidor-Servidor
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const cartItems = body.items || [];
    
    // 1. Obtener ID de la Organización
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
    
    // 2. Obtener Productos Reales de la DB
    const { data: dbProducts } = await supabase.from('products').select('*').eq('org_id', org.id);

    // 3. Construir Line Items verificados
    const line_items = cartItems.map(item => {
      // Buscar producto en DB por ID. Nota: item.id viene del frontend.
      const product = dbProducts.find(p => p.id === item.id);
      
      if (!product) throw new Error(`Producto ID ${item.id} no encontrado o agotado.`);
      
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: product.image_url ? [product.image_url] : []
          },
          unit_amount: Math.round(product.price * 100) // Precio viene de la DB, no del cliente
        },
        quantity: item.qty
      };
    });

    // Envío (Lógica simple preservada, se puede conectar a Envia después)
    let shipping_options = [];
    if (body.mode === 'tj') {
        shipping_options.push({ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: 20000, currency: 'mxn' }, display_name: 'Local Tijuana' } });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      success_url: `${process.env.URL}/?status=success`,
      cancel_url: `${process.env.URL}/?status=cancel`,
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: err.message });
  }
};
