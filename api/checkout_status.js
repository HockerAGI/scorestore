// api/checkout_status.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  initStripe,
  resolveScoreOrgId,
  safeStr,
} = require("../lib/_shared");

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

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  try {
    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "supabase_not_configured" }, origin));
    }

    const sessionId = normalizeSessionId(req);
    if (!sessionId) {
      return send(res, jsonResponse(400, { ok: false, error: "missing_session_id" }, origin));
    }

    const stripe = initStripe();
    let stripeSession = null;
    if (stripe) {
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
      } catch {}
    }

    const { data: order } = await sb
      .from("orders")
      .select("*")
      .or(`checkout_session_id.eq.${sessionId},stripe_session_id.eq.${sessionId}`)
      .limit(1)
      .maybeSingle();

    const data = {
      ok: true,
      session_id: sessionId,
      order: order || null,
      stripe_session: stripeSession || null,
      org_id: order?.org_id || order?.organization_id || null,
      payment_status: order?.payment_status || stripeSession?.payment_status || "unknown",
      status: order?.status || stripeSession?.status || "unknown",
    };

    return send(res, jsonResponse(200, data, origin));
  } catch (error) {
    console.error("[checkout_status] error:", error?.message || error);
    return send(res, jsonResponse(500, { ok: false, error: "checkout_status_failed" }, origin));
  }
};