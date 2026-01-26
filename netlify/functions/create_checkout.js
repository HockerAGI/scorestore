const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, getPromo } = require("./_shared");
// IMPORTANTE: Asegúrate de que catalog.json existe en esta ruta relativa
const catalogFallback = require("../../data/catalog.json"); 

exports.handler = async (event) => {
  // Configuración CORS
  if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method Not Allowed" });
  }

  try {
    // 1. CONFIGURACIÓN DE URL BASE (Fixed for Production)
    // Forzamos la URL oficial para evitar errores de redirección en Stripe
    const BASE_URL = "https://scorestore.netlify.app"; 

    const body = JSON.parse(event.body || "{}");
    const cartItems = body.cart || [];
    const shippingMode = body.shippingMode || "pickup";
    const zip = body.zip;
    const promoCode = body.promoCode;

    if (!cartItems.length) {
        return jsonResponse(400, { error: "El carrito está vacío" });
    }

    // 2. VALIDACIÓN DE PRECIOS (Seguridad)
    // Reconstruimos los items basándonos en el catálogo del servidor para evitar manipulación de precios
    const validLineItems = [];
    const promo = getPromo(promoCode); 

    for (const item of cartItems) {
        // Buscamos el producto en el catálogo seguro (Server Side)
        const productDb = catalogFallback.products.find(p => p.id === item.id);
        
        if (productDb) {
            let unitPrice = productDb.baseMXN;
            
            // Aplicar descuento porcentual si el cupón es válido
            if (promo && promo.type === 'percent') {
                unitPrice = unitPrice - (unitPrice * promo.value);
            }

            // Construcción del objeto LineItem para Stripe
            validLineItems.push({
                price_data: {
                    currency: "mxn",
                    product_data: {
                        name: productDb.name,
                        description: `Talla: ${item.size} ${promo ? `(Cupón ${promoCode})` : ''}`,
                        images: [BASE_URL + productDb.img], // Imagen absoluta usando la URL oficial
                        metadata: {
                            id: item.id,
                            size: item.size
                        }
                    },
                    unit_amount: Math.round(unitPrice * 100), // Stripe requiere centavos
                },
                quantity: item.qty || 1,
            });
        }
    }

    if(validLineItems.length === 0) {
        return jsonResponse(400, { error: "Error de validación de productos." });
    }

    // 3. CÁLCULO DE ENVÍO (Lógica Unico Uniformes)
    let shipping_options = [];
    
    if (shippingMode === "pickup") {
        // Recogida en tienda (Gratis)
        shipping_options = [];
    } else {
        // Costos fijos definidos para operación robusta
        const isUS = shippingMode === 'us';
        const cost = isUS ? 80000 : 25000; // $800.00 MXN o $250.00 MXN
        const label = isUS ? "FedEx International (USA)" : "FedEx Nacional (MX)";
        
        shipping_options = [{
            shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: cost, currency: "mxn" },
                display_name: label,
                delivery_estimate: {
                    minimum: { unit: "business_day", value: 3 },
                    maximum: { unit: "business_day", value: isUS ? 7 : 5 },
                },
            },
        }];
    }

    // 4. CREAR SESIÓN DE CHECKOUT
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items: validLineItems,
      mode: "payment",
      shipping_options,
      // Solo pedimos dirección si es envío
      shipping_address_collection: shippingMode !== "pickup" ? { allowed_countries: ["MX", "US"] } : undefined,
      phone_number_collection: { enabled: true },
      
      // URLs de redirección usando la variable BASE_URL correcta
      success_url: `${BASE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?status=cancel`,
      
      metadata: {
        order_source: "score_store_web",
        shipping_mode: shippingMode,
        promo_code: promoCode || "NONE",
        customer_cp: zip || "N/A"
      },
      allow_promotion_codes: false // Controlado manualmente arriba
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Stripe Error:", e);
    return jsonResponse(500, { error: "Error al iniciar pasarela de pago." });
  }
};