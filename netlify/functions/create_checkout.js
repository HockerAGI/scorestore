/**
 * create_checkout.js — PASARELA SEGURA
 */
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, safeJsonParse, supabase, FALLBACK_MX_PRICE, FALLBACK_US_PRICE } = require("./_shared");

const TJ_FLAT_RATE = 200; // Costo fijo local Tijuana
const BASE_URL = process.env.URL || "https://scorestore.netlify.app"; // URL de tu sitio

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const cartItems = body.items || [];
    const discountFactor = parseFloat(body.discountFactor) || 0;

    if (!cartItems.length) return jsonResponse(400, { error: "El carrito está vacío" });

    // 1. SEGURIDAD: Obtener precios REALES de Supabase (Único OS)
    // Evita que alguien modifique el precio en el navegador
    const ids = cartItems.map(i => i.id);
    const { data: dbProducts, error } = await supabase
      .from("products")
      .select("id, sku, price, name, image_url")
      .in("id", ids);

    if (error || !dbProducts) {
      console.error("DB Error:", error);
      throw new Error("Error al validar productos con el servidor.");
    }

    // 2. Construir Line Items para Stripe
    const line_items = cartItems.map(item => {
      const dbProd = dbProducts.find(p => String(p.id) === String(item.id));
      if (!dbProd) return null; // Si el producto no existe en DB, ignorar

      // Calcular precio final con descuento
      const unitPrice = Number(dbProd.price);
      const finalUnitAmount = Math.round(unitPrice * (1 - discountFactor) * 100); // En centavos

      let description = `Talla: ${item.size} | SKU: ${dbProd.sku}`;
      if (discountFactor > 0) description += ` | Desc: ${discountFactor * 100}%`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: dbProd.name,
            description: description,
            images: dbProd.image_url ? [dbProd.image_url] : [],
            metadata: { supabase_id: dbProd.id }
          },
          unit_amount: finalUnitAmount,
        },
        quantity: item.qty
      };
    }).filter(Boolean); // Eliminar nulos

    if (line_items.length === 0) throw new Error("No se pudieron procesar los productos.");

    // 3. Configurar Envío en Stripe
    let shipping_options = [];
    const mode = body.mode || "pickup";

    if (mode !== "pickup") {
      let shippingAmount = 0;
      let shippingLabel = "Envío";

      if (mode === "tj") {
        shippingAmount = TJ_FLAT_RATE * 100;
        shippingLabel = "Envío Local (Tijuana)";
      } else if (mode === "us") {
        shippingAmount = (body.shippingCost || FALLBACK_US_PRICE) * 100;
        shippingLabel = "Envío Internacional (USA)";
      } else {
        shippingAmount = (body.shippingCost || FALLBACK_MX_PRICE) * 100;
        shippingLabel = "Envío Nacional (MX)";
      }

      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingAmount, currency: 'mxn' },
          display_name: shippingLabel,
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      });
    }

    // 4. Crear Sesión de Pago
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      // Pedir dirección si es envío, no si es pickup
      shipping_address_collection: mode === "pickup" ? undefined : { allowed_countries: ["MX", "US"] },
      success_url: `${BASE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?status=cancel`,
      customer_email: body.customer?.email, // Prellenar email si existe
      metadata: {
        score_mode: mode,
        org_id: "org_6TnYQEAOKVXwJXywWXTr4Nc", // TU ORG ID REAL
        customer_name: body.customer?.name,
        customer_phone: body.customer?.phone
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: err.message });
  }
};
