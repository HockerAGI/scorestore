// api/checkout_status.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  initStripe,
  safeStr,
  resolveScoreOrgId,
  getBaseUrl,
} = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = noStoreHeaders["Cache-Control"];
  out.headers["Pragma"] = noStoreHeaders.Pragma;
  out.headers["Expires"] = noStoreHeaders.Expires;

  res.statusCode = out.statusCode || 200;
  for (const [key, value] of Object.entries(out.headers)) {
    res.setHeader(key, value);
  }
  res.end(out.body || "");
}

function getQueryValue(req, key) {
  try {
    if (req?.query && typeof req.query === "object" && key in req.query) {
      const v = req.query[key];
      if (Array.isArray(v)) return safeStr(v[0] || "");
      return safeStr(v || "");
    }
  } catch {}

  try {
    const url = new URL(req.url, "http://localhost");
    return safeStr(url.searchParams.get(key) || "");
  } catch {
    return "";
  }
}

function normalizeSessionId(req) {
  return (
    getQueryValue(req, "session_id") ||
    getQueryValue(req, "checkout_session_id") ||
    getQueryValue(req, "sid") ||
    ""
  ).trim();
}

function normalizePaymentIntentId(req) {
  return (
    getQueryValue(req, "payment_intent") ||
    getQueryValue(req, "paymentIntent") ||
    getQueryValue(req, "pi") ||
    ""
  ).trim();
}

function money(cents) {
  const n = Number(cents || 0);
  return Number.isFinite(n) ? Math.max(0, n) / 100 : 0;
}

function upper(v, d = "MXN") {
  return String(v || d).trim().toUpperCase() || d;
}

function lower(v, d = "") {
  return String(v || d).trim().toLowerCase() || d;
}

function normalizeShippingMode(mode) {
  const m = lower(mode, "");
  if (["pickup", "recoger", "pickup_store", "store_pickup"].includes(m)) return "pickup";
  if (["delivery", "envia_mx", "envia_us", "shipping", "ship"].includes(m)) return "delivery";
  return m || "pickup";
}

function normalizePaymentStatus(status) {
  const s = lower(status, "");
  if (["paid", "succeeded", "complete", "completed"].includes(s)) return "paid";
  if (["unpaid", "open", "requires_payment_method"].includes(s)) return "unpaid";
  if (["processing", "pending"].includes(s)) return "processing";
  if (["failed", "canceled", "cancelled", "expired"].includes(s)) return "failed";
  return s || "unpaid";
}

function normalizeOrderStatus(status) {
  const s = lower(status, "");
  if (["paid", "fulfilled", "refunded", "cancelled", "pending_payment", "payment_failed"].includes(s)) {
    return s;
  }
  if (["open", "unpaid", "processing", "pending"].includes(s)) return "pending_payment";
  return s || "pending_payment";
}

function parseCustomerName(session) {
  return (
    safeStr(session?.customer_details?.name) ||
    safeStr(session?.shipping_details?.name) ||
    safeStr(session?.metadata?.customer_name) ||
    "Cliente Final"
  ).trim();
}

function parseCustomerEmail(session) {
  return (
    safeStr(session?.customer_details?.email) ||
    safeStr(session?.customer_email) ||
    safeStr(session?.metadata?.customer_email) ||
    ""
  ).trim().toLowerCase();
}

function parseCustomerPhone(session) {
  return (
    safeStr(session?.customer_details?.phone) ||
    safeStr(session?.metadata?.customer_phone) ||
    ""
  ).trim();
}

function parseShippingMode(session) {
  return normalizeShippingMode(
    session?.metadata?.shipping_mode ||
      session?.metadata?.ship_mode ||
      session?.shipping_mode ||
      session?.shipping_details?.mode ||
      session?.shipping_details?.shipping_mode ||
      "pickup"
  );
}

function parseShippingCountry(session) {
  return upper(
    session?.shipping_details?.address?.country ||
      session?.customer_details?.address?.country ||
      session?.metadata?.shipping_country ||
      "MX"
  );
}

function parseShippingPostal(session) {
  return (
    safeStr(
      session?.shipping_details?.address?.postal_code ||
        session?.customer_details?.address?.postal_code ||
        session?.metadata?.shipping_postal_code ||
        ""
    ).trim()
  );
}

function parseLineItemsSummary(session) {
  const metaSummary = safeStr(session?.metadata?.items_summary || "").trim();
  if (metaSummary) return metaSummary;

  const items = Array.isArray(session?.line_items?.data) ? session.line_items.data : [];
  const summary = items
    .map((it) => `${Number(it?.quantity || 1)}x ${safeStr(it?.description || it?.price?.nickname || "Producto")}`)
    .join(" | ");

  return summary.slice(0, 500);
}

