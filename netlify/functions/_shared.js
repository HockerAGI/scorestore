// netlify/functions/_shared.js
// Shared helpers for SCORE Store (Stripe + Envia)
// - JSON/CORS helpers
// - Safe JSON parse
// - Qty normalization
// - digitsOnly + baseUrl
// - Envia: quote + (opcional) create label
// - Supabase Admin (opcional) para guardar/actualizar orders
//
// REQUIERE (según uso):
// - ENVIA_API_KEY (si quieres cotizar y/o generar guías)
// - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (si quieres guardar orders)
//
// NOTA: No hardcodees secretos aquí. Usa env vars en Netlify.

const axios = require("axios");

// --------- Shipping fallbacks (MXN) ----------
const FALLBACK_MX_PRICE = 250; // MXN
const FALLBACK_US_PRICE = 800; // MXN

// --------- Responses ----------
function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}

function safeJsonParse(body) {
  try {
    if (!body) return {};
    if (typeof body === "object") return body;
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function normalizeQty(n) {
  const q = Number(n || 0);
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.round(q)));
}

function digitsOnly(s) {
  return String(s || "").replace(/\D+/g, "");
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

// --------- ORIGEN FÁBRICA (para guías) ----------
const FACTORY_ORIGIN = {
  name: "SCORE Store / Único Uniformes",
  company: "BAJATEX, S. de R.L. de C.V.",
  email: "ventas.unicotexti@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postal_code: "22614",
  reference: "Interior JK",
};

// --------- Envia quote (best-effort) ----------
async function getEnviaQuote(zip, itemsQty, countryCode = "MX") {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  const qty = normalizeQty(itemsQty);
  const destinationZip = digitsOnly(zip);

  if (!destinationZip || destinationZip.length < 4) return null;

  try {
    const url = "https://api.envia.com/ship/rate/";
    const headers = { Authorization: `Bearer ${apiKey}` };

    // Payload mínimo viable (ajusta si tu cuenta Envia requiere más campos)
    const payload = {
      origin: { postal_code: FACTORY_ORIGIN.postal_code, country_code: "MX" },
      destination: {
        postal_code: String(destinationZip),
        country_code: String(countryCode || "MX"),
      },
      packages: [
        {
          content: "Merch SCORE Store",
          amount: qty,
          type: "box",
          weight: 1,
          insurance: 0,
          declared_value: 0,
          weight_unit: "KG",
          length_unit: "CM",
          dimensions: { length: 28, width: 22, height: 6 },
        },
      ],
    };

    const res = await axios.post(url, payload, { headers, timeout: 12000 });

    const rates = res?.data?.data || res?.data || [];
    const arr = Array.isArray(rates) ? rates : [];
    if (!arr.length) return null;

    const mapped = arr
      .map((r) => {
        const amount =
          Number(r?.totalPrice) ||
          Number(r?.total_price) ||
          Number(r?.price) ||
          Number(r?.amount) ||
          0;

        const carrier =
          r?.carrier?.name ||
          r?.carrier ||
          r?.provider ||
          r?.service ||
          "Envia";

        const days =
          Number(r?.deliveryTime) ||
          Number(r?.delivery_time) ||
          Number(r?.days) ||
          null;

        return { amount, carrier, days, raw: r };
      })
      .filter((x) => Number.isFinite(x.amount) && x.amount > 0)
      .sort((a, b) => a.amount - b.amount);

    if (!mapped.length) return null;

    return {
      mxn: mapped[0].amount,
      carrier: mapped[0].carrier,
      days: mapped[0].days,
      raw: mapped[0].raw,
    };
  } catch {
    return null;
  }
}

// --------- OPTIONAL: Supabase Admin (SAFE) ----------
let supabaseAdmin = null;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    const { createClient } = require("@supabase/supabase-js");
    supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
} catch {
  supabaseAdmin = null;
}

// --------- OPTIONAL: Envia label creator (REAL, pero SAFE) ----------
// Si no está ENVIA_API_KEY o falta address, regresa null y NO rompe.
async function createEnviaLabel(customerData, itemsQty = 1) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  const qty = normalizeQty(itemsQty);

  const addr = customerData?.address || null;
  const name = customerData?.name || "Cliente";
  const email = customerData?.email || "cliente@scorestore.com";
  const phone = digitsOnly(customerData?.phone || "") || "0000000000";

  // Envia requiere address completo para guía:
  if (!addr || !addr.postal_code || !addr.country) return null;

  try {
    const url = "https://api.envia.com/ship/generate/";
    const headers = { Authorization: `Bearer ${apiKey}` };

    // Peso estimado: 0.6kg por prenda (promedio seguro)
    const weightKg = Math.max(1, qty) * 0.6;

    const payload = {
      origin: {
        name: FACTORY_ORIGIN.name,
        company: FACTORY_ORIGIN.company,
        email: FACTORY_ORIGIN.email,
        phone: FACTORY_ORIGIN.phone,
        street: FACTORY_ORIGIN.street,
        number: FACTORY_ORIGIN.number,
        district: FACTORY_ORIGIN.district,
        city: FACTORY_ORIGIN.city,
        state: FACTORY_ORIGIN.state,
        country: FACTORY_ORIGIN.country,
        postal_code: FACTORY_ORIGIN.postal_code,
        reference: FACTORY_ORIGIN.reference,
      },
      destination: {
        name,
        email,
        phone,
        street: addr.line1 || addr.street || "",
        district: addr.line2 || "",
        city: addr.city || "",
        state: addr.state || "",
        country: addr.country || "MX",
        postal_code: addr.postal_code || "",
      },
      packages: [
        {
          content: "Merchandise SCORE",
          amount: 1,
          type: "box",
          weight: weightKg,
          dimensions: { length: 30, width: 25, height: 15 },
          declared_value: 400 * qty,
        },
      ],
      // carrier/type dependen de tu cuenta; esto es “best effort”
      shipment: { type: 1 },
      settings: { print_format: "PDF", print_size: "STOCK_4X6" },
    };

    const res = await axios.post(url, payload, { headers, timeout: 20000 });
    const result = res?.data || {};
    const row = result?.data?.[0];

    if (!row) return null;

    return {
      tracking: row.tracking_number || row.tracking || "N/A",
      labelUrl: row.label || row.label_url || "",
      carrier: row.carrier || row.provider || "Envia",
      raw: row,
    };
  } catch (e) {
    console.error("[createEnviaLabel] error:", e?.message || e);
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  digitsOnly,
  baseUrl,

  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,

  getEnviaQuote,

  // opcionales:
  supabaseAdmin,
  createEnviaLabel,
  FACTORY_ORIGIN,
};