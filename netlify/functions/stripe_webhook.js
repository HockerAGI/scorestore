// netlify/functions/stripe_webhook.js
// BLINDADO: firma Stripe + idempotencia persistente en metadata (sin DB)
// Dispara envia_webhook con payload completo.

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
  const url = toStr(process.env.URL_SCORE || process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL);
  return url ? url.replace(/\/+$/, "") : "";
}

function getRawBody(event) {
  if (!event?.body) return Buffer.from("");
  return event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
}

function nowISO() {
  return new Date().toISOString();
}

function minutesAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

async function fetchWithTimeout(url, options = {}, ms = 9000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event) => {
  const stripeKey = toStr(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = toStr(process.env.STRIPE_WEBHOOK_SECRET);

  if (!stripeKey) return json(500, { ok: false, error: "Falta STRIPE_SECRET_KEY" });
  if (!webhookSecret) return json(500, { ok: false, error: "Falta STRIPE_WEBHOOK_SECRET" });

  const stripe = require("stripe")(stripeKey);

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!sig) return json(400, { ok: false, error: "Falta stripe-signature" });

  let stripeEvent;
  try {
    const raw = getRawBody(event);
    stripeEvent = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const allowed = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]);

  if (!allowed.has(stripeEvent.type)) {
    return json(200, { received: true, ignored: stripeEvent.type });
  }

  const sessionLite = stripeEvent.data.object;

  // sesión completa (con customer_details)
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionLite.id, { expand: ["customer_details"] });
  } catch {
    session = sessionLite;
  }

  // ---- Idempotencia persistente (PI si existe) ----
  async function getNotifyState() {
    const piId = toStr(session?.payment_intent);
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        return { kind: "payment_intent", id: piId, meta: pi.metadata || {}, obj: pi };
      } catch {}
    }
    return { kind: "session", id: session.id, meta: session.metadata || {}, obj: session };
  }

  async function updateNotifyMeta(state, patch, idempotencyKey) {
    const metadata = {};
    for (const [k, v] of Object.entries(patch || {})) metadata[k] = toStr(v);

    try {
      if (state.kind === "payment_intent") {
        await stripe.paymentIntents.update(state.id, { metadata }, { idempotencyKey });
        return true;
      }
      await stripe.checkout.sessions.update(state.id, { metadata }, { idempotencyKey });
      return true;
    } catch (e) {
      console.error("updateNotifyMeta error:", e.message);
      return false;
    }
  }

  function shouldSkip(meta) {
    const status = toStr(meta.notify_status);
    if (status === "sent") return { skip: true, reason: "already_sent" };

    if (status === "processing") {
      const ts = toStr(meta.notify_ts);
      const mins = minutesAgo(ts);
      if (mins < 12) return { skip: true, reason: "processing_recent" };
    }
    return { skip: false, reason: "" };
  }

  const notifyState = await getNotifyState();
  const skip = shouldSkip(notifyState.meta || {});
  if (skip.skip) return json(200, { ok: true, skipped: skip.reason });

  // lock
  const lockOk = await updateNotifyMeta(
    notifyState,
    {
      notify_status: "processing",
      notify_event_id: stripeEvent.id,
      notify_ts: nowISO(),
      notify_err: "",
    },
    `notify-lock:${stripeEvent.id}`
  );

  if (!lockOk) return json(200, { ok: true, warned: "lock_failed" });

  // line items reales
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

  const m = session?.metadata || {};
  const payload = {
    eventId: stripeEvent.id,
    orderId: session.id,

    customerName: toStr(session?.customer_details?.name) || "Cliente",
    email: toStr(session?.customer_details?.email) || "",
    phone: toStr(session?.customer_details?.phone) || "",

    total: Number(session?.amount_total || 0) / 100,
    currency: upper(session?.currency || "mxn"),

    promoCode: toStr(m.promo_code),
    discountMXN: Number(m.discount_mxn || 0),
    shippingMXN: Number(m.shipping_mxn || 0),
    shippingMode: toStr(m.shipping_mode),

    // Envia hints
    shipCarrier: toStr(m.ship_carrier || ""),
    shipServiceCode: toStr(m.ship_service_code || ""),
    shipLabel: toStr(m.ship_label || ""),
    shipDays: Number(m.ship_days || 7),

    items: await listLineItems(session.id),
    shipping: session.shipping_details || {},
    metadata: m,

    // Facturación manual: se capturó vía custom_fields (Stripe lo muestra en dashboard).
    // Aquí dejamos instrucciones para el cliente.
    invoiceEmail: "ventas.unicotextil@gmail.com",
  };

  const siteUrl = getSiteUrl();
  if (!siteUrl) {
    await updateNotifyMeta(
      notifyState,
      { notify_status: "error", notify_err: "missing_site_url", notify_ts: nowISO() },
      `notify-err:${stripeEvent.id}`
    );
    return json(200, { ok: true, warned: "missing_site_url" });
  }

  try {
    const r = await fetchWithTimeout(`${siteUrl}/.netlify/functions/envia_webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      const errMsg = `envia_webhook_non_ok:${r.status}:${t.slice(0, 180)}`;

      await updateNotifyMeta(
        notifyState,
        { notify_status: "error", notify_err: errMsg, notify_ts: nowISO() },
        `notify-err:${stripeEvent.id}`
      );
      return json(200, { ok: true, delivered: false, error: errMsg });
    }

    await updateNotifyMeta(
      notifyState,
      { notify_status: "sent", notify_err: "", notify_ts: nowISO() },
      `notify-sent:${stripeEvent.id}`
    );
    return json(200, { ok: true, delivered: true });
  } catch (e) {
    const errMsg = `fetch_fail:${toStr(e.message).slice(0, 180)}`;
    await updateNotifyMeta(
      notifyState,
      { notify_status: "error", notify_err: errMsg, notify_ts: nowISO() },
      `notify-err:${stripeEvent.id}`
    );
    return json(200, { ok: true, delivered: false, error: errMsg });
  }
};