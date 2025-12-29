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

function roundMXN(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Flags
const FEATURE_ENVIADOTCOM = toStr(process.env.FEATURE_ENVIADOTCOM || "1") !== "0";

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
  const map = new Map();
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  for (const p of products) map.set(p.id, p);
  return map;
}

function getMarkupPct(catalog) {
  const m = Number(catalog?.pricing?.markup_pct ?? 0);
  return Number.isFinite(m) ? Math.max(0, m) : 0;
}

function priceMXN(p, markupPct) {
  const base = Number(p?.baseMXN ?? 0);
  if (!Number.isFinite(base)) return 0;
  return roundMXN(base * (1 + markupPct));
}

// ===== Validaciones =====
function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Carrito vacío o inválido." };
  }
  for (const it of items) {
    if (!it?.id || !Number(it?.qty) || Number(it?.qty) <= 0) {
      return { ok: false, error: "Item inválido en carrito." };
    }
  }
  return { ok: true, items };
}

function validateSizes(items, productMap) {
  for (const it of items) {
    const p = productMap.get(it.id);
    if (!p) return { ok: false, error: `Producto no existe: ${it.id}` };

    const sizes = Array.isArray(p?.sizes) ? p.sizes : [];
    if (sizes.length) {
      if (!it.size || !sizes.includes(it.size)) {
        return { ok: false, error: `Talla inválida para ${p.name}` };
      }
    }
  }
  return { ok: true };
}

// ===== Cálculos =====
function computeSubtotalMXN(items, productMap, markupPct = 0) {
  let subtotal = 0;
  for (const it of items) {
    const p = productMap.get(it.id);
    const unit = priceMXN(p, markupPct);
    subtotal += unit * Number(it.qty || 0);
  }
  return roundMXN(subtotal);
}

function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN, promos }) {
  const code = normalizePromo(promoCode);
  const rules = Array.isArray(promos?.rules) ? promos.rules : [];
  const rule = rules.find((r) => normalizePromo(r.code) === code && r.active);

  let discountMXN = 0;

  if (rule) {
    if (rule.type === "percent") discountMXN = Math.round(subtotalMXN * Number(rule.value || 0));
    else if (rule.type === "fixed_mxn") discountMXN = Math.round(Number(rule.value || 0));
    else if (rule.type === "free_shipping") discountMXN = Math.round(shippingMXN);
  }

  discountMXN = Math.max(0, Math.min(discountMXN, subtotalMXN + shippingMXN));

  const totalMXN = Math.max(0, roundMXN(subtotalMXN + shippingMXN - discountMXN));

  return {
    promoCode: rule ? code : (code || ""),
    discountMXN,
    totalMXN,
  };
}

// ===== Helpers geográficos =====
function isMxPostal(cp) {
  return /^\d{5}$/.test(toStr(cp));
}

function isTijuanaPostal(cp) {
  return /^22\d{3}$/.test(toStr(cp));
}

function looksLikeTijuana(city = "") {
  return /tijuana/i.test(toStr(city));
}

// ===== ENVIA (quote) =====
function enviaOriginFromEnv() {
  // Defaults (cámbialos en env si quieres)
  return {
    name: toStr(process.env.ENVIA_ORIGIN_NAME || "SCORE Store"),
    company: toStr(process.env.ENVIA_ORIGIN_COMPANY || "SCORE Store"),
    email: toStr(process.env.ENVIA_ORIGIN_EMAIL || "no-reply@scorestore.local"),
    phone: toStr(process.env.ENVIA_ORIGIN_PHONE || "0000000000"),
    street: toStr(process.env.ENVIA_ORIGIN_STREET || "Av. Revolución"),
    number: toStr(process.env.ENVIA_ORIGIN_NUMBER || "1000"),
    district: toStr(process.env.ENVIA_ORIGIN_DISTRICT || "Centro"),
    city: toStr(process.env.ENVIA_ORIGIN_CITY || "Tijuana"),
    state: toStr(process.env.ENVIA_ORIGIN_STATE || "BC"),
    country: toStr(process.env.ENVIA_ORIGIN_COUNTRY || "MX"),
    postalCode: digitsOnly(process.env.ENVIA_ORIGIN_POSTAL || "22000"),
    reference: toStr(process.env.ENVIA_ORIGIN_REFERENCE || "Origen"),
  };
}

