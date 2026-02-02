const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.URL ||
  "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// ✅ ENVIA_API_KEY (preferred) or ENVIA_API_TOKEN
const ENVIA_KEY = process.env.ENVIA_API_KEY || process.env.ENVIA_API_TOKEN || "";

// fallback shipping pricing (MXN)
const FALLBACK_MX_PRICE = {
  base: 180, // base shipping
  per_item: 35, // add per extra item
  max: 380, // cap
};

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, X-Chat-Token, X-Webhook-Token, X-Envia-Webhook-Token",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const supabaseAnon =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...HEADERS, ...extraHeaders },
    body: JSON.stringify(data),
  };
}

function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: HEADERS,
      body: "",
    };
  }
  return null;
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function baseUrl(event) {
  const headers = event.headers || {};
  const proto =
    headers["x-forwarded-proto"] ||
    headers["X-Forwarded-Proto"] ||
    "https";
  const host =
    headers["x-forwarded-host"] ||
    headers["X-Forwarded-Host"] ||
    headers.host ||
    headers.Host ||
    "";

  const explicit =
    process.env.SITE_URL ||
    process.env.DEPLOY_PRIME_URL ||
    "";

  if (explicit) return explicit.replace(/\/$/, "");
  if (!host) return "";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function digitsOnly(s) {
  return (s || "").toString().replace(/[^\d]/g, "");
}

function normalizeZip(zip) {
  return digitsOnly(zip).slice(0, 5);
}

function validateZip(zip) {
  const z = normalizeZip(zip);
  return z.length === 5;
}

function fallbackShippingMX(items_qty) {
  const qty = Math.max(1, Number(items_qty || 1));
  const calc = FALLBACK_MX_PRICE.base + (qty - 1) * FALLBACK_MX_PRICE.per_item;
  return Math.min(FALLBACK_MX_PRICE.max, calc);
}

async function getEnviaQuote({ zip, country = "MX", items_qty = 1 }) {
  if (!ENVIA_KEY) {
    return {
      ok: false,
      mode: "fallback",
      amount: fallbackShippingMX(items_qty),
      label: "Envío estándar (fallback)",
      carrier: null,
      raw: null,
      error: "ENVIA_API_KEY missing",
    };
  }

  if (!validateZip(zip)) {
    return {
      ok: false,
      mode: "fallback",
      amount: fallbackShippingMX(items_qty),
      label: "CP inválido (fallback)",
      carrier: null,
      raw: null,
      error: "Invalid ZIP",
    };
  }

  // ⚠️ Envía endpoint can vary by account. Keep it generic & safe.
  // If your existing flow already works, this function is the same idea:
  // - If API fails -> fallback
  try {
    // NOTE: Adjust the endpoint/payload ONLY if your existing envía call differs.
    const url = "https://api.envia.com/ship/rate";
    const payload = {
      origin: { country_code: "MX", postal_code: "22000" },
      destination: { country_code: country, postal_code: normalizeZip(zip) },
      packages: [{ content: "merch", amount: 1, type: "box", weight: 1 }],
      shipment: { carrier: "" },
    };

    const r = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_KEY}`,
      },
      timeout: 15000,
    });

    const data = r.data || {};
    const rates = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    // Pick cheapest valid rate
    const normalized = rates
      .map((x) => ({
        carrier: x?.carrier || x?.carrier_name || x?.provider || null,
        service: x?.service || x?.service_name || null,
        amount: Number(x?.total || x?.amount || x?.price || 0),
        raw: x,
      }))
      .filter((x) => x.amount > 0);

    if (!normalized.length) {
      return {
        ok: false,
        mode: "fallback",
        amount: fallbackShippingMX(items_qty),
        label: "Envío estándar (fallback)",
        carrier: null,
        raw: data,
        error: "No rates",
      };
    }

    normalized.sort((a, b) => a.amount - b.amount);
    const best = normalized[0];

    return {
      ok: true,
      mode: "live",
      amount: Math.round(best.amount),
      label: `${best.carrier || "Paquetería"}${best.service ? " · " + best.service : ""}`,
      carrier: best.carrier,
      raw: best.raw,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "fallback",
      amount: fallbackShippingMX(items_qty),
      label: "Envío estándar (fallback)",
      carrier: null,
      raw: err?.response?.data || null,
      error: err?.message || "Envía error",
    };
  }
}

async function createEnviaLabel({ order, destination }) {
  // This is used by stripe_webhook in your repo.
  // Keep behavior stable: if ENVIA is not configured, return a safe "skip".
  if (!ENVIA_KEY) {
    return {
      ok: false,
      skipped: true,
      error: "ENVIA_API_KEY missing",
      tracking_number: null,
      label_url: null,
      carrier: null,
      raw: null,
    };
  }

  // If you already have a working label flow, KEEP it.
  // This function is conservative and will not break checkout.
  try {
    const url = "https://api.envia.com/ship/generate";
    const payload = {
      order_reference: order?.id || order?.stripe_session_id || "",
      destination: destination || {},
      packages: [{ content: "merch", amount: 1, type: "box", weight: 1 }],
    };

    const r = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_KEY}`,
      },
      timeout: 20000,
    });

    const data = r.data || {};
    const shipment = data?.data || data?.shipment || data;

    return {
      ok: true,
      tracking_number:
        shipment?.tracking_number || shipment?.trackingNumber || null,
      label_url: shipment?.label_url || shipment?.labelUrl || null,
      carrier: shipment?.carrier || shipment?.carrier_name || null,
      raw: shipment,
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err?.message || "Envía label error",
      tracking_number: null,
      label_url: null,
      carrier: null,
      raw: err?.response?.data || null,
    };
  }
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) return { ok: false, skipped: true };

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(
      url,
      { chat_id: chatId, text },
      { timeout: 10000 }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "telegram error" };
  }
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  ENVIA_KEY,
  FALLBACK_MX_PRICE,
  HEADERS,

  supabaseAnon,
  supabaseAdmin,

  jsonResponse,
  handleOptions,
  safeJsonParse,
  baseUrl,

  digitsOnly,
  normalizeZip,
  validateZip,

  fallbackShippingMX,
  getEnviaQuote,
  createEnviaLabel,

  sendTelegram,
};