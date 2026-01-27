// netlify/functions/_shared.js
// Helpers compartidos para Score Store (Netlify Functions)
// - Respuestas JSON uniformes
// - Env vars seguras
// - Supabase client (anon + service role)
// - Envia.com helpers
// - Telegram notify helper
// - Validaciones básicas

import axios from "axios";
import { createClient } from "@supabase/supabase-js";

/* ----------------------- RESPONSE ----------------------- */
export function json(statusCode = 200, body = {}, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

export function ok(body = {}, statusCode = 200) {
  return json(statusCode, { ok: true, ...body });
}

export function fail(statusCode = 400, message = "Bad Request", extra = {}) {
  return json(statusCode, { ok: false, error: message, ...extra });
}

/* ----------------------- ENV ---------------------------- */
export function env(name, { required = false, fallback = "" } = {}) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing env var: ${name}`);
  return (v ?? fallback).trim();
}

/* ----------------------- SAFE PARSE ---------------------- */
export function parseJSON(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/* ----------------------- VALIDATORS --------------------- */
export function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function normalizeZip(zip) {
  const z = String(zip || "").trim();
  // MX: 5 dígitos, US: 5 o 5-4
  return z;
}

export function normalizeCountry(country) {
  const c = String(country || "").trim().toUpperCase();
  if (c === "US" || c === "USA") return "US";
  return "MX";
}

export function clampInt(n, min = 0, max = 9999) {
  const x = Number.parseInt(n, 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

/* ----------------------- SUPABASE ------------------------ */
export function getSupabaseAnon() {
  const url = env("SUPABASE_URL", { required: true });
  const anon = env("SUPABASE_ANON_KEY", { required: true });
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "scorestore-netlify/anon" } }
  });
}

export function getSupabaseService() {
  const url = env("SUPABASE_URL", { required: true });
  const service = env("SUPABASE_SERVICE_ROLE_KEY", { required: false });
  if (!service) return null;

  return createClient(url, service, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "scorestore-netlify/service" } }
  });
}

/* ----------------------- ENVIA.COM ----------------------- */
export function getEnviaClient() {
  const token = env("ENVIA_API_KEY", { required: false });
  if (!token) return null;

  return axios.create({
    baseURL: "https://api.envia.com",
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Cotiza envío con Envia.com
 * OJO: Envia requiere datos reales. Aquí dejamos el wrapper genérico.
 * @param {Object} payload Envia quote payload
 */
export async function enviaQuote(payload) {
  const client = getEnviaClient();
  if (!client) throw new Error("ENVIA_API_KEY no configurada");

  // Endpoint más común para cotización: /ship/rate/
  // Si tu cuenta usa otro endpoint, aquí se ajusta, pero NO invento: queda estándar.
  const { data } = await client.post("/ship/rate/", payload);
  return data;
}

/**
 * Crea guía con Envia.com
 * @param {Object} payload Envia shipment payload
 */
export async function enviaCreateShipment(payload) {
  const client = getEnviaClient();
  if (!client) throw new Error("ENVIA_API_KEY no configurada");

  // Endpoint típico: /ship/generate/
  const { data } = await client.post("/ship/generate/", payload);
  return data;
}

/* ----------------------- TELEGRAM ------------------------ */
export async function telegramNotify(text) {
  const token = env("TELEGRAM_BOT_TOKEN", { required: false });
  const chatId = env("TELEGRAM_CHAT_ID", { required: false });
  if (!token || !chatId) return { ok: false, skipped: true };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const { data } = await axios.post(
      url,
      { chat_id: chatId, text, disable_web_page_preview: true },
      { timeout: 15000 }
    );
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || "telegram error" };
  }
}

/* ----------------------- CORS (simple) ------------------ */
export function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}