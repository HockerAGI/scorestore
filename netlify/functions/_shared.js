// netlify/functions/_shared.js
/* =========================================================
   SCORE STORE — SHARED HELPERS (UNIFIED 360 · v2026)
   ✅ HTTP helpers (CORS + JSON) + OPTIONS support
   ✅ Qty/ZIP sanitizers
   ✅ Envia.com:
      - validateZip (geocodes)
      - quote (rate)
      - label (generate)
   ✅ Package specs centralizados (peso/dimensiones/valor declarado)
   ✅ Promo rules
   ✅ Supabase opcional (no rompe si falta @supabase/supabase-js)
   ✅ Fallback shipping coherente (si Envia falla o no hay key)
   ========================================================= */

const axios = require("axios");

// -------------------------
// OPTIONAL: Supabase (no rompe si falta dependencia)
// -------------------------
let createClient = null;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch (_) {
  createClient = null;
}

// -------------------------
// ENV (NO hardcodear secretos)
// -------------------------
const ENVIA_KEY = process.env.ENVIA_API_KEY || ""; // ✅ set en Netlify env vars (secreto)

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

// -------------------------
// Supabase clients (si están configurados)
// -------------------------
const supabase =
  (createClient && SUPABASE_URL && SUPABASE_ANON)
    ? createClient(SUPABASE_URL, SUPABASE_ANON)
    : null;

const supabaseAdmin =
  (createClient && SUPABASE_URL && SUPABASE_SERVICE)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } })
    : null;

// -------------------------
// Shipping fallbacks (MXN)
// -------------------------
const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800;

// -------------------------
// Origen (Único Uniformes · Tijuana)
// - Unificado: sirve para rate + generate label (completo)
// -------------------------
const FACTORY_ORIGIN = {
  // Para cotización rápida
  postal_code: "22614",
  country_code: "MX",
  state_code: "BC",
  city: "Tijuana",

  // Para generación de guía (label)
  name: "Score Store / Único Uniformes",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotextil@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK",
};

// -------------------------
// Promo rules (si tu checkout decide usarlas)
// -------------------------
const PROMO_RULES = {
  SCORE25: { type: "percent", value: 0.25, label: "25% OFF" },
  BAJA25: { type: "percent", value: 0.25, label: "25% OFF" },
  SCORE10: { type: "percent", value: 0.10, label: "10% OFF" },
  BAJA200: { type: "fixed_mxn", value: 200, label: "$200 MXN OFF" },
  ENVIOFREE: { type: "free_shipping", value: 0, label: "ENVÍO GRATIS" },
};

// -------------------------
// CORS/Headers
// -------------------------
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*", // si quieres, pon tu dominio en prod
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...HEADERS, ...extraHeaders },
    body: JSON.stringify(data),
  };
}

function handleOptions(event) {
  if (event?.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  return null;
}

function safeJsonParse(body) {
  try {
    if (!body) return {};
    if (typeof body === "object") return body;
    return JSON.parse(body);
  } catch (e) {
    return {};
  }
}

// -------------------------
// Utils
// -------------------------
function normalizeQty(n) {
  const q = Number(n || 0);
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.round(q)));
}

function digitsOnly(s) {
  return String(s || "").replace(/\D+/g, "");
}

function normalizeZip(zip) {
  const z = String(zip || "").trim();
  return z.length >= 4 ? z : "";
}

