// api/health_check.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  initStripe,
  safeStr,
  getEnviaQuote,
  getFallbackShipping,
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

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  const sb = supabaseAdmin();
  const stripe = initStripe();

  const checks = {
    supabase: !!sb,
    stripe: !!stripe,
    envia: !!process.env.ENVIA_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };

  let enviaQuote = null;
  try {
    enviaQuote = await getEnviaQuote({ zip: "22614", country: "MX", items_qty: 1 });
  } catch {
    enviaQuote = getFallbackShipping("MX", 1);
  }

  return send(
    res,
    jsonResponse(200, {
      ok: true,
      checks,
      enviaQuote,
      ts: new Date().toISOString(),
    }, origin)
  );
};