const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

/**
 * Shared helpers for Netlify Functions (Node 18+)
 */

// --- SUPABASE (ÚNICO OS) ---
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE || "";

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// --- ORIGIN / FACTORY DATA ---
const FACTORY_ORIGIN = {
  name: "Score Store / Único Uniformes",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotextil@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK",
};

// --- Shipping Floors (MXN) ---
const FALLBACK_MX_PRICE = Number(process.env.SHIPPING_FLOOR_MX || 250);
const FALLBACK_US_PRICE = Number(process.env.SHIPPING_FLOOR_US || 800);

// --- Promos (server-side safety) ---
let PROMO_RULES = null;
try {
  if (process.env.PROMOS_JSON) {
    PROMO_RULES = JSON.parse(process.env.PROMOS_JSON);
  }
} catch (_) {
  PROMO_RULES = null;
}

// --- Helpers ---
function jsonResponse(statusCode, body = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, Stripe-Signature, stripe-signature",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function digitsOnly(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function normalizeZip(zip) {
  const z = String(zip || "").trim();
  if (!z) return "";
  // For MX prefer digits
  const dz = digitsOnly(z);
  return dz || z;
}

function normalizeQty(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(999, Math.round(x)));
}

/**
 * Envia: Quote shipping (MXN)
 */
async function getEnviaQuote(zip, qty, country = "MX") {
  const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
  if (!ENVIA_API_KEY) return null;

  const q = normalizeQty(qty);
  const z = normalizeZip(zip);
  const c = String(country || "MX").toUpperCase();

  try {
    // Nota: endpoints reales pueden variar según tu cuenta/plan Envia.
    // Este wrapper está hecho para que tú solo ajustes el endpoint/body si Envia te lo pide.
    const res = await axios.post(
      "https://api.envia.com/ship/rate",
      {
        origin: FACTORY_ORIGIN,
        destination: { country: c, postalCode: z },
        packages: [{ quantity: q, weight: 1, length: 10, width: 10, height: 10 }],
      },
      { headers: { Authorization: `Bearer ${ENVIA_API_KEY}` }, timeout: 18000 }
    );

    const rates = res?.data?.data || res?.data?.rates || res?.data || [];
    const first = Array.isArray(rates) ? rates[0] : null;
    if (!first) return null;

    const cost = Number(first?.total_price || first?.price || first?.total || 0);
    if (!cost || !Number.isFinite(cost)) return null;

    return {
      mxn: Math.round(cost),
      carrier: String(first?.carrier || first?.provider || "Envia"),
      days: Number(first?.delivery_days || first?.days || 5),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Envia: Create label (optional)
 */
async function createEnviaLabel({ zip, country = "MX", qty = 1, customer = {}, items = [] } = {}) {
  const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
  if (!ENVIA_API_KEY) return { ok: false, error: "ENVIA_API_KEY missing" };

  try {
    const payload = {
      origin: FACTORY_ORIGIN,
      destination: {
        name: customer.name || "Cliente",
        address: customer.address || "",
        postalCode: normalizeZip(zip),
        country: String(country || "MX").toUpperCase(),
        phone: customer.phone || "",
      },
      packages: [{ quantity: normalizeQty(qty), weight: 1, length: 10, width: 10, height: 10 }],
      items,
    };

    const res = await axios.post("https://api.envia.com/ship/create", payload, {
      headers: { Authorization: `Bearer ${ENVIA_API_KEY}` },
      timeout: 20000,
    });

    const tracking =
      res?.data?.data?.tracking_number || res?.data?.tracking_number || null;

    return { ok: true, raw: res.data, tracking };
  } catch (e) {
    return { ok: false, error: e?.message || "Envia label error" };
  }
}

/**
 * Optional: Validate cart from Supabase (strict mode if service role present).
 */
async function getProductsFromDb({ orgSlug = "score-store" } = {}) {
  if (!supabaseAdmin && !supabase)
    return { ok: false, reason: "Supabase client not configured", orgId: null, products: [] };

  const client = supabaseAdmin || supabase;

  const { data: org, error: orgErr } = await client
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (orgErr || !org) return { ok: false, reason: "Organization not found", orgId: null, products: [] };

  const { data: products, error: prodErr } = await client
    .from("products")
    .select("id, org_id, name, price, image_url, active, sku")
    .eq("org_id", org.id);

  if (prodErr || !products) return { ok: false, reason: "Products query failed", orgId: org.id, products: [] };

  const filtered = products.filter((p) => p.active !== false);
  return { ok: true, orgId: org.id, products: filtered };
}

module.exports = {
  supabase,
  supabaseAdmin,
  SUPABASE_URL,
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  normalizeZip,
  digitsOnly,
  FACTORY_ORIGIN,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  PROMO_RULES,
  getEnviaQuote,
  createEnviaLabel,
  getProductsFromDb,
};