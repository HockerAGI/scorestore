/**
 * Netlify Function: stripe_webhook
 * - Recibe eventos de Stripe y manda notificación a Telegram/WhatsApp vía envia_webhook
 *
 * ENV:
 *  STRIPE_SECRET_KEY
 *  STRIPE_WEBHOOK_SECRET
 *  URL_SCORE (opcional)
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
      return jsonResponse(500, {
        ok: false,
        error: "Falta STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET en el entorno.",
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return jsonResponse(400, { ok: false, error: `Firma Stripe inválida: ${err.message}` });
    }

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "customer_details", "shipping_details"],
      });

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
        metadata: full.metadata || {},
        items: (full.line_items?.data || []).map((li) => ({
          name: li.description,
          qty: li.quantity,
          unit_amount: li.price?.unit_amount ? li.price.unit_amount / 100 : null,
          amount_total: li.amount_total ? li.amount_total / 100 : null,
          currency: li.currency,
        })),
      };

      await fetch(`${SITE_URL}/.netlify/functions/envia_webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    return jsonResponse(200, { ok: true, received: true, type: stripeEvent.type });
  } catch (err) {
    console.error("Error en webhook Stripe:", err);
    return jsonResponse(500, { ok: false, error: err.message || String(err) });
  }
};