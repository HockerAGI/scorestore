/**
 * _shared.js — FINAL MASTER (Shared Utilities)
 */

const { createClient } = require("@supabase/supabase-js");

// --- CREDENCIALES ---
// Prioridad: Variables de entorno de servidor > Fallbacks hardcodeados (solo si es necesario)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

// Inicializar Cliente
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// --- CONSTANTES ---
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

// --- HELPERS ---
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

const safeJsonParse = (str) => {
  try { return JSON.parse(str); } catch { return {}; }
};

const digitsOnly = (str) => String(str || "").replace(/[^0-9]/g, "");

function normalizeQty(qty) {
  const n = parseInt(qty, 10);
  return (isNaN(n) || n < 1) ? 1 : n;
}

function normalizeZip(zip) {
  const z = String(zip || "").trim();
  return z.length >= 5 ? z : "";
}

/* --- LOGÍSTICA (ENVIA.COM) --- */
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!process.env.ENVIA_API_KEY) return null;

  const safeZip = normalizeZip(zip);
  if (!safeZip) return null;

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
          amount: 1, type: "box",
          weight: normalizeQty(qty) * 0.6,
          dimensions: { length: 30, width: 25, height: 10 + normalizeQty(qty) },
          declared_value: 400 * normalizeQty(qty),
        }],
      }),
    });
    
    const data = await res.json();
    if (data?.data?.length > 0) {
      // Ordenar por precio y tomar el mejor
      const best = data.data.sort((a, b) => a.total_price - b.total_price)[0];
      return {
        mxn: Math.ceil(best.total_price * 1.05), // +5% margen
        carrier: best.carrier,
        days: best.delivery_estimate
      };
    }
    return null;
  } catch (e) {
    console.error("Envia Error:", e.message);
    return null;
  }
}

async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;
  const safeZip = normalizeZip(customer.address?.postal_code);
  if (!safeZip) return null;

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
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          street: customer.address?.line1 || "Calle Principal",
          number: "",
          district: customer.address?.line2 || "",
          city: customer.address?.city || "",
          state: customer.address?.state || "",
          country: customer.address?.country || "MX",
          postal_code: safeZip,
        },
        packages: [{
          content: "Merchandise SCORE",
          amount: 1, type: "box",
          weight: normalizeQty(itemsQty) * 0.6,
          dimensions: { length: 30, width: 25, height: 15 },
          declared_value: 400 * normalizeQty(itemsQty),
        }],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" },
      }),
    });
    const result = await res.json();
    if (result?.data?.[0]) {
      return {
        tracking: result.data[0].tracking_number,
        labelUrl: result.data[0].label,
        carrier: result.data[0].carrier
      };
    }
    return null;
  } catch (e) {
    console.error("Label Error:", e.message);
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  getEnviaQuote,
  createEnviaLabel,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  supabase,
};
