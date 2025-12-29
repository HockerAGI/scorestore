// netlify/functions/_shared.js
const fs = require("fs/promises");
const path = require("path");

// --- CONFIGURACIÓN ---
const FEATURE_ENVIADOTCOM = process.env.FEATURE_ENVIADOTCOM !== "false"; // Activo por defecto
const DEFAULT_NATIONAL_SHIPPING = 280; // Costo blindado si falla API
const TIJUANA_DELIVERY_PRICE = 200;    // Costo local fijo

// --- UTILIDADES ---
function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*", // CORS vital para tu frontend
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
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

function roundMXN(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// --- GEO ---
function isMxPostal(cp) { return /^\d{5}$/.test(toStr(cp)); }
function isTijuanaPostal(cp) { const p = toStr(cp); return isMxPostal(p) && p.startsWith("22"); }
function looksLikeTijuana(city) { const c = toStr(city).toLowerCase(); return c.includes("tijuana") || c.includes("tj"); }

// --- CARGA DE DATOS (Con Caché en Memoria) ---
let _catalogCache = null;
let _promosCache = null;

async function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  try {
    const file = path.join(process.cwd(), "data", "catalog.json");
    const raw = await fs.readFile(file, "utf8");
    _catalogCache = JSON.parse(raw);
    return _catalogCache;
  } catch (e) {
    console.error("Error loading catalog:", e);
    return { products: [] };
  }
}

async function loadPromos() {
  if (_promosCache) return _promosCache;
  try {
    const file = path.join(process.cwd(), "data", "promos.json");
    const raw = await fs.readFile(file, "utf8");
    _promosCache = JSON.parse(raw);
    return _promosCache;
  } catch (e) {
    console.error("Error loading promos:", e);
    return { rules: [] };
  }
}

function productMapFromCatalog(catalog) {
  const map = {};
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  for (const p of products) map[p.id] = p;
  return map;
}

// --- VALIDACIÓN ---
function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Carrito vacío." };
  }
  const validItems = [];
  for (const it of items) {
    const qty = parseInt(it.qty);
    if (!it.id || isNaN(qty) || qty < 1) continue;
    validItems.push({ id: toStr(it.id), qty, size: toStr(it.size) });
  }
  if (validItems.length === 0) return { ok: false, error: "Items inválidos." };
  return { ok: true, items: validItems };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap[it.id];
    if (!p) continue; // Si no existe, se ignora
    
    // Si el producto tiene tallas definidas, validar que la talla enviada exista
    if (Array.isArray(p.sizes) && p.sizes.length > 0) {
      if (!p.sizes.includes(it.size)) {
         return { ok: false, error: `Talla ${it.size} no válida para ${p.name}` };
      }
    }
  }
  return { ok: true };
}

function computeSubtotalMXN(items, productMap) {
  let sub = 0;
  for (const it of items) {
    const p = productMap[it.id];
    if (p) sub += (Number(p.baseMXN || 0) * it.qty);
  }
  return roundMXN(sub);
}

// --- ENVIA.COM (COTIZADOR) ---
function getEnviaOrigin() {
  // Configuración de Origen REAL (Tijuana)
  return {
    name: "SCORE Store",
    company: "Unico Uniformes",
    email: "ventas@scorestore.com",
    phone: "6641234567",
    street: "Palermo",
    number: "6106",
    district: "Anexa Roma",
    city: "Tijuana",
    state: "BC",
    country: "MX",
    postalCode: "22614"
  };
}

