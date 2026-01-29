/* =========================================================
   SCORE STORE — SHARED KERNEL (PROD 2026)
   - Centraliza: Envia.com, Supabase, CORS, Validaciones.
   - ORIGEN: Único Uniformes, Tijuana (Para cotizaciones reales)
   ========================================================= */

const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

// 1. CONFIGURACIÓN SEGURA
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET"
};

// CONSTANTES DE ENVÍO
const FALLBACK_MX_PRICE = 280; // Precio de seguridad MX
const FALLBACK_US_PRICE = 900; // Precio de seguridad USA
const SAFETY_MARGIN = 1.10;    // +10% sobre cotización real (colchón operativo)

// Origen de envío: FÁBRICA ÚNICO UNIFORMES (Tijuana)
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
  postalCode: "22614", // Tu CP real
  reference: "Interior JK",
};

// Keys
const ENVIA_KEY = process.env.ENVIA_API_KEY || ""; 
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ""; 

// 2. SUPABASE ADMIN
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE) 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } }) 
  : null;

// 3. HELPERS HTTP
const jsonResponse = (status, body) => ({
  statusCode: status,
  headers: HEADERS,
  body: JSON.stringify(body)
});

const handleOptions = (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, "ok");
  return null;
};

// Utils
function digitsOnly(str) { return String(str || "").replace(/\D/g, ""); }
function normalizeQty(n) { return Math.max(1, Math.round(Number(n) || 1)); }

// 4. LÓGICA DE PAQUETERÍA (Cálculo volumétrico)
function getPackageSpecs(qty) {
  const q = normalizeQty(qty);
  // Estimado: Hoodie (0.6kg) vs Playera (0.2kg) -> Promedio 0.5kg
  const weight = Math.max(1, q * 0.5); 
  // Caja crece según cantidad
  const height = Math.min(60, 5 + (q * 3)); 
  
  return {
    weight,
    dimensions: { length: 30, width: 20, height }, // Caja estándar 30x20
    content: "Ropa Deportiva Score International",
    declaredValue: q * 400 // Valor promedio para seguro
  };
}

// 5. API ENVIA: COTIZAR (Rate)
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!ENVIA_KEY) return null;
  const specs = getPackageSpecs(qty);
  
  try {
    const payload = {
      origin: {
        country_code: "MX",
        postal_code: FACTORY_ORIGIN.postalCode
      },
      destination: {
        country_code: countryCode,
        postal_code: digitsOnly(zip)
      },
      packages: [{
        content: specs.content,
        amount: 1,
        type: "box",
        weight: specs.weight,
        weight_unit: "KG",
        length_unit: "CM",
        dimensions: specs.dimensions,
        insurance: 0,
        declared_value: specs.declaredValue
      }],
      shipment: { carrier: "fedex" } // Preferencia
    };

    const { data } = await axios.post("https://api.envia.com/ship/rate", payload, {
      headers: { Authorization: `Bearer ${ENVIA_KEY}` }
    });

    const rates = data.data || [];
    // Buscar la mejor opción económica
    const best = rates.sort((a, b) => a.totalPrice - b.totalPrice)[0];

    if (best) {
      // Aplicar margen de seguridad
      const finalCost = Math.ceil(best.totalPrice * SAFETY_MARGIN);
      return {
        cost: finalCost,
        carrier: best.carrier,
        days: best.deliveryEstimate,
        currency: best.currency
      };
    }
    return null;
  } catch (e) {
    console.error("Envia Quote Error:", e.response?.data || e.message);
    return null;
  }
}

// 6. API ENVIA: GENERAR GUÍA (Label)
async function createEnviaLabel(customer, qty) {
  if (!ENVIA_KEY) return { ok: false, error: "No API Key" };
  const specs = getPackageSpecs(qty);

  try {
    const payload = {
      origin: { ...FACTORY_ORIGIN }, // Spread de la constante de fábrica
      destination: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        street: customer.address?.line1 || "",
        number: customer.address?.line2 || "S/N", // Stripe a veces manda numero en line2 o mezclado
        district: customer.address?.city || "",
        city: customer.address?.city,
        state: customer.address?.state,
        country: customer.address?.country || "MX",
        postal_code: customer.address?.postal_code
      },
      packages: [{
        content: specs.content,
        amount: 1,
        type: "box",
        weight: specs.weight,
        dimensions: specs.dimensions,
        declared_value: specs.declaredValue
      }],
      shipment: { carrier: "fedex", type: 1 },
      settings: { print_format: "PDF" }
    };

    const { data } = await axios.post("https://api.envia.com/ship/generate", payload, {
      headers: { Authorization: `Bearer ${ENVIA_KEY}` }
    });

    const result = data.data?.[0];
    if (result) {
      return {
        ok: true,
        tracking: result.trackingNumber,
        labelUrl: result.label,
        carrier: result.carrier
      };
    }
    return { ok: false, error: "No label data" };

  } catch (e) {
    console.error("Envia Label Error:", e.response?.data || e.message);
    return { ok: false, error: "API Error" };
  }
}

module.exports = {
  HEADERS,
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  getEnviaQuote,
  createEnviaLabel,
  digitsOnly,
  normalizeQty,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE
};