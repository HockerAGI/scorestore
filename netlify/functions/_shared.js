const { createClient } = require("@supabase/supabase-js");

/**
 * Shared helpers for Netlify Functions (Node 18+)
 * Real production behavior:
 * - Uses env vars first (recommended)
 * - Falls back to legacy NEXT_PUBLIC_* names for backward compatibility
 * - Never requires secrets on the frontend
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

// Create clients if possible (functions only; never send service role to the browser)
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
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

// --- SHIPPING FALLBACKS (MXN) ---
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

// --- PROMO RULES (mirrors /data/promos.json). Backend is the source of truth. ---
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

const safeJsonParse = (str) => {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return {};
  }
};

const normalizeQty = (qty) => {
  const n = parseInt(qty, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const normalizeZip = (zip) => {
  const z = String(zip || "").trim();
  return z.length >= 5 ? z : "";
};

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

// --- Envia.com quoting ---
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!process.env.ENVIA_API_KEY) return null;

  const safeZip = normalizeZip(zip);
  if (!safeZip) return null;

  const q = normalizeQty(qty);

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ENVIA_API_KEY}`,
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: safeZip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [
          {
            content: "Merchandise SCORE",
            amount: 1,
            type: "box",
            weight: q * 0.6,
            dimensions: { length: 30, width: 25, height: 10 + q },
            declared_value: 400 * q,
          },
        ],
      }),
    });

    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;

    const best = list.sort((a, b) => a.total_price - b.total_price)[0];
    return {
      mxn: Math.ceil(best.total_price * 1.05), // +5% margin
      carrier: best.carrier,
      days: best.delivery_estimate,
    };
  } catch {
    return null;
  }
}

// --- Envia.com label creation ---
async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;

  const q = normalizeQty(itemsQty);

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ENVIA_API_KEY}`,
      },
      body: JSON.stringify({
        origin: { ...FACTORY_ORIGIN, postal_code: FACTORY_ORIGIN.postalCode },
        destination: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          street: customer.address.line1,
          district: customer.address.line2 || "",
          city: customer.address.city,
          state: customer.address.state,
          country: customer.address.country,
          postal_code: customer.address.postal_code,
        },
        packages: [
          {
            content: "Merchandise SCORE",
            amount: 1,
            type: "box",
            weight: q * 0.6,
            dimensions: { length: 30, width: 25, height: 15 },
            declared_value: 400 * q,
          },
        ],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" },
      }),
    });

    const result = await res.json();
    const row = result?.data?.[0];
    if (!row) return null;

    return { tracking: row.tracking_number, labelUrl: row.label, carrier: row.carrier };
  } catch {
    return null;
  }
}

/**
 * Try to resolve products from Único OS (Supabase).
 * Expected schema (recommended):
 * - organizations: { id, slug }
 * - products: { id, org_id, name, price, image_url, active }
 */
async function getProductsFromDb({ orgSlug = "score-store" } = {}) {
  if (!supabaseAdmin && !supabase) return { ok: false, reason: "Supabase client not configured", orgId: null, products: [] };

  const client = supabaseAdmin || supabase;

  const { data: org, error: orgErr } = await client.from("organizations").select("id").eq("slug", orgSlug).single();
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
  // supabase
  supabase,
  supabaseAdmin,
  SUPABASE_URL,
  // helpers
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  normalizeZip,
  digitsOnly,
  // shipping
  FACTORY_ORIGIN,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  PROMO_RULES,
  getEnviaQuote,
  createEnviaLabel,
  // db
  getProductsFromDb,
};