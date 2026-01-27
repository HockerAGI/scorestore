// netlify/functions/_shared.js
// CENTRAL DE CREDENCIALES Y UTILIDADES
// Actualizado con lógica de generación de guías (Legacy Rescue)

import { createClient } from "@supabase/supabase-js";

// --- ENV VARS ---
export const env = (key) => {
  const val = process.env[key];
  if (!val) console.warn(`[WARN] Missing env var: ${key}`);
  return val || "";
};

export const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature", // Importante para Webhook
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

// Cliente Admin (Service Role) necesario para escribir órdenes seguras
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

// --- DATOS DE ORIGEN (RECUPERADO DE _shared.txt) ---
export const FACTORY_ORIGIN = {
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

// --- LÓGICA ENVIA.COM ---

// 1. Cotizar (Ya la teníamos)
export async function enviaQuote(payload) {
  const token = env("ENVIA_API_KEY");
  if (!token) throw new Error("Falta ENVIA_API_KEY");

  const response = await fetch("https://api.envia.com/ship/rate/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Error API Envia");
  const json = await response.json();
  return json.data || []; 
}

// 2. Generar Guía (RECUPERADO Y MEJORADO DE _shared.txt)
// Se usa en el Webhook cuando el pago es exitoso
export async function createEnviaLabel(customer, itemsQty) {
  const token = env("ENVIA_API_KEY");
  if (!token) return null;

  // Normalizamos cantidad para peso aproximado (0.6kg por prenda promedio)
  const qty = Math.max(1, parseInt(itemsQty) || 1);

  try {
    const payload = {
      origin: FACTORY_ORIGIN,
      destination: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "0000000000",
        street: customer.address.line1,
        district: customer.address.line2 || "",
        city: customer.address.city,
        state: customer.address.state,
        country: customer.address.country,
        postal_code: customer.address.postal_code
      },
      packages: [{
        content: "Merchandise SCORE",
        amount: 1,
        type: "box",
        weight: qty * 0.6,
        dimensions: { length: 30, width: 25, height: 15 },
        declared_value: 400 * qty // Valor declarado aproximado para seguro
      }],
      shipment: { carrier: "fedex", type: 1 }, // Type 1 = Generar guia
      settings: { print_format: "PDF", print_size: "STOCK_4X6" }
    };

    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    const row = result?.data?.[0];

    if (!row) {
      console.error("Envia Error:", JSON.stringify(result));
      return null;
    }

    return {
      tracking: row.tracking_number,
      labelUrl: row.label,
      carrier: row.carrier
    };
  } catch (e) {
    console.error("Error creando guia:", e);
    return null;
  }
}