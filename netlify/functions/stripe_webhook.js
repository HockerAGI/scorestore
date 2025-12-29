// netlify/functions/stripe_webhook.js
// BLINDADO + RETROCOMPATIBLE con create_checkout.js actual

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/* ================= UTIL ================= */
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
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body, "utf8");
}

function nowISO() {
  return new Date().toISOString();
}

function minutesAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

/* ================= METADATA NORMALIZER ================= */

function normalizeShippingFromMetadata(meta = {}) {
  const line1 = toStr(meta.address1 || meta.ship_address1);
  const city = toStr(meta.city || meta.ship_city);
  const state = toStr(meta.state_code || meta.ship_state);
  const postal = toStr(meta.postal_code || meta.ship_postal);

  if (!line1 && !city && !state && !postal) return null;

  return {
    address: {
      line1,
      city,
      state,
      postal_code: postal,
      country: "MX",
    },
  };
}

function normalizeShippingMode(meta = {}) {
  return (
    toStr(meta.shipping_mode) ||
    toStr(meta.mode) || // <- de create_checkout.js
    ""
  );
}

function normalizeDiscount(meta = {}) {
  return Number(
    meta.discount_mxn ??
    meta.promo_discount_mxn ??
    0
  );
}

/* ================= STRIPE HELPERS ================= */

async function listLineItems(sessionId) {
  try {
    const itemsRes = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    return (itemsRes?.data || []).map((li) => ({
      name: toStr(li.description),
      qty: Number(li.quantity || 1),
      amount: Number(li.amount_total || 0) / 100,
    }));
  } catch {
    return [];
  }
}

async function getNotifyState({ session }) {
  const meta = session?.metadata || {};
  const piId = toStr(session?.payment_intent);

  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      return { kind: "payment_intent", id: piId, meta: pi.metadata || {} };
    } catch {}
  }
  return { kind: "session", id: session.id, meta };
}

async function updateNotifyMeta({ state, patch, idempotencyKey }) {
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
  } catch {}
  return false;
}

function shouldSkip(meta) {
  const status = toStr(meta.notify_status);
  if (status === "sent") return { skip: true };
  if (status === "processing") {
    const mins = minutesAgo(meta.notify_ts);
    if (mins < 12) return { skip: true };
  }
  return { skip: false };
}

/* ================= HANDLER ================= */

exports.handler = async (event) => {
  const sig = event.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return json(500, { ok: false, error: "Missing Stripe webhook secret" });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, secret);
  } catch (e) {
    return { statusCode: 400, body: `Webhook Error: ${e.message}` };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { ignored: stripeEvent.type });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(stripeEvent.data.object.id, {
      expand: ["customer_details"],
    });
  } catch {
    session = stripeEvent.data.object;
  }

  const notifyState = await getNotifyState({ session });
  const meta = notifyState.meta || {};

  if (shouldSkip(meta).skip) {
    return json(200, { ok: true, skipped: true });
  }

  const locked = await updateNotifyMeta({
    state: notifyState,
    patch: {
      notify_status: "processing",
      notify_event_id: stripeEvent.id,
      notify_ts: nowISO(),
      notify_err: "",
    },
    idempotencyKey: `lock:${stripeEvent.id}`,
  });

  if (!locked) return json(200, { warned: "lock_failed" });

  const items = await listLineItems(session.id);

  const payload = {
    eventId: stripeEvent.id,
    orderId: session.id,
    customerName: toStr(session.customer_details?.name || meta.name || "Cliente"),
    email: toStr(session.customer_details?.email || ""),
    phone: toStr(session.customer_details?.phone || ""),
    total: Number(session.amount_total || 0) / 100,
    currency: upper(session.currency || "mxn"),
    promoCode: toStr(meta.promo_code),
    discountMXN: normalizeDiscount(meta),
    shippingMXN: Number(meta.shipping_mxn || 0),
    shippingMode: normalizeShippingMode(meta),
    shipping:
      session.shipping_details ||
      normalizeShippingFromMetadata(meta) ||
      {},
    items,
    metadata: meta,
  };

  const siteUrl = getSiteUrl();
  if (!siteUrl) return json(200, { warned: "missing_site_url" });

  try {
    await fetch(`${siteUrl}/.netlify/functions/envia_webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.INTERNAL_WEBHOOK_SECRET
          ? { "x-internal-secret": process.env.INTERNAL_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    await updateNotifyMeta({
      state: notifyState,
      patch: {
        notify_status: "sent",
        notify_err: "",
        notify_ts: nowISO(),
      },
      idempotencyKey: `sent:${stripeEvent.id}`,
    });

    return json(200, { ok: true, delivered: true });
  } catch (e) {
    await updateNotifyMeta({
      state: notifyState,
      patch: {
        notify_status: "error",
        notify_err: toStr(e.message),
        notify_ts: nowISO(),
      },
      idempotencyKey: `err:${stripeEvent.id}`,
    });

    return json(200, { ok: true, delivered: false });
  }
};