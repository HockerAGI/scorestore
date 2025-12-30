// netlify/functions/stripe_webhook.js
// ORQUESTADOR — fuente única de verdad

const Stripe = require("stripe");

/* ================= HELPERS ================= */
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function toStr(v) {
  return (v ?? "").toString().trim();
}

function getRawBody(event) {
  if (!event?.body) return Buffer.from("");
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");
}

function getSiteUrl(event) {
  return (
    toStr(process.env.URL_SCORE) ||
    toStr(process.env.URL) ||
    `${event.headers["x-forwarded-proto"] || "https"}://${event.headers.host}`
  ).replace(/\/+$/, "");
}

/* ================= HANDLER ================= */
exports.handler = async (event) => {
  const STRIPE_SECRET_KEY = toStr(process.env.STRIPE_SECRET_KEY);
  const STRIPE_WEBHOOK_SECRET = toStr(process.env.STRIPE_WEBHOOK_SECRET);
  const INTERNAL_WEBHOOK_SECRET = toStr(process.env.INTERNAL_WEBHOOK_SECRET);

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json(500, { error: "Stripe no configurado" });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-11-20",
  });

  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) return json(400, { error: "Falta stripe-signature" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.error("Firma Stripe inválida:", e.message);
    return json(400, { error: "Firma inválida" });
  }

  // Solo pagos finalizados
  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { ignored: stripeEvent.type });
  }

  const session = stripeEvent.data.object;

  // Cargar sesión completa
  let fullSession = session;
  try {
    fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["customer_details"],
    });
  } catch {}

  // --------- IDEMPOTENCIA ---------
  const meta = fullSession.metadata || {};
  if (toStr(meta.order_processed) === "yes") {
    return json(200, { skipped: "already_processed" });
  }

  const orderRef = meta.order_ref || `SCORE-${Date.now()}`;

  try {
    await stripe.checkout.sessions.update(
      fullSession.id,
      {
        metadata: {
          ...meta,
          order_processed: "yes",
          order_ref: orderRef,
          order_status: "paid",
          processed_at: new Date().toISOString(),
        },
      },
      { idempotencyKey: `order-lock:${stripeEvent.id}` }
    );
  } catch (e) {
    console.error("Error lock metadata:", e.message);
    return json(200, { warned: "lock_failed" });
  }

  // --------- PAYLOAD CANÓNICO ---------
  const payload = {
    eventId: stripeEvent.id,
    orderId: fullSession.id,
    orderRef,

    total: Number(fullSession.amount_total || 0) / 100,
    currency: fullSession.currency || "mxn",

    customerName: fullSession.customer_details?.name || "",
    email: fullSession.customer_details?.email || "",
    phone: fullSession.customer_details?.phone || "",

    shipping: fullSession.shipping_details || {},
    metadata: fullSession.metadata || {},
  };

  // --------- ORQUESTACIÓN ---------
  const siteUrl = getSiteUrl(event);

  try {
    await fetch(`${siteUrl}/.netlify/functions/envia_webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_WEBHOOK_SECRET
          ? { "x-internal-secret": INTERNAL_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Error llamando envia_webhook:", e.message);
  }

  console.log("ORDEN CONFIRMADA:", orderRef);

  return json(200, { ok: true, orderRef });
};