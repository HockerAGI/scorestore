// netlify/functions/_shared.js
const axios = require("axios");

// --------- Shipping fallbacks (MXN) ----------
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

// --------- Responses ----------
function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

function safeJsonParse(body) {
  try {
    if (!body) return {};
    if (typeof body === "object") return body;
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function normalizeQty(n) {
  const q = Number(n || 0);
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.round(q)));
}

function digitsOnly(s) {
  return String(s || "").replace(/\D+/g, "");
}

function baseUrl(event) {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL;
  if (envUrl) return envUrl;

  const host =
    event?.headers?.["x-forwarded-host"] ||
    event?.headers?.host ||
    "localhost:8888";

  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

// --------- ZIP validation (Geocodes API) ----------
async function validateZip(countryCode, zip) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return { ok: true, source: "no_key" }; // si no hay key, no bloqueamos

  const cc = String(countryCode || "MX").toUpperCase();
  const z = digitsOnly(zip);
  if (!z || z.length < 4) return { ok: false, error: "ZIP_INVALID" };

  try {
    const url = `https://geocodes.envia.com/zipcode/${cc}/${z}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 12000,
    });

    // Si responde, lo consideramos válido.
    // (La estructura exacta depende del país, pero “no error” = válido)
    return { ok: true, source: "geocodes", data: res?.data || null };
  } catch (e) {
    // Si geocodes falla por ZIP no válido, normalmente llega error http.
    return { ok: false, error: "ZIP_NOT_FOUND" };
  }
}

// --------- ORIGEN (para cotizar) ----------
const FACTORY_ORIGIN = {
  postal_code: "22614",
  country_code: "MX",
};

// --------- Envia quote (Shipping API) ----------
// Firma flexible: (zip, qty, countryCode, weightKg?, lengthCm?, heightCm?, widthCm?)
async function getEnviaQuote(zip, itemsQty, countryCode = "MX", weightKg, lengthCm, heightCm, widthCm) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  const qty = normalizeQty(itemsQty);
  const destinationZip = digitsOnly(zip);
  const cc = String(countryCode || "MX").toUpperCase();

  if (!destinationZip || destinationZip.length < 4) return null;

  // Defaults “seguros” por ítem (promedio)
  const perItemWeight = Number(weightKg) > 0 ? Number(weightKg) / Math.max(1, qty) : 0.5;
  const totalWeight = Math.max(0.5, perItemWeight * qty);

  const L = Number(lengthCm) > 0 ? Number(lengthCm) : 30;
  const W = Number(widthCm) > 0 ? Number(widthCm) : 25;
  const H = Number(heightCm) > 0 ? Number(heightCm) : Math.min(30, 5 + (qty * 2));

  try {
    const url = "https://api.envia.com/ship/rate/";
    const headers = { Authorization: `Bearer ${apiKey}` };

    const payload = {
      origin: { postal_code: FACTORY_ORIGIN.postal_code, country_code: "MX" },
      destination: {
        postal_code: String(destinationZip),
        country_code: cc,
      },
      packages: [
        {
          content: "Merch",
          amount: qty,
          type: "box",
          weight: Number(totalWeight.toFixed(2)),
          insurance: 0,
          declared_value: 0,
          weight_unit: "KG",
          length_unit: "CM",
          dimensions: { length: L, width: W, height: H },
        },
      ],
    };

    const res = await axios.post(url, payload, { headers, timeout: 15000 });

    const rates = res?.data?.data || res?.data || [];
    const arr = Array.isArray(rates) ? rates : [];
    if (!arr.length) return null;

    const mapped = arr
      .map((r) => {
        const amount =
          Number(r?.totalPrice) ||
          Number(r?.total_price) ||
          Number(r?.price) ||
          Number(r?.amount) ||
          0;

        const days =
          Number(r?.deliveryTime) ||
          Number(r?.delivery_time) ||
          Number(r?.days) ||
          null;

        return { amount, days, raw: r };
      })
      .filter((x) => Number.isFinite(x.amount) && x.amount > 0)
      .sort((a, b) => a.amount - b.amount);

    if (!mapped.length) return null;

    return {
      mxn: mapped[0].amount,
      days: mapped[0].days,
      raw: mapped[0].raw,
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  digitsOnly,
  baseUrl,

  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,

  validateZip,
  getEnviaQuote,
};