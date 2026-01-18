/**
 * _shared.js — FINAL MASTER (Netlify Functions)
 * - Supabase shared client (hybrid env/fallback)
 * - Envia.com quote + label (optional, fallback-safe)
 * - CORS + utils
 */

const { createClient } = require("@supabase/supabase-js");

// --- CREDENCIALES (HÍBRIDO: ENV preferido + fallback real) ---
// Nota: En Netlify Functions es común usar SUPABASE_URL / SUPABASE_ANON_KEY,
// pero conservamos NEXT_PUBLIC_* por compatibilidad con tu repo Admin (Next.js).
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://lpbzndnavkbpxwnlbqgb.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

// --- ORIGEN (FÁBRICA) ---
const FACTORY_ORIGIN = {
  name: "Score Store / Unico Uniformes",
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

// --- FALLBACKS DE ENVÍO (MXN pesos) ---
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

// --- CORS / RESPUESTAS ---
// Nota: dejamos Allow-Origin "*" porque tu frontend es estático y no usas cookies.
// Si algún día usas credentials, se ajusta.
const defaultHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const jsonResponse = (status, body) => ({
  statusCode: status,
  headers: defaultHeaders,
  body: JSON.stringify(body),
});

// --- UTILS ---
const safeJsonParse = (str) => {
  try {
    if (!str) return {};
    return JSON.parse(str);
  } catch {
    return {};
  }
};

const digitsOnly = (str) => String(str || "").replace(/[^0-9]/g, "");

function toNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function normalizeQty(qty) {
  const n = Math.floor(toNumber(qty, 1));
  return Math.max(1, n);
}

function normalizeCountryCode(countryCode) {
  const c = String(countryCode || "MX").trim().toUpperCase();
  return c === "US" ? "US" : "MX";
}

function normalizeZip(zip) {
  const z = String(zip || "").trim();
  // Permitimos ZIP US con guion, pero exigimos mínimo 5 chars útiles.
  // (No removemos guion para no romper ZIP+4; Envia acepta postal_code string.)
  return z.length >= 5 ? z : "";
}

// INICIALIZAR SUPABASE (shared)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// (Opcional) si la usas en otros functions
async function getProductsFromDB({ includeInactive = false } = {}) {
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (orgErr || !org?.id) return [];

  let q = supabase.from("products").select("*").eq("org_id", org.id);

  // Default: solo activos (para evitar que el store publique borradores)
  if (!includeInactive) q = q.eq("active", true);

  const { data: products, error: prodErr } = await q;
  if (prodErr) return [];

  return products || [];
}

/* --- ENVIA.COM --- */

async function getEnviaQuote(zip, qty, countryCode = "MX") {
  // Si no hay API Key, el sistema debe caer a fallback en la function que llama.
  if (!process.env.ENVIA_API_KEY) return null;

  const safeCountry = normalizeCountryCode(countryCode);
  const safeZip = normalizeZip(zip);
  const safeQty = normalizeQty(qty);

  if (!safeZip) return null;

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ENVIA_API_KEY}`,
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: safeCountry, postal_code: safeZip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [
          {
            content: "Merchandise SCORE International",
            amount: 1,
            type: "box",
            weight: safeQty * 0.6, // 600g promedio por prenda
            dimensions: { length: 30, width: 25, height: 10 + safeQty * 2 },
            declared_value: 400 * safeQty,
          },
        ],
      }),
    });

    const data = await res.json().catch(() => null);

    if (data && Array.isArray(data.data) && data.data.length > 0) {
      // Más barato por total_price
      const best = data.data
        .slice()
        .sort((a, b) => toNumber(a.total_price, 9e15) - toNumber(b.total_price, 9e15))[0];

      const total = toNumber(best?.total_price, 0);

      if (total > 0) {
        // mxn = PESOS MXN con +5% de margen de seguridad
        return {
          mxn: Math.ceil(total * 1.05),
          carrier: best?.carrier || "Envío",
          days: best?.delivery_estimate || "N/A",
        };
      }
    }

    return null;
  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}

function normalizeCustomerAddress(customer) {
  const c = customer || {};
  const a = c.address || {};
  const addr = typeof a === "object" && a ? a : {};

  return {
    name: String(c.name || "").trim(),
    email: String(c.email || "").trim(),
    phone: String(c.phone || "").trim(),
    line1: String(addr.line1 || "").trim(),
    line2: String(addr.line2 || "").trim(),
    city: String(addr.city || "").trim(),
    state: String(addr.state || "").trim(),
    country: String(addr.country || "").trim() || "MX",
    postal_code: String(addr.postal_code || "").trim(),
  };
}

async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;

  const qty = normalizeQty(itemsQty);
  const c = normalizeCustomerAddress(customer);

  // Si no hay CP, no generamos guía
  const safeZip = normalizeZip(c.postal_code);
  if (!safeZip) return null;

  const safeCountry = normalizeCountryCode(c.country);

  try {
    const payload = {
      origin: {
        company: FACTORY_ORIGIN.company,
        name: FACTORY_ORIGIN.name,
        email: FACTORY_ORIGIN.email,
        phone: FACTORY_ORIGIN.phone,
        street: FACTORY_ORIGIN.street,
        number: FACTORY_ORIGIN.number,
        district: FACTORY_ORIGIN.district,
        city: FACTORY_ORIGIN.city,
        state: FACTORY_ORIGIN.state,
        country: FACTORY_ORIGIN.country,
        postal_code: FACTORY_ORIGIN.postalCode,
        reference: FACTORY_ORIGIN.reference,
      },
      destination: {
        name: c.name || "Cliente",
        email: c.email || "cliente@scorestore.com",
        phone: c.phone || "0000000000",
        street: c.line1 || "",
        number: "",
        district: c.line2 || "",
        city: c.city || "",
        state: c.state || "",
        country: safeCountry,
        postal_code: safeZip,
      },
      packages: [
        {
          content: "Merchandise SCORE International",
          amount: 1,
          type: "box",
          weight: qty * 0.6,
          dimensions: { length: 30, width: 25, height: 10 + qty * 2 },
          declared_value: 400 * qty,
        },
      ],
      shipment: { carrier: "fedex", type: 1 },
      settings: { print_format: "PDF", print_size: "STOCK_4X6" },
    };

    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ENVIA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json().catch(() => null);

    if (result && result.meta === "generate" && result.data && result.data[0]) {
      return {
        tracking: result.data[0].tracking_number,
        labelUrl: result.data[0].label,
        carrier: result.data[0].carrier,
      };
    }

    return null;
  } catch (e) {
    console.error("Create Label Error:", e);
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getProductsFromDB,
  getEnviaQuote,
  createEnviaLabel,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  supabase,
};