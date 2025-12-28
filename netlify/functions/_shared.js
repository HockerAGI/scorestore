// netlify/functions/_shared.js

const fs = require("fs/promises");
const path = require("path");

// ===== Utilidades base =====
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

function safeJsonParse(raw, fallback = {}) {
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

// ===== Carga de datos =====
let _catalogCache = null;
let _promosCache = null;

async function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  const file = path.join(process.cwd(), "data", "catalog.json");
  const raw = await fs.readFile(file, "utf8");
  _catalogCache = JSON.parse(raw);
  return _catalogCache;
}

async function loadPromos() {
  if (_promosCache) return _promosCache;
  const file = path.join(process.cwd(), "data", "promos.json");
  const raw = await fs.readFile(file, "utf8");
  _promosCache = JSON.parse(raw);
  return _promosCache;
}

function productMapFromCatalog(catalog) {
  const map = {};
  catalog.forEach((p) => (map[p.id] = p));
  return map;
}

// ===== Validaciones =====
function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Carrito vacío o inválido." };
  }
  for (const it of items) {
    if (!it.id || !it.qty || it.qty <= 0) {
      return { ok: false, error: "Item inválido en carrito." };
    }
  }
  return { ok: true, items };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap[it.id];
    if (!p) return { ok: false, error: `Producto no existe: ${it.id}` };
    if (p.sizes && p.sizes.length && !p.sizes.includes(it.size)) {
      return { ok: false, error: `Talla inválida para ${p.name}` };
    }
  }
  return { ok: true };
}

// ===== Cálculos =====
function computeSubtotalMXN(items, productMap) {
  return items.reduce(
    (acc, it) => acc + Number(productMap[it.id].price) * it.qty,
    0
  );
}

function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  let discountMXN = 0;
  let applied = null;

  if (promoCode) {
    applied = normalizePromo(promoCode);
    if (applied === "SCORE10") {
      discountMXN = Math.round(subtotalMXN * 0.1);
    }
  }

  const totalMXN = Math.max(0, subtotalMXN + shippingMXN - discountMXN);

  return {
    promoCode: applied,
    discountMXN,
    totalMXN,
  };
}

// ===== Helpers geográficos =====
function isTijuanaPostal(cp) {
  return /^22\d{3}$/.test(cp);
}

function looksLikeTijuana(city = "") {
  return /tijuana/i.test(city);
}

// ===== ENVIA (quote) =====
async function quoteEnviaMXN({ to, items, productMap }) {
  const token = process.env.ENVIA_API_KEY;
  if (!token) return { ok: false };

  // Fallback simple (no rompe)
  return {
    ok: true,
    quote: {
      mxn: 290,
      provider: "ENVIA",
      service: "Standard",
    },
  };
}

// ===== SHIPPING WRAPPER (FIX CRÍTICO) =====
async function computeShipping({ mode, to, items, subtotal_mxn, featureEnvia = true }) {
  if (mode === "pickup") {
    return { ok: true, mxn: 0, label: "Recolectar en tienda" };
  }

  const isTJ =
    isTijuanaPostal(to.postal_code) ||
    (looksLikeTijuana(to.city) && (!to.state_code || to.state_code === "BC"));

  if (mode === "tj" || isTJ) {
    return { ok: true, mxn: 200, label: "Entrega local Tijuana" };
  }

  if (!featureEnvia) {
    return { ok: true, mxn: 250, label: "Envío nacional (estimado)" };
  }

  try {
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    const q = await quoteEnviaMXN({ to, items, productMap });
    if (!q.ok) throw new Error("No quote");

    return {
      ok: true,
      mxn: Math.max(250, Math.round(q.quote.mxn * 1.05)),
      label: `${q.quote.provider} ${q.quote.service}`,
    };
  } catch {
    return { ok: true, mxn: 250, label: "Envío nacional (fallback)" };
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  normalizePromo,
  loadCatalog,
  loadPromos,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeSubtotalMXN,
  applyPromoToTotals,
  isTijuanaPostal,
  looksLikeTijuana,
  quoteEnviaMXN,
  computeShipping,
};