const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
const catalog = require("../../data/catalog.json"); // NO modificar

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function safeJsonParse(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}

function normalizeQty(q) {
  const n = parseInt(q, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// === Supabase (ÚNICO OS) ===
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

// === Promos ===
const PROMOS = {
  SCORE25: { type: "percent", value: 0.25, label: "SCORE25 - 25% OFF" },
  BAJA25:  { type: "percent", value: 0.25, label: "BAJA25 - 25% OFF" },
  SCORE10: { type: "percent", value: 0.10, label: "SCORE10 - 10% OFF" }
};

function getPromo(code) {
  if (!code) return null;
  return PROMOS[String(code).trim().toUpperCase()] || null;
}

// === Telegram (opcional) ===
async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  } catch (e) {
    console.error("Telegram notify error:", e?.response?.data || e.message);
  }
}

// === Envia.com ===
const ENVIA_API_TOKEN = process.env.ENVIA_API_TOKEN || process.env.ENVIA_API_KEY;

const ORIGIN = {
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
  postal_code: "22614",
  reference: "Interior JK"
};

function getFallbackPackage(qty) {
  const q = normalizeQty(qty);
  return {
    content: "SCORE Official Merch",
    amount: 1,
    type: "box",
    weight: Math.max(1, q * 0.6),
    dimensions: { length: 30, width: 25, height: Math.min(60, 10 + Math.ceil(q * 2)) },
    declared_value: 400 * q
  };
}

async function quoteShipping({ postal_code, country_code = "MX", qty = 1 }) {
  if (!ENVIA_API_TOKEN) return null;
  const pkg = getFallbackPackage(qty);

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENVIA_API_TOKEN}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: ORIGIN.postal_code },
        destination: { country_code, postal_code },
        shipment: { carrier: "fedex", type: 1 },
        packages: [pkg]
      })
    });

    const data = await res.json();
    const list = data?.data || [];
    if (!Array.isArray(list) || list.length === 0) return null;

    const best = list.slice().sort((a, b) => (a.total_price || 1e9) - (b.total_price || 1e9))[0];

    return {
      mxn: Math.ceil(Number(best.total_price || 0) * 1.05),
      carrier: best.carrier || "fedex",
      service: best.service || "",
      eta: best.delivery_estimate || ""
    };
  } catch (e) {
    console.error("Envia quote error:", e.message);
    return null;
  }
}

async function createEnviaLabel({ customer, qty = 1 }) {
  if (!ENVIA_API_TOKEN) return null;
  const pkg = getFallbackPackage(qty);

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENVIA_API_TOKEN}` },
      body: JSON.stringify({
        origin: ORIGIN,
        destination: customer,
        packages: [pkg],
        shipment: { carrier: "fedex", type: 1 },
        settings: { print_format: "PDF", print_size: "STOCK_4X6" }
      })
    });

    const data = await res.json();
    const row = data?.data?.[0];
    if (!row) return null;

    return {
      tracking: row.tracking_number || row.tracking || null,
      label_url: row.label || row.label_url || null,
      carrier: row.carrier || "fedex"
    };
  } catch (e) {
    console.error("Envia label error:", e.message);
    return null;
  }
}

function getCatalogProduct(id) {
  return (catalog?.products || []).find((p) => p.id === id) || null;
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  supabase,
  supabaseAdmin,
  getPromo,
  notifyTelegram,
  quoteShipping,
  createEnviaLabel,
  getCatalogProduct
};