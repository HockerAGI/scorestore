"use strict";

const fs = require("fs");
const path = require("path");

let Stripe = null;
try { Stripe = require("stripe"); } catch {}
let createClient = null;
try { ({ createClient } = require("@supabase/supabase-js")); } catch {}

const corsHeaders = (origin) => ({
  "access-control-allow-origin": origin || "*",
  "access-control-allow-headers": "content-type, stripe-signature, x-org-id",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-max-age": "86400",
});

const jsonResponse = (statusCode, data, origin) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(origin),
  },
  body: JSON.stringify(data ?? {}),
});

const handleOptions = (event) => ({
  statusCode: 204,
  headers: corsHeaders(event?.headers?.origin || event?.headers?.Origin),
  body: "",
});

const safeJsonParse = (raw) => {
  try {
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const clampInt = (v, min, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const normalizeQty = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      sku: String(it?.sku || "").trim(),
      qty: clampInt(it?.qty, 1, 99),
      size: it?.size ? String(it.size).trim() : "",
    }))
    .filter((it) => it.sku);
};

const itemsQtyFromAny = (items) =>
  normalizeQty(items).reduce((sum, it) => sum + Number(it.qty || 0), 0);

const getBaseUrl = (event) => {
  const headers = event?.headers || {};
  const proto = headers["x-forwarded-proto"] || "https";
  const host = headers["x-forwarded-host"] || headers.host || process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!host) return "https://example.com";
  if (host.startsWith("http")) return host;
  return `${proto}://${host}`;
};

// CORRECCIÓN: Manejo seguro de archivos. Si no existe, no rompe el servidor.
const readJsonFile = (relPath) => {
  try {
    const p = path.join(process.cwd(), relPath);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      return JSON.parse(raw);
    }
    return null;
  } catch (e) {
    console.warn(`[Sistema] Archivo no encontrado o error de lectura en ${relPath}:`, e.message);
    return null;
  }
};

const getCatalogIndex = () => {
  const cat = readJsonFile("data/catalog.json");
  const products = Array.isArray(cat?.products) ? cat.products : [];
  const idx = new Map();
  for (const p of products) {
    const sku = String(p?.sku || p?.id || "").trim();
    if (!sku) continue;
    idx.set(sku, p);
  }
  return { catalog: cat, index: idx };
};

const validateZip = (zip, country) => {
  const z = String(zip || "").trim();
  const c = String(country || "").toUpperCase().trim();

  if (c === "US") {
    if (!/^\d{5}(-\d{4})?$/.test(z)) return null;
    return z;
  }

  if (z.length < 4 || z.length > 10) return null;
  if (!/^[a-zA-Z0-9\- ]+$/.test(z)) return null;
  return z;
};

const isSupabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && createClient);

const supabaseAdmin = (() => {
  let client = null;
  return () => {
    if (!isSupabaseConfigured()) return null;
    if (client) return client;
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { "x-client-info": "scorestore-netlify-functions" } },
    });
    return client;
  };
})();

// CORRECCIÓN: Telegram ahora usa Fetch Nativo
const sendTelegram = async (text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text || "").slice(0, 3500),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      })
    });
  } catch (e) {
    console.log("[telegram] warn:", e?.message || e);
  }
};

const ENVIA_API_URL = (process.env.ENVIA_API_URL || "https://api.envia.com").replace(/\/+$/, "");
const ENVIA_GEOCODES_URL = (process.env.ENVIA_GEOCODES_URL || "https://geocodes.envia.com").replace(/\/+$/, "");

const requireEnviaKey = () => {
  const key = process.env.ENVIA_API_KEY;
  if (!key) throw new Error("ENVIA_API_KEY no configurada");
  return key;
};

const enviaHeaders = () => ({
  authorization: `Bearer ${requireEnviaKey()}`,
  "content-type": "application/json",
});

const getOriginByCountry = (country) => {
  const c = String(country || "MX").toUpperCase();
  if (c === "US") {
    return {
      name: process.env.ORIGIN_US_NAME || "Score Store US",
      company: process.env.ORIGIN_US_COMPANY || "Score Store",
      email: process.env.ORIGIN_US_EMAIL || process.env.FACTORY_EMAIL || "ventas@scorestore.com",
      phone: process.env.ORIGIN_US_PHONE || "8180000000",
      street: process.env.ORIGIN_US_STREET || "Main St",
      number: process.env.ORIGIN_US_NUMBER || "1",
      district: process.env.ORIGIN_US_DISTRICT || "Other",
      city: process.env.ORIGIN_US_CITY || "San Diego",
      state: process.env.ORIGIN_US_STATE || "CA",
      country: "US",
      postalCode: process.env.ORIGIN_US_POSTAL || "92101",
      reference: process.env.ORIGIN_US_REFERENCE || "",
    };
  }

  return {
    name: process.env.ORIGIN_MX_NAME || "Score Store MX",
    company: process.env.ORIGIN_MX_COMPANY || "Único Uniformes",
    email: process.env.ORIGIN_MX_EMAIL || process.env.FACTORY_EMAIL || "ventas@unico-uniformes.com",
    phone: process.env.ORIGIN_MX_PHONE || "6640000000",
    street: process.env.ORIGIN_MX_STREET || "Av. Ejemplo",
    number: process.env.ORIGIN_MX_NUMBER || "1",
    district: process.env.ORIGIN_MX_DISTRICT || "Centro",
    city: process.env.ORIGIN_MX_CITY || "Tijuana",
    state: process.env.ORIGIN_MX_STATE || "BC",
    country: "MX",
    postalCode: process.env.ORIGIN_MX_POSTAL || "22000",
    reference: process.env.ORIGIN_MX_REFERENCE || "",
    identificationNumber: process.env.ORIGIN_MX_RFC || undefined,
  };
};

