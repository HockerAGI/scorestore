"use strict";

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  normalizeQty,
  getBaseUrl,
  readJsonFile,
  getEnviaQuote,
  getFallbackShipping,
  initStripe
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    // Inicializar de forma segura
    const stripe = initStripe();

    const baseUrl = getBaseUrl(event);
    const body = safeJsonParse(event.body) || {};
    const items = normalizeQty(body.items);
    const shipping_mode = String(body.shipping_mode || "pickup").trim();
    const postal_code = String(body.postal_code || "N/A").trim();
    const promo_code_input = String(body.promo_code || "").trim().toUpperCase();

    if (!items || !items.length) {
      return jsonResponse(400, { ok: false, error: "El carrito está vacío." }, origin);
    }

    const items_qty = items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal_cents = items.reduce((sum, item) => sum + ((item.priceCents || 55000) * item.qty), 0);
    const subtotal_mxn = subtotal_cents / 100;

    // --- LÓGICA DE CUPONES (Integración con promos.json) ---
    let discountMultiplier = 1;
    let freeShippingActive = false;
    let promoApplied = "Ninguno";

    if (promo_code_input) {
      const promosData = readJsonFile("data/promos.json");
      if (promosData && promosData.rules) {
        const promo = promosData.rules.find(p => p.code === promo_code_input && p.active);
        
        if (promo) {
          const now = new Date();
          const expiry = promo.expires_at ? new Date(promo.expires_at) : null;
          
          if ((!expiry || now <= expiry) && subtotal_mxn >= (promo.min_amount_mxn || 0)) {
            promoApplied = promo.code;
            
            if (promo.type === 'percent') {
              discountMultiplier = 1 - (Number(promo.value) || 0);
            } else if (promo.type === 'free_shipping') {
              freeShippingActive = true;
            } else if (promo.type === 'fixed_mxn') {
              const discountRatio = (subtotal_mxn - Number(promo.value)) / subtotal_mxn;
              discountMultiplier = Math.max(0, discountRatio);
            }
          }
        }
      }
    }

    const lineItems = items.map(item => {
      const originalPrice = item.priceCents || 55000;
      const discountedPrice = Math.round(originalPrice * discountMultiplier);
      
      return {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `${item.title || item.sku} (Talla: ${item.size})`,
            metadata: { sku: item.sku, size: item.size }
          },
          unit_amount: discountedPrice, 
        },
        quantity: item.qty
      };
    });

    // --- LÓGICA DE ENVÍOS BLINDADA ---
    let shipping_options = [];
    let shipping_amount_cents = 0;
    let shipping_country = shipping_mode === "envia_us" ? "US" : "MX";
    let shipping_display_name = "";

    if (shipping_mode === "pickup") {
      shipping_amount_cents = 0;
      shipping_display_name = "Recoger en Fábrica (Tijuana)";
    } else {
      if (freeShippingActive) {
        shipping_amount_cents = 0;
        shipping_display_name = shipping_country === "US" ? 'Envío USA (Cupón GRATIS)' : 'Envío Nacional (Cupón GRATIS)';
      } else {
        // CORRECCIÓN: Calcular la tarifa real en el backend, no confiar en lo que manda el frontend.
        try {
          const quote = await getEnviaQuote({ zip: postal_code, country: shipping_country, items_qty });
          shipping_amount_cents = quote.amount_cents;
          shipping_display_name = quote.label;
        } catch (err) {
          console.warn("[create_checkout] Falla cotización real, usando fallback de seguridad.", err.message);
          const fallback = getFallbackShipping(shipping_country, items_qty);
          shipping_amount_cents = fallback.amount_cents;
          shipping_display_name = fallback.label;
        }
      }
    }

    shipping_options.push({
      shipping_rate_data: { 
        type: 'fixed_amount', 
        fixed_amount: { amount: shipping_amount_cents, currency: 'mxn' }, 
        display_name: shipping_display_name 
      }
    });

    const orderSummary = items.map(i => `${i.qty}x ${i.sku}[${i.size}]`).join(" | ").substring(0, 450);

    // 3. Crear Sesión en Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      shipping_options: shipping_options,
      shipping_address_collection: shipping_mode !== "pickup" ? { allowed_countries: [shipping_country] } : undefined,
      metadata: {
        source: "score_store",
        shipping_mode: shipping_mode,
        shipping_country: shipping_country,
        postal_code: postal_code,
        items_qty: items_qty,
        shipping_amount_cents: shipping_amount_cents,
        promo_code: promoApplied,
        items_summary: orderSummary
      }
    });

    return jsonResponse(200, { ok: true, url: session.url }, origin);

  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    return jsonResponse(500, { ok: false, error: "No se pudo procesar el pago seguro. Intenta de nuevo." }, origin);
  }
};