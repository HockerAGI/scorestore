const { createClient } = require("@supabase/supabase-js");

// --- CREDENCIALES (HÍBRIDO: ENV o fallback real) ---
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

// --- ORIGEN (FÁBRICA) ---
const FACTORY_ORIGIN = {
  name: "Score Store / Unico Uniformes",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotextil@gmail.com", // ✅ corregido
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
const defaultHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// INICIALIZAR SUPABASE
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// (Opcional) si la usas en otros functions
async function getProductsFromDB() {
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (!org?.id) return [];

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", org.id);

  return products || [];
}

/* --- ENVIA.COM --- */

async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!process.env.ENVIA_API_KEY) return null;

  const safeZip = String(zip || "").trim();
  const safeCountry = String(countryCode || "MX").trim().toUpperCase() === "US" ? "US" : "MX";
  const safeQty = normalizeQty(qty);

  if (!safeZip || safeZip.length < 5) return null;

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

      const total = toNumber(best.total_price, 0);

      if (total > 0) {
        // mxn = PESOS MXN con +5% de margen de seguridad
        return {
          mxn: Math.ceil(total * 1.05),
          carrier: best.carrier || "Envío",
          days: best.delivery_estimate || "N/A",
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
  // Stripe suele mandar customer_details.address con:
  // line1, line2, city, state, country, postal_code
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
  if (!c.postal_code || c.postal_code.length < 5) return null;

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
        country: c.country || "MX",
        postal_code: c.postal_code || "",
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