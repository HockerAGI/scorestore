const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

/* --- CREDENCIALES INTEGRADAS (BAJATEX / ÚNICO) --- */
// Nota: Si configuras variables en Netlify, esas tendrán prioridad. Si no, usa estas.
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "89d853b2b6fd03f6fcbea5e1570a15265342d53315fc9a36b16769bbf9bad4c6";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MDEzMywiZXhwIjoyMDg0MjU2MTMzfQ.GvGMT-Ftx3hfuHHQdGcDCnHcap_3BBSnatl0CjPQ5Mo";

// Cliente Admin (para escribir órdenes y logs)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* --- DATOS DE ORIGEN (TU FÁBRICA) --- */
const FACTORY_ORIGIN = {
  name: "BAJATEX / SCORE Store",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotextil@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma", // Interior JK se puede poner en referencias
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK"
};

/* --- REGLAS DE NEGOCIO --- */
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

const PROMO_RULES = [
  { code: "SCORE25", type: "percent", value: 0.25, active: true },
  { code: "BAJA25", type: "percent", value: 0.25, active: true },
  { code: "SCORE10", type: "percent", value: 0.10, active: true },
  { code: "ENVIOFREE", type: "free_shipping", value: 0, active: true }
];

/* --- UTILIDADES --- */
const jsonResponse = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  },
  body: JSON.stringify(body)
});

const safeJsonParse = (str) => { try { return JSON.parse(str); } catch { return {}; } };
const normalizeQty = (q) => { const n = parseInt(q, 10); return (isNaN(n) || n < 1) ? 1 : n; };

/* --- INTEGRACIÓN ENVIA.COM --- */
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!ENVIA_API_KEY) return null;
  
  // Cálculo: 600g por prenda, caja base + altura dinámica
  const weight = qty * 0.6; 
  const height = 10 + (qty * 2); 

  try {
    const payload = {
      origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
      destination: { country_code: countryCode, postal_code: zip },
      shipment: { carrier: "fedex", type: 1 }, 
      packages: [{ 
        content: "Ropa Oficial SCORE", amount: 1, type: "box", 
        weight: weight, dimensions: { length: 30, width: 25, height: height }, 
        declared_value: 400 * qty 
      }]
    };

    const { data } = await axios.post("https://api.envia.com/ship/rate/", payload, {
      headers: { "Authorization": `Bearer ${ENVIA_API_KEY}`, "Content-Type": "application/json" }
    });

    const quotes = data.data || [];
    // Buscar FedEx o Redpack, si no, el más barato
    const best = quotes.find(q => q.carrier.toLowerCase().includes("fedex")) || quotes.sort((a,b) => a.total_price - b.total_price)[0];
    
    if (!best) return null;

    // +10% margen seguridad
    return { 
      mxn: Math.ceil(best.total_price * 1.10), 
      currency: best.currency, 
      carrier: best.carrier, 
      days: best.delivery_estimate 
    };
  } catch (e) {
    console.error("Envia Quote Error:", e.message);
    return null;
  }
}

async function createEnviaLabel(customer, itemsQty) {
  if (!ENVIA_API_KEY) return null;
  const q = normalizeQty(itemsQty);

  try {
    const payload = {
      origin: FACTORY_ORIGIN,
      destination: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        street: customer.address.line1,
        number: "", 
        district: customer.address.line2 || "Colonia",
        city: customer.address.city,
        state: customer.address.state,
        country: customer.address.country,
        postal_code: customer.address.postal_code
      },
      packages: [{ 
        content: "SCORE Merchandise", amount: 1, type: "box", 
        weight: q * 0.6, dimensions: { length: 30, width: 25, height: 10 + q }, 
        declared_value: 100 
      }],
      shipment: { carrier: "fedex", type: 1 },
      settings: { print_format: "PDF", print_size: "STOCK_4X6" }
    };

    const { data } = await axios.post("https://api.envia.com/ship/generate/", payload, {
      headers: { "Authorization": `Bearer ${ENVIA_API_KEY}`, "Content-Type": "application/json" }
    });

    const res = data.data && data.data[0];
    if (!res) return null;

    return { tracking: res.tracking_number, labelUrl: res.label, carrier: res.carrier };
  } catch (e) {
    console.error("Envia Label Error:", e.response?.data || e.message);
    return null;
  }
}

module.exports = {
  jsonResponse, safeJsonParse, normalizeQty,
  getEnviaQuote, createEnviaLabel, supabaseAdmin,
  FALLBACK_MX_PRICE, FALLBACK_US_PRICE, PROMO_RULES
};
