const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Configura estas variables en Netlify para máxima seguridad
// Si no sabes cómo, usa los valores 'fallback' (pero no es ideal para producción)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const supabase = createClient(supabaseUrl, supabaseKey);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  try {
    const body = JSON.parse(event.body);
    const cartItems = body.items || [];
    
    // 1. Obtener ID de la Organización
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
    if (!org) throw new Error("Tienda no configurada en Único OS");
    
    // 2. Obtener Productos Reales
    const { data: dbProducts } = await supabase.from('products').select('*').eq('org_id', org.id);

    // 3. Validar Precios
    const line_items = cartItems.map(item => {
      const product = dbProducts.find(p => p.id === item.id);
      if (!product) throw new Error(`Producto ${item.name} agotado o no existe.`);
      
      // Aplicar Markup de Promo si está activa (Lógica del dueño)
      let finalPrice = product.price;
      if (body.promo) {
         // Aquí puedes implementar lógica compleja de descuentos
         // Por ahora usamos el precio base de la DB
      }

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: product.image_url ? [product.image_url] : []
          },
          unit_amount: Math.round(finalPrice * 100)
        },
        quantity: item.qty
      };
    });

    // Envío Local TJ
    let shipping_options = [];
    if (body.mode === 'tj') {
        shipping_options.push({ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: 20000, currency: 'mxn' }, display_name: 'Local Express Tijuana' } });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      success_url: `${process.env.URL}/?status=success`,
      cancel_url: `${process.env.URL}/?status=cancel`,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};