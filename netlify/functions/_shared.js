// netlify/functions/_shared.js

const fs = require("fs/promises");
const path = require("path");

/* ======================================================
   RESPUESTAS
   ====================================================== */
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

/* ======================================================
   STRINGS / NUMBERS
   ====================================================== */
function toStr(v) {
  return (v ?? "").toString().trim();
}

function upper(v) {
  return toStr(v).toUpperCase();
}

function digitsOnly(v) {
  return toStr(v).replace(/\D+/g, "");
}

function roundMXN(n) {
  return Math.round(Number(n || 0));
}

function normalizePromo(code) {
  return upper(code).replace(/\s+/g, "");
}

/* ======================================================
   DATA LOAD (CACHE)
   ====================================================== */
let _catalogCache = null;
let _promoCache = null;

async function loadCatalog() {
  if (_catalogCache) return _catalogCache;

  const file = path.join(process.cwd(), "data", "catalog.json");
  const raw = await fs.readFile(file, "utf8");
  const json = JSON.parse(raw);

  const map = {};
  (json.products || []).forEach(p => (map[p.id] = p));

  _catalogCache = {
    raw: json,
    map,
  };

  return _catalogCache;
}

async function loadPromos() {
  if (_promoCache) return _promoCache;

  const file = path.join(process.cwd(), "data", "promos.json");
  const raw = await fs.readFile(file, "utf8");
  _promoCache = JSON.parse(raw);
  return _promoCache;
}

/* ======================================================
   VALIDACIONES
   ====================================================== */
function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Carrito vacío o inválido." };
  }

  for (const it of items) {
    if (!it.id || !Number.isInteger(it.qty) || it.qty <= 0) {
      return { ok: false, error: "Item inválido en carrito." };
    }
  }

  return { ok: true, items };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap[it.id];
    if (!p) return { ok: false, error: `Producto no existe: ${it.id}` };

    if (p.sizes && p.sizes.length > 0) {
      if (it.size && !p.sizes.includes(it.size)) {
        return { ok: false, error: `Talla inválida para ${p.name}` };
      }
    }
  }
  return { ok: true };
}

/* ======================================================
   PRICING
   ====================================================== */
function computeSubtotalMXN(items, productMap) {
  return items.reduce(
    (acc, it) => acc + Number(productMap[it.id].price) * it.qty,
    0
  );
}

function applyPromoToTotals({ promoCode, subtotal_mxn, shipping_mxn }) {
  let discount_mxn = 0;
  let applied = null;

  if (promoCode) {
    applied = normalizePromo(promoCode);
    if (applied === "SCORE10") {
      discount_mxn = roundMXN(subtotal_mxn * 0.1);
    }
  }

  const total_mxn = Math.max(
    0,
    subtotal_mxn + shipping_mxn - discount_mxn
  );

  return {
    promoCode: applied,
    discount_mxn,
    totals: {
      subtotal_mxn,
      shipping_mxn,
      discount_mxn,
      total_mxn,
    },
  };
}

/* ======================================================
   GEO
   ====================================================== */
function isTijuanaPostal(cp) {
  return /^22\d{3}$/.test(cp);
}

function looksLikeTijuana(city = "") {
  return /tijuana/i.test(city);
}

/* ======================================================
   ENVIA (SAFE FALLBACK)
   ====================================================== */
const FEATURE_ENVIADOTCOM = true;

async function quoteEnviaMXN() {
  return {
    ok: true,
    mxn: 290,
    carrier: "ENVIA",
    service: "Standard",
  };
}

/* ======================================================
   SHIPPING
   ====================================================== */
async function computeShipping({ mode, to, items }) {
  if (mode === "pickup") {
    return { ok: true, mxn: 0, label: "Recolectar en tienda" };
  }

  const isTJ =
    isTijuanaPostal(to.postal_code) ||
    (looksLikeTijuana(to.city) &&
      (!to.state_code || to.state_code === "BC"));

  if (mode === "tj" || isTJ) {
    return { ok: true, mxn: 200, label: "Entrega local Tijuana" };
  }

  if (!FEATURE_ENVIADOTCOM) {
    return { ok: true, mxn: 250, label: "Envío nacional" };
  }

  try {
    const q = await quoteEnviaMXN();
    return {
      ok: true,
      mxn: Math.max(250, roundMXN(q.mxn)),
      label: `${q.carrier} ${q.service}`,
    };
  } catch {
    return { ok: true, mxn: 250, label: "Envío nacional (fallback)" };
  }
}

/* ======================================================
   EXPORTS
   ====================================================== */
module.exports = {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  roundMXN,
  normalizePromo,
  loadCatalog,
  loadPromos,
  validateCartItems,
  validateSizes,
  computeSubtotalMXN,
  applyPromoToTotals,
  isTijuanaPostal,
  looksLikeTijuana,
  quoteEnviaMXN,
  computeShipping,
  FEATURE_ENVIADOTCOM,
};