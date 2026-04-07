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
  return req?.headers?.origin || req?.headers?.Origin || "*";
}

function getRawBody(req) {
  if (Buffer.isBuffer(req?.body)) return req.body;
  if (typeof req?.body === "string") return Buffer.from(req.body, "utf8");
  if (req?.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(String(req.rawBody));
  return Buffer.from("");
}

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "POST") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  try {
    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "supabase_not_configured" }, origin));
    }

    const orgId = await resolveScoreOrgId(sb);
    const payload = req.body && typeof req.body === "object" ? req.body : JSON.parse(getRawBody(req).toString("utf8") || "{}");
    const eventId = safeStr(payload?.event_id || payload?.id || crypto.randomUUID());

    await sb.from("shipping_webhooks").insert({
      org_id: orgId,
      organization_id: orgId,
      provider: "envia",
      status: safeStr(payload?.status || "received"),
      tracking_number: safeStr(payload?.tracking_number || payload?.trackingNumber || ""),
      stripe_session_id: safeStr(payload?.stripe_session_id || payload?.session_id || ""),
      carrier: safeStr(payload?.carrier || ""),
      raw: payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (typeof sendTelegram === "function") {
      await sendTelegram(`📦 Envía webhook recibido: ${eventId}`);
    }

    return send(res, jsonResponse(200, { ok: true, received: true }, origin));
  } catch (error) {
    console.error("[envia_webhook] error:", error?.message || error);
    return send(res, jsonResponse(500, { ok: false, error: "envia_webhook_failed" }, origin));
  }
};