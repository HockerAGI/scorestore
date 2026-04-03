// api/envia_webhook.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  safeStr,
} = require("./_shared");

const EXPECTED_SECRET =
  process.env.ENVIA_WEBHOOK_SECRET ||
  process.env.ENVIA_SECRET ||
  process.env.ENVIA_API_WEBHOOK_SECRET ||
  "";

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

function getHeader(headers, key) {
  if (!headers) return "";
  return safeStr(headers[key] || headers[String(key).toLowerCase()] || headers[String(key).toUpperCase()] || "");
}

function readBody(req) {
  const body = req?.body;
  if (!body) return {};

  if (typeof body === "object") return body;

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeText(v) {
  return safeStr(v).trim();
}

function normalizeLower(v) {
  return normalizeText(v).toLowerCase();
}

function normalizeTracking(payload) {
  const candidates = [
    payload?.tracking_number,
    payload?.trackingNumber,
    payload?.tracking,
    payload?.data?.tracking_number,
    payload?.data?.trackingNumber,
    payload?.data?.tracking,
  ];

  for (const c of candidates) {
    const s = normalizeText(c);
    if (s) return s;
  }

  return "";
}

function normalizeCarrier(payload) {
  const candidates = [
    payload?.carrier,
    payload?.carrier_name,
    payload?.carrierName,
    payload?.data?.carrier,
    payload?.data?.carrier_name,
  ];

  for (const c of candidates) {
    const s = normalizeText(c);
    if (s) return s;
  }

  return "";
}

function normalizeStatus(payload) {
  const candidates = [
    payload?.status,
    payload?.shipment_status,
    payload?.shipping_status,
    payload?.data?.status,
    payload?.data?.shipment_status,
    payload?.data?.shipping_status,
    payload?.raw_status,
    payload?.rawStatus,
  ];

  for (const c of candidates) {
    const s = normalizeLower(c);
    if (s) return s;
  }

  return "";
}

function normalizeCost(payload) {
  const candidates = [
    payload?.envia_cost_mxn,
    payload?.cost_mxn,
    payload?.shipping_cost_mxn,
    payload?.amount_mxn,
    payload?.data?.envia_cost_mxn,
    payload?.data?.shipping_cost_mxn,
    payload?.data?.cost_mxn,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }

  return NaN;
}

function normalizeSessionId(payload) {
  return normalizeText(
    payload?.stripe_session_id ||
      payload?.session_id ||
      payload?.checkout_session_id ||
      payload?.stripeSessionId ||
      payload?.sessionId ||
      payload?.data?.stripe_session_id ||
      payload?.data?.session_id ||
      ""
  );
}

function normalizePaymentIntentId(payload) {
  return normalizeText(
    payload?.stripe_payment_intent_id ||
      payload?.payment_intent_id ||
      payload?.payment_intent ||
      payload?.paymentIntent ||
      payload?.data?.stripe_payment_intent_id ||
      payload?.data?.payment_intent_id ||
      ""
  );
}

function normalizeOrderId(payload) {
  return normalizeText(
    payload?.order_id ||
      payload?.orderId ||
      payload?.id_order ||
      payload?.data?.order_id ||
      payload?.data?.orderId ||
      ""
  );
}

function normalizeOrgId(payload) {
  return normalizeText(
    payload?.org_id ||
      payload?.organization_id ||
      payload?.organizationId ||
      payload?.data?.org_id ||
      payload?.data?.organization_id ||
      ""
  );
}

function bucketStatus(rawStatus) {
  const s = normalizeLower(rawStatus);
  if (!s) return "pending";

  if (
    [
      "delivered",
      "delivery_success",
      "completed",
      "complete",
      "entregado",
      "entregada",
      "fulfilled",
      "delivered_successfully",
    ].includes(s)
  ) {
    return "delivered";
  }

  if (
    [
      "in_transit",
      "transit",
      "shipped",
      "picked_up",
      "pickup",
      "on_route",
      "en_route",
      "on the way",
      "en tránsito",
      "en_transito",
    ].includes(s)
  ) {
    return "in_transit";
  }

  if (
    [
      "issue",
      "problem",
      "error",
      "exception",
      "failed",
      "cancelled",
      "canceled",
      "returned",
      "lost",
      "held",
      "blocked",
      "delay",
      "delayed",
    ].includes(s)
  ) {
    return "issue";
  }

  if (
    [
      "pending",
      "created",
      "label_created",
      "ready",
      "processing",
      "preparing",
    ].includes(s)
  ) {
    return "pending";
  }

  return s;
}

function buildOrderQuery(sb, keys) {
  const orderSelect = "id,status,org_id,organization_id,tracking_number,stripe_session_id,stripe_payment_intent_id,updated_at";

  if (keys.stripeSessionId) {
    return sb
      .from("orders")
      .select(orderSelect)
      .or(`stripe_session_id.eq.${keys.stripeSessionId},checkout_session_id.eq.${keys.stripeSessionId}`)
      .limit(1)
      .maybeSingle();
  }

  if (keys.paymentIntentId) {
    return sb
      .from("orders")
      .select(orderSelect)
      .or(`stripe_payment_intent_id.eq.${keys.paymentIntentId},payment_intent_id.eq.${keys.paymentIntentId}`)
      .limit(1)
      .maybeSingle();
  }

  if (keys.trackingNumber) {
    return sb
      .from("orders")
      .select(orderSelect)
      .eq("tracking_number", keys.trackingNumber)
      .limit(1)
      .maybeSingle();
  }

  if (keys.orderId) {
    return sb
      .from("orders")
      .select(orderSelect)
      .eq("id", keys.orderId)
      .limit(1)
      .maybeSingle();
  }

  return null;
}

function buildOrderUpdate({ rawStatus, shipmentBucket, trackingNumber, carrier, orgId, enviaCostMaybe }) {
  const now = new Date().toISOString();
  const update = {
    updated_at: now,
    shipment_status: rawStatus || null,
    shipping_status: shipmentBucket || "pending",
    tracking_number: trackingNumber || null,
    carrier: carrier || null,
  };

  if (orgId) {
    update.org_id = orgId;
    update.organization_id = orgId;
  }

  if (Number.isFinite(enviaCostMaybe)) {
    update.envia_cost_mxn = enviaCostMaybe;
  }

  if (shipmentBucket === "delivered") {
    update.status = "fulfilled";
    update.fulfilled_at = now;
    update.shipped_at = now;
  } else if (shipmentBucket === "in_transit") {
    update.shipped_at = now;
    if (!["fulfilled", "refunded", "cancelled"].includes(normalizeLower(update.status || ""))) {
      update.status = "paid";
    }
  } else if (shipmentBucket === "issue") {
    if (!["refunded", "cancelled"].includes(normalizeLower(update.status || ""))) {
      update.status = "paid";
    }
  } else if (shipmentBucket === "pending") {
    if (!update.status) update.status = "pending";
  }

  return update;
}

async function updateOrder(sb, orderId, update) {
  const { error } = await sb.from("orders").update(update).eq("id", orderId);
  if (error) throw error;
}

async function upsertLabel(sb, payload, order, keys, rawStatus, shipmentBucket, carrier, trackingNumber, enviaCostMaybe) {
  if (!trackingNumber) return;

  await sb
    .from("shipping_labels")
    .upsert(
      {
        org_id: keys.orgId || null,
        organization_id: keys.orgId || null,
        order_id: order.id,
        stripe_session_id: keys.stripeSessionId || null,
        carrier: carrier || null,
        tracking_number: trackingNumber,
        shipment_status: rawStatus || null,
        shipping_status: shipmentBucket,
        envia_cost_mxn: Number.isFinite(enviaCostMaybe) ? enviaCostMaybe : null,
        status: shipmentBucket === "delivered" ? "delivered" : shipmentBucket || "pending",
        raw: payload || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tracking_number" }
    )
    .catch(() => {});
}

async function insertWebhookLog(sb, payload, order, keys, rawStatus, carrier, trackingNumber) {
  await sb
    .from("shipping_webhooks")
    .insert([
      {
        org_id: keys.orgId || null,
        organization_id: keys.orgId || null,
        order_id: order.id,
        provider: "envia",
        status: rawStatus || null,
        tracking_number: trackingNumber || null,
        stripe_session_id: keys.stripeSessionId || null,
        carrier: carrier || null,
        raw: payload || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])
    .catch(() => {});
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

    const receivedSecret = getHeader(req.headers, "x-envia-secret") || getHeader(req.headers, "x-webhook-secret");
    if (EXPECTED_SECRET && receivedSecret !== EXPECTED_SECRET) {
      return send(res, jsonResponse(403, { ok: false, error: "Forbidden" }, origin));
    }

    const payload = readBody(req);

    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin));
    }

    const trackingNumber = normalizeTracking(payload);
    const carrier = normalizeCarrier(payload);
    const rawStatus = normalizeStatus(payload);
    const shipmentBucket = bucketStatus(rawStatus);
    const enviaCostMaybe = normalizeCost(payload);

    const stripeSessionId = normalizeSessionId(payload);
    const paymentIntentId = normalizePaymentIntentId(payload);
    const orderId = normalizeOrderId(payload);
    const orgId = normalizeOrgId(payload);

    let query = null;

    if (stripeSessionId) {
      query = sb
        .from("orders")
        .select("id,status,org_id,organization_id,tracking_number,stripe_session_id,stripe_payment_intent_id")
        .eq("stripe_session_id", stripeSessionId)
        .limit(1)
        .maybeSingle();
    } else if (paymentIntentId) {
      query = sb
        .from("orders")
        .select("id,status,org_id,organization_id,tracking_number,stripe_session_id,stripe_payment_intent_id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .limit(1)
        .maybeSingle();
    } else if (trackingNumber) {
      query = sb
        .from("orders")
        .select("id,status,org_id,organization_id,tracking_number,stripe_session_id,stripe_payment_intent_id")
        .eq("tracking_number", trackingNumber)
        .limit(1)
        .maybeSingle();
    } else if (orderId) {
      query = sb
        .from("orders")
        .select("id,status,org_id,organization_id,tracking_number,stripe_session_id,stripe_payment_intent_id")
        .eq("id", orderId)
        .limit(1)
        .maybeSingle();
    }

    if (!query) {
      return send(
        res,
        jsonResponse(200, { ok: true, ignored: true, reason: "no_match_keys" }, origin)
      );
    }

    const { data: order, error: orderErr } = await query;
    if (orderErr || !order?.id) {
      return send(
        res,
        jsonResponse(200, { ok: true, ignored: true, reason: "order_not_found" }, origin)
      );
    }

    const update = buildOrderUpdate({
      rawStatus,
      shipmentBucket,
      trackingNumber,
      carrier,
      orgId,
      enviaCostMaybe,
    });

    const currentStatus = normalizeLower(order?.status);
    if (shipmentBucket === "delivered") {
      update.status = "fulfilled";
      update.fulfilled_at = new Date().toISOString();
      update.shipped_at = new Date().toISOString();
    } else if (shipmentBucket === "in_transit") {
      if (currentStatus !== "fulfilled") {
        update.status = currentStatus === "paid" ? "paid" : currentStatus || "paid";
      }
      update.shipped_at = new Date().toISOString();
    } else if (shipmentBucket === "issue") {
      if (currentStatus !== "refunded" && currentStatus !== "cancelled") {
        update.status = currentStatus || "paid";
      }
    }

    await updateOrder(sb, order.id, update);

    await upsertLabel(
      sb,
      payload,
      order,
      { orgId, stripeSessionId },
      rawStatus,
      shipmentBucket,
      carrier,
      trackingNumber,
      enviaCostMaybe
    );

    await insertWebhookLog(sb, payload, order, { orgId, stripeSessionId }, rawStatus, carrier, trackingNumber);

    return send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          updated: true,
          order_id: order.id,
          shipment_status: rawStatus,
          shipping_status: shipmentBucket,
        },
        origin
      )
    );
  } catch (e) {
    console.error("[envia_webhook] error:", e?.message || e);
    return send(res, jsonResponse(500, { ok: false, error: "envia_webhook_failed" }, origin));
  }
};