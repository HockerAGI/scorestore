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
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

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

    // Calcula el total de prendas reales para el webhook
    const items_qty = items.reduce((sum, item) => sum + item.qty, 0);

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

    // Configuración dinámica de envíos
    let shipping_options = [];
    let shipping_amount_cents = 0;
    let shipping_country = "MX";

    if (shipping_mode === "pickup") {
      shipping_amount_cents = 0;
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'mxn' },
          display_name: 'Recoger en Fábrica (Tijuana)',
        }
      });
    } else if (shipping_mode === "envia_us") {
      shipping_amount_cents = 35000;
      shipping_country = "US";
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shipping_amount_cents, currency: 'mxn' },
          display_name: 'Envío USA (Envía.com)',
        }
      });
    } else {
      shipping_amount_cents = 18000;
      shipping_country = "MX";
      shipping_options.push({
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shipping_amount_cents, currency: 'mxn' },
          display_name: 'Envío Nacional (Envía.com)',
        }
      });
    }

    const orderSummary = items.map(i => `${i.qty}x ${i.sku}[${i.size}]`).join(" | ").substring(0, 490);

    // Crear Sesión en Stripe con la Metadata EXACTA que UnicOs necesita
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
        shipping_country: shipping_country, // Vital para el webhook
        postal_code: postal_code,
        items_qty: items_qty,               // Vital para el peso de la caja
        shipping_amount_cents: shipping_amount_cents,
        items_summary: orderSummary
      }
    });

    return jsonResponse(200, { ok: true, url: session.url }, origin);

  } catch (error) {
    console.error("Stripe Error:", error);
    return jsonResponse(500, { ok: false, error: "No se pudo procesar el pago." }, origin);
  }
};
