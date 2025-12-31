// netlify/functions/_shared.js
const catalogData = require("../../data/catalog.json");
const promoData = require("../../data/promos.json");

/* =========================
   HELPERS & RESPONSES
========================= */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }
function digitsOnly(v) { return toStr(v).replace(/\D+/g, ""); }
function normalizePromo(code) { return upper(code).replace(/\s+/g, ""); }

function getSiteUrlFromEnv(event) {
  return process.env.URL_SCORE || process.env.URL || "https://scorestore.netlify.app";
}

/* =========================
   CATALOG & VALIDATION
========================= */
async function loadCatalog() { return catalogData; }

function productMapFromCatalog(catalog) {
  const map = {};
  for (const p of catalog.products || []) map[p.id] = p;
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "El carrito está vacío." };
  const clean = [];
  for (const it of items) {
    if (!it.id || !Number.isInteger(it.qty) || it.qty <= 0) return { ok: false, error: "Ítem inválido detectado." };
    clean.push({ id: toStr(it.id), qty: it.qty, size: toStr(it.size) || "Unitalla" });
  }
  return { ok: true, items: clean };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap[it.id];
    if (!p) return { ok: false, error: `Producto no disponible: ${it.id}` };
    if (Array.isArray(p.sizes) && !p.sizes.includes(it.size)) return { ok: false, error: `Talla ${it.size} no válida para ${p.name}` };
  }
  return { ok: true };
}

/* =========================
   LOGIC: SHIPPING & PROMOS
========================= */
async function computeShipping({ mode, to }) {
  if (mode === "pickup") return { ok: true, mxn: 0, label: "Pickup en Tienda (TJ)", days: 0 };
  if (mode === "tj") return { ok: true, mxn: 200, label: "Envío Local (Tijuana)", days: 2 };
  if (mode === "mx") {
    // Validación básica de CP
    if (!to?.postal_code || to.postal_code.length !== 5) return { ok: true, mxn: 250, label: "Envío Nacional", days: 5 };
    return { ok: true, mxn: 250, label: "Envío Nacional Standard", days: 5 };
  }
  return { ok: true, mxn: 0, label: "Por definir", days: 7 };
}

async function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  if (!promoCode) return { discountMXN: 0, totalMXN: subtotalMXN + shippingMXN };
  try {
    const rules = promoData.rules || [];
    const rule = rules.find((r) => normalizePromo(r.code) === normalizePromo(promoCode) && r.active);
    if (!rule) return { discountMXN: 0, totalMXN: subtotalMXN + shippingMXN };

    let discount = 0;
    if (rule.type === "percent") discount = Math.round(subtotalMXN * rule.value);
    else if (rule.type === "fixed_mxn") discount = Math.min(subtotalMXN, rule.value);
    else if (rule.type === "free_shipping") return { discountMXN: shippingMXN, totalMXN: subtotalMXN };

    return { discountMXN: discount, totalMXN: Math.max(0, subtotalMXN - discount) + shippingMXN };
  } catch { return { discountMXN: 0, totalMXN: subtotalMXN + shippingMXN }; }
}

/* =========================
   ENVIA.COM (PRODUCCIÓN)
========================= */
async function createEnviaLabel(orderData) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ SKIPPED: Falta ENVIA_API_KEY.");
    return null;
  }

  const carrier = toStr(orderData.metadata?.ship_carrier || "fedex").toLowerCase(); 
  const service = toStr(orderData.metadata?.ship_service_code || "standard");
  const address = orderData.shipping?.address || {};
  const name = orderData.shipping?.name || "Cliente SCORE Store";
  
  // DATOS REALES DE ORIGEN (TIJUANA)
  const origin = {
      name: "Logística SCORE Store",
      company: "Unico Uniformes",
      email: "ventas.unicotextil@gmail.com", 
      phone: "6641234567", // <--- ACTUALIZAR CON TU TELÉFONO REAL
      street: "Blvd. Gustavo Díaz Ordaz", 
      number: "12345",     // <--- ACTUALIZAR
      district: "La Mesa", 
      city: "Tijuana",
      state: "BC",
      country: "MX",
      postal_code: "22105" // <--- ACTUALIZAR
  };

  const payload = {
    origin: origin,
    destination: {
      name: name,
      street: toStr(address.line1),
      number: "", 
      district: toStr(address.line2 || ""),
      city: toStr(address.city),
      state: toStr(address.state),
      country: "MX",
      postal_code: toStr(address.postal_code),
      email: orderData.customer_details?.email || "",
      phone: orderData.customer_details?.phone || ""
    },
    packages: [{
      content: "Ropa Deportiva SCORE",
      amount: 1,
      type: "box",
      dimensions: { length: 30, width: 25, height: 10 }, 
      weight: 1, 
      insurance: 0,
      declared_value: orderData.amount_total ? (orderData.amount_total / 100) : 500
    }],
    shipment: { carrier, service },
    settings: { currency: "MXN", label_format: "pdf" }
  };

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    const shipData = Array.isArray(data) ? data[0] : (data.data ? data.data[0] : data);
    
    if (shipData && shipData.track) {
      return { tracking_number: shipData.track, label_url: shipData.label, carrier: shipData.carrier };
    }
    return null;
  } catch (e) {
    console.error("❌ Envia Exception:", e);
    return null;
  }
}

module.exports = {
  jsonResponse, safeJsonParse, toStr, upper, digitsOnly, normalizePromo, getSiteUrlFromEnv,
  loadCatalog, productMapFromCatalog, validateCartItems, validateSizes,
  computeShipping, applyPromoToTotals, createEnviaLabel
};
