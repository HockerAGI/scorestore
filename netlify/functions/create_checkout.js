/**
 * create_checkout.js — FINAL MASTER
 */
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, safeJsonParse, supabase, FALLBACK_MX_PRICE, FALLBACK_US_PRICE } = require("./_shared");

const TJ_FLAT = 200; // Costo local

function baseUrl() {
  return process.env.URL || "https://scorestore.netlify.app";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const cartItems = body.items || [];
    const discountFactor = parseFloat(body.discountFactor) || 0; // 0.10, 0.25, etc.

    if (!cartItems.length) return jsonResponse(400, { error: "Carrito vacío" });

    // 1. Obtener Org ID
    const { data: org } = await supabase.from("organizations").select("id").eq("slug", "score-store").single();
    if (!org) throw new Error("Tienda no configurada");

    // 2. Obtener productos reales de DB
    const ids = cartItems.map(i => i.id);
    const { data: products } = await supabase.from("products").select("*").in("id", ids).eq("active", true);

    if (!products?.length) throw new Error("Productos no disponibles");

    // 3. Construir Line Items
    const line_items = cartItems.map(item => {
      const dbProd = products.find(p => String(p.id) === String(item.id));
      if (!dbProd) return null;

      // Precio y Descuento
      const basePrice = Number(dbProd.price);
      const finalPrice = basePrice * (1 - discountFactor);
      const unitAmount = Math.round(finalPrice * 100); // Centavos

      let name = dbProd.name;
      if (discountFactor > 0) name += ` (${discountFactor * 100}% OFF)`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: name,
            description: `Talla: ${item.size} | SKU: ${dbProd.sku}`,
            images: dbProd.image_url ? [`${baseUrl()}${dbProd.image_url}`] : [],
            metadata: { product_id: dbProd.id }
          },
          unit_amount: unitAmount,
        },
        quantity: item.qty
      };
    }).filter(Boolean);

    // 4. Calcular Envío
    const mode = body.mode || "pickup";
    let shipping_options = [];
    
    if (mode !== "pickup") {
        let cost = FALLBACK_MX_PRICE;
        let label = "Envío Estándar";

        if (mode === "tj") {
            cost = TJ_FLAT;
            label = "Local Express (Tijuana)";
        } else if (mode === "us") {
            cost = body.shipping?.cost || FALLBACK_US_PRICE;
            label = "Envío Internacional (USA)";
        } else {
            cost = body.shipping?.cost || FALLBACK_MX_PRICE;
            label = "Envío Nacional (MX)";
        }

        if (cost > 0) {
            shipping_options.push({
                shipping_rate_data: {
                    type: "fixed_amount",
                    fixed_amount: { amount: Math.round(cost * 100), currency: "mxn" },
                    display_name: label,
                }
            });
        }
    }

    // 5. Crear Sesión Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection: mode === "pickup" ? undefined : { allowed_countries: ["MX", "US"] },
      success_url: `${baseUrl()}/?status=success`,
      cancel_url: `${baseUrl()}/?status=cancel`,
      metadata: {
        org_id: org.id,
        score_mode: mode,
        discount_applied: discountFactor
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: err.message });
  }
};
