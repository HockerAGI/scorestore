"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let Stripe = null;
try {
  Stripe = require("stripe");
} catch {}

let createClient = null;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch {}

const { rateLimit } = require("./_rate_limit.js");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const VERCEL_PROD_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://scorestore.vercel.app";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "ventas.unicotextil@gmail.com";
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "6642368701";
const SUPPORT_WHATSAPP_E164 = process.env.SUPPORT_WHATSAPP_E164 || "5216642368701";
const SUPPORT_WHATSAPP_DISPLAY = process.env.SUPPORT_WHATSAPP_DISPLAY || "664 236 8701";

function safeStr(v, d = "") {
  return typeof v === "string" ? v : v == null ? d : String(v);
}

function safeJsonParse(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function clampInt(v, min, max, fallback = min) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampText(v, max = 1800) {
  return safeStr(v).trim().slice(0, max);
}

function normalizeLower(v) {
  return safeStr(v).trim().toLowerCase();
}

function normalizeQty(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      sku: safeStr(it?.sku || it?.id || it?.slug || "").trim(),
      qty: clampInt(it?.qty || it?.quantity || 1, 1, 99, 1),
      size: safeStr(it?.size || "").trim(),
      priceCents: Number.isFinite(Number(it?.priceCents))
        ? Math.max(0, Math.round(Number(it.priceCents)))
        : Number.isFinite(Number(it?.price_cents))
          ? Math.max(0, Math.round(Number(it.price_cents)))
          : 0,
      title: safeStr(it?.title || it?.name || "").trim(),
    }))
    .filter((it) => it.sku || it.title);
}

function itemsQtyFromAny(items) {
  return normalizeQty(items).reduce((sum, it) => sum + clampInt(it.qty, 1, 99, 1), 0);
}

function getBaseUrl(req = {}) {
  const headers = req?.headers || {};
  const proto = safeStr(headers["x-forwarded-proto"] || "https");
  const host = safeStr(headers["x-forwarded-host"] || headers.host || process.env.SITE_URL || VERCEL_PROD_URL);
  if (!host) return VERCEL_PROD_URL;
  return host.startsWith("http") ? host : `${proto}://${host}`;
}

function readJsonFile(relPath) {
  try {
    const candidates = [
      path.join(process.cwd(), relPath),
      path.join(process.cwd(), "scorestore-main", relPath),
      path.join(__dirname, "..", relPath),
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    }

    return null;
  } catch {
    return null;
  }
}

function validateZip(zip, country) {
  const z = safeStr(zip).trim();
  const c = safeStr(country || "MX").trim().toUpperCase();

  if (c === "US") {
    return /^\d{5}(-\d{4})?$/.test(z) ? z : null;
  }

  return z.length >= 4 && z.length <= 10 && /^[a-zA-Z0-9\- ]+$/.test(z) ? z : null;
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeStr(s).trim());
}

function getCorsAllowlist() {
  return safeStr(process.env.CORS_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith("http://localhost")) return true;
  if (origin.endsWith(".vercel.app")) return true;
  if (origin === VERCEL_PROD_URL) return true;

  const allowed = getCorsAllowlist();
  if (allowed.includes("*")) return true;
  return allowed.includes(origin);
}

function corsHeaders(origin) {
  const safeOrigin = isAllowedOrigin(origin) ? origin || VERCEL_PROD_URL : VERCEL_PROD_URL;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, stripe-signature, x-org-id, x-envia-token, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, PUT, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function jsonResponse(statusCode, data, origin) {
  if (origin && !isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: false, error: "Forbidden Origin" }),
    };
  }

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
    body: JSON.stringify(data ?? {}),
  };
}

function handleOptions(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return { statusCode: 204, headers: corsHeaders(origin), body: "" };
}

const supabaseAdmin = (() => {
  let client = null;

  return () => {
    if (client) return client;
    if (!createClient) return null;

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "";

    if (!url || !key) return null;

    try {
      client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-client-info": "scorestore-vercel" } },
      });
      return client;
    } catch (error) {
      console.error("Supabase init error:", error?.message || error);
      return null;
    }
  };
})();

function getOriginByCountry(country) {
  const c = safeStr(country || "MX").trim().toUpperCase();

  if (c === "US") {
    return {
      name: "Score Store US",
      company: "Score Store",
      email: SUPPORT_EMAIL,
      phone: "8180000000",
      street: "Otay Mesa Rd",
      number: "123",
      district: "Otay",
      city: "San Diego",
      state: "CA",
      country: "US",
      postalCode: "92154",
    };
  }

  return {
    name: "Score Store MX",
    company: "Único Uniformes",
    email: SUPPORT_EMAIL,
    phone: SUPPORT_PHONE,
    street: "Palermo",
    number: "6106",
    district: "Anexa Roma",
    city: "Tijuana",
    state: "BC",
    country: "MX",
    postalCode: "22614",
  };
}

