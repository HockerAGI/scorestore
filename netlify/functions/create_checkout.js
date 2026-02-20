"use strict";

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  normalizeQty,
  getBaseUrl
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const baseUrl = getBaseUrl(event);
    const body = safeJsonParse(event.body) || {};
    const items = normalizeQty(body.items);
    const shipping_mode = String(body.shipping_mode || "pickup").trim();
    const postal_code = String(body.postal_code || "N/A").trim();

    if (!items || !items.length) {
      return jsonResponse(400, { ok: false, error: "El carrito está vacío." }, origin);
    }

    // 1. Mapear productos para Stripe Checkout (Alineado a UnicOs)
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: `${item.title || item.sku} - Talla: ${item.size}`,
          metadata: { 
            sku: item.sku, 
            size: item.size 
          }
        },
        unit_amount: item.priceCents || 55000, 
      },
      quantity: item.qty
    }));

    // 2. Configurar costos de envío reales
    let shipping_options = [];
    if (shipping_mode === "pickup") {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'mxn' },
          display_name: 'Recoger en Fábrica (Tijuana)',
          delivery_estimate: { minimum: { unit: 'business_day', value: 1 }, maximum: { unit: 'business_day', value: 3 } }
        }
      });
    } else if (shipping_mode === "envia_mx") {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 18000, currency: 'mxn' }, // Tarifa flat nacional MXN (180 MXN)
          display_name: 'Envío Nacional (Envía.com)',
          delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 5 } }
        }
      });
    } else if (shipping_mode === "envia_us") {
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 35000, currency: 'mxn' }, // Tarifa flat USA MXN (350 MXN)
          display_name: 'Envío USA (Envía.com)',
          delivery_estimate: { minimum: { unit: 'business_day', value: 5 }, maximum: { unit: 'business_day', value: 10 } }
        }
      });
    }

    // 3. Crear string de resumen para Metadata (Límite de Stripe: 500 caracteres)
    const orderSummary = items.map(i => `${i.qty}x ${i.sku}[${i.size}]`).join(" | ").substring(0, 490);

    // 4. Crear Sesión en Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'oxxo'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      shipping_options: shipping_options,
      payment_intent_data: {
        metadata: {
          source: "score_store",
          shipping_mode: shipping_mode,
          postal_code: postal_code,
          items_summary: orderSummary
        }
      },
      metadata: {
        source: "score_store",
        shipping_mode: shipping_mode,
        postal_code: postal_code,
        items_summary: orderSummary
      }
    });

    return jsonResponse(200, { ok: true, url: session.url }, origin);

  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    return jsonResponse(500, { ok: false, error: "No se pudo procesar el pago seguro con Stripe." }, origin);
  }
};
