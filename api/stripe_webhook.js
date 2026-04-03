// api/stripe_webhook.js
"use strict";

const crypto = require("crypto");
const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  readRawBody,
  resolveScoreOrgId,
  safeStr,
  sendTelegram,
} = require("./_shared");

const relevantEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.succeeded",
  "charge.refunded",
]);

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2024-06-20";

function nowIso() {
  return new Date().toISOString();
}

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurada");
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

function getSignature(headers) {
  return (
    headers["stripe-signature"] ||
    headers["Stripe-Signature"] ||
    headers["x-stripe-signature"] ||
    ""
  );
}

function normalizePaymentStatus(status) {
  const s = safeStr(status).trim().toLowerCase();
  if (!s) return "unpaid";
  if (["paid", "succeeded", "complete", "completed"].includes(s)) return "paid";
  if (["processing", "pending"].includes(s)) return "pending";
  if (["failed", "canceled", "cancelled", "expired"].includes(s)) return "failed";
  if (["refunded", "partially_refunded"].includes(s)) return "refunded";
  return s;
}

function normalizeOrderStatus(paymentStatus) {
  const s = normalizePaymentStatus(paymentStatus);
  if (s === "paid") return "paid";
  if (s === "refunded") return "refunded";
  if (s === "failed") return "payment_failed";
  if (s === "pending") return "pending_payment";
  return "pending_payment";
}

async function fetchOrderBySession(sb, sessionId) {
  const { data, error } = await sb
    .from("orders")
    .select(
      [
        "id",
        "org_id",
        "organization_id",
        "stripe_session_id",
        "checkout_session_id",
        "stripe_customer_id",
        "stripe_payment_intent_id",
        "payment_intent_id",
        "status",
        "payment_status",
        "amount_total_mxn",
        "amount_total_cents",
        "total_cents",
        "customer_email",
        "customer_name",
        "customer_phone",
        "shipping_mode",
        "shipping_country",
        "shipping_postal_code",
        "tracking_number",
        "carrier",
        "shipment_status",
        "shipping_status",
        "items_summary",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .or(`stripe_session_id.eq.${sessionId},checkout_session_id.eq.${sessionId}`)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data;
}

async function fetchOrderByPaymentIntent(sb, paymentIntentId) {
  const { data, error } = await sb
    .from("orders")
    .select(
      [
        "id",
        "org_id",
        "organization_id",
        "stripe_session_id",
        "checkout_session_id",
        "stripe_customer_id",
        "stripe_payment_intent_id",
        "payment_intent_id",
        "status",
        "payment_status",
        "amount_total_mxn",
        "amount_total_cents",
        "total_cents",
        "customer_email",
        "customer_name",
        "customer_phone",
        "shipping_mode",
        "shipping_country",
        "shipping_postal_code",
        "tracking_number",
        "carrier",
        "shipment_status",
        "shipping_status",
        "items_summary",
        "created_at",
        "updated_at",
      ].join(", ")
    )
    .or(`stripe_payment_intent_id.eq.${paymentIntentId},payment_intent_id.eq.${paymentIntentId}`)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data;
}

async function updateOrderById(sb, orderId, patch) {
  const update = {
    ...patch,
    updated_at: nowIso(),
  };

  const { error } = await sb.from("orders").update(update).eq("id", orderId);
  if (error) throw error;
  return true;
}

function buildSessionPatch(session) {
  const paymentStatus = normalizePaymentStatus(session?.payment_status || "unpaid");
  return {
    stripe_session_id: session?.id || null,
    checkout_session_id: session?.id || null,
    stripe_customer_id: session?.customer || null,
    stripe_payment_intent_id:
      typeof session?.payment_intent === "string"
        ? session.payment_intent
        : session?.payment_intent?.id || null,
    payment_status: paymentStatus,
    status: normalizeOrderStatus(paymentStatus),
    paid_at: paymentStatus === "paid" ? nowIso() : null,
  };
}

function buildPaymentIntentPatch(paymentIntent, nextStatus, extra = {}) {
  const paymentStatus = normalizePaymentStatus(
    extra?.payment_status || paymentIntent?.status || nextStatus || "unpaid"
  );

  return {
    stripe_payment_intent_id: paymentIntent?.id || null,
    payment_status: paymentStatus,
    status: normalizeOrderStatus(paymentStatus || nextStatus),
    paid_at: paymentStatus === "paid" ? nowIso() : null,
    refunded_at: paymentStatus === "refunded" ? nowIso() : null,
    ...extra,
  };
}

async function syncOrderFromSession(sb, session) {
  if (!session?.id) return null;

  const order = await fetchOrderBySession(sb, session.id);
  if (!order?.id) return null;

  const patch = buildSessionPatch(session);
  await updateOrderById(sb, order.id, patch);

  return { orderId: order.id, patch, order };
}

async function syncOrderFromPaymentIntent(sb, paymentIntentId, nextStatus, extra = {}) {
  if (!paymentIntentId) return null;

  const order = await fetchOrderByPaymentIntent(sb, paymentIntentId);
  if (!order?.id) return null;

  const patch = buildPaymentIntentPatch(
    typeof paymentIntentId === "object" ? paymentIntentId : { id: paymentIntentId },
    nextStatus,
    extra
  );

  await updateOrderById(sb, order.id, patch);

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

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "*";

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method !== "POST") {
      return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
    }

    const sig = getSignature(req.headers);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return send(res, jsonResponse(400, { ok: false, error: "Webhook secret not configured" }, origin));
    }

    const rawBody = await readRawBody(req);
    const stripe = getStripeClient();

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

    const orgId = await resolveScoreOrgId(sb).catch(() => "");
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
          const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
          if (piId) {
            await syncOrderFromPaymentIntent(sb, piId, session.payment_status === "paid" ? "paid" : "pending_payment", {
              payment_status: session.payment_status || "unpaid",
              paid_at: session.payment_status === "paid" ? nowIso() : null,
            });
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
          const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
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