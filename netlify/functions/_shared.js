// netlify/functions/_shared.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente público (lecturas típicas)
const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

// Cliente admin (webhook/orders/write)
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } })
  : supabase; // fallback (solo para dev sin RLS)

const defaultHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: defaultHeaders,
  body: JSON.stringify(body),
});

const safeJsonParse = (str) => {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
};

function normalizeQty(qty) {
  const n = parseInt(qty, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function normalizeZip(zip) {
  const z = String(zip || "").trim();
  return z.length >= 5 ? z : "";
}

/** ORIGEN FÁBRICA (BAJATEX / ÚNICO) */
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

const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

/** ENVIA.COM (rate) */
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
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`,
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: safeZip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{
          content: "Merchandise SCORE",
          amount: 1,
          type: "box",
          weight: q * 0.6,
          dimensions: { length: 30, width: 25, height: 10 + q },
          declared_value: 400 * q,
        }],
      }),
    });

    const data = await res.json();
    const list = data?.data || [];
    if (!Array.isArray(list) || list.length === 0) return null;

    const best = list.slice().sort((a, b) => Number(a.total_price) - Number(b.total_price))[0];
    if (!best) return null;

    return {
      mxn: Math.ceil(Number(best.total_price) * 1.05), // +5% margen
      carrier: best.carrier || "Envío",
      days: best.delivery_estimate || "N/A",
    };
  } catch (e) {
    console.error("Envia rate error:", e?.message || e);
    return null;
  }
}

/** ENVIA.COM (label) */
async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;
  const safeZip = normalizeZip(customer?.address?.postal_code);
  if (!safeZip) return null;

  const q = normalizeQty(itemsQty);

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`,
      },
      body: JSON.stringify({
        origin: { ...FACTORY_ORIGIN, postal_code: FACTORY_ORIGIN.postalCode },
        destination: {
          name: customer?.name || "Cliente",
          email: customer?.email || "cliente@scorestore.com",
          phone: String(customer?.phone || "0000000000").replace(/[^0-9]/g, "").slice(0, 15),
          street: customer?.address?.line1 || "Calle Principal",
          number: "",
          district: customer?.address?.line2 || "",
          city: customer?.address?.city || "",
          state: customer?.address?.state || "",
          country: customer?.address?.country || "MX",
          postal_code: safeZip,
        },
        packages: [{
          content: "Merchandise SCORE",
          amount: 1,
          type: "box",
          weight: q * 0.6,
          dimensions: { length: 30, width: 25, height: 15 },
          declared_value: 400 * q,
        }],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" },
      }),
    });

    const result = await res.json();
    const row = result?.data?.[0];
    if (!row) return null;

    return {
      tracking: row.tracking_number || null,
      labelUrl: row.label || null,
      carrier: row.carrier || null,
    };
  } catch (e) {
    console.error("Envia label error:", e?.message || e);
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  supabase,
  supabaseAdmin,
  FACTORY_ORIGIN,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  getEnviaQuote,
  createEnviaLabel,
  normalizeQty,
  normalizeZip,
};