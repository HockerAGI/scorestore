// netlify/functions/_shared.js
// Shared helpers for SCORE Store functions (Node 18 / Netlify)
// No secrets in code: everything sensitive comes from environment variables.

const fs = require("fs/promises");
const path = require("path");

let _catalogCache = null;
let _promosCache = null;

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

function normalizePromo(code) {
  return upper(code).replace(/\s+/g, "");
}

function isMxPostal(postal) {
  return /^[0-9]{5}$/.test(toStr(postal));
}

// Tijuana postal codes are typically 22xxx.
// We use this as a *practical* guard to avoid giving "Tijuana delivery" to random cities.
function isTijuanaPostal(postal) {
  const p = toStr(postal);
  return isMxPostal(p) && p.startsWith("22");
}

function looksLikeTijuana(city) {
  const c = toStr(city).toLowerCase();
  return c.includes("tijuana");
}

async function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  const filePath = path.join(process.cwd(), "data", "catalog.json");
  const raw = await fs.readFile(filePath, "utf8");
  _catalogCache = JSON.parse(raw);
  return _catalogCache;
}

async function loadPromos() {
  if (_promosCache) return _promosCache;
  const filePath = path.join(process.cwd(), "data", "promos.json");
  const raw = await fs.readFile(filePath, "utf8");
  _promosCache = JSON.parse(raw);
  return _promosCache;
}

function productMapFromCatalog(catalog) {
  const map = new Map();
  for (const p of (catalog?.products || [])) map.set(p.id, p);
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Carrito vacío." };
  if (items.length > 30) return { ok: false, error: "Carrito demasiado grande." };

  for (const it of items) {
    const id = toStr(it?.id);
    const qty = Number(it?.qty ?? 0);
    const size = toStr(it?.size);

    if (!id) return { ok: false, error: "Item inválido (id faltante)." };
    if (!Number.isFinite(qty) || qty <= 0 || qty > 20) return { ok: false, error: "Cantidad inválida." };
    // size can be empty for products that are "ÚNICA" (handled later), but send it anyway.
    if (size.length > 10) return { ok: false, error: "Talla inválida." };
  }
  return { ok: true };
}

function buildPackageFromItems(items, productMap) {
  // Very simple packing: aggregate weight; use max dims among items.
  let totalWeightG = 0;
  let maxL = 10, maxW = 10, maxH = 5;

  const contentNames = [];

  for (const it of items) {
    const p = productMap.get(it.id);
    if (!p) continue;

    const qty = Number(it.qty || 0);
    totalWeightG += (Number(p.weight_g || 300) * qty);

    const dims = Array.isArray(p.dimensions_cm) ? p.dimensions_cm : [30, 20, 5];
    maxL = Math.max(maxL, Number(dims[0] || 30));
    maxW = Math.max(maxW, Number(dims[1] || 20));
    maxH = Math.max(maxH, Number(dims[2] || 5));

    contentNames.push(`${p.name} x${qty}`);
  }

  const totalWeightKg = Math.max(0.2, Math.round((totalWeightG / 1000) * 100) / 100);

  return {
    totalWeightKg,
    dimsCm: [maxL, maxW, maxH],
    content: contentNames.slice(0, 6).join(", "),
  };
}

function computeSubtotalMXN(items, productMap) {
  let subtotal = 0;
  for (const it of items) {
    const p = productMap.get(it.id);
    if (!p) continue;
    subtotal += Number(p.baseMXN || 0) * Number(it.qty || 0);
  }
  return Math.max(0, Math.round(subtotal));
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap.get(it.id);
    if (!p) return { ok: false, error: `Producto no encontrado: ${it.id}` };

    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const sent = toStr(it.size);

    // If product has only one size ("ÚNICA"), accept blank or matching.
    if (sizes.length === 1 && upper(sizes[0]) === "ÚNICA") {
      continue;
    }

    if (!sent) return { ok: false, error: `Falta talla para: ${p.name}` };

    const allowed = new Set(sizes.map(s => upper(s)));
    if (!allowed.has(upper(sent))) return { ok: false, error: `Talla inválida para: ${p.name}` };
  }
  return { ok: true };
}

