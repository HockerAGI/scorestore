// netlify/functions/create_checkout.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  productMapFromCatalog,
  loadCatalog,
  validateCartItems,
  validateSizes,
  computeShipping,
  applyPromoToTotals,
  getSiteUrlFromEnv
} = require("./_shared");

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const siteUrl = getSiteUrlFromEnv(event);
    const body = safeJsonParse(event.body, {});
    
    // 1. Validar Inventario
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);
    
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });
    
    const sizeCheck = validateSizes(cartCheck.items, productMap);
    if (!sizeCheck.ok) return jsonResponse(400, { error: sizeCheck.error });

    // 2. Calcular Totales Base
    let subtotal = 0;
    const line_items = cartCheck.items.map((item) => {
      const p = productMap[item.id];
      const amount = Math.round(p.baseMXN * 100); // centavos
      subtotal += amount * item.qty;
      
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${item.size}`, // Detalle importante para almacén
            images: p.img ? [new URL(p.img, siteUrl).toString()] : [],
            metadata: { id: item.id, size: item.size }
          },
          unit_amount: amount,
        },
        quantity: item.qty,
      };
    });

    // 3. Envío y Promociones
    const mode = body.mode || "pickup";
    const shipRes = await computeShipping({ mode, to: body.to });
    const shipping_mxn = shipRes.mxn || 0;
    
    // Aplicar lógica de descuento
    const promoCode = body.promoCode || "";
    // Nota: applyPromoToTotals maneja valores en Pesos, Stripe usa Centavos
    const promoCalc = await applyPromoToTotals({ 
        promoCode, 
        subtotalMXN: subtotal / 100, 
        shippingMXN: shipping_mxn 
    });
    
    const discountAmountMXN = promoCalc.discountMXN;

    // 4. Configurar Sesión de Stripe
    const sessionConfig = {
      payment_method_types: ["card", "oxxo"],
      line_items: line_items,
      mode: "payment",
      success_url: `${siteUrl}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?status=cancel`,
      metadata: {
        shipping_mode: mode,
        promo_code: promoCode,
        // Guardamos info útil para el webhook
        items_summary: cartCheck.items.map(i => `${i.id}(${i.size})x${i.qty}`).join(", ")
      },
    };

    // Dirección
    if (mode === "mx") {
      // Forzar recolección de dirección en Stripe para envíos nacionales
      sessionConfig.shipping_address_collection = { allowed_countries: ["MX"] };
    }

    // Costo de Envío (Stripe Shipping Options)
    if (shipping_mxn > 0) {
      sessionConfig.shipping_options = [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(shipping_mxn * 100), currency: "mxn" },
          display_name: shipRes.label || "Envío",
          delivery_estimate: { 
            minimum: { unit: "business_day", value: 3 }, 
            maximum: { unit: "business_day", value: 7 } 
          },
        },
      }];
    }

    // APLICACIÓN DE CUPÓN NATIVO (Mejora del archivo subido)
    if (discountAmountMXN > 0) {
      // Creamos un cupón efímero para esta transacción
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(discountAmountMXN * 100),
        currency: 'mxn',
        duration: 'once',
        name: `PROMO: ${promoCode}`,
      });
      sessionConfig.discounts = [{ coupon: coupon.id }];
    }

    // Crear sesión
    const session = await stripe.checkout.sessions.create(sessionConfig);
    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: "Error iniciando pago. Intenta de nuevo." });
  }
};
