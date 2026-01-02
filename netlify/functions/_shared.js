// netlify/functions/_shared.js
const catalogData = require("../../data/catalog.json");

/* =========================
   HELPERS & RESPONSES
========================= */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body),
  };
}

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
function digitsOnly(v) { return (v || "").toString().replace(/\D+/g, ""); }
function toStr(v) { return (v || "").toString().trim(); }

/* =========================
   CATALOG LOGIC
========================= */
async function loadCatalog() { return catalogData; }

function productMapFromCatalog(catalog) {
  const map = {};
  const items = catalog.products || []; 
  for (const p of items) map[p.id] = p;
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "Carrito vacío" };
  const clean = items.map(i => ({
    id: toStr(i.id),
    qty: parseInt(i.qty) || 1,
    size: toStr(i.size) || "Unitalla"
  }));
  return { ok: true, items: clean };
}

/* =========================
   ENVIA.COM: COTIZADOR (Quote)
========================= */
async function getEnviaQuote(postalCode, itemsCount = 1) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  try {
    const weight = 0.8 + (Math.max(0, itemsCount - 1) * 0.3);

    const payload = {
      origin: {
        company: "UNICO UNIFORMES",
        country_code: "MX",
        postal_code: "22614", // Palermo 6106, Tijuana
        state: "BC",
        city: "Tijuana"
      },
      destination: { country_code: "MX", postal_code: postalCode },
      packages: [{
        content: "Ropa Deportiva SCORE",
        amount: 1, type: "box",
        dimensions: { length: 30, width: 25, height: 10 },
        weight: weight, insurance: 0, declared_value: 500
      }],
      shipment: { carrier: "fedex", service: "standard" }
    };

    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const data = await res.json();
    
    let rates = (data.data || []).filter(r => 
      ["fedex", "estafeta", "dhl", "paquetexpress", "redpack"].includes(r.carrier?.toLowerCase())
    );
    
    if (!rates.length) rates = data.data || [];
    if (!rates.length) return null;

    rates.sort((a, b) => a.total_price - b.total_price);
    const best = rates[0];

    // --- REGLA DE NEGOCIO: MÍNIMO $250 ---
    const finalPrice = Math.max(250, Math.ceil(best.total_price));

    return {
      mxn: finalPrice,
      label: `${best.carrier.toUpperCase()} Estándar`,
      carrier: best.carrier,
      days: best.delivery_estimate || "3-7"
    };

  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}

/* =========================
   ENVIA.COM: GENERAR GUÍA (Label)
   (Usada por el Webhook)
========================= */
async function createEnviaLabel(session) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  try {
    const shipping = session.shipping_details;
    const itemsCount = session.line_items?.data?.length || 1; 
    const weight = 0.8 + (Math.max(0, itemsCount - 1) * 0.3);

    const payload = {
      origin: {
        company: "UNICO UNIFORMES",
        name: "Logística Score Store",
        email: "ventas.unicotextil@gmail.com",
        phone: "6642368701",
        street: "Palermo",
        number: "6106",
        district: "Anexa Roma",
        city: "Tijuana",
        state: "BC",
        country: "MX",
        postal_code: "22614"
      },
      destination: {
        name: shipping.name,
        street: shipping.address.line1,
        number: "", // Stripe suele mandar calle y numero junto en line1
        district: shipping.address.line2 || "",
        city: shipping.address.city,
        state: shipping.address.state,
        country: "MX",
        postal_code: shipping.address.postal_code,
        email: session.customer_details?.email || "cliente@score.com",
        phone: session.customer_details?.phone || "0000000000"
      },
      packages: [{
        content: "Ropa Oficial SCORE",
        amount: 1, type: "box",
        dimensions: { length: 30, width: 25, height: 10 },
        weight: weight,
        insurance: 0,
        declared_value: session.amount_total ? (session.amount_total / 100) : 500
      }],
      shipment: { carrier: "fedex", service: "standard" }, // Forzamos FedEx o el que prefieras por defecto
      settings: { print_format: "PDF", label_format: "PDF", currency: "MXN" }
    };

    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errData = await res.text();
        console.error("Envia API Error Body:", errData);
        return null;
    }

    const data = await res.json();
    // La respuesta de Envia puede variar, buscamos la data
    const shipData = Array.isArray(data.data) ? data.data[0] : (data.data || data);

    if (shipData && shipData.track) {
      return { 
        tracking_number: shipData.track, 
        label_url: shipData.label, 
        carrier: shipData.carrier 
      };
    }
    return null;

  } catch (e) {
    console.error("Envia Label Error:", e);
    return null;
  }
}

module.exports = {
  jsonResponse, safeJsonParse, digitsOnly,
  loadCatalog, productMapFromCatalog, validateCartItems, 
  getEnviaQuote, createEnviaLabel
};