async function quoteEnviaMXN({ to, items, productMap }) {
  if (!FEATURE_ENVIADOTCOM || !process.env.ENVIA_API_KEY) {
    return { ok: false, error: "API Disabled or Missing Key" };
  }

  // Peso estimado: 1kg base + 0.4kg por prenda adicional
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const weight = Math.round((1 + (totalQty * 0.4)) * 100) / 100;
  
  // Valor declarado (tope 5000 para seguro básico incluido)
  const subtotal = computeSubtotalMXN(items, productMap);
  const declaredValue = Math.min(5000, subtotal);

  try {
    const payload = {
      origin: getEnviaOrigin(),
      destination: {
        name: toStr(to.name || "Cliente"),
        street: toStr(to.address1),
        number: "S/N",
        district: "",
        city: toStr(to.city),
        state: upper(to.state_code),
        country: "MX",
        postalCode: digitsOnly(to.postal_code)
      },
      packages: [{
        content: "Ropa Deportiva",
        amount: 1,
        type: "box",
        weight: weight,
        insurance: 0,
        declaredValue: declaredValue,
        length: 30, width: 20, height: 10
      }],
      shipment: { carrier: "fedex,estafeta,redpack,dhl", type: 1 },
      settings: { currency: "MXN" }
    };

    const res = await fetch("https://api.envia.com/ship/rate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.meta || data.meta !== "generate") {
      // Intentar leer error
      const errMsg = data?.error?.message || `Error API (${res.status})`;
      return { ok: false, error: errMsg };
    }

    // Filtrar y ordenar opciones
    let rates = (data.data || []).filter(r => r.totalPrice > 0);
    if (rates.length === 0) return { ok: false, error: "Sin cobertura" };
    
    // Ordenar por precio ascendente
    rates.sort((a, b) => a.totalPrice - b.totalPrice);
    const best = rates[0];

    return { 
      ok: true, 
      quote: {
        mxn: best.totalPrice,
        provider: best.carrierDescription,
        service: best.serviceDescription,
        days: Number(best.deliveryDays || 5) 
      }
    };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// --- CÁLCULO FINAL DE ENVÍO ---
async function computeShipping({ mode, to, items, productMap }) {
  const m = toStr(mode).toLowerCase();

  // 1. Pickup
  if (m === "pickup") {
    return { ok: true, mxn: 0, label: "Pickup (Tijuana)", carrier: "TIJUANA" };
  }

  // 2. Local Tijuana (Detectado o Forzado)
  const isTJ = m === "tj" || isTijuanaPostal(to?.postal_code) || (looksLikeTijuana(to?.city) && to?.state_code === "BC");
  
  if (isTJ) {
    // CORREGIDO: Usar TIJUANA_DELIVERY_PRICE en lugar de TIJUANA_DELIVERY_MXN
    return { ok: true, mxn: TIJUANA_DELIVERY_PRICE, label: "Entrega Local Tijuana", carrier: "LOCAL" };
  }

  // 3. Nacional (Envia.com)
  const q = await quoteEnviaMXN({ to, items, productMap });
  
  if (q.ok) {
    // Agregamos 5% buffer de seguridad y redondeamos
    const finalPrice = Math.ceil(q.quote.mxn * 1.05);
    return { 
      ok: true, 
      mxn: finalPrice, 
      label: `${q.quote.provider} ${q.quote.service}`.trim(),
      carrier: q.quote.provider 
    };
  }

  // 4. Fallback Nacional (Si falla API)
  console.warn("Usando tarifa fallback nacional:", q.error);
  return { 
    ok: true, 
    mxn: DEFAULT_NATIONAL_SHIPPING, 
    label: "Envío Nacional Estándar", 
    carrier: "ESTIMADO" 
  };
}

// --- PROMOS ---
async function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  const code = normalizePromo(promoCode);
  const promoData = await loadPromos(); // Carga desde promos.json
  const rules = promoData.rules || [];
  
  const rule = rules.find(r => normalizePromo(r.code) === code && r.active);
  let discount = 0;

  if (rule) {
    if (rule.type === "percent") discount = Math.round(subtotalMXN * (rule.value || 0));
    else if (rule.type === "fixed_mxn") discount = Math.round(rule.value || 0);
    else if (rule.type === "free_shipping") discount = Math.round(shippingMXN);
    else if (rule.type === "free_total") discount = subtotalMXN + shippingMXN; // 100% off
  }

  // Seguridad: Descuento no puede ser mayor al total
  const totalRaw = subtotalMXN + shippingMXN;
  discount = Math.min(discount, totalRaw);
  
  return {
    promoCode: discount > 0 ? code : null,
    discountMXN: discount,
    shippingMXN,
    totalMXN: Math.max(0, totalRaw - discount)
  };
}

function getBaseUrlFromEnv() { return process.env.URL || "https://scorestore.netlify.app"; }

module.exports = {
  jsonResponse, safeJsonParse, toStr, upper, isMxPostal, isTijuanaPostal, looksLikeTijuana,
  loadCatalog, loadPromos, productMapFromCatalog, validateCartItems, validateSizes, computeSubtotalMXN,
  applyPromoToTotals, getBaseUrlFromEnv, quoteEnviaMXN, computeShipping
};