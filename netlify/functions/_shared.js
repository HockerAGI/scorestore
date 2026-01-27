const { createClient } = require("@supabase/supabase-js");
const localCatalog = require("../../data/catalog.json"); // NO se modifica

/**
 * SHARED HELPERS v2026 (Unified)
 * - ENV VARS ONLY (no secrets en repo)
 * - Soporta Supabase (ÚNICO OS), Envia, Telegram, promos
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE, {
        auth: { persistSession: false },
      })
    : null;

// Origen (Único / Score Store)
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

const PROMO_RULES = {
  SCORE25: { type: "percent", value: 0.25, label: "25% OFF" },
  BAJA25: { type: "percent", value: 0.25, label: "25% OFF" },
  SCORE10: { type: "percent", value: 0.1, label: "10% OFF" },
};

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

const safeJsonParse = (str) => {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return {};
  }
};

const normalizeQty = (q) => {
  const n = parseInt(q, 10);
  return n > 0 ? n : 1;
};

const digitsOnly = (s) => String(s || "").replace(/[^\d]/g, "");

/**
 * Paquetería: fallback solo para que el MVP no muera.
 * Para operación REAL al 100%, guarda specs por SKU en ÚNICO OS:
 * weight_kg, length_cm, width_cm, height_cm, declared_value_mxn
 */
const getPackageSpecs = (qty) => {
  const q = normalizeQty(qty);
  return {
    weight: Math.max(1, q * 0.6),
    dimensions: {
      length: 30,
      width: 25,
      height: Math.min(60, 10 + Math.ceil(q * 2)),
    },
    declared_value: 400 * q,
  };
};

async function getEnviaQuote(zip, qty, country = "MX") {
  const ENVIA_API_TOKEN = process.env.ENVIA_API_TOKEN;
  if (!ENVIA_API_TOKEN) return null;

  const specs = getPackageSpecs(qty);

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_API_TOKEN}`,
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: country, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [
          {
            content: "SCORE Merch",
            amount: 1,
            type: "box",
            weight: specs.weight,
            dimensions: specs.dimensions,
            declared_value: specs.declared_value,
          },
        ],
      }),
    });

    const data = await res.json();
    const list = data?.data || [];
    if (!list.length) return null;

    const best = list.sort((a, b) => a.total_price - b.total_price)[0];

    return {
      mxn: Math.ceil(best.total_price * 1.05),
      carrier: best.carrier,
      days: best.delivery_estimate,
    };
  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}
async function createEnviaLabel(customer, itemsQty) {
  const ENVIA_API_TOKEN = process.env.ENVIA_API_TOKEN;
  if (!ENVIA_API_TOKEN) return null;

  const specs = getPackageSpecs(itemsQty);

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_API_TOKEN}`,
      },
      body: JSON.stringify({
        origin: { ...FACTORY_ORIGIN, postal_code: FACTORY_ORIGIN.postalCode },
        destination: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          street: customer.address.line1,
          district: customer.address.line2 || "",
          city: customer.address.city,
          state: customer.address.state,
          country: customer.address.country,
          postal_code: customer.address.postal_code,
        },
        packages: [
          {
            content: "SCORE Official Merch",
            amount: 1,
            type: "box",
            weight: specs.weight,
            dimensions: specs.dimensions,
            declared_value: specs.declared_value,
          },
        ],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" },
      }),
    });

    const result = await res.json();
    const row = result?.data?.[0];

    if (!row) {
      console.error("Envia Gen Error:", JSON.stringify(result));
      return null;
    }

    return {
      tracking: row.tracking_number,
      labelUrl: row.label,
      carrier: row.carrier,
    };
  } catch (e) {
    console.error("Envia Label Error:", e);
    return null;
  }
}

// DB -> JSON fallback
async function getProductDetails(id) {
  if (supabase) {
    const { data } = await supabase.from("products").select("*").eq("id", id).single();
    if (data) return data;
  }

  const local = (localCatalog?.products || []).find((p) => p.id === id);
  if (local) {
    return {
      id: local.id,
      name: local.name,
      price_mxn: local.baseMXN,
      image: local.img,
      sku: local.sku || local.id,
      size_chart: local.sizeChart || null,
    };
  }

  return null;
}

function getPromo(code) {
  if (!code) return null;
  return PROMO_RULES[String(code).toUpperCase()] || null;
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  digitsOnly,
  supabase,
  supabaseAdmin,
  getEnviaQuote,
  createEnviaLabel,
  getProductDetails,
  getPromo,
  FACTORY_ORIGIN,
};