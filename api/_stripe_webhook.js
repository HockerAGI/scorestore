// api/_stripe_webhook.js
"use strict";

const crypto = require("crypto");
const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  safeStr,
  resolveScoreOrgId,
  sendTelegram,
} = require("../lib/_shared");

const relevantEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.succeeded",
  "charge.refunded",
]);

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";

  res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body || "");
}

function getOrigin(req) {
  return req?.headers?.origin || req?.headers?.Origin || "*";
}

function getHeader(headers, name) {
  const h = headers || {};
  const lower = String(name || "").toLowerCase();
  const upper = String(name || "").toUpperCase();
  return safeStr(h[name] || h[lower] || h[upper] || "");
}

function getSignature(headers) {
  return getHeader(headers, "stripe-signature");
}

function getWebhookSecret() {
  return (
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET ||
    ""
  );
}

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) return null;

  try {
    return new Stripe(key, {
      apiVersion: "2024-06-20",
    });
  } catch (e) {
    console.error("[stripe_webhook] stripe init failed:", e?.message || e);
    return null;
  }
}

async function readRawBody(req) {
  if (!req) return Buffer.from("");

  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(String(req.rawBody));

  if (typeof req.arrayBuffer === "function") {
    const ab = await req.arrayBuffer();
    return Buffer.from(ab);
  }

  return new Promise((resolve) => {
    const chunks = [];
    req.on?.("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on?.("end", () => resolve(Buffer.concat(chunks)));
    req.on?.("error", () => resolve(Buffer.from("")));
  });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeLower(v) {
  return safeStr(v).trim().toLowerCase();
}

function normalizePaymentStatus(v) {
  const s = normalizeLower(v);
  if (!s) return "unpaid";
  if (s === "paid") return "paid";
  if (s === "refunded") return "refunded";
  if (s === "failed") return "failed";
  if (s === "unpaid") return "unpaid";
  if (s === "pending_payment") return "pending_payment";
  if (s === "processing") return "processing";
  if (s === "requires_action") return "requires_action";
  return s;
}

function normalizeOrderStatus(paymentStatus, fallback = "open") {
  const p = normalizePaymentStatus(paymentStatus);
  if (p === "paid") return "paid";
  if (p === "refunded") return "refunded";
  if (p === "failed") return "payment_failed";
  if (p === "pending_payment") return "pending_payment";
  if (p === "requires_action") return "pending_payment";
  if (p === "processing") return "pending_payment";
  if (p === "unpaid") return fallback || "open";
  return fallback || "open";
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  return fallback;
}

function pickAddress(address = {}) {
  const addr = safeJson(address, {});
  return {
    line1: safeStr(addr.line1 || ""),
    line2: safeStr(addr.line2 || ""),
    city: safeStr(addr.city || ""),
    state: safeStr(addr.state || ""),
    country: safeStr(addr.country || ""),
    postal_code: safeStr(addr.postal_code || addr.postalCode || ""),
  };
}

function buildSessionPatch(session) {
  const md = safeJson(session?.metadata, {});
  const shippingDetails = safeJson(session?.shipping_details, {});
  const customerDetails = safeJson(session?.customer_details, {});
  const address = pickAddress(shippingDetails?.address);

  const paymentIntentId =
    typeof session?.payment_intent === "string"
      ? session.payment_intent
      : session?.payment_intent?.id || "";

  const paymentStatus = normalizePaymentStatus(session?.payment_status || "unpaid");
  const orderStatus = normalizeOrderStatus(paymentStatus, safeStr(session?.status || "open"));

  return {
    stripe_session_id: safeStr(session?.id || ""),
    checkout_session_id: safeStr(session?.id || ""),
    stripe_payment_intent_id: safeStr(paymentIntentId || ""),
    status: orderStatus,
    payment_status: paymentStatus,
    paid_at: paymentStatus === "paid" ? nowIso() : null,
    refunded_at: paymentStatus === "refunded" ? nowIso() : null,
    customer_email: safeStr(session?.customer_email || md.customer_email || customerDetails?.email || ""),
    customer_name: safeStr(customerDetails?.name || md.customer_name || ""),
    customer_phone: safeStr(customerDetails?.phone || md.customer_phone || ""),
    shipping_mode: safeStr(md.shipping_mode || md.shippingMode || session?.metadata?.shipping_mode || ""),
    shipping_country: safeStr(address.country || md.shipping_country || ""),
    shipping_postal_code: safeStr(address.postal_code || md.shipping_postal_code || md.shipping_zip || ""),
    amount_subtotal_cents: Math.max(
      0,
      Math.round(Number(session?.amount_subtotal || session?.amount_subtotal_cents || 0))
    ),
    amount_total_cents: Math.max(
      0,
      Math.round(Number(session?.amount_total || session?.amount_total_cents || 0))
    ),
    amount_total_mxn: Math.max(
      0,
      Math.round(Number(session?.amount_total || session?.amount_total_cents || 0)) / 100
    ),
    items_summary: safeStr(md.items_summary || ""),
    shipping_details: shippingDetails,
    customer_details: customerDetails,
    metadata: md,
  };
}

function buildOrderUpdateFromSession(session) {
  const patch = buildSessionPatch(session);
  return {
    ...patch,
    updated_at: nowIso(),
  };
}

function buildPaymentIntentPatch(paymentIntent, nextStatus, extra = {}) {
  const paymentStatus = normalizePaymentStatus(
    extra?.payment_status || paymentIntent?.status || nextStatus || "unpaid"
  );

  return {
    stripe_payment_intent_id: safeStr(paymentIntent?.id || ""),
    payment_status: paymentStatus,
    status: normalizeOrderStatus(paymentStatus, nextStatus),
    paid_at: paymentStatus === "paid" ? nowIso() : extra?.paid_at || null,
    refunded_at: paymentStatus === "refunded" ? nowIso() : extra?.refunded_at || null,
    ...extra,
    updated_at: nowIso(),
  };
}

async function fetchOrderBySession(sb, sessionId) {
  const sid = safeStr(sessionId || "").trim();
  if (!sid) return null;

  const { data, error } = await sb
    .from("orders")
    .select("*")
    .or(`checkout_session_id.eq.${sid},stripe_session_id.eq.${sid}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function fetchOrderByPaymentIntent(sb, paymentIntentId) {
  const pi = safeStr(paymentIntentId || "").trim();
  if (!pi) return null;

  const { data, error } = await sb
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", pi)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function updateOrder(sb, orderId, patch) {
  if (!orderId) return null;

  const { data, error } = await sb
    .from("orders")
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function syncOrderFromSession(sb, session) {
  if (!session?.id) return null;

  const order = await fetchOrderBySession(sb, session.id);
  if (!order?.id) return null;

  const patch = buildOrderUpdateFromSession(session);
  await updateOrder(sb, order.id, patch);

  return { orderId: order.id, patch, order };
}

async function syncOrderFromPaymentIntent(sb, paymentIntentId, nextStatus, extra = {}) {
  const pi = safeStr(paymentIntentId || "").trim();
  if (!pi) return null;

  const order = await fetchOrderByPaymentIntent(sb, pi);
  if (!order?.id) return null;

  const patch = buildPaymentIntentPatch(
    {
      id: pi,
      status: extra?.payment_status || nextStatus || "unpaid",
    },
    nextStatus,
    extra
  );

  await updateOrder(sb, order.id, patch);

  return { orderId: order.id, patch, order };
}

async function attachAudit(sb, orgId, action, entity, entityId, summary, meta = {}) {
  try {
    await sb.from("audit_log").insert({
      organization_id: orgId,
      org_id: orgId,
      actor_email: "stripe-webhook@system",
      actor_user_id: null,
      action,
      entity,
      entity_id: entityId,
      summary,
      before: null,
      after: null,
      meta: {
        source: "api/stripe_webhook",
        ...meta,
      },
      ip: null,
      user_agent: null,
    });
  } catch (e) {
    console.error("[stripe_webhook] audit insert failed:", e?.message || e);
  }
}

async function maybeNotifyTelegram(message) {
  if (typeof sendTelegram !== "function") return;
  try {
    await sendTelegram(message);
  } catch {}
}

async function resolveWebhookOrgId(sb, event) {
  const md = event?.data?.object?.metadata || {};
  const candidates = [
    safeStr(md.org_id || md.organization_id || ""),
    safeStr(md.orgId || ""),
    safeStr(process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID || ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (/^[0-9a-f-]{36}$/i.test(candidate)) return candidate;
  }

  try {
    const orgId = await resolveScoreOrgId(sb);
    if (orgId) return orgId;
  } catch {}

  return "";
}

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method !== "POST") {
      return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
    }

    const sig = getSignature(req.headers);
    const webhookSecret = getWebhookSecret();

    if (!sig || !webhookSecret) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "Webhook secret not configured" }, origin)
      );
    }

    const rawBody = await readRawBody(req);
    const stripe = getStripeClient();

    if (!stripe) {
      return send(res, jsonResponse(500, { ok: false, error: "Stripe not configured" }, origin));
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (error) {
      console.error("[stripe_webhook] signature verification failed:", error?.message || error);
      return send(
        res,
        jsonResponse(400, { ok: false, error: `Webhook Error: ${error.message}` }, origin)
      );
    }

    if (!relevantEvents.has(event.type)) {
      return send(
        res,
        jsonResponse(
          200,
          { ok: true, received: true, ignored: true, reason: "irrelevant_event" },
          origin
        )
      );
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin));
    }

    const orgId = await resolveWebhookOrgId(sb, event);
    const eventId = safeStr(event?.id || crypto.randomUUID());

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const synced = await syncOrderFromSession(sb, session);

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.checkout_session_completed",
          "orders",
          synced?.orderId || safeStr(session?.id || ""),
          "Stripe checkout.session.completed processed",
          {
            event_id: eventId,
            event_type: event.type,
            session_id: safeStr(session?.id || ""),
            payment_status: safeStr(session?.payment_status || "unpaid"),
            order_id: synced?.orderId || null,
          }
        );

        if (session?.payment_intent) {
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id;

          if (piId) {
            await syncOrderFromPaymentIntent(
              sb,
              piId,
              session.payment_status === "paid" ? "paid" : "pending_payment",
              {
                payment_status: session.payment_status || "unpaid",
                paid_at: session.payment_status === "paid" ? nowIso() : null,
              }
            );
          }
        }

        await maybeNotifyTelegram(
          [
            "✅ <b>Stripe webhook</b>",
            `Evento: ${event.type}`,
            `Session: ${safeStr(session?.id || "")}`,
            `Pago: ${safeStr(session?.payment_status || "unpaid")}`,
          ].join("\n")
        );
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const synced = await syncOrderFromSession(sb, session);

        if (session?.payment_intent) {
          const piId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id;

          if (piId) {
            await syncOrderFromPaymentIntent(sb, piId, "paid", {
              payment_status: "paid",
              paid_at: nowIso(),
            });
          }
        }

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.async_payment_succeeded",
          "orders",
          synced?.orderId || safeStr(session?.id || ""),
          "Stripe async payment succeeded processed",
          {
            event_id: eventId,
            event_type: event.type,
            session_id: safeStr(session?.id || ""),
            order_id: synced?.orderId || null,
          }
        );
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        const synced = await syncOrderFromSession(sb, session);

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.async_payment_failed",
          "orders",
          synced?.orderId || safeStr(session?.id || ""),
          "Stripe async payment failed processed",
          {
            event_id: eventId,
            event_type: event.type,
            session_id: safeStr(session?.id || ""),
            order_id: synced?.orderId || null,
          }
        );
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const piId = safeStr(paymentIntent?.id || "");
        const synced = piId
          ? await syncOrderFromPaymentIntent(sb, piId, "paid", {
              payment_status: "paid",
              paid_at: nowIso(),
              stripe_payment_intent_id: piId,
            })
          : null;

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.payment_intent_succeeded",
          "orders",
          synced?.orderId || piId,
          "Stripe payment_intent.succeeded processed",
          {
            event_id: eventId,
            event_type: event.type,
            payment_intent_id: piId,
            order_id: synced?.orderId || null,
          }
        );
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        const piId = safeStr(paymentIntent?.id || "");
        const synced = piId
          ? await syncOrderFromPaymentIntent(sb, piId, "failed", {
              payment_status: "failed",
              stripe_payment_intent_id: piId,
            })
          : null;

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.payment_intent_failed",
          "orders",
          synced?.orderId || piId,
          "Stripe payment_intent.payment_failed processed",
          {
            event_id: eventId,
            event_type: event.type,
            payment_intent_id: piId,
            order_id: synced?.orderId || null,
          }
        );
        break;
      }

      case "charge.succeeded": {
        const charge = event.data.object;
        const piId = safeStr(charge?.payment_intent || "");
        const synced = piId
          ? await syncOrderFromPaymentIntent(sb, piId, "paid", {
              payment_status: "paid",
              paid_at: nowIso(),
              stripe_charge_id: safeStr(charge?.id || ""),
            })
          : null;

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.charge_succeeded",
          "orders",
          synced?.orderId || piId || safeStr(charge?.id || ""),
          "Stripe charge.succeeded processed",
          {
            event_id: eventId,
            event_type: event.type,
            charge_id: safeStr(charge?.id || ""),
            payment_intent: piId || null,
            order_id: synced?.orderId || null,
          }
        );
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const piId = safeStr(charge?.payment_intent || "");
        const synced = piId
          ? await syncOrderFromPaymentIntent(sb, piId, "refunded", {
              payment_status: "refunded",
              refunded_at: nowIso(),
              stripe_charge_id: safeStr(charge?.id || ""),
            })
          : null;

        await attachAudit(
          sb,
          orgId,
          "stripe.webhook.charge_refunded",
          "orders",
          synced?.orderId || piId || safeStr(charge?.id || ""),
          "Stripe charge.refunded processed",
          {
            event_id: eventId,
            event_type: event.type,
            charge_id: safeStr(charge?.id || ""),
            payment_intent: piId || null,
            order_id: synced?.orderId || null,
          }
        );
        break;
      }

      default:
        break;
    }

    return send(res, jsonResponse(200, { ok: true, received: true }, origin));
  } catch (error) {
    console.error("[stripe_webhook] error:", error?.message || error);
    return send(res, jsonResponse(500, { ok: false, error: "stripe_webhook_failed" }, origin));
  }
};

module.exports.default = module.exports;