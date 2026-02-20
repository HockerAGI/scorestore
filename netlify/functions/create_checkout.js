"use strict";

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  normalizeQty,
  getBaseUrl
} = require("./_shared"); // Utilizando tu shared module

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const baseUrl = getBaseUrl(event);
    const body = safeJsonParse(event.body) || {};
    const items = normalizeQty(body.items);
    const shipping_mode = String(body.shipping_mode || "pickup").trim();

    if (!items || !items.length) {
      return jsonResponse(400, { ok: false, error: "El carrito está vacío." }, origin);
    }

    // 1. Mapear productos para Stripe Checkout
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: `${item.title || item.sku} (Talla: ${item.size})`,
          metadata: { sku: item.sku, size: item.size }
        },
        unit_amount: item.priceCents || 55000, 
      },
      quantity: item.qty
    }));

    // 2. Configurar costos de envío reales basados en Envía.com si aplica
    let shipping_options = [];
    if (shipping_mode === "pickup") {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'mxn' },
          display_name: 'Recoger en Fábrica',
        }
      });
    } else {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 15000, currency: 'mxn' }, // Ej. Costo fijo o calculado previo
          display_name: shipping_mode === 'envia_mx' ? 'Envío Nacional' : 'Envío Internacional',
        }
      });
    }

    // 3. Crear Sesión en Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      shipping_options: shipping_options,
      metadata: {
        shipping_mode: shipping_mode,
        postal_code: body.postal_code || 'N/A'
      }
    });

    return jsonResponse(200, { ok: true, url: session.url }, origin);

  } catch (error) {
    console.error("Stripe Error:", error);
    return jsonResponse(500, { ok: false, error: "No se pudo procesar el pago." }, origin);
  }
};