function getPackageSpecs(country, items_qty) {
  const qty = clampInt(items_qty || 1, 1, 99, 1);
  const c = safeStr(country || "MX").trim().toUpperCase();

  if (c === "US") {
    return {
      type: "box",
      content: "Merchandise",
      amount: 1,
      weightUnit: "LB",
      lengthUnit: "IN",
      weight: qty * 0.8,
      dimensions: { length: 12, width: 12, height: 8 },
    };
  }

  return {
    type: "box",
    content: "Ropa",
    amount: 1,
    weightUnit: "KG",
    lengthUnit: "CM",
    weight: qty * 0.4,
    dimensions: { length: 25, width: 20, height: 15 },
  };
}

async function getZipDetails(country, zip) {
  const c = safeStr(country || "MX").trim().toUpperCase();
  const z = validateZip(zip, c);
  if (!z) return null;

  const url = `https://geocodes.envia.com/zipcode/${c}/${z}`;

  try {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${process.env.ENVIA_API_KEY || ""}`,
        "content-type": "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => ({}));
    const info = data?.data?.[0] || data?.data || data;

    return {
      city: info?.city || info?.locality || null,
      state: info?.state_code || info?.state || null,
      postalCode: z,
      country: c,
    };
  } catch {
    return null;
  }
}

function pickBestRate(rates) {
  return (Array.isArray(rates) ? rates : []).reduce((best, r) => {
    const price = Number(r?.totalPrice || r?.price || r?.amount || Infinity);

    if (!best || price < best.price) {
      return {
        carrier: safeStr(r?.carrier || "carrier"),
        service: safeStr(r?.service || "service"),
        price,
      };
    }

    return best;
  }, null);
}

async function getEnviaQuote({ zip, country, items_qty }) {
  const c = safeStr(country || "MX").trim().toUpperCase();
  const z = validateZip(zip, c);
  if (!z) throw new Error("CP/ZIP inválido");

  const apiKey = process.env.ENVIA_API_KEY || "";
  if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

  const origin = getOriginByCountry(c);
  const zipInfo = await getZipDetails(c, z);

  const payload = {
    origin,
    destination: {
      name: "Cliente",
      email: SUPPORT_EMAIL,
      phone: "0000000000",
      street: "Stripe",
      number: "1",
      district: "Centro",
      city: zipInfo?.city || "Tijuana",
      state: zipInfo?.state || "BC",
      country: c,
      postalCode: z,
    },
    packages: [getPackageSpecs(c, items_qty)],
    shipment: { carrier: c === "US" ? "usps" : "dhl", type: 1 },
    settings: { currency: "MXN" },
  };

  const res = await fetch("https://queries.envia.com/v1/ship/rate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error en Envía");

  const best = pickBestRate(data?.data || data?.rates || []);
  if (!best) throw new Error("No hay tarifas disponibles");

  return {
    ok: true,
    provider: "envia",
    label: `${best.carrier.toUpperCase()} ${best.service}`,
    amount_cents: Math.round(best.price * 100),
    amount_mxn: best.price,
  };
}

function getFallbackShipping(country, items_qty) {
  const c = safeStr(country || "MX").trim().toUpperCase();
  const priceMXN = c === "US" ? 850 + Number(items_qty || 1) * 50 : 250;

  return {
    ok: true,
    provider: "fallback",
    label: "Envío Estándar",
    amount_cents: priceMXN * 100,
    amount_mxn: priceMXN,
  };
}

function stripeShippingToEnviaDestination(sess) {
  if (!sess) return null;

  const sd = sess.shipping_details || {};
  const cd = sess.customer_details || {};
  const addr = sd.address || {};

  let street = safeStr(addr.line1 || "Domicilio Conocido").trim();
  let number = safeStr(addr.line2 || "S/N").trim();

  const match = street.match(/^(.*?)\s+((?:No\.?\s*|#\s*)?\d+[a-zA-Z]?(?:-\d+)?)$/i);
  if (match && number === "S/N") {
    street = match[1].trim();
    number = match[2].trim();
  }

  return {
    name: sd.name || cd.name || "Cliente",
    email: cd.email || sess.customer_email || SUPPORT_EMAIL,
    phone: safeStr(sd.phone || cd.phone || "0000000000").replace(/\D/g, "").substring(0, 10),
    street,
    number,
    district: safeStr(addr.line2 || "Centro"),
    city: safeStr(addr.city || ""),
    state: safeStr(addr.state || ""),
    country: safeStr(addr.country || "MX").toUpperCase(),
    postalCode: safeStr(addr.postal_code || ""),
    reference: "Venta Online",
  };
}

async function createEnviaLabel({ shipping_country, stripe_session, items_qty }) {
  const country = safeStr(shipping_country || "MX").trim().toUpperCase();
  const apiKey = process.env.ENVIA_API_KEY || "";
  if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

  const payload = {
    origin: getOriginByCountry(country),
    destination: stripeShippingToEnviaDestination(stripe_session),
    packages: [getPackageSpecs(country, items_qty)],
    shipment: { carrier: country === "US" ? "usps" : "dhl", type: 1 },
    settings: { printFormat: "PDF", printSize: "STOCK_4X6", currency: "MXN" },
  };

  const res = await fetch("https://queries.envia.com/v1/ship/generate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al generar guía");

  return {
    ok: true,
    label_url: data?.data?.label_url || data?.label_url || null,
    tracking_number: data?.data?.tracking_number || data?.tracking_number || null,
  };
}

async function callGemini({ apiKey, model = "gemini-2.5-flash-lite", systemText, userText }) {
  if (!apiKey) return "";

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemText}\n\nUSER: ${userText}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  return data?.candidates?.[0]?.content?.parts?.map((p) => safeStr(p?.text || "")).join("").trim() || "";
}

function normalizeReply(text) {
  return safeStr(text).replace(/\[ACTION:.*?\]/g, "").trim().slice(0, 1500);
}

function extractActionMarkers(text) {
  return Array.from(safeStr(text).matchAll(/\[ACTION:([A-Z_]+)(?::([^\]]+))?\]/g)).map((m) => ({
    action: m[1],
    value: m[2] || "",
  }));
}

function initStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !Stripe) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" });
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req?.body)) return req.body;
  if (typeof req?.body === "string") return Buffer.from(req.body, "utf8");
  if (Buffer.isBuffer(req?.rawBody)) return req.rawBody;
  if (typeof req?.rawBody === "string") return Buffer.from(req.rawBody, "utf8");
  return Buffer.from("");
}

async function resolveScoreOrgId(sb) {
  if (!sb) return DEFAULT_SCORE_ORG_ID;

  const { data } = await sb
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .maybeSingle()
    .catch(() => ({ data: null }));

  return data?.id || DEFAULT_SCORE_ORG_ID;
}

async function readPublicSiteSettings(sb = null, orgId = null) {
  const client = sb || supabaseAdmin();
  const resolvedId = orgId || DEFAULT_SCORE_ORG_ID;

  if (!client) {
    return { hero_title: "SCORE STORE", promo_active: false };
  }

  const { data } = await client
    .from("site_settings")
    .select("*")
    .or(`organization_id.eq.${resolvedId},org_id.eq.${resolvedId}`)
    .maybeSingle()
    .catch(() => ({ data: null }));

  return data || { hero_title: "SCORE STORE", promo_active: false };
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeStr(text).slice(0, 4000),
      parse_mode: "HTML",
    }),
  }).catch(() => {});
}

function getCatalogIndex() {
  const cat = readJsonFile("data/catalog.json");
  const products = Array.isArray(cat?.products) ? cat.products : [];
  const idx = new Map();

  for (const p of products) {
    if (p?.sku) idx.set(String(p.sku), p);
  }

  return { catalog: cat, index: idx };
}

function makeCheckoutIdempotencyKey(req = {}, body = {}) {
  const headerKey = safeStr(req?.headers?.["idempotency-key"] || req?.headers?.["Idempotency-Key"] || "").trim();
  if (headerKey) return headerKey;

  const fingerprint = {
    method: safeStr(req?.method || "GET"),
    path: safeStr(req?.url || ""),
    email: safeStr(body.customer_email || body.email || body.checkout_email || ""),
    phone: safeStr(body.customer_phone || body.phone || body.checkout_phone || ""),
    zip: safeStr(body.shipping_zip || body.postal_code || body.zip || body.postal || ""),
    country: safeStr(body.shipping_country || body.country || ""),
    promo: safeStr(body.promo_code || body.promoCode || ""),
    items: normalizeQty(body.items || body.cart || []),
  };

  return crypto.createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex").slice(0, 32);
}

module.exports = {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  clampInt,
  clampText,
  normalizeLower,
  normalizeQty,
  itemsQtyFromAny,
  getBaseUrl,
  readJsonFile,
  getCatalogIndex,
  validateZip,
  isUuid,
  safeStr,
  supabaseAdmin,
  rateLimit,
  getOriginByCountry,
  getEnviaQuote,
  getFallbackShipping,
  stripeShippingToEnviaDestination,
  createEnviaLabel,
  initStripe,
  readRawBody,
  resolveScoreOrgId,
  readPublicSiteSettings,
  sendTelegram,
  callGemini,
  normalizeReply,
  extractActionMarkers,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP_E164,
  SUPPORT_WHATSAPP_DISPLAY,
  VERCEL_PROD_URL,
  makeCheckoutIdempotencyKey,
};