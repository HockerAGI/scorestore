// netlify/functions/stripe_webhook.js
// BLINDADO: Idempotencia persistente usando Stripe metadata (sin DB / sin add-ons)
// - Evita duplicados incluso en cold starts
// - Lock: notify_status = processing/sent/error
// - Guarda notify_event_id, notify_ts, notify_err
// - Soporta base64 body
// - Incluye items reales + metadata (cupón, envío, descuento, dirección)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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

function upper(v) {
  return toStr(v).toUpperCase();
}

function getSiteUrl() {
  const url = toStr(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL);
  return url ? url.replace(/\/+$/, "") : "";
}

function getRawBody(event) {
  if (!event?.body) return Buffer.from("");
  return event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
}

function buildShippingFromMetadata(meta = {}) {
  const line1 = toStr(meta.ship_address1);
  const city = toStr(meta.ship_city);
  const state = toStr(meta.ship_state);
  const postal = toStr(meta.ship_postal);

  if (!line1 && !city && !state && !postal) return null;

  return {
    address: {
      line1: line1 || "",
      city: city || "",
      state: state || "",
      postal_code: postal || "",
      country: "MX",
    },
  };
}

async function listLineItems(sessionId) {
  try {
    const itemsRes = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    return (itemsRes?.data || []).map((li) => ({
      name: toStr(li.description),
      qty: Number(li.quantity || 1),
      amount: Number(li.amount_total || 0) / 100,
    }));
  } catch (e) {
    console.error("listLineItems error:", e.message);
    return [];
  }
}

async function fetchWithTimeout(url, options = {}, ms = 7000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function nowISO() {
  return new Date().toISOString();
}

function minutesAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

/**
 * Idempotencia persistente:
 * - Preferimos PaymentIntent (más estable)
 * - Fallback: Session.metadata
 */
async function getNotifyState({ session }) {
  const meta = session?.metadata || {};
  const piId = toStr(session?.payment_intent);

  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      return { kind: "payment_intent", id: piId, meta: pi.metadata || {}, obj: pi };
    } catch (e) {
      console.error("retrieve PI error:", e.message);
    }
  }

  // fallback: session metadata
  return { kind: "session", id: session.id, meta, obj: session };
}

async function updateNotifyMeta({ state, patch, idempotencyKey }) {
  // Stripe metadata values must be strings
  const metadata = {};
  for (const [k, v] of Object.entries(patch || {})) metadata[k] = toStr(v);

  try {
    if (state.kind === "payment_intent") {
      await stripe.paymentIntents.update(state.id, { metadata }, { idempotencyKey });
      return true;
    }
    if (state.kind === "session") {
      await stripe.checkout.sessions.update(state.id, { metadata }, { idempotencyKey });
      return true;
    }
    return false;
  } catch (e) {
    console.error("updateNotifyMeta error:", e.message);
    return false;
  }
}