const getPackageSpecs = (country, items_qty) => {
  const qty = clampInt(items_qty || 1, 1, 99);
  const c = String(country || "MX").toUpperCase();

  if (c === "US") {
    const weightLb = Number(process.env.PACK_WEIGHT_LB || 1) * qty;
    return {
      type: "box",
      content: "Score Store Merch",
      amount: 1,
      declaredValue: 0,
      weightUnit: "LB",
      lengthUnit: "IN",
      weight: Number.isFinite(weightLb) ? weightLb : 1,
      dimensions: {
        length: Number(process.env.PACK_L_IN || 11),
        width: Number(process.env.PACK_W_IN || 15),
        height: Number(process.env.PACK_H_IN || 20),
      },
    };
  }

  const weightKg = Number(process.env.PACK_WEIGHT_KG || 1) * qty;
  return {
    type: "box",
    content: "Score Store Merch",
    amount: 1,
    declaredValue: 0,
    weightUnit: "KG",
    lengthUnit: "CM",
    weight: Number.isFinite(weightKg) ? weightKg : 1,
    dimensions: {
      length: Number(process.env.PACK_L_CM || 30),
      width: Number(process.env.PACK_W_CM || 25),
      height: Number(process.env.PACK_H_CM || 10),
    },
  };
};

// CORRECCIÓN: Migración de Envia Geocodes a Fetch Nativo
const getZipDetails = async (country, zip) => {
  const c = String(country || "MX").toUpperCase();
  const z = validateZip(zip, c);
  if (!z) return null;

  try {
    const url = `${ENVIA_GEOCODES_URL}/zipcode/${encodeURIComponent(c)}/${encodeURIComponent(z)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${requireEnviaKey()}` } });
    if (!res.ok) return null;
    const data = await res.json();

    const city =
      data?.city ||
      data?.locality ||
      data?.town ||
      data?.data?.city ||
      data?.data?.locality ||
      (Array.isArray(data?.data) ? data.data[0]?.city : null);

    const state =
      data?.state ||
      data?.state_code ||
      data?.stateCode ||
      data?.data?.state ||
      data?.data?.state_code ||
      (Array.isArray(data?.data) ? (data.data[0]?.state_code || data.data[0]?.state) : null);

    return {
      city: city ? String(city) : null,
      state: state ? String(state).toUpperCase() : null,
      postalCode: z,
      country: c,
    };
  } catch (e) {
    console.log("[envia][zip] warn:", e?.message || e);
    return null;
  }
};

const pickBestRate = (rates) => {
  const arr = Array.isArray(rates) ? rates : [];
  let best = null;

  for (const r of arr) {
    const price =
      Number(r?.totalPrice ?? r?.basePrice ?? r?.price ?? r?.amount ?? r?.rate ?? NaN);
    if (!Number.isFinite(price) || price <= 0) continue;

    if (!best || price < best.price) {
      best = {
        carrier: String(r?.carrier || r?.carrierDescription || "carrier"),
        service: String(r?.serviceDescription || r?.service || "service"),
        deliveryEstimate: String(r?.deliveryEstimate || ""),
        price,
      };
    }
  }

  return best;
};

