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

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const VERCEL_PROD_URL =
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://scorestore.vercel.app";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/* =========================================================
   CORS / RESPONSE HELPERS
   ========================================================= */

const getCorsAllowlist = () => {
  const envList = process.env.CORS_ALLOWLIST || "";
  return envList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (origin.startsWith("http://localhost")) return true;
  if (origin.endsWith(".vercel.app")) return true;
  if (origin === VERCEL_PROD_URL) return true;

  const allowed = getCorsAllowlist();
  if (allowed.includes("*")) return true;

  return allowed.includes(origin);
};

const corsHeaders = (origin) => {
  const safeOrigin = isAllowedOrigin(origin) ? origin || VERCEL_PROD_URL : VERCEL_PROD_URL;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "Content-Type, stripe-signature, x-org-id, x-envia-token, authorization, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
};

const jsonResponse = (statusCode, data, origin) => {
  if (origin && !isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
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
};

const handleOptions = (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return {
    statusCode: 204,
    headers: corsHeaders(origin),
    body: "",
  };
};

/* =========================================================
   SAFE UTILITIES
   ========================================================= */

const safeStr = (v, d = "") => typeof v === "string" ? v : v == null ? d : String(v);

const safeJsonParse = (raw, fallback = null) => {
  try {
    if (!raw) return fallback;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) || fallback;
  } catch {
    return fallback;
  }
};

const clampInt = (v, min, max, fallback = min) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const clampText = (v, max = 1800) => safeStr(v).trim().slice(0, max);
const normalizeLower = (v) => safeStr(v).trim().toLowerCase();

const normalizeQty = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      sku: String(it?.sku || it?.id || "").trim(),
      qty: clampInt(it?.qty || it?.quantity, 1, 99, 1),
      size: it?.size ? String(it.size).trim() : "",
      priceCents: Number.isFinite(Number(it?.priceCents))
        ? Number(it.priceCents)
        : Number.isFinite(Number(it?.price_cents))
          ? Number(it.price_cents)
          : 0,
      title: it?.title ? String(it.title).trim() : "",
    }))
    .filter((it) => it.sku || it.title);
};

const itemsQtyFromAny = (items) =>
  normalizeQty(items).reduce((sum, it) => sum + Number(it.qty || 0), 0);

const getBaseUrl = (event) => {
  const headers = event?.headers || {};
  const proto = headers["x-forwarded-proto"] || "https";
  const host = headers["x-forwarded-host"] || headers.host || process.env.SITE_URL || VERCEL_PROD_URL;
  if (!host) return VERCEL_PROD_URL;
  return host.startsWith("http") ? host : `${proto}://${host}`;
};

/**
 * Corregido para Vercel Serverless: 
 * Busca archivos en el contexto de ejecución de la función.
 */
