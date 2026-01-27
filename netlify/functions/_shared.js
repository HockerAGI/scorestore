// netlify/functions/_shared.js
// CENTRAL DE CREDENCIALES Y UTILIDADES
// Versión segura para GitHub (lee variables de entorno)

import { createClient } from "@supabase/supabase-js";

// Función para leer variables de entorno (Netlify)
export const env = (key) => {
  const val = process.env[key];
  if (!val) {
    console.warn(`[WARN] Missing env var: ${key}`);
  }
  return val || "";
};

export const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
});

export const ok = (body) => ({
  statusCode: 200,
  headers: corsHeaders(),
  body: JSON.stringify({ ok: true, ...body })
});

export const fail = (code, msg, extra = {}) => ({
  statusCode: code,
  headers: corsHeaders(),
  body: JSON.stringify({ ok: false, error: msg, ...extra })
});

export const parseJSON = (str) => {
  try { return JSON.parse(str); } catch { return {}; }
};

// --- SUPABASE CLIENTS ---
export const getSupabaseAnon = () => createClient(
  env("SUPABASE_URL"), 
  env("SUPABASE_ANON_KEY")
);

export const getSupabaseService = () => createClient(
  env("SUPABASE_URL"), 
  env("SUPABASE_SERVICE_ROLE_KEY")
);

// --- UTILS ---
export const normalizeZip = (z) => {
  const s = String(z || "").replace(/[^0-9]/g, "");
  return s.length >= 4 ? s : null;
};

export const normalizeCountry = (c) => {
  const s = String(c || "").toUpperCase();
  if (s === "US" || s === "USA") return "US";
  return "MX";
};

export const clampInt = (n, min, max) => Math.min(Math.max(parseInt(n) || 1, min), max);

// --- LÓGICA ENVIA.COM ---
export async function enviaQuote(payload) {
  const token = env("ENVIA_API_KEY");
  
  if (!token) throw new Error("Falta ENVIA_API_KEY en configuración");

  const response = await fetch("https://api.envia.com/ship/rate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const txt = await response.text();
    console.error("Envia Error:", txt);
    throw new Error("Error conectando con paquetería");
  }

  const json = await response.json();
  return json.data || []; 
}