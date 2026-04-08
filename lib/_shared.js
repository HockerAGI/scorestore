"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let Stripe = null;
try { Stripe = require("stripe"); } catch (e) {}
let createClient = null;
try { ({ createClient } = require("@supabase/supabase-js")); } catch (e) {}

/* ========================================================= 
   CONSTANTES Y CONFIGURACIÓN GLOBAL
   ========================================================= */
const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const ENVIA_API_URL = "https://queries.envia.com/v1";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/* ========================================================= 
   UTILIDADES DE SANITIZACIÓN Y TIPADO (Originales)
   ========================================================= */
const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const safeInt = (v, d = 0) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; };
const safeFloat = (v, d = 0.0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const safeBool = (v, d = false) => {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1" || v === 1) return true;
  if (v === "false" || v === "0" || v === 0) return false;
  return d;
};
const safeNum = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const isArr = (v) => Array.isArray(v);
const isObj = (v) => v !== null && typeof v === "object" && !isArr(v);

const safeJsonParse = (v, d = {}) => {
  try { return (typeof v === "string" ? JSON.parse(v) : v) || d; } catch { return d; }
};

const clampInt = (v, min, max, d) => {
  const n = safeInt(v, d);
  return Math.min(Math.max(n, min), max);
};

const clampText = (v, max = 1800) => safeStr(v).trim().slice(0, max);
const normalizeLower = (v) => safeStr(v).trim().toLowerCase();

/* ========================================================= 
   SUPABASE Y PERSISTENCIA
   ========================================================= */
const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !createClient) return null;
  return createClient(url, key, { auth: { persistSession: false } });
};

const resolveScoreOrgId = async (sb) => {
  if (!sb) return DEFAULT_SCORE_ORG_ID;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", "score").maybeSingle();
  return data?.id || DEFAULT_SCORE_ORG_ID;
};

/* ========================================================= 
   I/O Y ARCHIVOS (Ajustado para Vercel)
   ========================================================= */
