const { createClient } = require('@supabase/supabase-js');

// --- CREDENCIALES REALES (CONFIGURACIÓN HÍBRIDA) ---
// Usa variables de entorno si existen, si no, usa tus claves reales directas.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

// --- CONFIGURACIÓN ENVIA.COM ---
// NOTA: Necesitas poner tu API KEY de Envia en Netlify (Environment Variables) como ENVIA_API_KEY
// Si no la tienes aún, el sistema usará los precios "Fallback" automáticos.
const FACTORY_ORIGIN = {
  name: "Score Store / Unico Uniformes",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotexti@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK"
};

const FALLBACK_MX_PRICE = 250;
const FALLBACK_US_PRICE = 800; // ~$40 USD

/* --- FUNCIONES ÚTILES --- */

const jsonResponse = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(body)
});

const safeJsonParse = (str) => { try { return JSON.parse(str); } catch { return {}; } };
const digitsOnly = (str) => (str || "").replace(/[^0-9]/g, "");

// INICIALIZAR SUPABASE
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// FUNCIÓN: Obtener productos reales desde tu Admin App
async function getProductsFromDB() {
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
  if (!org) return [];
  const { data: products } = await supabase.from('products').select('*').eq('org_id', org.id);
  return products || [];
}

/* --- LÓGICA DE ENVÍOS (ENVIA.COM) --- */

async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!process.env.ENVIA_API_KEY) return null; // Si no hay API Key, retorna null para usar Fallback

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 }, 
        packages: [{
          content: "Ropa Deportiva SCORE",
          amount: 1,
          type: "box",
          weight: qty * 0.6, // 600g por prenda promedio
          dimensions: { length: 30, width: 25, height: 10 + (qty * 2) },
          declared_value: 400 * qty
        }]
      })
    });

    const data = await res.json();
    
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      // Tomamos la opción más barata
      const best = data.data.sort((a,b) => a.total_price - b.total_price)[0];
      return {
        mxn: Math.ceil(best.total_price * 1.05), // +5% margen de seguridad
        carrier: best.carrier,
        days: best.delivery_estimate
      };
    }
    return null;
  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}

async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) return null;

  try {
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
        postal_code: FACTORY_ORIGIN.postalCode
      },
      destination: {
        name: customer.name,
        email: customer.email || "cliente@scorestore.com",
        phone: customer.phone || "0000000000",
        street: customer.address.line1 || "",
        number: "", 
        district: customer.address.line2 || "",
        city: customer.address.city,
        state: customer.address.state,
        country: customer.address.country, 
        postal_code: customer.address.postal_code
      },
      packages: [{
        content: "Merchandise SCORE International",
        amount: 1,
        type: "box",
        weight: itemsQty * 0.6,
        dimensions: { length: 30, width: 25, height: 10 + (itemsQty * 2) },
        declared_value: 400 * itemsQty 
      }],
      shipment: { carrier: "fedex", type: 1 },
      settings: { print_format: "PDF", print_size: "STOCK_4X6" }
    };

    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    
    if (result && result.meta === "generate") {
      return {
        tracking: result.data[0].tracking_number,
        labelUrl: result.data[0].label,
        carrier: result.data[0].carrier
      };
    }
    return null;
  } catch (e) {
    console.error("Create Label Error:", e);
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  getProductsFromDB,
  getEnviaQuote,
  createEnviaLabel,
  digitsOnly,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  supabase // Exportamos el cliente para uso interno si se requiere
};
