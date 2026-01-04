const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const promos = require("../../data/promos.json"); // Unificado (Json directo)
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
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Método no permitido" });

    const body = safeJsonParse(event.body);
    if (!body) return jsonResponse(400, { error: "JSON inválido" });

    // 1. Cargar Datos
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);
    
    // 2. Validar Carrito
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 3. Validar Promo
    let couponId = undefined;
    const promoCode = String(body.promo || "").toUpperCase();
    const activePromo = promos.rules.find(r => r.code === promoCode && r.active);
    
    if (activePromo && activePromo.type !== "free_shipping") {
      // Crear cupón al vuelo en Stripe para asegurar validez
      const coupon = await stripe.coupons.create({
        amount_off: activePromo.type === "fixed" ? (activePromo.value * 100) : undefined,
        percent_off: activePromo.type === "percent" ? (activePromo.value * 100) : undefined,
        currency: "mxn",
        duration: "once",
        name: `PROMO: ${promoCode}`
      });
      couponId = coupon.id;
    }

    // 4. Construir Line Items
    const line_items = cartCheck.items.map(item => {
      const product = productMap[item.id];
      if (!product) throw new Error(`Producto ${item.id} no encontrado`);
      
      // Construir URL absoluta para Stripe (Requerido para mostrar imagen en checkout)
      const imgUrl = product.img.startsWith("http") 
        ? product.img 
        : `https://scorestore.netlify.app${product.img}`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: [imgUrl]
          },
          unit_amount: product.baseMXN * 100, // Centavos
        },
        quantity: item.qty
      };
    });

    // 5. Calcular Envío (Lógica Crucial)
    let shipping_options = [];
    const isFreeShipPromo = activePromo && activePromo.type === "free_shipping";
    
    if (body.mode === "pickup") {
      // No agregamos shipping_options = Stripe asume gratis o no envío físico
      // Pero para forzar "Recoger", podemos no poner shipping y manejarlo en metadata
      // O poner un shipping rate de $0
       shipping_options = [
        { shipping_rate_data: { 
            type: 'fixed_amount', 
            fixed_amount: { amount: 0, currency: 'mxn' }, 
            display_name: 'Recoger en Fábrica (Tijuana)' 
        }}
      ];
    } 
    else if (body.mode === "tj") {
      shipping_options = [
        { shipping_rate_data: { 
            type: 'fixed_amount', 
            fixed_amount: { amount: isFreeShipPromo ? 0 : 20000, currency: 'mxn' }, 
            display_name: 'Entrega Local Express (Tijuana)' 
        }}
      ];
    }
    else {
      // NACIONAL (mx)
      // Cotizar con Envia.com
      const zip = digitsOnly(body.to?.postal_code);
      const totalItems = cartCheck.items.reduce((acc, i) => acc + i.qty, 0);
      
      // Fallback por si falla Envia
      let cost = 250; 
      let label = "Envío Estándar Nacional";
      
      if (!isFreeShipPromo) {
        const quote = await getEnviaQuote(zip, totalItems);
        if (quote) {
          cost = quote.mxn;
          label = `Envío Nacional (${quote.carrier})`;
        }
      } else {
        cost = 0;
        label = "Envío Gratis (Promo)";
      }

      shipping_options = [
        { shipping_rate_data: { 
            type: 'fixed_amount', 
            fixed_amount: { amount: cost * 100, currency: 'mxn' }, 
            display_name: label,
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 }
            }
        }}
      ];
    }

    // 6. Crear Sesión
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items: line_items,
      mode: "payment",
      discounts: couponId ? [{ coupon: couponId }] : undefined,
      shipping_options: shipping_options,
      
      // IMPORTANTE: Pedir dirección de envío a Stripe para validación final
      shipping_address_collection: { allowed_countries: ["MX", "US"] },
      
      success_url: "https://scorestore.netlify.app/?status=success",
      cancel_url: "https://scorestore.netlify.app/?status=cancel",
      
      metadata: {
        score_mode: body.mode,
        score_promo: promoCode
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: err.message || "Error interno del servidor" });
  }
};
