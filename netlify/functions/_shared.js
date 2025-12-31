// netlify/functions/_shared.js
const path = require("path");

// CARGA SEGURA DE DATOS (Vital para Netlify Functions)
// Usamos require para que esbuild empaquete el JSON dentro del JS.
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
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toStr(v) {
  return (v ?? "").toString().trim();
}

function upper(v) {
  return toStr(v).toUpperCase();
}

function digitsOnly(v) {
  return toStr(v).replace(/\D+/g, "");
}

function normalizePromo(code) {
  return upper(code).replace(/\s+/g, "");
}

/* =========================
   ENV / URL
========================= */
function getSiteUrlFromEnv(event) {
  if (process.env.URL_SCORE) return process.env.URL_SCORE;
  if (process.env.URL) return process.env.URL; // Variable default de Netlify
  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  const host = event?.headers?.host;
  return host ? `${proto}://${host}` : "";
}

/* =========================
   CATÁLOGO
========================= */
// Ajustado para retornar los datos ya cargados
async function loadCatalog() {
  return catalogData;
}

function productMapFromCatalog(catalog) {
  const map = {};
  for (const p of catalog.products || []) {
    map[p.id] = p;
  }
  return map;
}

/* =========================
   VALIDACIONES
========================= */
function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, error: "Carrito vacío o inválido." };
  }

  const clean = [];
  for (const it of items) {
    if (!it.id || !Number.isInteger(it.qty) || it.qty <= 0) {
      return { ok: false, error: "Ítem inválido en carrito." };
    }
    clean.push({
      id: toStr(it.id),
      qty: it.qty,
      size: toStr(it.size) || "Unitalla",
    });
  }

  return { ok: true, items: clean };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap[it.id];
    if (!p) return { ok: false, error: `Producto inexistente: ${it.id}` };

    if (Array.isArray(p.sizes) && !p.sizes.includes(it.size)) {
      return {
        ok: false,
        error: `Talla inválida para ${p.name}`,
      };
    }
  }
  return { ok: true };
}

/* =========================
   SHIPPING
========================= */
async function computeShipping({ mode, to }) {
  // Fallbacks definidos
  if (mode === "pickup") {
    return { ok: true, mxn: 0, label: "Pickup Tijuana", days: 0 };
  }
  if (mode === "tj") {
    return { ok: true, mxn: 200, label: "Envío Local TJ", days: 2 };
  }
  if (mode === "mx") {
    // Si no hay CP válido, usa tarifa estándar
    if (!to?.postal_code || to.postal_code.length !== 5) {
      return { ok: true, mxn: 250, label: "Envío Nacional", days: 5 };
    }
    // Nota: El cálculo real con API de Envia se hace en el frontend 
    // o en quote_shipping.js. Aquí solo aseguramos un fallback seguro.
    return { ok: true, mxn: 250, label: "Envío Nacional", days: 5 }; 
  }
  return { ok: true, mxn: 0, label: "Envío", days: 7 };
}

/* =========================
   PROMOS
========================= */
async function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  if (!promoCode) {
    return {
      discountMXN: 0,
      totalMXN: subtotalMXN + shippingMXN,
    };
  }

  try {
    // Usamos los datos cargados con require
    const rules = promoData.rules || [];

    const rule = rules.find(
      (r) => normalizePromo(r.code) === normalizePromo(promoCode) && r.active
    );

    if (!rule) {
      return {
        discountMXN: 0,
        totalMXN: subtotalMXN + shippingMXN,
      };
    }

    let discount = 0;

    if (rule.type === "percent") {
      discount = Math.round(subtotalMXN * rule.value);
    } else if (rule.type === "fixed_mxn") {
      discount = Math.min(subtotalMXN, rule.value);
    } else if (rule.type === "free_shipping") {
      return {
        discountMXN: shippingMXN,
        totalMXN: subtotalMXN,
      };
    }

    return {
      discountMXN: discount,
      totalMXN: Math.max(0, subtotalMXN - discount) + shippingMXN,
    };
  } catch {
    return {
      discountMXN: 0,
      totalMXN: subtotalMXN + shippingMXN,
    };
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
};