// api/envia_webhook.js
"use strict";

const crypto = require("crypto");

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  safeStr,
  resolveScoreOrgId,
  sendTelegram,
  readJsonFile,
} = require("./_shared");

const ENVIA_WEBHOOK_SECRET = process.env.ENVIA_WEBHOOK_SECRET || "";
const MAX_WEBHOOK_RAW = 100_000;

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

function getHeader(req, name) {
  const h = req?.headers || {};
  return safeStr(h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || "");
}

function normalizeLower(v) {
  return safeStr(v).trim().toLowerCase();
}

function normalizeStatus(v) {
  return normalizeLower(v);
}

function normalizePaymentStatus(v) {
  return normalizeLower(v);
}

function normalizeOrgId(payload) {
  return safeStr(
    payload?.org_id ||
      payload?.organization_id ||
      payload?.organizationId ||
      payload?.data?.org_id ||
      payload?.data?.organization_id ||
      ""
  ).trim();
}

function normalizeSessionId(payload) {
  return safeStr(
    payload?.stripe_session_id ||
      payload?.session_id ||
      payload?.checkout_session_id ||
      payload?.stripeSessionId ||
      payload?.data?.stripe_session_id ||
      payload?.data?.session_id ||
      payload?.data?.checkout_session_id ||
      ""
  ).trim();
}

function normalizePaymentIntentId(payload) {
  return safeStr(
    payload?.payment_intent_id ||
      payload?.paymentIntentId ||
      payload?.payment_intent ||
      payload?.data?.payment_intent_id ||
      payload?.data?.paymentIntentId ||
      payload?.data?.payment_intent ||
      ""
  ).trim();
}

function normalizeOrderId(payload) {
  return safeStr(
    payload?.order_id ||
      payload?.orderId ||
      payload?.id_order ||
      payload?.data?.order_id ||
      payload?.data?.orderId ||
      ""
  ).trim();
}

function normalizeTrackingNumber(payload) {
  return safeStr(
    payload?.tracking_number ||
      payload?.trackingNumber ||
      payload?.data?.tracking_number ||
      payload?.data?.trackingNumber ||
      ""
  ).trim();
}

function normalizeCarrier(payload) {
  return safeStr(
    payload?.carrier ||
      payload?.data?.carrier ||
      payload?.service_provider ||
      payload?.data?.service_provider ||
      ""
  ).trim();
}

function normalizeService(payload) {
  return safeStr(
    payload?.service ||
      payload?.data?.service ||
      payload?.service_name ||
      payload?.data?.service_name ||
      ""
  ).trim();
}

function normalizeLabelUrl(payload) {
  return safeStr(
    payload?.label_url ||
      payload?.data?.label_url ||
      payload?.labelUrl ||
      payload?.data?.labelUrl ||
      ""
  ).trim();
}

function normalizeEnviaCost(payload) {
  const raw =
    payload?.envia_cost_mxn ??
    payload?.shipping_cost_mxn ??
    payload?.cost_mxn ??
    payload?.data?.envia_cost_mxn ??
    payload?.data?.shipping_cost_mxn ??
    payload?.data?.cost_mxn ??
    null;

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
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

  if (Number.isFinite(Number(enviaCostMaybe))) {
    update.envia_cost_mxn = Math.round(Number(enviaCostMaybe) * 100) / 100;
  }

  return update;
}