// CORRECCIÓN: Migración de Cotización Envia a Fetch Nativo
const getEnviaQuote = async ({ zip, country, items_qty }) => {
  const c = String(country || "MX").toUpperCase();
  const z = validateZip(zip, c);
  if (!z) throw new Error("CP/ZIP inválido");

  const origin = getOriginByCountry(c);
  const zipInfo = await getZipDetails(c, z);

  const destination = {
    name: "Cliente",
    company: "",
    email: "",
    phone: "",
    street: "",
    number: "",
    district: "Other",
    city: zipInfo?.city || "",
    state: zipInfo?.state || (c === "US" ? "CA" : "BC"),
    country: c,
    postalCode: z,
    reference: "",
  };

  const pkg = getPackageSpecs(c, items_qty || 1);

  const payload = {
    origin,
    destination,
    packages: [pkg],
    shipment: {
      carrier: c === "US" ? (process.env.ENVIA_US_DEFAULT_CARRIER || "usps") : (process.env.ENVIA_MX_DEFAULT_CARRIER || "dhl"),
      type: 1,
    },
    settings: {
      currency: "MXN",
    },
  };

  const url = `${ENVIA_API_URL}/ship/rate/`;
  const res = await fetch(url, {
    method: "POST",
    headers: enviaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  const rates = data?.data || data?.rates || data || [];
  
  const best = pickBestRate(rates);
  if (!best) {
    throw new Error("No se encontró tarifa (envía) para ese CP/ZIP");
  }

  let priceMXN = Number(best.price);
  if (!Number.isFinite(priceMXN) || priceMXN <= 0) throw new Error("Tarifa inválida");
  const fx = Number(process.env.FX_USD_TO_MXN) || 18; 
  if (String(c) === "US" && String(process.env.ENVIA_FORCE_USD_TO_MXN || "0") === "1") {
    if (Number.isFinite(fx) && fx > 0) priceMXN = priceMXN * fx;
  }

  const amount_cents = Math.round(priceMXN * 100);

  return {
    ok: true,
    provider: "envia",
    label: `${best.carrier.toUpperCase()} · ${best.service}`,
    country: c,
    amount_cents,
    amount_mxn: priceMXN,
  };
};

const getFallbackShipping = (country, items_qty) => {
  const c = String(country || "MX").toUpperCase();
  const qty = clampInt(items_qty || 1, 1, 99);

  const base = c === "US"
    ? Number(process.env.FALLBACK_US_PRICE_MXN || 450)
    : Number(process.env.FALLBACK_MX_PRICE_MXN || 250);

  const perItem = Number(process.env.FALLBACK_PER_ITEM_MXN || 0);
  const price = (Number.isFinite(base) ? base : 0) + (Number.isFinite(perItem) ? perItem * Math.max(0, qty - 1) : 0);

  const priceMXN = Math.max(0, price);
  return {
    ok: true,
    provider: "fallback",
    label: c === "US" ? "Envío USA (estimado)" : "Envío MX (estimado)",
    country: c,
    amount_cents: Math.round(priceMXN * 100),
    amount_mxn: priceMXN,
  };
};

const initStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurada");
  if (!Stripe) throw new Error("Dependencia 'stripe' no instalada");
  return new Stripe(key, { apiVersion: "2024-06-20" });
};

const readRawBody = (event) => {
  const body = event?.body || "";
  if (event?.isBase64Encoded) return Buffer.from(body, "base64");
  return Buffer.from(body, "utf8");
};

const stripeShippingToEnviaDestination = (shipping_details) => {
  const sd = shipping_details || {};
  const addr = sd.address || {};
  const country = String(addr.country || "").toUpperCase();

  return {
    name: sd.name || "Cliente",
    company: "",
    email: "",
    phone: "",
    street: addr.line1 || "",
    number: addr.line2 || "",
    district: addr.line2 || "Centro",
    city: addr.city || "",
    state: addr.state || "",
    country: country || "MX",
    postalCode: addr.postal_code || "",
    reference: "",
  };
};

// CORRECCIÓN: Migración de Guías Envia a Fetch Nativo
const createEnviaLabel = async ({ shipping_country, stripe_session, items_qty }) => {
  const country = String(shipping_country || "MX").toUpperCase();

  const origin = getOriginByCountry(country);
  const destination = stripeShippingToEnviaDestination(stripe_session?.shipping_details);

  if (!destination?.postalCode || !destination?.state || !destination?.country) {
    throw new Error("Dirección incompleta para generar guía");
  }

  const pkg = getPackageSpecs(country, items_qty || 1);

  const payload = {
    origin,
    destination,
    packages: [pkg],
    shipment: {
      carrier: country === "US"
        ? (process.env.ENVIA_US_DEFAULT_CARRIER || "usps")
        : (process.env.ENVIA_MX_DEFAULT_CARRIER || "dhl"),
      type: 1,
    },
    settings: {
      printFormat: "PDF",
      printSize: "STOCK_4X6",
      currency: "MXN",
    },
  };

  const url = `${ENVIA_API_URL}/ship/generate/`;
  const res = await fetch(url, {
    method: "POST",
    headers: enviaHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  return data?.data || data;
};

module.exports = {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  clampInt,
  normalizeQty,
  itemsQtyFromAny,
  getBaseUrl,
  validateZip,

  readJsonFile,
  getCatalogIndex,

  isSupabaseConfigured,
  supabaseAdmin,

  sendTelegram,

  getEnviaQuote,
  getFallbackShipping,
  createEnviaLabel,

  initStripe,
  readRawBody,
};
