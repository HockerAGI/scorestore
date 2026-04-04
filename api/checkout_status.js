// api/checkout_status.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  initStripe,
  resolveScoreOrgId,
  safeStr,
} = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

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

function getQuery(req) {
  return req?.query && typeof req.query === "object" ? req.query : {};
}

function normalizeSessionId(req) {
  const q = getQuery(req);
  return safeStr(q.session_id || q.sessionId || q.checkout_session_id || q.checkoutSessionId || "").trim();
}

function normalizePaymentIntentId(req) {
  const q = getQuery(req);
  return safeStr(q.payment_intent || q.paymentIntent || q.payment_intent_id || q.paymentIntentId || "").trim();
}

function normalizeShipMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "pickup_local") return "pickup_local";
  if (m === "envia_us") return "envia_us";
  if (m === "envia_mx") return "envia_mx";
  if (m === "delivery") return "delivery";
  return m || "pickup";
}

function normalizeOrder(row) {
  if (!row) return null;

  const paymentStatus = safeStr(row.payment_status || row.status || "unpaid", "unpaid").toLowerCase();
  const status = safeStr(row.status || "open", "open").toLowerCase();

  return {
    id: safeStr(row.id || row.checkout_session_id || row.stripe_session_id || ""),
    session_id: safeStr(row.checkout_session_id || row.stripe_session_id || row.id || ""),
    stripe_session_id: safeStr(row.stripe_session_id || row.checkout_session_id || row.id || ""),
    payment_status: paymentStatus,
    status,
    customer_name: safeStr(row.customer_name || row.customer_details?.name || ""),
    customer_email: safeStr(row.customer_email || row.customer_details?.email || row.email || ""),
    customer_phone: safeStr(row.customer_phone || row.customer_details?.phone || row.phone || ""),
    shipping_mode: normalizeShipMode(row.shipping_mode || row.shipping_details?.mode || row.delivery_mode),
    shipping_country: safeStr(row.shipping_country || row.shipping_details?.country || "MX"),
    shipping_postal_code: safeStr(row.shipping_postal_code || row.shipping_details?.postal || row.postal_code || ""),
    amount_subtotal_cents: Number(row.amount_subtotal_cents || row.subtotal_cents || 0),
    amount_discount_cents: Number(row.amount_discount_cents || row.discount_cents || 0),
    amount_shipping_cents: Number(row.amount_shipping_cents || row.shipping_cents || 0),
    amount_total_cents: Number(row.amount_total_cents || row.total_cents || 0),
    amount_total_mxn: Number(row.amount_total_mxn || row.amount_total_cents || row.total_cents || 0) / 100,
    currency: safeStr(row.currency || "MXN", "MXN"),
    promo_code: safeStr(row.promo_code || ""),
    items_summary: safeStr(row.items_summary || ""),
    items: Array.isArray(row.items) ? row.items : Array.isArray(row.items_json) ? row.items_json : [],
    shipping_details: row.shipping_details || null,
    customer_details: row.customer_details || null,
    metadata: row.metadata || null,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
  };
}

