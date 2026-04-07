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
} = require("../lib/_shared");

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
  return req?.headers?.origin || "*";
}

function getHeader(headers, name) {
  const h = headers || {};
  const lower = String(name || "").toLowerCase();
  const upper = String(name || "").toUpperCase();
  return safeStr(h[name] || h[lower] || h[upper] || "");
}

function verifySignature(reqBody, signature, secret) {
  if (!signature || !secret) return false;

  const hash = crypto
    .createHmac("sha256", secret)
    .update(reqBody)
    .digest("hex");

  return hash === signature;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.from("")));
  });
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

    const rawBody = await readRawBody(req);
    const signature = getHeader(req.headers, "x-enviashipping-signature");
    const secret = process.env.ENVIA_WEBHOOK_SECRET || "";

    if (secret && !verifySignature(rawBody, signature, secret)) {
      return send(res, jsonResponse(401, { ok: false, error: "invalid_signature" }, origin));
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (e) {
      return send(res, jsonResponse(400, { ok: false, error: "invalid_json" }, origin));
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "supabase_not_configured" }, origin));
    }

    const orgId = await resolveScoreOrgId(sb);

    const trackingNumber = safeStr(payload?.tracking_number || payload?.tracking || "");
    const status = safeStr(payload?.status || "");

    if (!trackingNumber) {
      return send(res, jsonResponse(200, { ok: true, ignored: true }, origin));
    }

    const { data: orders } = await sb
      .from("orders")
      .select("*")
      .eq("tracking_number", trackingNumber)
      .limit(1);

    const order = Array.isArray(orders) && orders.length ? orders[0] : null;

    if (!order) {
      return send(res, jsonResponse(200, { ok: true, ignored: true }, origin));
    }

    await sb
      .from("orders")
      .update({
        shipping_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await sendTelegram(
      `📦 Envío actualizado\nTracking: ${trackingNumber}\nStatus: ${status}`
    );

    return send(res, jsonResponse(200, { ok: true, received: true }, origin));
  } catch (error) {
    console.error("[envia_webhook] error:", error?.message || error);

    return send(
      res,
      jsonResponse(500, { ok: false, error: "envia_webhook_failed" }, origin)
    );
  }
};

module.exports.default = module.exports;