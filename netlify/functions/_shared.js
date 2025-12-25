// netlify/functions/_shared.js
const fs = require("fs/promises");
const path = require("path");

// Caches en memoria (warm)
let _catalogCache = null;
let _promosCache = null;

// === Utilidades ===
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

// === Validación ===
function isMxPostal(postal) {
  return /^[0-9]{5}$/.test(toStr(postal));
}

function isTijuanaPostal(postal) {
  const p = toStr(postal);
  return isMxPostal(p) && p.startsWith("22");
}

function looksLikeTijuana(city) {
  const c = toStr(city).toLowerCase();
  return c.includes("tijuana") || c.includes("tj");
}

function isUnicaLabel(s) {
  const u = upper(s).normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // quita acentos
  return u === "UNICA" || u === "UNICA." || u === "UNICA " || u === "UNICA TALLA" || u === "TALLA UNICA";
}

// === Lectura de JSON robusta (Netlify + esbuild) ===
async function readJsonSafe(relPath) {
  const candidates = [
    path.join(process.cwd(), relPath),
    path.join(process.cwd(), ".", relPath),
    path.join(__dirname, "..", "..", relPath),
    path.join(__dirname, "..", relPath),
    path.join(__dirname, relPath),
  ];

  let lastErr = null;
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`No se pudo leer ${relPath}`);
}

// === Carga de datos ===
async function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  _catalogCache = await readJsonSafe(path.join("data", "catalog.json"));
  return _catalogCache;
}

async function loadPromos() {
  if (_promosCache) return _promosCache;
  _promosCache = await readJsonSafe(path.join("data", "promos.json"));
  return _promosCache;
}

function productMapFromCatalog(catalog) {
  const map = new Map();
  for (const p of catalog?.products || []) map.set(p.id, p);
  return map;
}

// === Validaciones Carrito ===
function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Carrito vacío." };
  if (items.length > 30) return { ok: false, error: "Carrito demasiado grande." };

  for (const it of items) {
    const id = toStr(it?.id);
    const qty = Number(it?.qty ?? 0);
    const size = toStr(it?.size);

    if (!id) return { ok: false, error: "ID de producto inválido." };
    if (!Number.isFinite(qty) || qty <= 0 || qty > 20) return { ok: false, error: "Cantidad inválida." };
    if (size.length > 32) return { ok: false, error: "Talla inválida." };
  }

  return { ok: true };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const pid = toStr(it?.id);
    const p = productMap.get(pid);
    if (!p) return { ok: false, error: `Producto no encontrado: ${pid}` };

    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const sent = toStr(it?.size);

    // Si no hay tallas definidas, no bloqueamos
    if (!sizes.length) continue;

    // Si solo hay "Única/Unica", no exige talla
    if (sizes.length === 1 && isUnicaLabel(sizes[0])) continue;

    if (!sent) return { ok: false, error: `Falta talla para: ${p.name}` };

    const allowed = new Set(sizes.map((s) => upper(s)));
    if (!allowed.has(upper(sent))) return { ok: false, error: `Talla inválida para: ${p.name}` };
  }
  return { ok: true };
}

// === Cálculos ===
function computeSubtotalMXN(items, productMap) {
  let subtotal = 0;
  for (const it of items) {
    const p = productMap.get(toStr(it.id));
    if (!p) continue;
    subtotal += Number(p.baseMXN || 0) * Number(it.qty || 0);
  }
  return Math.max(0, Math.round(subtotal));
}

function buildPackageFromItems(items, productMap) {
  let totalWeightG = 0;
  let maxL = 10, maxW = 10, maxH = 5;
  const contentNames = [];

  for (const it of items) {
    const p = productMap.get(toStr(it.id));
    if (!p) continue;

    const qty = Number(it.qty || 0);
    totalWeightG += Number(p.weight_g || 300) * qty;

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

// === Promos (IMPORTANTE: NO bloquea checkout si cupón inválido) ===
async function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  const promos = await loadPromos();
  const code = normalizePromo(promoCode);

  // Sin cupón: ok
  if (!code) {
    return {
      ok: true,
      valid: false,
      promoCode: "",
      discountMXN: 0,
      shippingMXN: Number(shippingMXN || 0),
      totalMXN: Math.round(Number(subtotalMXN || 0) + Number(shippingMXN || 0)),
    };
  }

  const rule = (promos?.rules || []).find((r) => normalizePromo(r.code) === code);

  // Cupón inválido: ok (solo no aplica descuento)
  if (!rule || !rule.active) {
    return {
      ok: true,
      valid: false,
      promoCode: code,
      discountMXN: 0,
      shippingMXN: Number(shippingMXN || 0),
      totalMXN: Math.round(Number(subtotalMXN || 0) + Number(shippingMXN || 0)),
      note: "Cupón inválido o desactivado.",
    };
  }

  let discountMXN = 0;
  let newShipping = Number(shippingMXN || 0);
  let newSubtotal = Number(subtotalMXN || 0);

  if (rule.type === "percent") {
    discountMXN = Math.round(newSubtotal * Number(rule.value || 0));
  } else if (rule.type === "fixed_mxn") {
    discountMXN = Math.round(Number(rule.value || 0));
  } else if (rule.type === "free_shipping") {
    newShipping = 0;
  } else if (rule.type === "free_total") {
    newSubtotal = 0;
    newShipping = 0;
  }

  const cappedDiscount = Math.max(0, Math.min(discountMXN, newSubtotal));
  const totalMXN = Math.max(0, Math.round(newSubtotal - cappedDiscount + newShipping));

  return {
    ok: true,
    valid: true,
    promoCode: code,
    discountMXN: cappedDiscount,
    shippingMXN: newShipping,
    totalMXN,
  };
}

function getBaseUrlFromEnv() {
  const explicit = toStr(process.env.URL_SCORE);
  if (explicit) return explicit.replace(/\/+$/, "");
  const url = toStr(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL);
  return url ? url.replace(/\/+$/, "") : "";
}

// === Cotizador Envia (Node 18 fetch nativo) ===
async function quoteEnviaMXN({ to, items, productMap }) {
  const apiKey = toStr(process.env.ENVIA_API_KEY);
  if (!apiKey) return { ok: false, error: "ENVIA_API_KEY no configurada." };

  const postalCode = toStr(to?.postal_code);
  const state = upper(to?.state_code || to?.state || "");
  const city = toStr(to?.city);
  const address1 = toStr(to?.address1);

  if (!isMxPostal(postalCode) || !state || !city || !address1) {
    return { ok: false, error: "Dirección incompleta para cotización." };
  }

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

  if (!res.ok || !Array.isArray(data?.data) || data.data.length === 0) {
    const msg = data?.message || `Error Envia (${res.status})`;
    return { ok: false, error: msg };
  }

  const lowest = data.data.reduce((a, b) => (Number(a.total) < Number(b.total) ? a : b));
  return {
    ok: true,
    quote: {
      mxn: Number(lowest.total || 0),
      provider: toStr(lowest.provider),
      service: toStr(lowest.service),
      days: Number(lowest.days || 0),
    },
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