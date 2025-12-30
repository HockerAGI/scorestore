// netlify/functions/stripe_webhook.js
// Stripe Webhook — versión estable y alineada al flujo actual

const Stripe = require("stripe");

/* ---------- helpers mínimos ---------- */
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

/* ---------- handler ---------- */
exports.handler = async (event) => {
  const stripeKey = toStr(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = toStr(process.env.STRIPE_WEBHOOK_SECRET);

  if (!stripeKey || !webhookSecret) {
    return json(500, { ok: false, error: "Stripe no configurado" });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-11-20",
  });

  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!sig) {
    return json(400, { ok: false, error: "Falta stripe-signature" });
  }

  let stripeEvent;
  try {
    const rawBody = getRawBody(event);
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return json(400, { ok: false, error: "Firma inválida" });
  }

  /* ---------- solo procesamos pagos completos ---------- */
  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true, ignored: stripeEvent.type });
  }

  const session = stripeEvent.data.object;

  /* ---------- idempotencia básica ---------- */
  // Stripe puede reenviar el evento. Usamos metadata como lock simple.
  const meta = session.metadata || {};
  if (toStr(meta.processed) === "yes") {
    return json(200, { ok: true, skipped: "already_processed" });
  }

  try {
    // marcamos como procesado (sin DB, sin fetch extra)
    await stripe.checkout.sessions.update(
      session.id,
      {
        metadata: {
          ...meta,
          processed: "yes",
          processed_at: new Date().toISOString(),
        },
      },
      {
        idempotencyKey: `process:${stripeEvent.id}`,
      }
    );
  } catch (e) {
    console.error("Metadata update failed:", e.message);
    // no detenemos: Stripe volverá a intentar
    return json(200, { ok: true, warned: "metadata_lock_failed" });
  }

  /* ---------- log operativo (puedes reemplazar por email / slack después) ---------- */
  console.log("Pago confirmado", {
    sessionId: session.id,
    total: Number(session.amount_total || 0) / 100,
    currency: session.currency,
    email: session.customer_details?.email || "",
  });

  return json(200, { ok: true, processed: true });
};