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
  // LÓGICA DE NEGOCIO (Flat Rate simplificada para conversión rápida)
  // Si deseas cotización en tiempo real en el checkout, se debe llamar a quote_shipping.js
  // Para MVP robusto, Flat Rate es más seguro y rápido.
  
  if (mode === "pickup") return { ok: true, mxn: 0, label: "Pickup en Tienda (TJ)", days: 0 };
  
  if (mode === "tj") {
    return { ok: true, mxn: 200, label: "Envío Local (Tijuana)", days: 2 };
  }
  
  if (mode === "mx") {
    // Validación básica de CP
    if (!to?.postal_code || to.postal_code.length !== 5) {
      return { ok: true, mxn: 250, label: "Envío Nacional Standard", days: 7 };
    }
    return { ok: true, mxn: 250, label: "Envío Nacional Standard", days: 5 };
  }
  
  // Default fallback
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
async function createEnviaLabel(session) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR: Falta ENVIA_API_KEY en variables de entorno.");
    return null;
  }

  // DATOS ORIGEN (TU ALMACÉN) - Configurar en Netlify
  const origin = {
      name: process.env.ORIGIN_NAME || "Logística SCORE Store",
      company: process.env.ORIGIN_COMPANY || "Unico Uniformes",
      email: process.env.ORIGIN_EMAIL || "ventas.unicotextil@gmail.com", 
      phone: process.env.ORIGIN_PHONE || "6641234567", // Reemplazar con variable real
      street: process.env.ORIGIN_STREET || "Blvd. Gustavo Díaz Ordaz", 
      number: process.env.ORIGIN_NUMBER || "12345",
      district: process.env.ORIGIN_DISTRICT || "La Mesa", 
      city: process.env.ORIGIN_CITY || "Tijuana",
      state: "BC",
      country: "MX",
      postal_code: process.env.ORIGIN_ZIP || "22105"
  };

  // DATOS DESTINO (Desde Stripe Session)
  // Stripe "shipping_details" es la fuente correcta, no "shipping"
  const shipDetails = session.shipping_details || {};
  const address = shipDetails.address || {};
  const customer = session.customer_details || {};
  
  const destination = {
      name: shipDetails.name || customer.name || "Cliente SCORE",
      street: toStr(address.line1),
      number: "", // Stripe suele mandar todo en line1
      district: toStr(address.line2 || ""),
      city: toStr(address.city),
      state: toStr(address.state),
      country: "MX",
      postal_code: toStr(address.postal_code),
      email: customer.email || "",
      phone: customer.phone || ""
  };

  const carrier = toStr(session.metadata?.ship_carrier || "fedex").toLowerCase(); 
  const service = toStr(session.metadata?.ship_service_code || "standard");
  
  // PAQUETE
  // Idealmente ajustar peso según cantidad de items en session.line_items
  const payload = {
    origin,
    destination,
    packages: [{
      content: "Ropa Deportiva SCORE Oficial",
      amount: 1,
      type: "box",
      dimensions: { length: 30, width: 25, height: 10 }, 
      weight: 1, 
      insurance: 0,
      declared_value: session.amount_total ? (session.amount_total / 100) : 500
    }],
    shipment: { carrier, service },
    settings: { currency: "MXN", label_format: "pdf" }
  };

  try {
    console.log("🚚 Generando guía con Envia...");
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
        const errText = await res.text();
        console.error("❌ Error Envia API:", errText);
        return null;
    }

    const data = await res.json();
    // La respuesta de Envia puede variar (array o objeto data)
    const shipData = Array.isArray(data) ? data[0] : (data.data ? data.data[0] : data);
    
    if (shipData && (shipData.track || shipData.label)) {
      console.log(`✅ Guía generada: ${shipData.track}`);
      return { tracking_number: shipData.track, label_url: shipData.label, carrier: shipData.carrier };
    }
    
    console.warn("⚠️ Respuesta inesperada de Envia:", JSON.stringify(data));
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