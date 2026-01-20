/**
 * _shared.js — REAL CONFIG
 */
const { createClient } = require('@supabase/supabase-js');

// TUS CLAVES REALES
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "89d853b2b6fd03f6fcbea5e1570a15265342d53315fc9a36b16769bbf9bad4c6";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FACTORY_ORIGIN = {
  name: "Score Store", company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotextil@gmail.com", phone: "6642368701",
  street: "Palermo", number: "6106", district: "Anexa Roma",
  city: "Tijuana", state: "BC", country: "MX", postalCode: "22614"
};

const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

const jsonResponse = (s, b) => ({ statusCode: s, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const safeJsonParse = (s) => { try { return JSON.parse(s); } catch { return {}; } };
const digitsOnly = (s) => String(s || "").replace(/[^0-9]/g, "");

async function getEnviaQuote(zip, qty, country="MX") {
  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: "22614" },
        destination: { country_code: country, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{ content: "Merch", amount: 1, type: "box", weight: qty*0.6, dimensions: { length: 30, width: 25, height: 10 }, declared_value: 400*qty }]
      })
    });
    const data = await res.json();
    if(data?.data?.length > 0) return { mxn: Math.ceil(data.data[0].total_price * 1.05), carrier: data.data[0].carrier, days: data.data[0].delivery_estimate };
  } catch(e) { console.error(e); }
  return null;
}

async function createEnviaLabel(customer, qty) {
  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: { ...FACTORY_ORIGIN, postal_code: "22614", country_code: "MX" },
        destination: { name: customer.name, email: customer.email, phone: customer.phone, street: customer.address.line1, number: "", district: customer.address.line2||"", city: customer.address.city, state: customer.address.state, country: "MX", postal_code: customer.address.postal_code },
        packages: [{ content: "Merch", amount: 1, type: "box", weight: qty*0.6, dimensions: { length: 30, width: 25, height: 15 }, declared_value: 400*qty }],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" }
      })
    });
    const result = await res.json();
    if(result?.data?.[0]) return { tracking: result.data[0].tracking_number, labelUrl: result.data[0].label, carrier: result.data[0].carrier };
  } catch(e) { console.error(e); }
  return null;
}

module.exports = { jsonResponse, safeJsonParse, digitsOnly, getEnviaQuote, createEnviaLabel, FALLBACK_MX_PRICE, FALLBACK_US_PRICE, supabase };
