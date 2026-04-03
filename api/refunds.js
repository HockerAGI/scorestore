// api/refunds.js
"use strict";

const Stripe = require("stripe");

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  safeStr,
} = require("./_shared");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store";

  res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body || "");
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "*";

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "POST") {
    return send(res, jsonResponse(405, { ok: false }, origin));
  }

  try {
    const body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");

    const paymentIntent = safeStr(body.payment_intent_id);
    const amount = Number(body.amount_cents || 0);

    if (!paymentIntent) {
      return send(res, jsonResponse(400, { ok: false, error: "payment_intent_required" }, origin));
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent,
      amount: amount > 0 ? amount : undefined,
    });

    const sb = supabaseAdmin();

    await sb
      .from("orders")
      .update({
        status: "refunded",
        payment_status: "refunded",
        refunded_at: new Date().toISOString(),
      })
      .eq("stripe_payment_intent_id", paymentIntent);

    return send(res, jsonResponse(200, { ok: true, refund }, origin));
  } catch (e) {
    return send(res, jsonResponse(500, { ok: false, error: "refund_failed" }, origin));
  }
};