async function updateOrder(sb, orderId, patch) {
  if (!orderId) return null;

  const { data, error } = await sb
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function upsertLabel(
  sb,
  payload,
  order,
  { orgId, stripeSessionId },
  rawStatus,
  shipmentBucket,
  carrier,
  trackingNumber,
  enviaCostMaybe
) {
  const now = new Date().toISOString();
  const labelPayload = {
    organization_id: orgId || order?.organization_id || order?.org_id || null,
    org_id: orgId || order?.org_id || order?.organization_id || null,
    order_id: order?.id || null,
    stripe_session_id: stripeSessionId || order?.stripe_session_id || null,
    carrier: carrier || null,
    service: normalizeService(payload) || null,
    tracking_number: trackingNumber || order?.tracking_number || null,
    label_url: normalizeLabelUrl(payload) || null,
    shipment_status: rawStatus || null,
    shipping_status: shipmentBucket || "pending",
    envia_cost_mxn: Number.isFinite(Number(enviaCostMaybe)) ? Math.round(Number(enviaCostMaybe) * 100) / 100 : null,
    status: shipmentBucket || "pending",
    raw: payload && typeof payload === "object" ? payload : { raw: payload },
    updated_at: now,
    created_at: now,
  };

  const { data, error } = await sb
    .from("shipping_labels")
    .upsert(labelPayload, {
      onConflict: "stripe_session_id,tracking_number",
    })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function insertWebhookLog(
  sb,
  payload,
  order,
  { orgId, stripeSessionId },
  rawStatus,
  carrier,
  trackingNumber
) {
  const now = new Date().toISOString();

  const row = {
    organization_id: orgId || order?.organization_id || order?.org_id || null,
    org_id: orgId || order?.org_id || order?.organization_id || null,
    order_id: order?.id || null,
    provider: "envia",
    status: normalizeStatus(rawStatus || "pending"),
    tracking_number: trackingNumber || order?.tracking_number || null,
    stripe_session_id: stripeSessionId || order?.stripe_session_id || null,
    carrier: carrier || null,
    raw: payload && typeof payload === "object" ? payload : { raw: payload },
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await sb.from("shipping_webhooks").insert(row).select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

function verifySignature(rawBody, signature) {
  if (!ENVIA_WEBHOOK_SECRET) return true;
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", ENVIA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function getRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(String(req.rawBody));
  return Buffer.from("");
}

function parsePayload(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = getRawBody(req).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return {
      raw,
    };
  }
}

async function maybeNotifyTelegram(message) {
  if (typeof sendTelegram !== "function") return;
  try {
    await sendTelegram(message);
  } catch {}
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

    const rawBody = getRawBody(req);
    const signature =
      getHeader(req, "x-envia-signature") ||
      getHeader(req, "x-signature") ||
      getHeader(req, "envia-signature");

    if (rawBody.length > MAX_WEBHOOK_RAW) {
      return send(res, jsonResponse(413, { ok: false, error: "Payload demasiado grande" }, origin));
    }

    if (!verifySignature(rawBody, signature)) {
      return send(res, jsonResponse(401, { ok: false, error: "Firma inválida" }, origin));
    }

    const payload = parsePayload(req);

    const rawStatus = normalizeStatus(
      payload?.status ||
        payload?.shipment_status ||
        payload?.shipping_status ||
        payload?.data?.status ||
        payload?.data?.shipment_status ||
        payload?.data?.shipping_status ||
        ""
    );

    const shipmentBucket = bucketStatus(rawStatus);

    const trackingNumber = normalizeTrackingNumber(payload);
    const carrier = normalizeCarrier(payload);
    const stripeSessionId = normalizeSessionId(payload);
    const paymentIntentId = normalizePaymentIntentId(payload);
    const orderId = normalizeOrderId(payload);
    let orgId = normalizeOrgId(payload);

    const enviaCostMaybe = normalizeEnviaCost(payload);

    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin));
    }

    if (!orgId) {
      try {
        orgId = (await resolveScoreOrgId(sb)) || "";
      } catch {
        orgId = "";
      }
    }

    let query = null;

    if (stripeSessionId) {
      query = buildOrderQuery(sb, { stripeSessionId });
    } else if (paymentIntentId) {
      query = buildOrderQuery(sb, { paymentIntentId });
    } else if (trackingNumber) {
      query = buildOrderQuery(sb, { trackingNumber });
    } else if (orderId) {
      query = buildOrderQuery(sb, { orderId });
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

    await insertWebhookLog(
      sb,
      payload,
      order,
      { orgId, stripeSessionId },
      rawStatus,
      carrier,
      trackingNumber
    );

    await maybeNotifyTelegram(
      [
        "📦 <b>Envía webhook</b>",
        `Estado: ${rawStatus || "pending"}`,
        `Bucket: ${shipmentBucket}`,
        `Pedido: ${order.id}`,
        trackingNumber ? `Tracking: ${trackingNumber}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );

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