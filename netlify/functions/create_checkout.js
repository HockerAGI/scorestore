"use strict";

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  normalizeQty,
  getBaseUrl,
  readJsonFile
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

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
              // Distribuye el descuento fijo proporcionalmente en los items
              const discountRatio = (subtotal_mxn - Number(promo.value)) / subtotal_mxn;
              discountMultiplier = Math.max(0, discountRatio);
            }
          }
        }
      }
    }

    // 1. Mapear productos aplicando el descuento si existe
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

    // 2. Configuración dinámica de envíos respetando Free Shipping
    let shipping_options = [];
    let shipping_amount_cents = 0;
    let shipping_country = "MX";

    if (shipping_mode === "pickup") {
      shipping_amount_cents = 0;
      shipping_options.push({
        shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: 0, currency: 'mxn' }, display_name: 'Recoger en Fábrica (Tijuana)' }
      });
    } else if (shipping_mode === "envia_us") {
      shipping_amount_cents = freeShippingActive ? 0 : 35000;
      shipping_country = "US";
      shipping_options.push({
        shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: shipping_amount_cents, currency: 'mxn' }, display_name: freeShippingActive ? 'Envío USA (GRATIS)' : 'Envío USA (Envía.com)' }
      });
    } else {
      shipping_amount_cents = freeShippingActive ? 0 : 18000;
      shipping_country = "MX";
      shipping_options.push({
        shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: shipping_amount_cents, currency: 'mxn' }, display_name: freeShippingActive ? 'Envío Nacional (GRATIS)' : 'Envío Nacional (Envía.com)' }
      });
    }

    const orderSummary = items.map(i => `${i.qty}x ${i.sku}[${i.size}]`).join(" | ").substring(0, 450);

    // 3. Crear Sesión en Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      shipping_options: shipping_options,
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
    return jsonResponse(500, { ok: false, error: "No se pudo procesar el pago." }, origin);
  }
};
