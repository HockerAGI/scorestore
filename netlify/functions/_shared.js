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
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE || "";

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

// --- Logic helper for Box Dimensions ---
// Centralizamos esto para que la cotización y la guía usen las mismas medidas
const getPackageSpecs = (qty) => {
  const q = normalizeQty(qty);
  return {
    weight: Math.max(1, q * 0.6), // Mínimo 1kg
    dimensions: {
      length: 30,
      width: 25,
      height: Math.min(60, 10 + Math.ceil(q * 2)) // Altura dinámica topada a 60cm
    },
    declared_value: 400 * q
  };
};

// --- Envia.com quoting ---
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!process.env.ENVIA_API_KEY) return null;

  const safeZip = normalizeZip(zip);
  if (!safeZip) return null;

  const specs = getPackageSpecs(qty);

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
            weight: specs.weight,
            dimensions: specs.dimensions,
            declared_value: specs.declared_value,
          },
        ],
      }),
    });

    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;

    // Filter logic: prefer FedEx/DHL if available, else cheapest
    const best = list.sort((a, b) => a.total_price - b.total_price)[0];
    
    return {
      mxn: Math.ceil(best.total_price * 1.05), // +5% margen seguridad
      carrier: best.carrier,
      days: best.delivery_estimate,
    };
  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}

// --- Envia.com label creation ---
async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;

  const specs = getPackageSpecs(itemsQty);

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
          phone: customer.phone, // REQUIRED by Envia/Carriers
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
            weight: specs.weight,
            dimensions: specs.dimensions,
            declared_value: specs.declared_value,
          },
        ],
        shipment: { carrier: "fedex", type: 1 }, // Default to FedEx, or dynamic if needed
        settings: { print_format: "PDF", print_size: "STOCK_4X6" },
      }),
    });

    const result = await res.json();
    const row = result?.data?.[0];
    
    if (!row) {
        console.error("Envia Gen Error Data:", JSON.stringify(result));
        return null;
    }

    return { tracking: row.tracking_number, labelUrl: row.label, carrier: row.carrier };
  } catch (e) {
    console.error("Envia Gen Error:", e);
    return null;
  }
}

/**
 * Try to resolve products from Único OS (Supabase).
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