const readJsonFile = (relPath) => {
  try {
    // Vercel requiere rutas absolutas usando process.cwd()
    const possiblePaths = [
      path.join(process.cwd(), relPath),
      path.join(process.cwd(), "scorestore-main", relPath),
      path.join(__dirname, "..", relPath)
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    return null;
  } catch { return null; }
};

const readPublicSiteSettings = async (sb, orgId) => {
  if (!sb || !orgId) return null;
  const { data } = await sb.from("site_settings").select("*").eq("organization_id", orgId).maybeSingle();
  return data;
};

/* ========================================================= 
   ENVÍO Y ENVÍA.COM (Lógica de Mapeo Stripe -> Envía)
   ========================================================= */
const getOriginByCountry = (country = "MX") => {
  if (String(country).toUpperCase() === "US") {
    return { name: "BAJATEX US", company: "BAJATEX", email: "ventas.unicotextil@gmail.com", phone: "6642368701", street: "Otay Mesa Rd", number: "123", district: "Otay", city: "San Diego", state: "CA", country: "US", postalCode: "92154" };
  }
  return { name: "BAJATEX MX", company: "BAJATEX", email: "ventas.unicotextil@gmail.com", phone: "6642368701", street: "Calle 16", number: "123", district: "Libertad", city: "Tijuana", state: "BC", country: "MX", postalCode: "22614" };
};

const stripeShippingToEnviaDestination = (sess) => {
  if (!sess) return null;
  const sd = sess.shipping_details || {};
  const cd = sess.customer_details || {};
  const addr = sd.address || cd.address || {};
  const country = String(addr.country || "MX").toUpperCase();

  let calle = String(addr.line1 || "Domicilio Conocido").trim();
  let numStreet = String(addr.line2 || "").trim();

  // Lógica de extracción de número de calle si viene en line1
  if (!numStreet || numStreet.toLowerCase() === "s/n") {
    const match = calle.match(/^(.*?)\s+((?:No\.?\s*|#\s*)?\d+[a-zA-Z]?(?:-\d+)?)$/i);
    if (match) { calle = match[1].trim(); numStreet = match[2].trim(); }
    else { numStreet = "S/N"; }
  }

  return {
    name: sd.name || cd.name || "Cliente Final",
    email: cd.email || sess.customer_email || "cliente@scorestore.mx",
    phone: String(sd.phone || cd.phone || "6640000000").replace(/\D/g, "").substring(0, 10),
    street: calle.substring(0, 100),
    number: numStreet.substring(0, 20),
    district: String(addr.line2 || "Centro").substring(0, 100),
    city: String(addr.city || "").substring(0, 50),
    state: String(addr.state || "").substring(0, 50),
    country,
    postalCode: String(addr.postal_code || "").substring(0, 10),
    reference: "Venta Online Score Store"
  };
};

const getPackageSpecs = (country, qty) => {
  const q = clampInt(qty, 1, 50, 1);
  if (country === "US") return { content: "Merchandise", amount: 1, type: "box", weight: q * 0.5, weight_unit: "kg", length_unit: "cm", dimensions: { length: 30, width: 25, height: 20 } };
  return { content: "Ropa", amount: 1, type: "box", weight: q * 0.4, weight_unit: "kg", length_unit: "cm", dimensions: { length: 25, width: 20, height: 15 } };
};

const createEnviaLabel = async ({ shipping_country, stripe_session, items_qty }) => {
  const country = String(shipping_country || "MX").toUpperCase();
  const origin = getOriginByCountry(country);
  const destination = stripeShippingToEnviaDestination(stripe_session);
  const pkg = getPackageSpecs(country, items_qty || 1);

  const payload = {
    origin, destination, packages: [pkg],
    shipment: { 
      carrier: country === "US" ? (process.env.ENVIA_US_DEFAULT_CARRIER || "usps") : (process.env.ENVIA_MX_DEFAULT_CARRIER || "dhl"),
      type: 1 
    },
    settings: { printFormat: "PDF", printSize: "STOCK_4X6", currency: "MXN" }
  };

  const res = await fetch(`${ENVIA_API_URL}/ship/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.ENVIA_API_KEY}` },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Error en Envía");
  return {
    ok: true,
    label_url: data?.label_url || data?.data?.label_url,
    tracking_number: data?.tracking_number || data?.data?.tracking_number,
    carrier: data?.carrier || data?.data?.carrier
  };
};

/* ========================================================= 
   STRIPE
   ========================================================= */
const initStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !Stripe) return null;
  return new Stripe(key, { apiVersion: "2023-10-16" });
};

/* ========================================================= 
   IA Y GEMINI (Lógica de Chatbot)
   ========================================================= */
const normalizeReply = (text) => safeStr(text).replace(/\[ACTION:.*?\]/g, "").trim().slice(0, 1400);

const extractActionMarkers = (text) => {
  const matches = String(text).matchAll(/\[ACTION:([A-Z_]+)(?::([^\]]+))?\]/g);
  return Array.from(matches).map(m => ({ action: m[1], value: m[2] || "" }));
};

const callGemini = async ({ apiKey, model, systemText, userText }) => {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${systemText}\n\nUSER: ${userText}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 }
    })
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

/* ========================================================= 
   NOTIFICACIONES Y RESPUESTAS
   ========================================================= */
const sendTelegram = async (msg) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" })
    });
  } catch (e) {}
};

const jsonResponse = (statusCode, body, origin = "*") => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true"
  },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const handleOptions = (req) => ({
  statusCode: 204,
  headers: {
    "Access-Control-Allow-Origin": req?.headers?.origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Allow-Credentials": "true"
  },
  body: ""
});

/* ========================================================= 
   LOGICA DE NEGOCIO Y NORMALIZACIÓN
   ========================================================= */
const normalizeQty = (items) => (isArr(items) ? items : []).map(i => ({
  ...i, qty: clampInt(i.qty || i.quantity, 1, 99, 1),
  priceCents: Math.max(0, Math.round(safeFloat(i.priceCents || i.price_cents || 0)))
}));

const itemsQtyFromAny = (items) => (isArr(items) ? items : []).reduce((acc, i) => acc + clampInt(i.qty || i.quantity, 1, 99, 1), 0);

/* ========================================================= 
   EXPORTS
   ========================================================= */
module.exports = {
  safeStr, safeInt, safeFloat, safeBool, safeNum, safeJsonParse,
  isArr, isObj, clampInt, clampText, normalizeLower,
  resolveScoreOrgId, readJsonFile, readPublicSiteSettings,
  supabaseAdmin, initStripe,
  getOriginByCountry, stripeShippingToEnviaDestination, getPackageSpecs, createEnviaLabel,
  normalizeReply, extractActionMarkers, callGemini,
  sendTelegram, jsonResponse, handleOptions,
  normalizeQty, itemsQtyFromAny,
  DEFAULT_SCORE_ORG_ID
};
