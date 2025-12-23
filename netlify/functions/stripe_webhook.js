/**
 * Netlify Function: stripe_webhook
 * - Recibe eventos de Stripe (pago exitoso).
 * - Recupera detalles completos (items, cliente).
 * - Invoca a envia_webhook para notificar al Admin.
 */

const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SITE_URL = process.env.URL_SCORE || process.env.URL || "http://localhost:8888";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Método no permitido" });
    }

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      console.error("Faltan claves de Stripe en entorno.");
      return jsonResponse(500, { ok: false, error: "Error de configuración servidor." });
    }

    // Usamos la misma versión de API que en create_checkout para consistencia
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Firma de Stripe inválida:", err.message);
      return jsonResponse(400, { ok: false, error: `Webhook Signature Error: ${err.message}` });
    }

    // Solo nos interesa cuando el checkout se completa exitosamente
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      // Recuperamos datos expandidos (items comprados, detalles de envío)
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "customer_details", "shipping_details"],
      });

      // Preparamos el payload para el sistema de notificaciones (envia_webhook)
      const payload = {
        source: "stripe",
        sessionId: session.id,
        paymentStatus: full.payment_status,
        amountTotal: full.amount_total ? full.amount_total / 100 : null,
        currency: full.currency || "mxn",
        customerEmail: full.customer_details?.email || full.customer_email || null,
        customerName: full.customer_details?.name || null,
        phone: full.customer_details?.phone || null,
        shipping: full.shipping_details || null,
        
        // Sincronización de metadatos (promo_code -> promoCode)
        metadata: {
          ...full.metadata,
          promoCode: full.metadata?.promo_code || full.metadata?.promoCode || null
        },

        items: (full.line_items?.data || []).map((li) => ({
          name: li.description,
          qty: li.quantity,
          unit_amount: li.price?.unit_amount ? li.price.unit_amount / 100 : null,
          amount_total: li.amount_total ? li.amount_total / 100 : null,
          currency: li.currency,
        })),
      };

      // Llamada interna al webhook de notificaciones (WhatsApp/Telegram)
      // Usamos fetch al propio dominio para desacoplar la lógica
      try {
        await fetch(`${SITE_URL}/.netlify/functions/envia_webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (notifyErr) {
        console.error("Error llamando a envia_webhook:", notifyErr);
        // No fallamos el webhook de Stripe si falla la notificación interna
      }
    }

    return jsonResponse(200, { ok: true, received: true });

  } catch (err) {
    console.error("Error crítico en stripe_webhook:", err);
    return jsonResponse(500, { ok: false, error: err.message });
  }
};
