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

function getBody(req) {
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

function normalizeCountry(value) {
  return String(value || "MX").trim().toUpperCase() || "MX";
}

function normalizeZip(value) {
  return String(value || "").trim();
}

function normalizeItemsQty(body) {
  if (Number.isFinite(Number(body?.items_qty))) {
    return Math.max(1, Math.min(99, Math.floor(Number(body.items_qty))));
  }

  if (Array.isArray(body?.items)) {
    return Math.max(1, Math.min(99, itemsQtyFromAny(normalizeQty(body.items))));
  }

  if (Array.isArray(body?.cart)) {
    return Math.max(1, Math.min(99, itemsQtyFromAny(normalizeQty(body.cart))));
  }

  return 1;
}

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
    }

    const rl = rateLimit(req);
    if (!rl.ok) {
      return send(res, jsonResponse(429, { ok: false, error: "rate_limited" }, origin));
    }

    const body = req.method === "POST" ? getBody(req) : {};
    const query = req.method === "GET" ? (req.query || {}) : {};

    const country = normalizeCountry(
      body.country || body.shipping_country || query.country || query.shipping_country || "MX"
    );

    const zip = normalizeZip(
      body.zip || body.postal_code || body.shipping_postal_code || query.zip || query.postal_code || ""
    );

    if (!zip) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "Falta zip/postal_code." }, origin)
      );
    }

    const validatedZip = validateZip(zip, country);
    if (!validatedZip) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "Código postal inválido." }, origin)
      );
    }

    const itemsQty = normalizeItemsQty(body);
    const preferFallback = String(body.fallback || query.fallback || "").trim() === "1";

    let quote = null;

    if (!preferFallback && typeof getEnviaQuote === "function") {
      try {
        quote = await getEnviaQuote({
          zip: validatedZip,
          country,
          items_qty: itemsQty,
        });
      } catch {
        quote = null;
      }
    }

    if (!quote || !quote.ok) {
      quote = typeof getFallbackShipping === "function"
        ? getFallbackShipping(country, itemsQty)
        : {
            ok: true,
            provider: "fallback",
            label: country === "US" ? "Envío USA (estimado)" : "Envío MX (estimado)",
            country,
            amount_cents: country === "US" ? 85000 : 25000,
            amount_mxn: country === "US" ? 850 : 250,
          };
    }

    const amount_cents = Number(quote.amount_cents || quote.amountCents || 0);
    const amount_mxn = Number(quote.amount_mxn || quote.amountMXN || amount_cents / 100);

    return send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          quote: {
            ok: true,
            provider: safeStr(quote.provider || "envia"),
            label: safeStr(quote.label || ""),
            country,
            zip: validatedZip,
            items_qty: itemsQty,
            amount_cents: Number.isFinite(amount_cents) ? Math.max(0, Math.round(amount_cents)) : 0,
            amount_mxn: Number.isFinite(amount_mxn) ? Math.max(0, amount_mxn) : 0,
            eta: safeStr(quote.eta || ""),
            raw: quote.raw || null,
          },
        },
        origin
      )
    );
  } catch (err) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: err?.message || "No fue posible cotizar el envío.",
        },
        origin
      )
    );
  }
};

module.exports.default = module.exports;