function shouldSkip(stateMeta, incomingEventId) {
  const status = toStr(stateMeta.notify_status);
  const sent = status === "sent";
  if (sent) return { skip: true, reason: "already_sent" };

  // Si quedó processing hace poquito, no duplicar
  if (status === "processing") {
    const ts = toStr(stateMeta.notify_ts);
    const mins = minutesAgo(ts);
    if (mins < 12) return { skip: true, reason: "processing_recent" };
    // Si está "atorado" > 12 min, permitimos reintento
  }

  // Si es error, permitimos reintento (Stripe puede reintentar el evento)
  // Si es vacío, primera vez
  return { skip: false, reason: "" };
}

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return json(500, { ok: false, error: "Falta STRIPE_WEBHOOK_SECRET o stripe-signature." });
  }

  let stripeEvent;
  try {
    const raw = getRawBody(event);
    stripeEvent = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Solo checkout completado
  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true, ignored: stripeEvent.type });
  }

  const sessionLite = stripeEvent.data.object;

  // Recupera sesión completa (más confiable) + payment_intent id
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionLite.id, {
      expand: ["customer_details"],
    });
  } catch (e) {
    console.error("retrieve session error:", e.message);
    session = sessionLite;
  }

  // Idempotencia persistente
  const notifyState = await getNotifyState({ session });
  const meta = notifyState.meta || {};

  const skip = shouldSkip(meta, stripeEvent.id);
  if (skip.skip) return json(200, { ok: true, skipped: skip.reason });

  // 1) Lock "processing" (persistente)
  // Nota: no hay CAS en metadata, pero esto elimina duplicados en retries/cold-starts.
  const lockOk = await updateNotifyMeta({
    state: notifyState,
    patch: {
      notify_status: "processing",
      notify_event_id: stripeEvent.id,
      notify_ts: nowISO(),
      notify_err: "",
    },
    idempotencyKey: `notify-lock:${stripeEvent.id}`,
  });

  if (!lockOk) {
    // Si no pudimos lockear, mejor no duplicar. Stripe reintentará.
    return json(200, { ok: true, warned: "lock_failed" });
  }

  // Datos de cliente
  const customerName =
    toStr(session?.metadata?.customer_name) ||
    toStr(session?.customer_details?.name) ||
    "Cliente";

  const email =
    toStr(session?.metadata?.customer_email) ||
    toStr(session?.customer_details?.email) ||
    "";

  const phone =
    toStr(session?.metadata?.customer_phone) ||
    toStr(session?.customer_details?.phone) ||
    "";

  const currency = upper(session?.currency || "mxn");
  const total = Number(session?.amount_total || 0) / 100;

  // Metadata importante (de create_checkout.js)
  const m = session?.metadata || {};
  const promoCode = toStr(m.promo_code);
  const discountMXN = Number(m.discount_mxn || 0);
  const shippingMXN = Number(m.shipping_mxn || 0);
  const shippingMode = toStr(m.shipping_mode);

  // Items reales
  const items = await listLineItems(session.id);

  // Shipping robusto (Stripe puede traerlo vacío)
  const shipping =
    session.shipping_details ||
    buildShippingFromMetadata(m) ||
    {};

  const payload = {
    // para dedupe adicional en el receptor, si quieres
    eventId: stripeEvent.id,

    orderId: session.id,
    customerName,
    email,
    phone,
    total,
    currency,

    promoCode: promoCode || "",
    discountMXN,
    shippingMXN,
    shippingMode: shippingMode || "",

    shipping,
    items,
    metadata: m,
  };

  // Llama tu webhook interno
  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    await updateNotifyMeta({
      state: notifyState,
      patch: {
        notify_status: "error",
        notify_err: "missing_site_url",
        notify_ts: nowISO(),
      },
      idempotencyKey: `notify-err:${stripeEvent.id}`,
    });
    return json(200, { ok: true, warned: "missing_site_url" });
  }

  const internalSecret = toStr(process.env.INTERNAL_WEBHOOK_SECRET);

  try {
    const r = await fetchWithTimeout(
      `${siteUrl}/.netlify/functions/envia_webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalSecret ? { "x-internal-secret": internalSecret } : {}),
        },
        body: JSON.stringify(payload),
      },
      9000
    );

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      const errMsg = `envia_webhook_non_ok:${r.status}:${t.slice(0, 180)}`;

      await updateNotifyMeta({
        state: notifyState,
        patch: {
          notify_status: "error",
          notify_err: errMsg,
          notify_ts: nowISO(),
        },
        idempotencyKey: `notify-err:${stripeEvent.id}`,
      });

      return json(200, { ok: true, delivered: false, error: errMsg });
    }

    // 2) Marca como "sent" persistente
    await updateNotifyMeta({
      state: notifyState,
      patch: {
        notify_status: "sent",
        notify_err: "",
        notify_ts: nowISO(),
      },
      idempotencyKey: `notify-sent:${stripeEvent.id}`,
    });

    return json(200, { ok: true, delivered: true });
  } catch (e) {
    const errMsg = `fetch_fail:${toStr(e.message).slice(0, 180)}`;

    await updateNotifyMeta({
      state: notifyState,
      patch: {
        notify_status: "error",
        notify_err: errMsg,
        notify_ts: nowISO(),
      },
      idempotencyKey: `notify-err:${stripeEvent.id}`,
    });

    return json(200, { ok: true, delivered: false, error: errMsg });
  }
};