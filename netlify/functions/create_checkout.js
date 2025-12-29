// netlify/functions/create_checkout.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  normalizePromo,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeShipping,
  applyPromoToTotals,
  getBaseUrlFromEnv
} = require("./_shared");

exports.handler = async (event) => {
  // 1. CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  // 2. Método Permitido
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("Falta STRIPE_SECRET_KEY en Netlify");
      return jsonResponse(500, { error: "Error de configuración de pagos." });
    }

    /* ---------- INPUT ---------- */
    const body = safeJsonParse(event.body, {});
    const items = body.items || [];
    const rawTo = body.to || {};
    const mode = toStr(body.mode) || "pickup";
    const promoCode = toStr(body.promoCode);

    /* ---------- VALIDACIONES ---------- */
    // 1. Validar carrito básico
    const cartCheck = validateCartItems(items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });
    
    // 2. Cargar datos reales
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    // 3. Validar Tallas (evitar que pidan tallas agotadas o inexistentes)
    const sizeCheck = validateSizes(cartCheck.items, productMap);
    if (!sizeCheck.ok) return jsonResponse(400, { error: sizeCheck.error });

    /* ---------- CONSTRUIR LINE ITEMS (STRIPE) ---------- */
    const line_items = [];
    let subtotal_mxn = 0;

    for (const it of cartCheck.items) {
      const p = productMap[it.id];
      // Seguridad: Si el producto no existe en JSON, error.
      if (!p) return jsonResponse(400, { error: `Producto no disponible: ${it.id}` });

      // Precio: Usamos baseMXN que viene de tu JSON
      const unitAmount = Math.round(Number(p.baseMXN || 0) * 100);
      subtotal_mxn += (Number(p.baseMXN || 0) * it.qty);

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name} (${it.size})`, // Nombre + Talla en el recibo
            images: p.img ? [new URL(p.img, getBaseUrlFromEnv()).toString()] : [],
          },
          unit_amount: unitAmount,
        },
        quantity: it.qty,
      });
    }

    /* ---------- DIRECCIÓN & ENVÍO ---------- */
    const to = {
      postal_code: digitsOnly(rawTo.postal_code),
      state_code: upper(rawTo.state_code),
      city: toStr(rawTo.city),
      address1: toStr(rawTo.address1),
      name: toStr(rawTo.name),
    };

    // Calcular Envío (Llama a la lógica centralizada de _shared)
    // Esto maneja Pickup, TJ Local y Nacional automáticamente
    const ship = await computeShipping({ mode, to, items: cartCheck.items, productMap });
    
    // Si es envío nacional y falló el cálculo crítico, detenemos (o usamos fallback interno)
    const shipping_mxn = ship.ok ? (ship.mxn || 0) : 0;
    
    /* ---------- CUPONES (Metadata) ---------- */
    // Nota: Aplicamos la lógica de descuento para calcular totales informativos.
    // Stripe no aplicará el descuento al cobro a menos que crees el cupón en su dashboard.
    // Aquí lo guardamos en metadata para que tú sepas qué cupón usaron.
    const promo = await applyPromoToTotals({ 
      promoCode, 
      subtotalMXN: subtotal_mxn, 
      shippingMXN: shipping_mxn 
    });

    /* ---------- SESIÓN STRIPE ---------- */
    const sessionConfig = {
      mode: "payment",
      line_items,
      success_url: `${getBaseUrlFromEnv()}/?status=success`,
      cancel_url: `${getBaseUrlFromEnv()}/?status=cancel`,
      metadata: {
        customer_name: to.name,
        shipping_mode: mode,
        promo_used: promo.promoCode || "NONE",
        discount_calc: promo.discountMXN || 0, // Informativo para el admin
        final_total_calc: promo.totalMXN
      }
    };

    // Agregar cobro de envío si aplica
    if (shipping_mxn > 0) {
      sessionConfig.shipping_options = [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: Math.round(shipping_mxn * 100), currency: "mxn" },
            display_name: ship.label || "Envío",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: ship.days || 7 },
            },
          },
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "No se pudo iniciar el pago. Intenta de nuevo." });
  }
};