function buildPayload(order, stripeSession, paymentIntent, charge) {
  const paymentStatus =
    safeStr(
      order?.payment_status ||
        stripeSession?.payment_status ||
        paymentIntent?.status ||
        charge?.status ||
        "unpaid",
      "unpaid"
    ).toLowerCase();

  const status =
    safeStr(
      order?.status ||
        stripeSession?.status ||
        paymentIntent?.status ||
        "open",
      "open"
    ).toLowerCase();

  const shippingDetails =
    order?.shipping_details ||
    stripeSession?.shipping_details ||
    paymentIntent?.shipping ||
    null;

  const customerDetails =
    order?.customer_details ||
    stripeSession?.customer_details ||
    paymentIntent?.charges?.data?.[0]?.billing_details ||
    null;

  const amountTotalCents =
    Number(order?.amount_total_cents || 0) ||
    Number(stripeSession?.amount_total || 0) ||
    Number(paymentIntent?.amount || 0) ||
    Number(charge?.amount || 0) ||
    0;

  const amountSubtotalCents =
    Number(order?.amount_subtotal_cents || 0) ||
    Number(stripeSession?.amount_subtotal || 0) ||
    0;

  const amountShippingCents =
    Number(order?.amount_shipping_cents || 0) ||
    Number(stripeSession?.shipping_cost?.amount_subtotal || 0) ||
    0;

  const amountDiscountCents =
    Number(order?.amount_discount_cents || 0) ||
    Number(stripeSession?.total_details?.amount_discount || 0) ||
    0;

  const shippingMode =
    normalizeShipMode(
      order?.shipping_mode ||
        shippingDetails?.mode ||
        shippingDetails?.shipping_method ||
        stripeSession?.metadata?.shipping_mode
    );

  const sessionId =
    safeStr(
      stripeSession?.id ||
        order?.checkout_session_id ||
        order?.stripe_session_id ||
        paymentIntent?.metadata?.stripe_session_id ||
        ""
    );

  const customerEmail =
    safeStr(
      order?.customer_email ||
        stripeSession?.customer_email ||
        paymentIntent?.receipt_email ||
        paymentIntent?.metadata?.customer_email ||
        customerDetails?.email ||
        ""
    );

  const payload = {
    ok: true,
    id: order?.id || sessionId || paymentIntent?.id || "",
    session_id: sessionId,
    checkout_session_id: sessionId,
    stripe_session_id: safeStr(order?.stripe_session_id || stripeSession?.id || sessionId || ""),
    payment_intent_id: safeStr(
      paymentIntent?.id ||
        stripeSession?.payment_intent?.id ||
        stripeSession?.payment_intent ||
        order?.metadata?.payment_intent_id ||
        ""
    ),
    payment_status: paymentStatus,
    status,
    customer_name:
      safeStr(
        order?.customer_name ||
          customerDetails?.name ||
          paymentIntent?.charges?.data?.[0]?.billing_details?.name ||
          ""
      ),
    customer_email: customerEmail,
    customer_phone:
      safeStr(
        order?.customer_phone ||
          customerDetails?.phone ||
          paymentIntent?.shipping?.phone ||
          ""
      ),
    shipping_mode: shippingMode,
    shipping_country: safeStr(
      order?.shipping_country ||
        shippingDetails?.address?.country ||
        stripeSession?.shipping_details?.address?.country ||
        "MX"
    ),
    shipping_postal_code: safeStr(
      order?.shipping_postal_code ||
        shippingDetails?.address?.postal_code ||
        stripeSession?.shipping_details?.address?.postal_code ||
        ""
    ),
    amount_subtotal_cents: amountSubtotalCents,
    amount_discount_cents: amountDiscountCents,
    amount_shipping_cents: amountShippingCents,
    amount_total_cents: amountTotalCents,
    amount_subtotal_mxn: amountSubtotalCents / 100,
    amount_discount_mxn: amountDiscountCents / 100,
    amount_shipping_mxn: amountShippingCents / 100,
    amount_total_mxn: amountTotalCents / 100,
    currency: safeStr(order?.currency || stripeSession?.currency || "MXN", "MXN"),
    promo_code: safeStr(order?.promo_code || stripeSession?.metadata?.promo_code || ""),
    items_summary: safeStr(order?.items_summary || stripeSession?.metadata?.items_summary || ""),
    items: Array.isArray(order?.items) ? order.items : Array.isArray(order?.items_json) ? order.items_json : [],
    customer_details: customerDetails,
    shipping_details: shippingDetails,
    metadata: order?.metadata || stripeSession?.metadata || paymentIntent?.metadata || {},
    stripe_session: stripeSession || null,
    payment_intent: paymentIntent || null,
    charge: charge || null,
    updated_at: order?.updated_at || null,
    created_at: order?.created_at || null,
  };

  return payload;
}

async function fetchStripeSession(stripe, sessionId) {
  if (!stripe || !sessionId) return null;

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent", "customer", "line_items"],
  });

  return session || null;
}

async function fetchPaymentIntent(stripe, paymentIntentId) {
  if (!stripe || !paymentIntentId) return null;

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["customer", "charges.data.balance_transaction"],
  });

  return intent || null;
}

async function fetchStripeChargeFromIntent(stripe, paymentIntentId) {
  if (!stripe || !paymentIntentId) return null;

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["charges.data.balance_transaction"],
    });

    return intent?.charges?.data?.[0] || null;
  } catch {
    return null;
  }
}