async function getStripe() {
  const stripe = initStripe();
  if (!stripe) throw new Error("Stripe no está disponible");
  return stripe;
}

async function fetchStripeSession(stripe, sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: [
      "payment_intent",
      "payment_intent.latest_charge",
      "payment_intent.latest_charge.balance_transaction",
      "shipping_cost",
      "customer_details",
    ],
  });
}

async function fetchPaymentIntent(stripe, paymentIntentId) {
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge", "latest_charge.balance_transaction"],
  });
}

async function fetchStripeChargeFromIntent(stripe, paymentIntentId) {
  const pi = await fetchPaymentIntent(stripe, paymentIntentId);
  const latestCharge = pi?.latest_charge;
  if (!latestCharge) return null;
  if (typeof latestCharge === "object") return latestCharge;

  return stripe.charges.retrieve(String(latestCharge), {
    expand: ["balance_transaction"],
  });
}

async function fetchOrderBySession(sb, orgId, sessionId) {
  const baseSelect = `
    id,
    org_id,
    organization_id,
    stripe_session_id,
    checkout_session_id,
    stripe_payment_intent_id,
    payment_intent_id,
    status,
    payment_status,
    amount_total_cents,
    amount_subtotal_cents,
    amount_shipping_cents,
    amount_discount_cents,
    total_cents,
    subtotal_cents,
    shipping_cents,
    discount_cents,
    amount_total_mxn,
    amount_subtotal_mxn,
    amount_shipping_mxn,
    amount_discount_mxn,
    customer_email,
    customer_name,
    customer_phone,
    shipping_mode,
    shipping_country,
    shipping_postal_code,
    shipping_details,
    customer_details,
    items_json,
    items_summary,
    tracking_number,
    carrier,
    shipment_status,
    shipping_status,
    created_at,
    updated_at
  `;

  const bySession = await sb
    .from("orders")
    .select(baseSelect)
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .or(`stripe_session_id.eq.${sessionId},checkout_session_id.eq.${sessionId}`)
    .limit(1)
    .maybeSingle();

  if (!bySession?.error && bySession?.data?.id) return bySession.data;

  const byStripeSession = await sb
    .from("orders")
    .select(baseSelect)
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .eq("stripe_session_id", sessionId)
    .limit(1)
    .maybeSingle();

  if (!byStripeSession?.error && byStripeSession?.data?.id) return byStripeSession.data;

  const byCheckoutSession = await sb
    .from("orders")
    .select(baseSelect)
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .eq("checkout_session_id", sessionId)
    .limit(1)
    .maybeSingle();

  if (!byCheckoutSession?.error && byCheckoutSession?.data?.id) return byCheckoutSession.data;

  return null;
}

async function fetchOrderByPaymentIntent(sb, orgId, paymentIntentId) {
  const baseSelect = `
    id,
    org_id,
    organization_id,
    stripe_session_id,
    checkout_session_id,
    stripe_payment_intent_id,
    payment_intent_id,
    status,
    payment_status,
    amount_total_cents,
    amount_subtotal_cents,
    amount_shipping_cents,
    amount_discount_cents,
    total_cents,
    subtotal_cents,
    shipping_cents,
    discount_cents,
    amount_total_mxn,
    amount_subtotal_mxn,
    amount_shipping_mxn,
    amount_discount_mxn,
    customer_email,
    customer_name,
    customer_phone,
    shipping_mode,
    shipping_country,
    shipping_postal_code,
    shipping_details,
    customer_details,
    items_json,
    items_summary,
    tracking_number,
    carrier,
    shipment_status,
    shipping_status,
    created_at,
    updated_at
  `;

  const byIntent = await sb
    .from("orders")
    .select(baseSelect)
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .or(`stripe_payment_intent_id.eq.${paymentIntentId},payment_intent_id.eq.${paymentIntentId}`)
    .limit(1)
    .maybeSingle();

  if (!byIntent?.error && byIntent?.data?.id) return byIntent.data;

  return null;
}

