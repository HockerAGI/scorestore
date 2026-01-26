const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");

// --- 1. CREDENCIALES REALES SUPABASE (Extraídas de tus archivos) ---
// Usamos estas como fallback para garantizar que funcione al copiar y pegar.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. CONFIGURACIÓN FÁBRICA (ORIGEN ENVÍOS) ---
const FACTORY_ORIGIN = {
  name: "Score Store / Unico Uniformes",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotextil@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614"
};

const PROMO_RULES = {
  "SCORE25": { type: "percent", value: 0.25 },
  "BAJA25": { type: "percent", value: 0.25 },
  "STAFF": { type: "percent", value: 1.00 }
};

const jsonResponse = (code, body) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(body)
});

// --- 3. LÓGICA DE GENERACIÓN DE GUÍAS (ENVIA.COM) ---
async function createEnviaLabel(customer, itemsQty) {
    if (!process.env.ENVIA_API_KEY) {
        // Si no hay API KEY, no rompe el flujo, solo no genera guía automática.
        console.warn("⚠️ FALTA ENVIA_API_KEY en Netlify.");
        return null;
    }
    try {
        const payload = {
            origin: { ...FACTORY_ORIGIN },
            destination: {
                name: customer.name,
                email: customer.email || "cliente@scorestore.com",
                phone: customer.phone || "0000000000",
                street: customer.address?.line1 || "Domicilio Conocido",
                number: "",
                district: customer.address?.city || "",
                city: customer.address?.city,
                state: customer.address?.state,
                country: customer.address?.country,
                postalCode: customer.address?.postal_code
            },
            package: {
                content: "Ropa Deportiva SCORE",
                amount: 1, 
                type: "box", 
                dimensions: { length: 30, width: 25, height: 10 + itemsQty }, 
                weight: itemsQty * 0.5,
                declared_value: 400 * itemsQty 
            },
            shipment: { carrier: "fedex", type: 1 },
            settings: { print_format: "PDF", print_size: "STOCK_4X6" }
        };

        const { data } = await axios.post("https://api.envia.com/ship/generate", payload, {
            headers: { "Authorization": `Bearer ${process.env.ENVIA_API_KEY}` }
        });

        if (data && data.meta === "generate") {
            return {
                tracking: data.data[0].tracking_number,
                labelUrl: data.data[0].label,
                carrier: data.data[0].carrier
            };
        }
        return null;
    } catch (e) {
        console.error("Envia Error:", e.response?.data || e.message);
        return null;
    }
}

module.exports = { supabase, PROMO_RULES, jsonResponse, createEnviaLabel, FACTORY_ORIGIN };