async function fetchOrderBySession(sb, orgId, sessionId) {
  const { data, error } = await sb
    .from("orders")
    .select("*")
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .or(`checkout_session_id.eq.${sessionId},stripe_session_id.eq.${sessionId}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function fetchOrderByPaymentIntent(sb, orgId, paymentIntentId) {
  const { data, error } = await sb
    .from("orders")
    .select("*")
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function maybeSyncOrderFromStripe(sb, order, stripeSession, paymentIntent) {
  if (!order?.id) return;

  const patch = {
    checkout_session_id: stripeSession?.id || order.checkout_session_id || order.stripe_session_id || null,
    stripe_session_id: stripeSession?.id || order.stripe_session_id || order.checkout_session_id || null,
    payment_status:
      safeStr(
        stripeSession?.payment_status ||
          paymentIntent?.status ||
          order.payment_status ||
          "unpaid",
        "unpaid"
      ).toLowerCase(),
    status:
      safeStr(
        stripeSession?.status ||
          paymentIntent?.status ||
          order.status ||
          "open",
        "open"
      ).toLowerCase(),
    customer_email:
      safeStr(
        stripeSession?.customer_email ||
          order.customer_email ||
          paymentIntent?.receipt_email ||
          paymentIntent?.metadata?.customer_email ||
          ""
      ),
    customer_phone:
      safeStr(
        order.customer_phone ||
          stripeSession?.customer_details?.phone ||
          paymentIntent?.shipping?.phone ||
          ""
      ),
    amount_total_cents:
      Number(order.amount_total_cents || 0) ||
      Number(stripeSession?.amount_total || 0) ||
      Number(paymentIntent?.amount || 0) ||
      0,
    amount_subtotal_cents:
      Number(order.amount_subtotal_cents || 0) ||
      Number(stripeSession?.amount_subtotal || 0) ||
      0,
    amount_discount_cents:
      Number(order.amount_discount_cents || 0) ||
      Number(stripeSession?.total_details?.amount_discount || 0) ||
      0,
    amount_shipping_cents:
      Number(order.amount_shipping_cents || 0) ||
      Number(stripeSession?.shipping_cost?.amount_subtotal || 0) ||
      0,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await sb
      .from("orders")
      .update(patch)
      .or(`org_id.eq.${order.org_id || order.organization_id},organization_id.eq.${order.org_id || order.organization_id}`)
      .eq("id", order.id);

    if (error) throw error;
  } catch (e) {
    console.error("[checkout_status] order sync failed:", e?.message || e);
  }
}

async function main(req, res) {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return send(
        res,
        jsonResponse(405, { ok: false, error: "Method not allowed" }, origin)
      );
    }

    const sessionId = normalizeSessionId(req);
    const paymentIntentId = normalizePaymentIntentId(req);

    if (!sessionId && !paymentIntentId) {
      return send(
        res,
        jsonResponse(
          400,
          { ok: false, error: "Falta session_id o payment_intent." },
          origin
        )
      );
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return send(
        res,
        jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin)
      );
    }

    const stripe = initStripe ? initStripe() : null;
    const orgId = (await resolveScoreOrgId?.(sb).catch(() => null)) || DEFAULT_SCORE_ORG_ID;

    let stripeSession = null;
    let paymentIntent = null;
    let charge = null;

    if (sessionId) {
      try {
        stripeSession = await fetchStripeSession(stripe, sessionId);
      } catch (e) {
        console.error("[checkout_status] stripe session error:", e?.message || e);
      }
    }

    if (!stripeSession && paymentIntentId) {
      try {
        paymentIntent = await fetchPaymentIntent(stripe, paymentIntentId);
        charge = await fetchStripeChargeFromIntent(stripe, paymentIntentId);
      } catch (e) {
        console.error("[checkout_status] payment intent error:", e?.message || e);
      }
    }

    if (!stripeSession && !paymentIntent) {
      return send(
        res,
        jsonResponse(
          404,
          { ok: false, error: "No se encontró la sesión en Stripe." },
          origin
        )
      );
    }

    const order =
      (stripeSession &&
        (await fetchOrderBySession(sb, orgId, stripeSession.id).catch(() => null))) ||
      (paymentIntentId &&
        (await fetchOrderByPaymentIntent(sb, orgId, paymentIntentId).catch(() => null))) ||
      null;

    if (order && stripeSession && !paymentIntent) {
      try {
        const pi = stripeSession.payment_intent;
        const piId = typeof pi === "string" ? pi : pi?.id;
        if (piId) {
          paymentIntent = await fetchPaymentIntent(stripe, piId).catch(() => null);
          charge = paymentIntent
            ? await fetchStripeChargeFromIntent(stripe, piId).catch(() => null)
            : null;
        }
      } catch {}
    }

    const payload = buildPayload(order, stripeSession, paymentIntent, charge);

    if (order?.id) {
      await maybeSyncOrderFromStripe(sb, order, stripeSession, paymentIntent);
    }

    return send(res, jsonResponse(200, payload, origin));
  } catch (err) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: err?.message || "No fue posible verificar el estado del checkout.",
        },
        origin
      )
    );
  }
}

module.exports = main;
module.exports.default = main;