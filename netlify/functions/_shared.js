const catalogData = require("../../data/catalog.json");

/* UTILS */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

function safeJsonParse(raw, fallback = null) { try { return JSON.parse(raw); } catch { return fallback; } }
function digitsOnly(v) { return (v || "").toString().replace(/\D+/g, ""); }
function toStr(v) { return (v || "").toString().trim(); }

/* CATALOG */
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

/* ENVIA.COM LOGIC */
async function getEnviaQuote(postalCode, itemsCount = 1) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  try {
    const weight = 0.8 + (Math.max(0, itemsCount - 1) * 0.3);
    const payload = {
      origin: { company: "UNICO UNIFORMES", country_code: "MX", postal_code: "22614", state: "BC", city: "Tijuana" },
      destination: { country_code: "MX", postal_code: postalCode },
      packages: [{ content: "Ropa Deportiva SCORE", amount: 1, type: "box", dimensions: { length: 30, width: 25, height: 10 }, weight: weight, insurance: 0, declared_value: 500 }],
      shipment: { carrier: "fedex", service: "standard" }
    };

    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return null;
    const data = await res.json();
    let rates = (data.data || []).filter(r => ["fedex", "estafeta", "dhl", "paquetexpress"].includes(r.carrier?.toLowerCase()));
    if (!rates.length) rates = data.data || [];
    if (!rates.length) return null;

    rates.sort((a, b) => a.total_price - b.total_price);
    const finalPrice = Math.max(250, Math.ceil(rates[0].total_price)); // REGLA $250

    return { mxn: finalPrice, label: `${rates[0].carrier.toUpperCase()} Estándar`, carrier: rates[0].carrier, days: rates[0].delivery_estimate || "3-7" };
  } catch (e) { console.error("Envia Error:", e); return null; }
}

async function createEnviaLabel(session) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;
  // (Lógica de webhook simplificada para no repetir, usa la del bloque anterior si activas webhooks)
  return null; 
}

module.exports = {
  jsonResponse, safeJsonParse, digitsOnly, loadCatalog, productMapFromCatalog, validateCartItems, getEnviaQuote, createEnviaLabel
};
