// api/promos.js
"use strict";

const { jsonResponse, handleOptions, readJsonFile } = require("./_shared");

const DEFAULT_PROMOS = {
  rules: [
    {
      code: "SCORE25",
      type: "percent",
      value: 0.25,
      description: "25% OFF por Inauguración",
      active: true,
      min_amount_mxn: 1000,
      expires_at: "2026-12-31T23:59:59Z",
    },
    {
      code: "BAJA25",
      type: "percent",
      value: 0.25,
      description: "25% OFF Cupón Baja",
      active: true,
      min_amount_mxn: 0,
      expires_at: "2026-12-31T23:59:59Z",
    },
    {
      code: "SCORE10",
      type: "percent",
      value: 0.1,
      description: "10% OFF Fans",
      active: true,
      min_amount_mxn: 500,
      expires_at: "2027-01-01T00:00:00Z",
    },
    {
      code: "BAJA200",
      type: "fixed_mxn",
      value: 200,
      description: "$200 MXN OFF en tu carrito",
      active: true,
      min_amount_mxn: 1500,
      expires_at: null,
    },
    {
      code: "ENVIOFREE",
      type: "free_shipping",
      value: 0,
      description: "Envío Gratis a todo México",
      active: true,
      min_amount_mxn: 2000,
      expires_at: null,
    },
  ],
};

const withNoStore = (resp) => {
  const out = resp || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";
  return out;
};

const send = (res, resp) => {
  const out = withNoStore(resp);
  if (out.headers) {
    Object.keys(out.headers).forEach((key) => res.setHeader(key, out.headers[key]));
  }
  res.status(out.statusCode || 200).send(out.body);
};

const cleanCode = (v) => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
const moneyToCents = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isExpired = (promo) => {
  const expires = parseDate(promo?.expires_at);
  if (!expires) return false;
  return expires.getTime() < Date.now();
};

const normalizeRule = (rule) => {
  if (!rule || typeof rule !== "object") return null;

  const code = cleanCode(rule.code);
  if (!code) return null;

  const type = String(rule.type || "").trim().toLowerCase();
  const value = Number(rule.value || 0);
  const minAmount = Number(rule.min_amount_mxn || 0);
  const active = rule.active == null ? true : !!rule.active;
  const expiresAt = rule.expires_at || null;

  return {
    code,
    type,
    value: Number.isFinite(value) ? value : 0,
    description: String(rule.description || "").trim(),
    active,
    min_amount_mxn: Number.isFinite(minAmount) ? minAmount : 0,
    expires_at: expiresAt,
  };
};

const loadPromos = () => {
  try {
    const json = readJsonFile ? readJsonFile("data/promos.json") : null;
    const source = json && typeof json === "object" ? json : DEFAULT_PROMOS;
    const rules = Array.isArray(source.rules)
      ? source.rules
      : Array.isArray(source.promos)
        ? source.promos
        : [];

    const normalized = rules.map(normalizeRule).filter(Boolean);
    return { rules: normalized };
  } catch {
    return { rules: [] };
  }
};

const computeValidity = (promo, subtotalMxn) => {
  if (!promo) {
    return { valid: false, reason: "NOT_FOUND" };
  }

  if (!promo.active) {
    return { valid: false, reason: "INACTIVE" };
  }

  if (isExpired(promo)) {
    return { valid: false, reason: "EXPIRED" };
  }

  const subtotal = Number(subtotalMxn || 0);
  if (subtotal < Number(promo.min_amount_mxn || 0)) {
    return { valid: false, reason: "MIN_AMOUNT" };
  }

  return { valid: true, reason: "OK" };
};

const computePromo = (promo, subtotalCents) => {
  if (!promo) return { promo: null, discount_cents: 0, free_shipping: false };
  if (!promo.active) return { promo: null, discount_cents: 0, free_shipping: false };
  if (isExpired(promo)) return { promo: null, discount_cents: 0, free_shipping: false };

  if (subtotalCents < moneyToCents(promo.min_amount_mxn || 0)) {
    return { promo: null, discount_cents: 0, free_shipping: false };
  }

  const type = String(promo.type || "").toLowerCase();

  if (["free_shipping", "freeshipping"].includes(type)) {
    return { promo, discount_cents: 0, free_shipping: true };
  }

  if (["percent", "percentage", "percent_off"].includes(type)) {
    const raw = Number(promo.value || 0);
    const rate = raw > 1 ? raw / 100 : raw;
    const discount = Math.round(subtotalCents * (Number.isFinite(rate) ? rate : 0));
    return {
      promo,
      discount_cents: Math.max(0, Math.min(subtotalCents, discount)),
      free_shipping: false,
    };
  }

  if (["fixed", "fixed_mxn", "fixed_off"].includes(type)) {
    const discount = moneyToCents(promo.value || 0);
    return {
      promo,
      discount_cents: Math.max(0, Math.min(subtotalCents, discount)),
      free_shipping: false,
    };
  }

  return { promo: null, discount_cents: 0, free_shipping: false };
};

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "*";

  if (req.method === "OPTIONS") {
    const optionsRes = handleOptions?.({ headers: { origin } }) || {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };

    return send(res, optionsRes);
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  const promos = loadPromos();
  const code = cleanCode(req.query?.code || req.query?.coupon || req.query?.promo || "");
  const subtotalMxn = Number(req.query?.subtotal_mxn || req.query?.amount_mxn || 0);
  const subtotalCents = moneyToCents(subtotalMxn);

  if (!code) {
    return send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          rules: promos.rules,
          count: promos.rules.length,
        },
        origin
      )
    );
  }

  const promo = promos.rules.find((r) => cleanCode(r.code) === code) || null;
  const verdict = computeValidity(promo, subtotalMxn);
  const promoMath = verdict.valid ? computePromo(promo, subtotalCents) : { promo: null, discount_cents: 0, free_shipping: false };

  return send(
    res,
    jsonResponse(
      200,
      {
        ok: true,
        valid: verdict.valid,
        reason: verdict.reason,
        promo: verdict.valid ? promoMath.promo : null,
        discount_cents: promoMath.discount_cents,
        free_shipping: promoMath.free_shipping,
        rules: promos.rules,
        count: promos.rules.length,
      },
      origin
    )
  );
};