function baseUrl(event) {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL;
  if (envUrl) return envUrl;

  const host =
    event?.headers?.["x-forwarded-host"] ||
    event?.headers?.host ||
    "localhost:8888";

  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

// -------------------------
// Package Specs (centralizado)
// - Unifica “estimateParcel” + “getPackageSpecs”
// -------------------------
function getPackageSpecs(itemsQty, weightKg, lengthCm, heightCm, widthCm) {
  const q = normalizeQty(itemsQty);

  // Default por ítem (promedio): 0.6kg (hoodie) / 0.2kg (tee) => promedio operativo 0.5-0.6
  const perItemWeight =
    Number(weightKg) > 0
      ? Number(weightKg) / Math.max(1, q)
      : 0.6;

  // Carriers muchas veces penalizan peso mínimo; aquí dejamos mínimo 1kg para estabilidad
  const totalWeight = Math.max(1, perItemWeight * q);

  // Caja base (CM)
  const L = Number(lengthCm) > 0 ? Number(lengthCm) : 30;
  const W = Number(widthCm) > 0 ? Number(widthCm) : 20;
  // Altura crece con qty (limite razonable)
  const H = Number(heightCm) > 0 ? Number(heightCm) : Math.min(60, 5 + Math.ceil(q * 3));

  // Valor declarado: consistente con tu lógica anterior
  const declared_value = 400 * q;

  return {
    qty: q,
    weight: Number(totalWeight.toFixed(2)),
    dimensions: { length: L, width: W, height: H },
    declared_value,
  };
}

// Alias para compat con código viejo
function estimateParcel(qty) {
  const specs = getPackageSpecs(qty);
  return {
    weight: specs.weight,
    length: specs.dimensions.length,
    width: specs.dimensions.width,
    height: specs.dimensions.height,
  };
}

// -------------------------
// ZIP validation (Envia Geocodes API)
// - Si no hay ENVIA_KEY: NO bloquea (ok:true)
// -------------------------
async function validateZip(countryCode, zip) {
  if (!ENVIA_KEY) return { ok: true, source: "no_key" };

  const cc = String(countryCode || "MX").toUpperCase();
  const z = digitsOnly(zip);

  if (!z || z.length < 4) return { ok: false, error: "ZIP_INVALID" };

  try {
    const url = `https://geocodes.envia.com/zipcode/${cc}/${z}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${ENVIA_KEY}` },
      timeout: 12000,
    });

    return { ok: true, source: "geocodes", data: res?.data || null, zip: z, country: cc };
  } catch (e) {
    return { ok: false, error: "ZIP_NOT_FOUND" };
  }
}

// -------------------------
// Envia quote (Ship Rate API) — PRIORIDAD
// Firma flexible: (zip, qty, countryCode, weightKg?, lengthCm?, heightCm?, widthCm?)
// Devuelve: { price, currency, carrier, service, days, mxn, raw }
// -------------------------
async function getEnviaQuote(zip, itemsQty, countryCode = "MX", weightKg, lengthCm, heightCm, widthCm) {
  if (!ENVIA_KEY) return null;

  const destinationZip = digitsOnly(zip);
  const cc = String(countryCode || "MX").toUpperCase();
  if (!destinationZip || destinationZip.length < 4) return null;

  const specs = getPackageSpecs(itemsQty, weightKg, lengthCm, heightCm, widthCm);

  try {
    const url = "https://api.envia.com/ship/rate/";
    const headers = {
      Authorization: `Bearer ${ENVIA_KEY}`,
      "Content-Type": "application/json",
    };

    const payload = {
      origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postal_code },
      destination: { country_code: cc, postal_code: String(destinationZip) },
      // Mantiene compat con tu lógica anterior; si envía devuelve varias, igual elegimos la mejor
      shipment: { carrier: "fedex", type: 1 },
      packages: [
        {
          content: "Merchandise SCORE International",
          amount: 1,
          type: "box",
          weight: specs.weight,
          weight_unit: "KG",
          length_unit: "CM",
          dimensions: specs.dimensions,
          insurance: 0,
          declared_value: specs.declared_value,
        },
      ],
      settings: {
        currency: "MXN",
        print_format: "PDF",
      },
    };

    const res = await axios.post(url, payload, { headers, timeout: 15000 });

    const rates = res?.data?.data || res?.data || [];
    const arr = Array.isArray(rates) ? rates : [];
    if (!arr.length) return null;

    // Normaliza campos comunes y toma la tarifa más barata
    const mapped = arr
      .map((r) => {
        const price =
          Number(r?.totalPrice) ||
          Number(r?.total_price) ||
          Number(r?.price) ||
          Number(r?.amount) ||
          0;

        const days =
          Number(r?.deliveryTime) ||
          Number(r?.delivery_time) ||
          Number(r?.deliveryEstimate) ||
          Number(r?.delivery_estimate) ||
          Number(r?.delivery_min) ||
          Number(r?.days) ||
          null;

        const carrier = r?.carrier || r?.carrier_name || null;
        const service = r?.service || r?.service_name || null;

        return { price, days, carrier, service, raw: r };
      })
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
      .sort((a, b) => a.price - b.price);

    if (!mapped.length) return null;

    // Margen operativo +5% (seguridad)
    const best = mapped[0];
    const mxn = Math.ceil(best.price * 1.05);

    return {
      ok: true,
      price: Number(best.price),
      currency: "MXN",
      carrier: best.carrier,
      service: best.service,
      days: best.days,
      mxn,
      raw: best.raw,
    };
  } catch (e) {
    return null;
  }
}

