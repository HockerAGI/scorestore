// netlify/functions/_shared.js
const path = require("path");

// CARGA SEGURA DE DATOS (Vital para Netlify Functions)
const catalogData = require("../../data/catalog.json");
const promoData = require("../../data/promos.json");

/* =========================
   RESPUESTAS
========================= */
function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

/* =========================
   HELPERS BÁSICOS
========================= */
function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }
function digitsOnly(v) { return toStr(v).replace(/\D+/g, ""); }
function normalizePromo(code) { return upper(code).replace(/\s+/g, ""); }

/* =========================
   ENV / URL
========================= */
function getSiteUrlFromEnv(event) {
  if (process.env.URL_SCORE) return process.env.URL_SCORE;
  if (process.env.URL) return process.env.URL;
  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  const host = event?.headers?.host;
  return host ? `${proto}://${host}` : "";
}

/* =========================
   CATÁLOGO
========================= */
async function loadCatalog() { return catalogData; }

function productMapFromCatalog(catalog) {
  const map = {};
  for (const p of catalog.products || []) map[p.id] = p;
  return map;
}

/* =========================
   VALIDACIONES
========================= */
function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "Carrito vacío." };
  const clean = [];
  for (const it of items) {
    if (!it.id || !Number.isInteger(it.qty) || it.qty <= 0) return { ok: false, error: "Ítem inválido." };
    clean.push({ id: toStr(it.id), qty: it.qty, size: toStr(it.size) || "Unitalla" });
  }
  return { ok: true, items: clean };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap[it.id];
    if (!p) return { ok: false, error: `Producto inexistente: ${it.id}` };
    if (Array.isArray(p.sizes) && !p.sizes.includes(it.size)) return { ok: false, error: `Talla inválida para ${p.name}` };
  }
  return { ok: true };
}

/* =========================
   SHIPPING & PROMOS
========================= */
async function computeShipping({ mode, to }) {
  if (mode === "pickup") return { ok: true, mxn: 0, label: "Pickup Tijuana", days: 0 };
  if (mode === "tj") return { ok: true, mxn: 200, label: "Envío Local TJ", days: 2 };
  if (mode === "mx") {
    if (!to?.postal_code || to.postal_code.length !== 5) return { ok: true, mxn: 250, label: "Envío Nacional", days: 5 };
    return { ok: true, mxn: 250, label: "Envío Nacional", days: 5 };
  }
  return { ok: true, mxn: 0, label: "Envío", days: 7 };
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
   ENVIA.COM AUTOMATION
========================= */
async function createEnviaLabel(orderData) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ SKIPPED: Falta ENVIA_API_KEY.");
    return null;
  }

  // Mapear datos desde Stripe Session
  const carrier = toStr(orderData.metadata?.ship_carrier || "fedex").toLowerCase(); 
  const service = toStr(orderData.metadata?.ship_service_code || "standard");
  const address = orderData.shipping?.address || {};
  const name = orderData.shipping?.name || "Cliente";
  
  // Payload para Envia (Generate)
  const payload = {
    origin: {
      name: "SCORE Store",
      company: "Unico Uniformes",
      email: "ventas.unicotextil@gmail.com",
      phone: "6641234567", // Ajustar teléfono real
      street: "Blvd. Gustavo Díaz Ordaz",
      number: "1234", // Ajustar dirección real
      district: "La Mesa",
      city: "Tijuana",
      state: "BC",
      country: "MX",
      postal_code: "22000"
    },
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
    packages: [
      {
        content: "Merch Oficial SCORE",
        amount: 1,
        type: "box",
        dimensions: { length: 25, width: 25, height: 12 },
        weight: 1,
        insurance: 0,
        declared_value: orderData.amount_total ? (orderData.amount_total / 100) : 500
      }
    ],
    shipment: {
      carrier: carrier, 
      service: service
    },
    settings: {
      currency: "MXN",
      label_format: "pdf"
    }
  };

  try {
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Envia API Error:", errText);
      return null;
    }

    const data = await res.json();
    // Envia a veces devuelve array o objeto con data
    const shipData = Array.isArray(data) ? data[0] : (data.data ? data.data[0] : data);
    
    if (shipData && shipData.track) {
      console.log(`✅ GUÍA CREADA: ${shipData.track} (${shipData.carrier})`);
      return {
        tracking_number: shipData.track,
        label_url: shipData.label,
        carrier: shipData.carrier
      };
    }
    return null;
  } catch (e) {
    console.error("❌ Envia Exception:", e);
    return null;
  }
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  normalizePromo,
  getSiteUrlFromEnv,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeShipping,
  applyPromoToTotals,
  createEnviaLabel // EXPORTADO
};