function normalizeOrderRow(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id || null,
    org_id: row.org_id || row.organization_id || null,
    organization_id: row.organization_id || row.org_id || null,
    stripe_session_id: safeStr(row.stripe_session_id || row.checkout_session_id || ""),
    checkout_session_id: safeStr(row.checkout_session_id || row.stripe_session_id || ""),
    stripe_payment_intent_id: safeStr(row.stripe_payment_intent_id || row.payment_intent_id || ""),
    payment_intent_id: safeStr(row.payment_intent_id || row.stripe_payment_intent_id || ""),
    status: normalizeOrderStatus(row.status || "pending_payment"),
    payment_status: normalizePaymentStatus(row.payment_status || "unpaid"),
    amount_total_cents:
      Number(row.amount_total_cents || row.total_cents || 0) ||
      Number(row.total_cents || 0) ||
      0,
    amount_subtotal_cents:
      Number(row.amount_subtotal_cents || row.subtotal_cents || 0) ||
      0,
    amount_shipping_cents:
      Number(row.amount_shipping_cents || row.shipping_cents || 0) ||
      0,
    amount_discount_cents:
      Number(row.amount_discount_cents || row.discount_cents || 0) ||
      0,
    amount_total_mxn: Number(row.amount_total_mxn || row.total_mxn || money(row.amount_total_cents || row.total_cents || 0)) || 0,
    amount_subtotal_mxn: Number(row.amount_subtotal_mxn || row.subtotal_mxn || money(row.amount_subtotal_cents || row.subtotal_cents || 0)) || 0,
    amount_shipping_mxn: Number(row.amount_shipping_mxn || row.shipping_mxn || money(row.amount_shipping_cents || row.shipping_cents || 0)) || 0,
    amount_discount_mxn: Number(row.amount_discount_mxn || row.discount_mxn || money(row.amount_discount_cents || row.discount_cents || 0)) || 0,
    customer_name: safeStr(row.customer_name || ""),
    customer_email: safeStr(row.customer_email || ""),
    customer_phone: safeStr(row.customer_phone || ""),
    shipping_mode: normalizeShippingMode(row.shipping_mode || "pickup"),
    shipping_country: upper(row.shipping_country || "MX"),
    shipping_postal_code: safeStr(row.shipping_postal_code || ""),
    shipping_details: row.shipping_details || null,
    customer_details: row.customer_details || null,
    items_json: row.items_json || null,
    items_summary: safeStr(row.items_summary || ""),
    tracking_number: safeStr(row.tracking_number || ""),
    carrier: safeStr(row.carrier || ""),
    shipment_status: safeStr(row.shipment_status || ""),
    shipping_status: safeStr(row.shipping_status || ""),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeStripeSession(session) {
  if (!session || typeof session !== "object") return null;

  const amountSubtotal = Number(session.amount_subtotal || 0) || 0;
  const amountTotal = Number(session.amount_total || 0) || 0;
  const shippingMode = parseShippingMode(session);

  return {
    ok: true,
    source: "stripe",
    session_id: safeStr(session.id || ""),
    status: safeStr(session.status || "open", "open"),
    payment_status: normalizePaymentStatus(session.payment_status || "unpaid"),
    currency: upper(session.currency || "mxn"),
    amount_subtotal_cents: amountSubtotal,
    amount_total_cents: amountTotal,
    amount_subtotal_mxn: money(amountSubtotal),
    amount_total_mxn: money(amountTotal),
    customer_email: parseCustomerEmail(session),
    customer_name: parseCustomerName(session),
    customer_phone: parseCustomerPhone(session),
    shipping_mode: shippingMode,
    shipping_country: parseShippingCountry(session),
    shipping_postal_code: parseShippingPostal(session),
    items_summary: parseLineItemsSummary(session),
    shipping_details: session.shipping_details || null,
    customer_details: session.customer_details || null,
    metadata: session.metadata || {},
  };
}

function buildPayload(order, stripeSession, paymentIntent, charge) {
  const mergedOrder = normalizeOrderRow(order);
  const stripe = normalizeStripeSession(stripeSession);

  const paymentStatus = normalizePaymentStatus(
    stripe?.payment_status ||
      paymentIntent?.status ||
      mergedOrder?.payment_status ||
      "unpaid"
  );

  const orderStatus = normalizeOrderStatus(
    mergedOrder?.status ||
      (paymentStatus === "paid" ? "paid" : paymentStatus === "processing" ? "pending_payment" : "pending_payment")
  );

  const amountTotalCents =
    stripe?.amount_total_cents ||
    mergedOrder?.amount_total_cents ||
    mergedOrder?.total_cents ||
    0;

  const amountSubtotalCents =
    stripe?.amount_subtotal_cents ||
    mergedOrder?.amount_subtotal_cents ||
    mergedOrder?.subtotal_cents ||
    0;

  const shippingCents =
    mergedOrder?.amount_shipping_cents ||
    mergedOrder?.shipping_cents ||
    0;

  const discountCents =
    mergedOrder?.amount_discount_cents ||
    mergedOrder?.discount_cents ||
    0;

  const stripePaymentIntentId =
    safeStr(paymentIntent?.id || stripeSession?.payment_intent?.id || stripeSession?.payment_intent || mergedOrder?.stripe_payment_intent_id || "");

  const shipmentStatus =
    safeStr(
      mergedOrder?.shipment_status ||
        mergedOrder?.shipping_status ||
        stripeSession?.metadata?.shipping_status ||
        "",
      ""
    );

  return {
    ok: true,
    source: "checkout_status",
    order_id: mergedOrder?.id || null,
    session_id: stripe?.session_id || stripeSession?.id || mergedOrder?.stripe_session_id || mergedOrder?.checkout_session_id || "",
    stripe_payment_intent_id: stripePaymentIntentId || null,
    status: orderStatus,
    payment_status: paymentStatus,
    currency: upper(stripeSession?.currency || "mxn"),
    amount_subtotal_cents: amountSubtotalCents,
    amount_total_cents: amountTotalCents,
    amount_shipping_cents: shippingCents,
    amount_discount_cents: discountCents,
    amount_subtotal_mxn: money(amountSubtotalCents),
    amount_total_mxn: money(amountTotalCents),
    amount_shipping_mxn: money(shippingCents),
    amount_discount_mxn: money(discountCents),
    customer_email:
      stripe?.customer_email ||
      mergedOrder?.customer_email ||
      parseCustomerEmail(stripeSession),
    customer_name:
      stripe?.customer_name ||
      mergedOrder?.customer_name ||
      parseCustomerName(stripeSession),
    customer_phone:
      stripe?.customer_phone ||
      mergedOrder?.customer_phone ||
      parseCustomerPhone(stripeSession),
    shipping_mode:
      normalizeShippingMode(
        mergedOrder?.shipping_mode ||
          stripe?.shipping_mode ||
          stripeSession?.metadata?.shipping_mode ||
          "pickup"
      ),
    shipping_country:
      upper(
        mergedOrder?.shipping_country ||
          stripe?.shipping_country ||
          stripeSession?.metadata?.shipping_country ||
          "MX"
      ),
    shipping_postal_code:
      safeStr(
        mergedOrder?.shipping_postal_code ||
          stripe?.shipping_postal_code ||
          stripeSession?.metadata?.shipping_postal_code ||
          ""
      ).trim(),
    shipping_status: shipmentStatus || null,
    shipment_status: shipmentStatus || null,
    tracking_number: safeStr(mergedOrder?.tracking_number || ""),
    carrier: safeStr(mergedOrder?.carrier || ""),
    items_summary:
      mergedOrder?.items_summary ||
      stripe?.items_summary ||
      parseLineItemsSummary(stripeSession),
    customer_details: mergedOrder?.customer_details || stripe?.customer_details || null,
    shipping_details: mergedOrder?.shipping_details || stripe?.shipping_details || null,
    payment_intent: paymentIntent || null,
    charge: charge || null,
    updated_at: new Date().toISOString(),
  };
}

async function maybeSyncOrder(sb, orgId, payload) {
  try {
    if (!payload?.order_id) return;

    const patch = {
      status: payload.status,
      payment_status: payload.payment_status,
      amount_total_cents: payload.amount_total_cents,
      amount_subtotal_cents: payload.amount_subtotal_cents,
      amount_shipping_cents: payload.amount_shipping_cents,
      amount_discount_cents: payload.amount_discount_cents,
      amount_total_mxn: payload.amount_total_mxn,
      amount_subtotal_mxn: payload.amount_subtotal_mxn,
      amount_shipping_mxn: payload.amount_shipping_mxn,
      amount_discount_mxn: payload.amount_discount_mxn,
      customer_email: payload.customer_email,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      shipping_mode: payload.shipping_mode,
      shipping_country: payload.shipping_country,
      shipping_postal_code: payload.shipping_postal_code,
      shipping_status: payload.shipping_status,
      shipment_status: payload.shipment_status,
      updated_at: payload.updated_at,
    };

    if (payload.stripe_payment_intent_id) {
      patch.stripe_payment_intent_id = payload.stripe_payment_intent_id;
    }

    await sb
      .from("orders")
      .update(patch)
      .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
      .eq("id", payload.order_id);
  } catch (e) {
    console.error("[checkout_status] order sync failed:", e?.message || e);
  }
}

async function main(req, res) {
  const origin = req?.headers?.origin || "*";

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

    const stripe = initStripe();
    const orgId = await resolveScoreOrgId(sb).catch(() => DEFAULT_SCORE_ORG_ID);

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
      (stripeSession && (await fetchOrderBySession(sb, orgId, stripeSession.id).catch(() => null))) ||
      (paymentIntentId && (await fetchOrderByPaymentIntent(sb, orgId, paymentIntentId).catch(() => null))) ||
      null;

    if (order && stripeSession && !paymentIntent) {
      try {
        const pi = stripeSession.payment_intent;
        const piId = typeof pi === "string" ? pi : pi?.id;
        if (piId) {
          paymentIntent = await fetchPaymentIntent(stripe, piId).catch(() => null);
          charge = paymentIntent ? await fetchStripeChargeFromIntent(stripe, piId).catch(() => null) : null;
        }
      } catch {}
    }

    const payload = buildPayload(order, stripeSession, paymentIntent, charge);

    if (order?.id) {
      await maybe