async function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  const promos = await loadPromos();
  const code = normalizePromo(promoCode);
  if (!code) return { code: "", discountMXN: 0, shippingMXN, totalMXN: subtotalMXN + shippingMXN };

  const rule = (promos?.rules || []).find(r => normalizePromo(r.code) === code);
  if (!rule || !rule.active) {
    return { code, discountMXN: 0, shippingMXN, totalMXN: subtotalMXN + shippingMXN, note: "Cupón inválido o desactivado." };
  }

  let discountMXN = 0;
  let newShipping = shippingMXN;
  let newSubtotal = subtotalMXN;

  if (rule.type === "percent") {
    discountMXN = Math.round(subtotalMXN * Number(rule.value || 0));
  } else if (rule.type === "fixed_mxn") {
    discountMXN = Math.round(Number(rule.value || 0));
  } else if (rule.type === "free_shipping") {
    newShipping = 0;
  } else if (rule.type === "free_total") {
    // VERY risky. Keep only if you explicitly activate it in data/promos.json.
    newSubtotal = 0;
    newShipping = 0;
  }

  const cappedDiscount = Math.max(0, Math.min(discountMXN, newSubtotal));
  const totalMXN = Math.max(0, Math.round(newSubtotal - cappedDiscount + newShipping));

  return { code, discountMXN: cappedDiscount, shippingMXN: newShipping, totalMXN };
}

function getBaseUrlFromEnv() {
  // priority: explicit URL_SCORE, then Netlify system URLs.
  const explicit = toStr(process.env.URL_SCORE);
  if (explicit) return explicit.replace(/\/+$/, "");
  const url = toStr(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL);
  return url ? url.replace(/\/+$/, "") : "";
}

// --- ENVIÁ.COM RATE QUOTE ---
async function quoteEnviaMXN({ to, items, productMap }) {
  const apiKey = toStr(process.env.ENVIA_API_KEY);
  if (!apiKey) {
    return { ok: false, error: "ENVIA_API_KEY no configurada." };
  }

  const postalCode = toStr(to?.postal_code);
  const state = upper(to?.state_code || to?.state || "");
  const city = toStr(to?.city);
  const address1 = toStr(to?.address1);

  if (!isMxPostal(postalCode)) return { ok: false, error: "C.P. inválido." };
  if (!state) return { ok: false, error: "Estado inválido." };
  if (!city) return { ok: false, error: "Ciudad inválida." };
  if (!address1) return { ok: false, error: "Dirección inválida." };

  const pkg = buildPackageFromItems(items, productMap);

  const payload = {
    origin: {
      name: "ÚNICO Uniformes",
      company: "BAJATEX S. de R.L. de C.V.",
      email: "ventas.unicotextil@gmail.com",
      phone: "6642368701",
      street: "Palermo 6106 Interior JK",
      neighborhood: "Anexa Roma",
      city: "Tijuana",
      state: "BC",
      country: "MX",
      postalCode: "22614",
    },
    destination: {
      name: "Cliente SCORE",
      street: address1,
      neighborhood: "",
      city,
      state,
      country: "MX",
      postalCode,
    },
    packages: [
      {
        content: pkg.content || "Mercancía SCORE Store",
        amount: 1,
        type: "box",
        weight: pkg.totalWeightKg,
        insurance: 0,
        declaredValue: 0,
        length: pkg.dimsCm[0],
        width: pkg.dimsCm[1],
        height: pkg.dimsCm[2],
      },
    ],
    shipment: { carrier: "ENVIA" },
  };

  const res = await fetch("https://api.envia.com/ship/rate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.message || `Error Envia (${res.status})`;
    return { ok: false, error: msg };
  }

  const rates = data?.data;
  if (!Array.isArray(rates) || rates.length === 0) return { ok: false, error: "Envia sin tarifas disponibles." };

  // choose lowest total
  const lowest = rates.reduce((a, b) => (Number(a.total) < Number(b.total) ? a : b));
  const raw = Number(lowest.total || 0);
  const provider = toStr(lowest.provider);
  const service = toStr(lowest.service);
  const days = Number(lowest.days || 0);

  return {
    ok: true,
    quote: { mxn: raw, provider, service, days },
  };
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  normalizePromo,
  isMxPostal,
  isTijuanaPostal,
  looksLikeTijuana,
  loadCatalog,
  loadPromos,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeSubtotalMXN,
  applyPromoToTotals,
  getBaseUrlFromEnv,
  quoteEnviaMXN,
};