// -------------------------
// Envia label (Ship Generate API) — PRIORIDAD
// Devuelve: { tracking, labelUrl, carrier, raw }
// -------------------------
async function createEnviaLabel(customer, itemsQty, carrier = "fedex", type = 1, weightKg, lengthCm, heightCm, widthCm) {
  if (!ENVIA_KEY) return null;

  const q = normalizeQty(itemsQty);
  const specs = getPackageSpecs(q, weightKg, lengthCm, heightCm, widthCm);

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
      reference: FACTORY_ORIGIN.reference || "",
    },
    destination: {
      name: customer?.name || "Cliente",
      email: customer?.email || "cliente@scorestore.com",
      phone: customer?.phone || "0000000000",
      street: customer?.address?.line1 || "",
      number: customer?.address?.number || "",
      district: customer?.address?.line2 || "",
      city: customer?.address?.city || "",
      state: customer?.address?.state || "",
      country: customer?.address?.country || "MX",
      postal_code: customer?.address?.postal_code || "",
      reference: customer?.address?.reference || "",
    },
    packages: [
      {
        content: "Merchandise SCORE International",
        amount: 1,
        type: "box",
        weight: specs.weight,
        dimensions: specs.dimensions,
        declared_value: specs.declared_value,
      },
    ],
    shipment: { carrier, type },
    settings: { print_format: "PDF", print_size: "STOCK_4X6" },
  };

  try {
    const url = "https://api.envia.com/ship/generate/";
    const headers = { Authorization: `Bearer ${ENVIA_KEY}` };

    const res = await axios.post(url, payload, { headers, timeout: 20000 });
    const result = res?.data || null;

    const row = result?.data?.[0] || null;
    if (!row) return null;

    return {
      ok: true,
      tracking: row.tracking_number || row.tracking || null,
      labelUrl: row.label || row.label_url || null,
      carrier: row.carrier || carrier,
      raw: row,
    };
  } catch (e) {
    console.error("Envia Generate Error:", e?.response?.data || e?.message || e);
    return null;
  }
}

// -------------------------
// Products (Supabase) — opcional
// -------------------------
async function getProductsFromDb({ orgSlug = "score-store" } = {}) {
  if (!supabaseAdmin && !supabase) {
    return { ok: false, reason: "Supabase client not configured", orgId: null, products: [] };
  }

  const client = supabaseAdmin || supabase;

  const { data: org, error: orgErr } = await client
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (orgErr || !org) {
    return { ok: false, reason: "Organization not found", orgId: null, products: [] };
  }

  const { data: products, error: prodErr } = await client
    .from("products")
    .select("id, org_id, name, price, image_url, active, sku")
    .eq("org_id", org.id);

  if (prodErr || !products) {
    return { ok: false, reason: "Products query failed", orgId: org.id, products: [] };
  }

  const filtered = products.filter((p) => p.active !== false);
  return { ok: true, orgId: org.id, products: filtered };
}

// -------------------------
// Fallback helpers
// -------------------------
function getFallbackShipping(countryCode = "MX") {
  const cc = String(countryCode || "MX").toUpperCase();
  return cc === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
}

module.exports = {
  // ✅ Headers / preflight
  HEADERS,
  handleOptions,

  // Supabase
  supabase,
  supabaseAdmin,
  SUPABASE_URL,

  // HTTP + parsing
  jsonResponse,
  safeJsonParse,
  baseUrl,

  // utils
  normalizeQty,
  digitsOnly,
  normalizeZip,
  getPackageSpecs,
  estimateParcel,

  // shipping constants
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  getFallbackShipping,

  // promos
  PROMO_RULES,

  // Envia priority
  validateZip,
  getEnviaQuote,
  createEnviaLabel,

  // optional DB
  getProductsFromDb,

  // origin
  FACTORY_ORIGIN,
};