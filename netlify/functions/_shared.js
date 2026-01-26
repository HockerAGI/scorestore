const { createClient } = require("@supabase/supabase-js");

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
};

// Configuración Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_SERVICE 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } }) 
  : null;

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  },
  body: JSON.stringify(body),
});

const safeJsonParse = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
const normalizeQty = (qty) => { const n = parseInt(qty, 10); return Number.isFinite(n) && n > 0 ? n : 1; };

// Cotización en Envia.com
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey || !zip) return null;
  const q = normalizeQty(qty);

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{ content: "Clothing", amount: 1, type: "box", weight: q * 0.5, dimensions: { length: 30, width: 25, height: 15 } }],
      }),
    });
    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;
    const best = list.sort((a, b) => a.total_price - b.total_price)[0];
    return { mxn: Math.ceil(best.total_price * 1.05), carrier: best.carrier, days: best.delivery_estimate };
  } catch (e) { return null; }
}

// Generación de Guía
async function createEnviaLabel(customer, qty) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        origin: FACTORY_ORIGIN,
        destination: {
          name: customer.name, email: customer.email, phone: customer.phone,
          street: customer.address.line1, city: customer.address.city,
          state: customer.address.state, country: customer.address.country, postal_code: customer.address.postal_code
        },
        packages: [{ content: "Merch Oficial SCORE", amount: 1, type: "box", weight: qty * 0.5, dimensions: { length: 30, width: 25, height: 15 } }],
        shipment: { carrier: "fedex", type: 1, service: "ground" }
      }),
    });
    const result = await res.json();
    return result?.data?.[0] || null;
  } catch (e) { return null; }
}

module.exports = { 
  jsonResponse, safeJsonParse, supabaseAdmin, getEnviaQuote, createEnviaLabel, normalizeQty,
  FALLBACK_MX_PRICE: 250, FALLBACK_US_PRICE: 850 
};