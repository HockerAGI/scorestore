const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const { jsonResponse, createEnviaLabel, supabaseAdmin, normalizeQty } = require("./_shared");

/**
 * Stripe Webhook (Master Version v2026)
 * Procesa pagos, genera guías con peso real y notifica.
 */

// Función para evitar errores en Telegram con caracteres especiales
function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sistema de Notificaciones Telegram
async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error("Telegram Error:", e?.response?.data || e.message);
  }
}

exports.handler = async (event) => {
  // 1. Validaciones de Seguridad
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    console.error("Webhook Error: Falta firma o secreto.");
    return jsonResponse(400, { error: "Missing Signature or Secret" });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error("Firma inválida:", err.message);
    return jsonResponse(400, { error: `Webhook Error: ${err.message}` });
  }

  // 2. Procesar solo pagos completados
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;
    const sessionId = session.id;
    const total = session.amount_total ? session.amount_total / 100 : 0;
    const currency = (session.currency || "mxn").toUpperCase();

    // Metadatos y Configuración
    const mode = String(session.metadata?.shipping_mode || session.metadata?.mode || "pickup").toLowerCase();
    const promoCode = String(session.metadata?.promo_code || "").trim();

    // 3. Extracción de Datos del Cliente (Logística)
    const shipping = session.shipping_details || session.customer_details || {};
    const addressSource = shipping.address || {};

    const customer = {
      name: shipping.name || session.customer_details?.name || "Cliente Score",
      email: session.customer_details?.email || "sin-email@scorestore.com",
      phone: session.customer_details?.phone || shipping.phone || "0000000000",
      address: {
        line1: addressSource.line1 || "",
        line2: addressSource.line2 || "",
        city: addressSource.city || "",
        state: addressSource.state || "",
        country: addressSource.country || "MX",
        postal_code: addressSource.postal_code || "",
      },
    };

    // 4. Obtener Ítems Reales (Para peso exacto)
    let itemsQty = 1;
    let lineItems = [];
    
    try {
        const li = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
        lineItems = (li.data || []).map((x) => ({
          description: x.description || "Producto Score",
          quantity: x.quantity || 1,
          amount_total: x.amount_total ? x.amount_total / 100 : 0,
        }));
        // Calcular cantidad total de prendas para el peso
        itemsQty = lineItems.reduce((acc, x) => acc + (parseInt(x.quantity) || 1), 0);
    } catch (e) {
        console.warn("No se pudieron obtener line_items, usando default 1kg");
    }

    // 5. Generación de Guía (Solo si es envío y hay CP)
    let envia = null;
    let trackingNumber = "RECOGER_TIENDA";
    let carrier = "LOCAL";
    let labelUrl = null;
    let labelError = null;

    if ((mode === "mx" || mode === "us") && customer.address.postal_code) {
      console.log(`🚚 Generando guía para ${itemsQty} items a ${customer.address.postal_code}`);
      envia = await createEnviaLabel(customer, itemsQty);
      
      if (envia) {
        trackingNumber = envia.tracking;
        carrier = envia.carrier;
        labelUrl = envia.labelUrl || envia.label; // Soporte para ambos nombres
      } else {
        labelError = "Error API Envia";
        trackingNumber = "PENDIENTE_MANUAL";
      }
    }

    // 6. Guardar en Base de Datos (Supabase)
    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert([{
        stripe_id: sessionId,
        customer_name: customer.name,
        email: customer.email,
        phone: customer.phone,
        total_amount: total,
        currency: currency,
        status: "paid",
        shipping_mode: mode,
        promo_code: promoCode || null,
        tracking_number: trackingNumber,
        label_url: labelUrl,
        carrier: carrier,
        items_json: lineItems, // Guardamos el detalle exacto de qué compró
        customer_json: customer, // Guardamos dirección completa cruda por seguridad
        created_at: new Date().toISOString(),
      }]);
    }

    // 7. Notificación Telegram
    const cleanName = escapeHtml(customer.name);
    const cleanPromo = escapeHtml(promoCode);
    
    const msg = `
<b>🏆 VENTA CONFIRMADA - SCORE STORE</b>
➖➖➖➖➖➖➖➖➖➖
👤 <b>Cliente:</b> ${cleanName}
💰 <b>Total:</b> $${total.toFixed(2)} ${currency}
🎟️ <b>Cupón:</b> ${cleanPromo || 'N/A'}
🚚 <b>Modo:</b> ${mode.toUpperCase()}
📦 <b>Items:</b> ${itemsQty} pzas
📝 <b>Guía:</b> <code>${trackingNumber}</code>
🏢 <b>Carrier:</b> ${carrier}
${labelError ? `⚠️ <b>Alerta:</b> ${labelError}` : ''}
➖➖➖➖➖➖➖➖➖➖`;

    await notifyTelegram(msg);
  }

  return jsonResponse(200, { received: true });
};
