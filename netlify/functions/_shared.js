/* =========================================================
   SCORE STORE / UnicOs — SHARED HELPERS (PROD) v2026.02.16
   Netlify Functions helpers (Stripe, Envia.com, Supabase, Gemini)
   ========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// ---- ENV ----
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ENVIA_KEY = process.env.ENVIA_API_KEY || process.env.ENVIA_API_TOKEN || "";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.SCORE_STORE_ORG_ID ||
  "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const FACTORY_ORIGIN = {
  name: process.env.ENVIA_ORIGIN_NAME || "Unico Uniformes",
  phone: process.env.ENVIA_ORIGIN_PHONE || "+52 664 000 0000",
  email: process.env.ENVIA_ORIGIN_EMAIL || "ventas@unico-uniformes.com",
  address1: process.env.ENVIA_ORIGIN_ADDRESS1 || "Tijuana, B.C.",
  city: process.env.ENVIA_ORIGIN_CITY || "Tijuana",
  state: process.env.ENVIA_ORIGIN_STATE || "BC",
  country: process.env.ENVIA_ORIGIN_COUNTRY || "MX",
  postal_code: process.env.ENVIA_ORIGIN_POSTAL || "22000",
};

const FALLBACK_MX_PRICE = { base: 180, per_item: 35, max: 380 };
const FALLBACK_US_PRICE = { base: 800, per_item: 90, max: 1600 };

// ---- CORS / headers ----
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, x-org-id",
};

function isSupabaseConfigured() {
  return !!SUPABASE_URL && (!!SUPABASE_SERVICE_ROLE_KEY || !!SUPABASE_ANON);
}

function isEnviaConfigured() {
  return !!ENVIA_KEY;
}

// ---- Supabase clients ----
const supabase =
  SUPABASE_URL && SUPABASE_ANON
    ? createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
    : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// ---- org_id (UnicOs multi-tenant) ----
function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

function getOrgIdFromEvent(event, fallback = DEFAULT_ORG_ID) {
  const qp = event?.queryStringParameters || {};
  const headers = event?.headers || {};
  const fromHeader =
    headers["x-org-id"] || headers["X-Org-Id"] || headers["X-ORG-ID"] || "";
  const candidate = qp.org_id || qp.orgId || qp.org || fromHeader || "";
  const v = String(candidate || "").trim();
  return isUuid(v) ? v : fallback;
}

// ---- response helpers ----
function jsonResponse(statusCode, obj) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(obj || {}) };
}

// Backward compatible:
// - handleOptions() => always returns 204
// - handleOptions(event) => returns 204 only if OPTIONS, else null
function handleOptions(event) {
  if (event && event.httpMethod && event.httpMethod !== "OPTIONS") return null;
  return { statusCode: 204, headers: HEADERS, body: "" };
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

async function readRawBody(event) {
  const b = event?.body || "";
  if (!b) return Buffer.from("");
  if (event?.isBase64Encoded) return Buffer.from(b, "base64");
  return Buffer.from(b, "utf8");
}

// ---- URL helpers ----
function baseUrl(event) {
  const proto = String(event?.headers?.["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();
  const host = String(event?.headers?.host || "").trim();
  return `${proto}://${host}`;
}

function encodeUrl(base, p) {
  const b = String(base || "").replace(/\/+$/, "");
  const s = String(p || "").replace(/^\/+/, "");
  return `${b}/${encodeURI(s)}`;
}

function readJson(relPath) {
  const file = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// ---- zip / qty ----
function normalizeZip(zip) {
  return String(zip || "").replace(/\D+/g, "").slice(0, 10);
}

function validateZip(zip) {
  const z = normalizeZip(zip);
  return z.length >= 4;
}

function normalizeQty(qty) {
  const n = Math.floor(Number(qty) || 0);
  if (n < 1) return 1;
  if (n > 99) return 99;
  return n;
}

function itemsQtyFromAny(itemsOrQty) {
  if (Array.isArray(itemsOrQty)) {
    return itemsOrQty.reduce((sum, it) => sum + normalizeQty(it?.qty || 1), 0);
  }
  return normalizeQty(itemsOrQty || 1);
}

// ---- Shipping fallback ----
function getFallbackShipping(country, items_qty) {
  const qty = normalizeQty(items_qty);
  const isUS = String(country || "MX").toUpperCase() === "US";
  const p = isUS ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
  const mxn = Math.min(p.max, p.base + p.per_item * Math.max(0, qty - 1));
  return {
    ok: true,
    provider: "fallback",
    country: isUS ? "US" : "MX",
    items_qty: qty,
    amount_mxn: mxn,
    label: "Standard",
    carrier: null,
    raw: null,
  };
}

function getPackageSpecs(items_qty) {
  const qty = normalizeQty(items_qty);
  if (qty <= 1) return { weight: 1.0, length: 30, width: 25, height: 6 };
  if (qty <= 3) return { weight: 2.4, length: 40, width: 30, height: 10 };
  if (qty <= 6) return { weight: 4.5, length: 45, width: 35, height: 14 };
  return { weight: 7.5, length: 55, width: 40, height: 20 };
}

// ---- Envia quote ----
async function getEnviaQuote({ zip, country = "MX", items_qty }) {
  const z = normalizeZip(zip);
  const cc = String(country || "MX").toUpperCase();
  const qty = normalizeQty(items_qty || 1);

  if (!ENVIA_KEY || !validateZip(z)) return getFallbackShipping(cc, qty);

  try {
    const pkg = getPackageSpecs(qty);
    const url = "https://api.envia.com/ship/rate/";

    const payload = {
      origin: {
        name: FACTORY_ORIGIN.name,
        phone: FACTORY_ORIGIN.phone,
        email: FACTORY_ORIGIN.email,
        address1: FACTORY_ORIGIN.address1,
        city: FACTORY_ORIGIN.city,
        state: FACTORY_ORIGIN.state,
        country: FACTORY_ORIGIN.country,
        postal_code: FACTORY_ORIGIN.postal_code,
      },
      destination: {
        name: "Customer",
        address1: "N/A",
        city: cc === "US" ? "San Diego" : "Tijuana",
        state: cc === "US" ? "CA" : "BC",
        country: cc,
        postal_code: z,
        phone: "+1 000 000 0000",
        email: "customer@example.com",
      },
      packages: [
        {
          content: "merch",
          amount: 1,
          type: "box",
          weight: pkg.weight,
          length: pkg.length,
          width: pkg.width,
          height: pkg.height,
        },
      ],
    };

    const r = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_KEY}`,
      },
      timeout: 20000,
    });

    const data = r.data || {};
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    if (!list.length) return getFallbackShipping(cc, qty);

    const sorted = list
      .map((x) => ({
        raw: x,
        price: Number(x?.totalPrice || x?.total_price || x?.price || x?.amount || 0) || 0,
        carrier: x?.carrier || x?.carrier_name || x?.provider || null,
        service: x?.service || x?.service_name || x?.name || null,
      }))
      .filter((x) => x.price > 0)
      .sort((a, b) => a.price - b.price);

    const best = sorted[0];
    if (!best) return getFallbackShipping(cc, qty);

    return {
      ok: true,
      provider: "envia",
      country: cc,
      items_qty: qty,
      amount_mxn: best.price,
      label: best.service || "Standard",
      carrier: best.carrier,
      raw: best.raw,
    };
  } catch (err) {
    console.error("[envia quote]", err?.message || err);
    return getFallbackShipping(cc, qty);
  }
}

// ---- Envia label ----
function normalizeDestination(dest) {
  const d = dest || {};
  const address1 =
    d.address1 || [d.street, d.number].filter(Boolean).join(" ").trim() || "";

  return {
    name: d.name || "Customer",
    company: d.company || "",
    email: d.email || "",
    phone: d.phone || "",
    address1,
    address2: d.address2 || d.district || "",
    city: d.city || "",
    state: d.state || "",
    country_code: (d.country_code || d.country || "MX").toUpperCase(),
    postal_code: normalizeZip(d.postal_code || d.zip || ""),
    reference: d.reference || "",
  };
}

function isDestinationComplete(dest) {
  const d = normalizeDestination(dest);
  return [
    d.postal_code,
    d.address1,
    d.city,
    d.state,
    d.country_code,
    d.name,
    d.phone,
  ].every(Boolean);
}

async function createEnviaLabel({ order, stripe_session_id, destination, meta }) {
  if (!ENVIA_KEY) return { ok: false, skipped: true, error: "ENVIA_API_KEY missing" };

  const dest = normalizeDestination(destination);
  if (!isDestinationComplete(dest)) {
    return { ok: false, skipped: true, error: "Destination incomplete" };
  }

  try {
    const qty = Number(order?.items_qty || meta?.items_qty || 1) || 1;
    const pkg = getPackageSpecs(qty);
    const url = "https://api.envia.com/ship/generate/";

    const reference = order?.id || order?.stripe_session_id || stripe_session_id || "";

    const payload = {
      order_reference: String(reference || "").slice(0, 60),
      origin: {
        name: FACTORY_ORIGIN.name,
        phone: FACTORY_ORIGIN.phone,
        email: FACTORY_ORIGIN.email,
        address1: FACTORY_ORIGIN.address1,
        city: FACTORY_ORIGIN.city,
        state: FACTORY_ORIGIN.state,
        country: FACTORY_ORIGIN.country,
        postal_code: FACTORY_ORIGIN.postal_code,
      },
      destination: {
        name: dest.name,
        company: dest.company,
        email: dest.email,
        phone: dest.phone,
        address1: dest.address1,
        address2: dest.address2,
        city: dest.city,
        state: dest.state,
        country: dest.country_code,
        postal_code: dest.postal_code,
        reference: dest.reference,
      },
      packages: [
        {
          content: "merch",
          amount: 1,
          type: "box",
          weight: pkg.weight,
          length: pkg.length,
          width: pkg.width,
          height: pkg.height,
        },
      ],
    };

    const r = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENVIA_KEY}` },
      timeout: 20000,
    });

    const data = r.data || {};
    const shipment = data?.data || data?.shipment || data;

    return {
      ok: true,
      tracking_number: shipment?.tracking_number || shipment?.trackingNumber || null,
      label_url: shipment?.label_url || shipment?.labelUrl || null,
      carrier: shipment?.carrier || shipment?.carrier_name || null,
      raw: shipment,
    };
  } catch (err) {
    return { ok: false, error: err?.message || "Envio label error", raw: err?.response?.data || null };
  }
}

// ---- Gemini (Google AI Studio) ----
async function geminiChat({ message, systemInstruction, model } = {}) {
  if (!GEMINI_API_KEY) return { ok: false, error: "GEMINI_API_KEY missing" };

  const m = String(model || GEMINI_MODEL || "").trim() || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    m
  )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: String(message || "").slice(0, 8000) }],
      },
    ],
    generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: String(systemInstruction).slice(0, 8000) }],
    };
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data?.error?.message || `Gemini error (${r.status})` };

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join("\n") || "";

    return { ok: true, text: String(text || "").trim(), raw: data };
  } catch (err) {
    return { ok: false, error: err?.message || "Gemini request failed" };
  }
}

// ---- Telegram notify ----
async function sendTelegram(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  if (!token || !chatId) return { ok: false, skipped: true };

  const text = typeof payload === "string" ? payload : String(payload?.text || "");
  const parse_mode = typeof payload === "object" ? payload?.parse_mode : undefined;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const r = await axios.post(
      url,
      {
        chat_id: chatId,
        text: String(text || "").slice(0, 3900),
        ...(parse_mode ? { parse_mode } : {}),
        disable_web_page_preview: true,
      },
      { timeout: 12000 }
    );
    return { ok: true, raw: r.data };
  } catch (e) {
    console.error("[telegram]", e?.message || e);
    return { ok: false, error: e?.message || "telegram error" };
  }
}

module.exports = {
  HEADERS,

  SUPABASE_URL,
  SUPABASE_ANON,
  supabase,
  supabaseAdmin,

  DEFAULT_ORG_ID,
  getOrgIdFromEvent,
  isUuid,

  ENVIA_KEY,
  isEnviaConfigured,

  FACTORY_ORIGIN,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,

  isSupabaseConfigured,

  jsonResponse,
  handleOptions,
  safeJsonParse,
  readRawBody,

  baseUrl,
  encodeUrl,
  readJson,

  normalizeZip,
  validateZip,
  normalizeQty,
  itemsQtyFromAny,

  getFallbackShipping,
  getEnviaQuote,
  createEnviaLabel,

  geminiChat,
  sendTelegram,
};