const readJsonFile = (relPath) => {
  try {
    const root = process.cwd();
    const paths = [
      path.join(root, relPath),
      path.join(root, "api", relPath),
      path.join(root, "scorestore-main", relPath),
      path.join(__dirname, "..", relPath)
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    return null;
  } catch {
    return null;
  }
};

const validateZip = (zip, country) => {
  const z = String(zip || "").trim();
  const c = String(country || "").toUpperCase().trim();
  if (c === "US") return /^\d{5}(-\d{4})?$/.test(z) ? z : null;
  return (z.length >= 4 && z.length <= 10 && /^[a-zA-Z0-9\- ]+$/.test(z)) ? z : null;
};

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

/* =========================================================
   SUPABASE (Configuración Robusta para Vercel)
   ========================================================= */

const getSupabaseServiceKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const isSupabaseConfigured = () => Boolean(getSupabaseUrl() && getSupabaseServiceKey() && createClient);

const supabaseAdmin = (() => {
  let client = null;
  return () => {
    if (client) return client;
    if (!isSupabaseConfigured()) return null;
    try {
      client = createClient(getSupabaseUrl(), getSupabaseServiceKey(), {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-client-info": "scorestore-vercel" } },
      });
      return client;
    } catch (e) {
      console.error("Supabase init error:", e);
      return null;
    }
  };
})();

/* =========================================================
   ENVÍA / SHIPMENTS
   ========================================================= */

const ENVIA_API_URL = (process.env.ENVIA_API_URL || "https://queries.envia.com/v1").replace(/\/+$/, "");
const ENVIA_GEOCODES_URL = (process.env.ENVIA_GEOCODES_URL || "https://geocodes.envia.com").replace(/\/+$/, "");

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "ventas.unicotextil@gmail.com";
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || "6642368701";
const SUPPORT_WHATSAPP_E164 = process.env.SUPPORT_WHATSAPP_E164 || "5216642368701";
const SUPPORT_WHATSAPP_DISPLAY = process.env.SUPPORT_WHATSAPP_DISPLAY || "664 236 8701";

const requireEnviaKey = () => {
  const key = process.env.ENVIA_API_KEY;
  if (!key) throw new Error("ENVIA_API_KEY no configurada");
  return key;
};

const enviaHeaders = () => ({
  authorization: `Bearer ${requireEnviaKey()}`,
  "content-type": "application/json",
});

const getOriginByCountry = (country) => {
  const c = String(country || "MX").toUpperCase();
  if (c === "US") {
    return { name: "Score Store US", company: "Score Store", email: SUPPORT_EMAIL, phone: "8180000000", street: "Otay Mesa Rd", number: "123", district: "Otay", city: "San Diego", state: "CA", country: "US", postalCode: "92154" };
  }
  return { name: "Score Store MX", company: "Único Uniformes", email: SUPPORT_EMAIL, phone: SUPPORT_PHONE, street: "Palermo", number: "6106", district: "Anexa Roma", city: "Tijuana", state: "BC", country: "MX", postalCode: "22614" };
};

const getPackageSpecs = (country, items_qty) => {
  const qty = clampInt(items_qty || 1, 1, 99);
  const c = String(country || "MX").toUpperCase();
  if (c === "US") {
    return { type: "box", content: "Merchandise", amount: 1, weightUnit: "LB", lengthUnit: "IN", weight: qty * 0.8, dimensions: { length: 12, width: 12, height: 8 } };
  }
  return { type: "box", content: "Ropa", amount: 1, weightUnit: "KG", lengthUnit: "CM", weight: qty * 0.4, dimensions: { length: 25, width: 20, height: 15 } };
};

const getZipDetails = async (country, zip) => {
  const c = String(country || "MX").toUpperCase();
  const z = validateZip(zip, c);
  if (!z) return null;
  try {
    const res = await fetch(`${ENVIA_GEOCODES_URL}/zipcode/${c}/${z}`, { headers: enviaHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const info = data?.data?.[0] || data?.data || data;
    return { city: info?.city || info?.locality || null, state: info?.state_code || info?.state || null, postalCode: z, country: c };
  } catch { return null; }
};

const pickBestRate = (rates) => {
  const arr = Array.isArray(rates) ? rates : [];
  return arr.reduce((best, r) => {
    const price = Number(r?.totalPrice || r?.price || r?.amount || Infinity);
    if (!best || price < best.price) {
      return { carrier: String(r?.carrier || "carrier"), service: String(r?.service || "service"), price };
    }
    return best;
  }, null);
};

const getEnviaQuote = async ({ zip, country, items_qty }) => {
  const c = String(country || "MX").toUpperCase();
  const z = validateZip(zip, c);
  if (!z) throw new Error("CP/ZIP inválido");
  const origin = getOriginByCountry(c);
  const zipInfo = await getZipDetails(c, z);

  const payload = {
    origin,
    destination: { name: "Cliente", email: SUPPORT_EMAIL, phone: "0000000000", street: "Stripe", number: "1", district: "Centro", city: zipInfo?.city || "Tijuana", state: zipInfo?.state || "BC", country: c, postalCode: z },
    packages: [getPackageSpecs(c, items_qty)],
    shipment: { carrier: c === "US" ? "usps" : "dhl", type: 1 },
    settings: { currency: "MXN" }
  };

  const res = await fetch(`${ENVIA_API_URL}/ship/rate`, { method: "POST", headers: enviaHeaders(), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Error en Envía");

  const best = pickBestRate(data?.data || data?.rates || []);
  if (!best) throw new Error("No hay tarifas disponibles");

  return { ok: true, provider: "envia", label: `${best.carrier.toUpperCase()} ${best.service}`, amount_cents: Math.round(best.price * 100), amount_mxn: best.price };
};

const getFallbackShipping = (country, items_qty) => {
  const c = String(country || "MX").toUpperCase();
  const priceMXN = c === "US" ? 850 + (items_qty * 50) : 250;
  return { ok: true, provider: "fallback", label: "Envío Estándar", amount_cents: priceMXN * 100, amount_mxn: priceMXN };
};

const stripeShippingToEnviaDestination = (sess) => {
  if (!sess) return null;
  const sd = sess.shipping_details || {};
  const cd = sess.customer_details || {};
  const addr = sd.address || {};
  
  let calle = String(addr.line1 || "Domicilio Conocido").trim();
  let numStreet = String(addr.line2 || "S/N").trim();

  const match = calle.match(/^(.*?)\s+((?:No\.?\s*|#\s*)?\d+[a-zA-Z]?(?:-\d+)?)$/i);
  if (match && numStreet === "S/N") {
    calle = match[1].trim();
    numStreet = match[2].trim();
  }

  return {
    name: sd.name || cd.name || "Cliente",
    email: cd.email || sess.customer_email || SUPPORT_EMAIL,
    phone: String(sd.phone || cd.phone || "0000000000").replace(/\D/g, "").substring(0, 10),
    street: calle,
    number: numStreet,
    district: String(addr.line2 || "Centro"),
    city: String(addr.city || ""),
    state: String(addr.state || ""),
    country: String(addr.country || "MX").toUpperCase(),
    postalCode: String(addr.postal_code || ""),
    reference: "Venta Online"
  };
};

const createEnviaLabel = async ({ shipping_country, stripe_session, items_qty }) => {
  const country = String(shipping_country || "MX").toUpperCase();
  const payload = {
    origin: getOriginByCountry(country),
    destination: stripeShippingToEnviaDestination(stripe_session),
    packages: [getPackageSpecs(country, items_qty)],
    shipment: { carrier: country === "US" ? "usps" : "dhl", type: 1 },
    settings: { printFormat: "PDF", printSize: "STOCK_4X6", currency: "MXN" }
  };

  const res = await fetch(`${ENVIA_API_URL}/ship/generate`, { method: "POST", headers: enviaHeaders(), body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Error al generar guía");

  return { ok: true, label_url: data?.data?.label_url || data?.label_url, tracking_number: data?.data?.tracking_number || data?.tracking_number };
};

/* =========================================================
   IA / GEMINI (Lógica chatbot)
   ========================================================= */

const callGemini = async ({ apiKey, model = "gemini-1.5-flash", systemText, userText }) => {
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemText}\n\nUSER: ${userText}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
      })
    });
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (e) {
    console.error("Gemini error:", e);
    return "";
  }
};

const normalizeReply = (text) => safeStr(text).replace(/\[ACTION:.*?\]/g, "").trim().slice(0, 1500);

const extractActionMarkers = (text) => {
  const matches = String(text).matchAll(/\[ACTION:([A-Z_]+)(?::([^\]]+))?\]/g);
  return Array.from(matches).map(m => ({ action: m[1], value: m[2] || "" }));
};

/* =========================================================
   STRIPE & CORE
   ========================================================= */

const initStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !Stripe) return null;
  return new Stripe(key, { apiVersion: "2023-10-16" });
};

const readRawBody = async (req) => {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  return Buffer.from("");
};

const resolveScoreOrgId = async (sb) => {
  if (!sb) return DEFAULT_SCORE_ORG_ID;
  const { data } = await sb.from("organizations").select("id").eq("slug", "score-store").maybeSingle();
  return data?.id || DEFAULT_SCORE_ORG_ID;
};

const readPublicSiteSettings = async (sb = null, orgId = null) => {
  const client = sb || supabaseAdmin();
  const resolvedId = orgId || DEFAULT_SCORE_ORG_ID;
  const { data } = await client.from("site_settings").select("*").eq("organization_id", resolvedId).maybeSingle();
  return data || { hero_title: "SCORE STORE", promo_active: false };
};

const getCatalogIndex = () => {
  const cat = readJsonFile("data/catalog.json");
  const products = Array.isArray(cat?.products) ? cat.products : [];
  const idx = new Map();
  products.forEach(p => { if (p.sku) idx.set(String(p.sku), p); });
  return { catalog: cat, index: idx };
};

const sendTelegram = async (text) => {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000), parse_mode: "HTML" })
  }).catch(() => {});
};

module.exports = {
  jsonResponse, handleOptions, safeJsonParse, clampInt, clampText, normalizeLower,
  normalizeQty, itemsQtyFromAny, getBaseUrl, readJsonFile, getCatalogIndex,
  validateZip, isUuid, safeStr, supabaseAdmin, isSupabaseConfigured,
  getOriginByCountry, getEnviaQuote, getFallbackShipping, stripeShippingToEnviaDestination,
  createEnviaLabel, initStripe, readRawBody, resolveScoreOrgId, readPublicSiteSettings,
  sendTelegram, callGemini, normalizeReply, extractActionMarkers,
  SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_WHATSAPP_E164, SUPPORT_WHATSAPP_DISPLAY, VERCEL_PROD_URL
};
