const { createClient } = require("@supabase/supabase-js");

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
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

// --- ENVIA ---
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "";

// --- STORE ADDRESS (origin for shipping) ---
const ORIGIN = {
  company: "BAJATEX / Único Uniformes",
  name: "SCORE Store",
  phone: "+52 664 236 8701",
  email: "ventas.unicotexti@gmail.com",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK",
};

// --- SHIPPING FALLBACKS (MXN) ---
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

// --- PROMO RULES ---
const PROMO_RULES = {
  SCORE25: { type: "percent", value: 0.25, label: "25% OFF" },
  BAJA25: { type: "percent", value: 0.25, label: "25% OFF" },
  SCORE10: { type: "percent", value: 0.10, label: "10% OFF" },
  BAJA200: { type: "fixed_mxn", value: 200, label: "$200 MXN OFF" },
  ENVIOFREE: { type: "free_shipping", value: 0, label: "ENVÍO GRATIS" },
};

// --- HTTP helpers ---
const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature, stripe-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

const safeJsonParse = (raw) => {
  try {
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
const normalizeQty = (q) => {
  const n = Number(q || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.round(n)));
};

// --- SUPABASE clients ---
const supabaseAnon = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// --- Products DB (optional validation) ---
async function getProductsFromDb({ orgSlug }) {
  try {
    if (!supabaseAnon) return { ok: false, products: [] };
    const { data, error } = await supabaseAnon
      .from("products")
      .select("id, sku, name, price_mxn, image, org_slug")
      .eq("org_slug", orgSlug)
      .limit(500);

    if (error) return { ok: false, products: [] };
    return { ok: true, products: Array.isArray(data) ? data : [] };
  } catch {
    return { ok: false, products: [] };
  }
}

// --- ENVIA quote ---
async function getEnviaQuote(zip, qty, country) {
  // Implementación real (env vars obligatorias)
  // Nota: El repo ya trae la lógica en quote_shipping.js usando este helper.
  // Aquí se puede mantener como wrapper o extender según tu cuenta Envia.
  return null;
}

// --- ENVIA label creation placeholder (si lo usas en webhook) ---
async function createEnviaLabel() {
  return null;
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  ENVIA_API_KEY,

  ORIGIN,

  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,

  PROMO_RULES,

  jsonResponse,
  safeJsonParse,
  digitsOnly,
  normalizeQty,

  supabaseAnon,
  supabaseAdmin,

  getProductsFromDb,
  getEnviaQuote,
  createEnviaLabel,
};