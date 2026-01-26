const { createClient } = require("@supabase/supabase-js");

// DATOS DE ORIGEN (BAJATEX / ÚNICO)
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

// PRECIOS DE RESPALDO (SI FALLA LA API)
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 850;

// CONFIGURACIÓN SUPABASE (ÚNICO OS)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_SERVICE 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } }) 
  : null;

// RESPUESTAS ESTÁNDAR
const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

const safeJsonParse = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
const normalizeQty = (qty) => { const n = parseInt(qty, 10); return Number.isFinite(n) && n > 0 ? n : 1; };
const digitsOnly = (str) => String(str || "").replace(/\D/g, "");

// LOGICA DE ENVIA.COM (COTIZACIÓN)
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;
  const q = normalizeQty(qty);
  
  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{ 
          content: "Clothing Merch", 
          amount: 1, 
          type: "box", 
          weight: q * 0.6, 
          dimensions: { length: 30, width: 25, height: 10 + q } 
        }],
      }),
    });
    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;
    const best = list.sort((a, b) => a.total_price - b.total_price)[0];
    return { mxn: Math.ceil(best.total_price * 1.05), carrier: best.carrier, days: best.delivery_estimate };
  } catch (e) { return null; }
}

// GENERACIÓN DE GUÍA AUTOMÁTICA
async function createEnviaLabel(customer, itemsQty) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;
  const q = normalizeQty(itemsQty);
  
  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        origin: FACTORY_ORIGIN,
        destination: {
          name: customer.name, email: customer.email, phone: customer.phone,
          street: customer.address.line1, city: customer.address.city,
          state: customer.address.state, country: customer.address.country, 
          postal_code: customer.address.postal_code
        },
        packages: [{ content: "Merchandise SCORE Official", amount: 1, type: "box", weight: q * 0.6, dimensions: { length: 30, width: 25, height: 15 } }],
        shipment: { carrier: "fedex", type: 1, service: "ground" },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" },
      }),
    });
    const result = await res.json();
    const row = result?.data?.[0];
    if (!row) return null;
    return { tracking: row.tracking_number, labelUrl: row.label, carrier: row.carrier };
  } catch (e) { return null; }
}

module.exports = {
  supabaseAdmin, jsonResponse, safeJsonParse, normalizeQty, digitsOnly,
  getEnviaQuote, createEnviaLabel, FACTORY_ORIGIN, FALLBACK_MX_PRICE, FALLBACK_US_PRICE
};