const { createClient } = require("@supabase/supabase-js");
const localCatalog = require("../../data/catalog.json"); // Fallback de seguridad

/**
 * SHARED HELPERS v2026 (Unified Master)
 */

// --- CONFIGURACIÓN SUPABASE (ÚNICO OS) ---
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Clientes de Base de Datos
const supabase = (SUPABASE_URL && SUPABASE_ANON) ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE) ? createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } }) : null;

// --- DATOS DE ORIGEN (FÁBRICA) ---
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

// --- CONFIGURACIÓN COMERCIAL ---
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

const PROMO_RULES = {
  "SCORE25": { type: "percent", value: 0.25, label: "25% OFF" },
  "BAJA25": { type: "percent", value: 0.25, label: "25% OFF" },
  "SCORE10": { type: "percent", value: 0.10, label: "10% OFF" },
  "STAFF": { type: "percent", value: 1.00, label: "100% OFF (Interno)" }
};

// --- UTILIDADES ---
const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  },
  body: JSON.stringify(body),
});

const safeJsonParse = (str) => { try { return JSON.parse(str || "{}"); } catch { return {}; } };
const normalizeQty = (q) => { const n = parseInt(q); return (n > 0) ? n : 1; };
const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

// --- LÓGICA DE PAQUETERÍA (Centralizada) ---
const getPackageSpecs = (qty) => {
  const q = normalizeQty(qty);
  return {
    weight: Math.max(1, q * 0.6), // Mínimo 1kg, 600g por prenda
    dimensions: {
      length: 30,
      width: 25,
      height: Math.min(60, 10 + Math.ceil(q * 2)) // Altura dinámica
    },
    declared_value: 400 * q // Valor seguro declarado
  };
};

// 1. COTIZAR ENVÍO (ENVIA.COM)
async function getEnviaQuote(zip, qty, country = "MX") {
  if (!process.env.ENVIA_API_KEY) return null;
  
  const specs = getPackageSpecs(qty);
  
  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: country, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{ 
          content: "SCORE Merch", amount: 1, type: "box", 
          weight: specs.weight, dimensions: specs.dimensions, declared_value: specs.declared_value 
        }]
      })
    });
    
    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;

    // Filtro inteligente: Preferencia FedEx/DHL, sino el más barato
    const best = list.sort((a,b) => a.total_price - b.total_price)[0];
    
    return { 
      mxn: Math.ceil(best.total_price * 1.05), // +5% margen seguridad
      carrier: best.carrier, 
      days: best.delivery_estimate 
    };
  } catch(e) { 
    console.error("Envia Quote Error:", e);
    return null; 
  }
}

// 2. GENERAR GUÍA REAL
async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;
  const specs = getPackageSpecs(itemsQty);

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: { ...FACTORY_ORIGIN, postal_code: FACTORY_ORIGIN.postalCode },
        destination: {
          name: customer.name, email: customer.email, phone: customer.phone,
          street: customer.address.line1, district: customer.address.line2 || "", city: customer.address.city,
          state: customer.address.state, country: customer.address.country, postal_code: customer.address.postal_code
        },
        packages: [{ 
          content: "SCORE Official Merch", amount: 1, type: "box", 
          weight: specs.weight, dimensions: specs.dimensions, declared_value: specs.declared_value 
        }],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" }
      })
    });
    
    const result = await res.json();
    const row = result?.data?.[0];
    
    if (!row) {
        console.error("Envia Gen Error:", JSON.stringify(result));
        return null;
    }
    
    return { tracking: row.tracking_number, labelUrl: row.label, carrier: row.carrier };
  } catch(e) { return null; }
}

// 3. OBTENER DETALLES DE PRODUCTO (Híbrido: DB -> JSON)
async function getProductDetails(id) {
    // A. Intentar buscar en Supabase (Datos frescos)
    if (supabase) {
        const { data } = await supabase.from('products').select('*').eq('id', id).single();
        if (data) return data;
    }
    
    // B. Fallback a JSON Local (Resiliencia)
    const local = localCatalog.products.find(p => p.id === id);
    if (local) return { 
        name: local.name, 
        price_mxn: local.baseMXN, 
        image: local.img, 
        sku: local.sku 
    };
    
    return null;
}

function getPromo(code) {
    if (!code) return null;
    return PROMO_RULES[code.toUpperCase()] || null;
}

module.exports = { 
    jsonResponse, safeJsonParse, normalizeQty, digitsOnly,
    supabase, supabaseAdmin, 
    getEnviaQuote, createEnviaLabel, 
    getProductDetails, getPromo,
    FALLBACK_MX_PRICE, FALLBACK_US_PRICE 
};
