// netlify/functions/stripe_webhook.js
// ORQUESTADOR — Stripe manda, el sistema ejecuta

const Stripe = require("stripe");

/* ---------- helpers ---------- */
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

/* ---------- handler ---------- */
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

  // Solo pagos completos
  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { ignored: stripeEvent.type });
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};

  // ---- Idempotencia simple pero real ----
  if (toStr(meta.processed) === "yes") {
    return json(200, { skipped: "already_processed" });
  }

  try {
    await stripe.checkout.sessions.update(
      session.id,
      {
        metadata: {
          ...meta,
          processed: "yes",
          processed_at: new Date().toISOString(),
        },
      },
      { idempotencyKey: `process:${stripeEvent.id}` }
    );
  } catch (e) {
    console.error("No se pudo lockear metadata:", e.message);
    return json(200, { warned: "metadata_lock_failed" });
  }

  // ---- ORQUESTACIÓN: llamar worker ----
  const siteUrl = getSiteUrl(event);

  const payload = {
    orderId: session.id,
    total: Number(session.amount_total || 0) / 100,
    currency: session.currency,
    email: session.customer_details?.email || "",
  };

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
    console.error("Fallo al llamar envia_webhook:", e.message);
  }

  console.log("Orden procesada por Stripe:", payload);

  return json(200, { ok: true, processed: true });
};