async function quoteEnviaMXN({ to, items, productMap, markupPct = 0 }) {
  const token = toStr(process.env.ENVIA_API_KEY);
  if (!token) return { ok: false, error: "Missing ENVIA_API_KEY" };

  const origin = enviaOriginFromEnv();

  // paquetes: estimación por item (1 kg mínimo total)
  let weight = 0;
  for (const it of items) weight += Math.max(1, Number(it.qty || 1)) * 0.35;
  weight = Math.max(1, Math.round(weight * 100) / 100);

  const body = {
    origin,
    destination: {
      name: toStr(to?.name || "Cliente"),
      company: "",
      email: "",
      phone: "",
      street: toStr(to?.address1 || ""),
      number: "S/N",
      district: "",
      city: toStr(to?.city || ""),
      state: toStr(to?.state_code || ""),
      country: "MX",
      postalCode: digitsOnly(to?.postal_code || ""),
      reference: "",
    },
    packages: [
      {
        content: "Merch",
        amount: 1,
        type: "box",
        weight,
        insurance: 0,
        declaredValue: Math.min(5000, computeSubtotalMXN(items, productMap, markupPct)),
        length: 30,
        width: 25,
        height: 10,
      },
    ],
    shipment: { carrier: "", service: "" },
    settings: { currency: "MXN" },
  };

  try {
    const res = await fetch("https://api.envia.com/ship/rate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `ENVIA_HTTP_${res.status}`, detail: data };
    }

    // Normalización simple: toma la mejor opción por costo
    const options = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    if (!options.length) return { ok: false, error: "ENVIA_NO_OPTIONS", detail: data };

    options.sort((a, b) => Number(a.totalPrice || a.total || 1e9) - Number(b.totalPrice || b.total || 1e9));
    const best = options[0];

    const mxn = roundMXN(best.totalPrice || best.total || best.price || 0);
    const provider = toStr(best.carrier || best.provider || "ENVIA");
    const service = toStr(best.service || best.serviceName || "Standard");
    const days = Number(best.deliveryDays || best.days || 3);

    if (!mxn) return { ok: false, error: "ENVIA_BAD_PRICE", detail: best };

    return { ok: true, quote: { mxn, provider, service, days } };
  } catch (e) {
    return { ok: false, error: `ENVIA_FETCH_FAIL:${toStr(e.message)}` };
  }
}

// ===== SHIPPING (UNIFICADO) =====
const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

async function computeShipping({ mode, to, items, subtotal_mxn = 0, featureEnvia = true, catalog = null, productMap = null }) {
  const m = toStr(mode).toLowerCase();

  if (m === "pickup") return { ok: true, mxn: 0, label: "Pickup (Tijuana)", carrier: "TIJUANA", service: "Pickup" };

  // Local TJ (forzado o auto-detect)
  const isTJ =
    m === "tj" ||
    isTijuanaPostal(to?.postal_code) ||
    (looksLikeTijuana(to?.city) && (!to?.state_code || to?.state_code === "BC"));

  if (isTJ) {
    return { ok: true, mxn: TIJUANA_DELIVERY_MXN, label: "Entrega local Tijuana", carrier: "TIJUANA", service: "Local" };
  }

  // Nacional
  if (!featureEnvia) {
    return { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, label: "Envío nacional (estimado)", carrier: "ESTIMADO", service: "Nacional" };
  }

  try {
    const cat = catalog || (await loadCatalog());
    const pm = productMap || productMapFromCatalog(cat);
    const markup = getMarkupPct(cat);

    const q = await quoteEnviaMXN({ to, items, productMap: pm, markupPct: markup });
    if (!q.ok) {
      return { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, label: "Envío nacional (fallback)", carrier: "ESTIMADO", service: "Nacional" };
    }

    // buffer leve
    const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, roundMXN(Number(q.quote.mxn) * 1.05));

    return { ok: true, mxn, label: `${q.quote.provider} ${q.quote.service}`.trim(), carrier: q.quote.provider, service: q.quote.service, days: q.quote.days || 3 };
  } catch {
    return { ok: true, mxn: MIN_OUTSIDE_TJ_MXN, label: "Envío nacional (fallback)", carrier: "ESTIMADO", service: "Nacional" };
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  normalizePromo,
  roundMXN,
  FEATURE_ENVIADOTCOM,

  loadCatalog,
  loadPromos,
  productMapFromCatalog,

  validateCartItems,
  validateSizes,

  computeSubtotalMXN,
  applyPromoToTotals,

  isMxPostal,
  isTijuanaPostal,
  looksLikeTijuana,

  quoteEnviaMXN,
  computeShipping,
};