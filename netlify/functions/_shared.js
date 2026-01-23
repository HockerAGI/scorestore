const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

/* --- CREDENCIALES HARDCODED (RESPALDO DE SEGURIDAD) --- */
const ENVIA_API_KEY = process.env.ENVIA_API_KEY || "89d853b2b6fd03f6fcbea5e1570a15265342d53315fc9a36b16769bbf9bad4c6";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODY4MDEzMywiZXhwIjoyMDg0MjU2MTMzfQ.GvGMT-Ftx3hfuHHQdGcDCnHcap_3BBSnatl0CjPQ5Mo";

// Cliente Admin de Supabase
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) 
  : null;

// Cliente Público (para consultas simples si fuera necesario)
const supabase = (SUPABASE_URL) ? createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE") : null;

/* --- DATOS DE ORIGEN (BAJATEX / ÚNICO) --- */
const FACTORY_ORIGIN = {
  name: "SCORE Store / Único Uniformes",
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
  reference: "Interior JK"
};

/* --- REGLAS DE NEGOCIO --- */
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

const PROMO_RULES = {
  "SCORE25": { type: "percent", value: 0.25, label: "25% OFF" },
  "BAJA25": { type: "percent", value: 0.25, label: "25% OFF" },
  "SCORE10": { type: "percent", value: 0.10, label: "10% OFF" },
  "BAJA200": { type: "fixed_mxn", value: 200, label: "$200 MXN OFF" },
  "ENVIOFREE": { type: "free_shipping", value: 0, label: "ENVÍO GRATIS" }
};

/* --- UTILIDADES --- */
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

const safeJsonParse = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
const normalizeQty = (qty) => { const n = parseInt(qty, 10); return (Number.isFinite(n) && n > 0) ? n : 1; };
const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

// Cálculo de Dimensiones de Caja
const getPackageSpecs = (qty) => {
  const q = normalizeQty(qty);
  return {
    weight: Math.max(1, q * 0.6), // Mínimo 1kg, 600g por prenda extra
    dimensions: {
      length: 30,
      width: 25,
      height: Math.min(60, 10 + Math.ceil(q * 2)) // La caja crece hacia arriba
    },
    declared_value: 400 * q // Valor declarado para seguro
  };
};

/* --- ENVIA.COM COTIZACIÓN --- */
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!ENVIA_API_KEY) return null;
  const specs = getPackageSpecs(qty);

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{ 
          content: "Merchandise SCORE", amount: 1, type: "box", 
          weight: specs.weight, dimensions: specs.dimensions, declared_value: specs.declared_value 
        }]
      })
    });

    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;

    // Priorizar FedEx, si no, el más barato
    const best = list.find(q => q.carrier.toLowerCase().includes("fedex")) || list.sort((a, b) => a.total_price - b.total_price)[0];
    
    return {
      mxn: Math.ceil(best.total_price * 1.10), // +10% margen de seguridad
      carrier: best.carrier,
      days: best.delivery_estimate
    };
  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}

/* --- ENVIA.COM GENERACIÓN DE GUÍA --- */
async function createEnviaLabel(customer, itemsQty) {
  if (!ENVIA_API_KEY) return null;
  const specs = getPackageSpecs(itemsQty);

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: FACTORY_ORIGIN,
        destination: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone, // ¡CRUCIAL! FedEx requiere teléfono
          street: customer.address.line1,
          district: customer.address.line2 || "Colonia",
          city: customer.address.city,
          state: customer.address.state,
          country: customer.address.country,
          postal_code: customer.address.postal_code,
        },
        packages: [{ 
          content: "SCORE Merchandise", amount: 1, type: "box", 
          weight: specs.weight, dimensions: specs.dimensions, declared_value: specs.declared_value 
        }],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" }
      })
    });

    const result = await res.json();
    const row = result?.data?.[0];
    
    if (!row) { console.error("Envia Gen Error Data:", JSON.stringify(result)); return null; }
    return { tracking: row.tracking_number, labelUrl: row.label, carrier: row.carrier };
  } catch (e) {
    console.error("Envia Gen Error:", e);
    return null;
  }
}

/* --- SUPABASE PRODUCT CHECK --- */
async function getProductsFromDb(orgSlug = "score-store") {
  if (!supabaseAdmin) return { ok: false, products: [] };
  
  try {
    const { data: org } = await supabaseAdmin.from("organizations").select("id").eq("slug", orgSlug).single();
    if (!org) return { ok: false, products: [] };

    const { data: products } = await supabaseAdmin.from("products").select("*").eq("org_id", org.id).eq("active", true);
    return { ok: true, products: products || [] };
  } catch (e) {
    return { ok: false, products: [] };
  }
}

module.exports = {
  supabase, supabaseAdmin, jsonResponse, safeJsonParse, normalizeQty, digitsOnly,
  getEnviaQuote, createEnviaLabel, getProductsFromDb,
  FALLBACK_MX_PRICE, FALLBACK_US_PRICE, PROMO_RULES
};