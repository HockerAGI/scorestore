// api/quote_shipping.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  rateLimit,
  validateZip,
  getEnviaQuote,
  getFallbackShipping,
  itemsQtyFromAny,
  normalizeQty,
  safeStr,
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
  return req?.headers?.origin || req?.headers?.Origin || "";
}

function parseBody(req) {
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

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  const rl = rateLimit(req);
  if (!rl.ok) {
    return send(res, jsonResponse(429, { ok: false, error: "rate_limited" }, origin));
  }

  const body = parseBody(req);
  const zip = safeStr(body.zip || body.postal_code || body.postalCode || req.query?.zip || "").trim();
  const country = safeStr(body.country || req.query?.country || "MX").trim().toUpperCase();
  const itemsQty = itemsQtyFromAny(body.items || body.cart || []);

  const validZip = validateZip(zip, country);
  if (!validZip) {
    return send(res, jsonResponse(400, { ok: false, error: "invalid_zip" }, origin));
  }

  try {
    const quote = await getEnviaQuote({ zip: validZip, country, items_qty: itemsQty || 1 });
    return send(res, jsonResponse(200, { ok: true, provider: quote.provider, quote }, origin));
  } catch {
    const fallback = getFallbackShipping(country, itemsQty || 1);
    return send(res, jsonResponse(200, { ok: true, provider: fallback.provider, quote: fallback }, origin));
  }
};