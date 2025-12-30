// netlify/functions/_shared.js
const fs = require("fs/promises");
const path = require("path");

/** =========================
 *  RESPUESTA JSON + CORS
 *  ========================= */
function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Stripe-Signature,X-Internal-Secret",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

/** =========================
 *  HELPERS
 *  ========================= */
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

function getSiteUrlFromEnv(event) {
  // Prioridad: tu variable custom si existe
  const urlScore = toStr(process.env.URL_SCORE);
  if (urlScore) return urlScore.replace(/\/+$/, "");

  // Netlify
  const netlifyURL = toStr(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL);
  if (netlifyURL) return netlifyURL.replace(/\/+$/, "");

  // Fallback local/dev
  const proto = toStr(event?.headers?.["x-forwarded-proto"]) || "https";
  const host = toStr(event?.headers?.host);
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return "";
}

function withTimeout(ms, fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fn(ctrl).finally(() => clearTimeout(t));
}

/** =========================
 *  CARGA JSON DATA
 *  ========================= */
let _catalogCache = null;
let _promosCache = null;

async function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  const file = path.join(__dirname, "..", "..", "data", "catalog.json");
  const raw = await fs.readFile(file, "utf8");
  _catalogCache = JSON.parse(raw);
  return _catalogCache;
}

async function loadPromos() {
  if (_promosCache) return _promosCache;
  const file = path.join(__dirname, "..", "..", "data", "promos.json");
  const raw = await fs.readFile(file, "utf8");
  _promosCache = JSON.parse(raw);
  return _promosCache;
}

function productMapFromCatalog(catalog) {
  const map = {};
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  for (const p of products) {
    if (p?.id) map[p.id] = p;
  }
  return map;
}

/** =========================
 *  VALIDACIONES CARRITO
 *  ========================= */
function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Carrito vacío." };
  }

  const clean = [];
  for (const it of items) {
    const id = toStr(it?.id);
    const qty = Number(it?.qty ?? 1);
    const size = toStr(it?.size);

    if (!id) return { ok: false, error: "Item inválido: falta id." };
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) return { ok: false, error: `Cantidad inválida para ${id}.` };
    if (!size) return { ok: false, error: `Falta talla en ${id}.` };

    clean.push({ id, qty, size });
  }

  return { ok: true, items: clean };
}

function validateSizes(cartItems, productMap) {
  for (const it of cartItems) {
    const p = productMap[it.id];
    if (!p) return { ok: false, error: `Producto no disponible: ${it.id}` };

    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    if (!sizes.includes(it.size)) return { ok: false, error: `Talla inválida (${it.size}) para ${p.name || it.id}` };

    // opcional si tu JSON trae "soldOutSizes": []
    const soldOut = Array.isArray(p.soldOutSizes) ? p.soldOutSizes : [];
    if (soldOut.includes(it.size)) return { ok: false, error: `Talla agotada (${it.size}) para ${p.name || it.id}` };
  }
  return { ok: true };
}

/** =========================
 *  PROMOS (informativo)
 *  ========================= */
async function applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN }) {
  const code = normalizePromo(promoCode);
  const totalBefore = Number(subtotalMXN || 0) + Number(shippingMXN || 0);

  if (!code) {
    return { ok: true, promoCode: "", discountMXN: 0, totalMXN: totalBefore };
  }

  const promos = await loadPromos().catch(() => ({ promos: [] }));
  const list = Array.isArray(promos?.promos) ? promos.promos : [];
  const promo = list.find((p) => normalizePromo(p?.code) === code);

  if (!promo) {
    return { ok: true, promoCode: code, discountMXN: 0, totalMXN: totalBefore, note: "Cupón no encontrado" };
  }

  const type = toStr(promo.type); // "percent" | "fixed"
  let discount = 0;

  if (type === "percent") {
    const pct = Number(promo.value || 0);
    discount = Math.max(0, Math.round((Number(subtotalMXN || 0) * pct) / 100));
  } else if (type === "fixed") {
    discount = Math.max(0, Math.round(Number(promo.value || 0)));
  }

  // cap discount no mayor a subtotal
  discount = Math.min(discount, Number(subtotalMXN || 0));

  const totalAfter = Math.max(0, totalBefore - discount);
  return { ok: true, promoCode: code, discountMXN: discount, totalMXN: totalAfter };
}

/** =========================
 *  ENVÍO (HOY): robusto + fallback
 *  - Si ENVIA_API_KEY está, intentamos Envia Rate.
 *  - Si falla (payload/servicios), usamos tarifa fija segura.
 *  ========================= */
const ENVIA_API_KEY = toStr(process.env.ENVIA_API_KEY);
const ENVIA_BASE = "https://api.envia.com";

const DEFAULT_ORIGIN = {
  country_code: "MX",
  postal_code: "22000",
  state_code: "BCN",
  city: "TIJUANA",
};

// default package (ajustable luego por producto)
function buildDefaultPackages(items) {
  const qty = items.reduce((a, it) => a + Number(it.qty || 1), 0);
  const weight = Math.max(0.5, qty * 0.5); // kg (conservador)
  return [
    {
      content: "Merch",
      amount: 1,
      type: "box",
      weight,     // kg
      length: 30, // cm
      width: 25,
      height: 10,
    },
  ];
}

function pickCheapestRate(rates) {
  if (!Array.isArray(rates) || rates.length === 0) return null;

  const norm = rates
    .map((r) => {
      const price =
        Number(r?.total_amount) ||
        Number(r?.total) ||
        Number(r?.price) ||
        Number(r?.amount) ||
        NaN;

      const days =
        Number(r?.delivery_estimate?.days) ||
        Number(r?.days) ||
        Number(r?.delivery_days) ||
        null;

      const label =
        toStr(r?.service) ||
        toStr(r?.service_name) ||
        toStr(r?.name) ||
        "Envío";

      const carrier =
        toStr(r?.carrier) ||
        toStr(r?.carrier_name) ||
        toStr(r?.provider) ||
        "";

      const service_code =
        toStr(r?.service_code) ||
        toStr(r?.serviceCode) ||
        toStr(r?.code) ||
        "";

      return Number.isFinite(price) ? { price, days, label, carrier, service_code } : null;
    })
    .filter(Boolean);

  if (!norm.length) return null;
  norm.sort((a, b) => a.price - b.price);
  return norm[0];
}

async function enviaRateQuote({ toPostal, items }) {
  if (!ENVIA_API_KEY) return { ok: false, reason: "missing_envia_api_key" };
  if (!/^\d{5}$/.test(toPostal)) return { ok: false, reason: "invalid_postal" };

  const payload = {
    origin: DEFAULT_ORIGIN,
    destination: { country_code: "MX", postal_code: toPostal },
    packages: buildDefaultPackages(items),
  };

  // Nota: En Envia a veces necesitas cotizar por carrier.
  // Probamos una lista común. Si tu cuenta usa otros nombres, verás el error exacto en logs.
  const carriersToTry = ["estafeta", "fedex", "dhl", "redpack", "paquetexpress"];

  for (const carrier of carriersToTry) {
    try {
      const body = { ...payload, carrier };
      const res = await withTimeout(8000, (ctrl) =>
        fetch(`${ENVIA_BASE}/ship/rate/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ENVIA_API_KEY}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        })
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.warn("Envia rate non-ok:", carrier, res.status, data);
        continue;
      }

      // data puede ser { data:[...] } o [...]
      const rates = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      const best = pickCheapestRate(rates);
      if (!best) continue;

      return {
        ok: true,
        mxn: Math.round(best.price),
        label: best.label,
        days: best.days || 7,
        carrier: best.carrier || carrier,
        service_code: best.service_code || "",
      };
    } catch (e) {
      console.warn("Envia rate error:", carrier, e?.message);
    }
  }

  return { ok: false, reason: "no_rates" };
}

async function computeShipping({ mode, to, items }) {
  const m = toStr(mode) || "pickup";
  if (m === "pickup") return { ok: true, mxn: 0, label: "Recoger en tienda", days: 0, mode: "pickup" };

  const toPostal = digitsOnly(to?.postal_code);
  // fallback fijo (si Envia no responde)
  const fallback = {
    ok: true,
    mxn: 290,
    label: "Envío (tarifa fija)",
    days: 7,
    mode: "mx",
    carrier: "",
    service_code: "",
  };

  // Intentamos Envia rate
  const q = await enviaRateQuote({ toPostal, items }).catch(() => ({ ok: false }));
  if (q?.ok) {
    return { ok: true, mxn: q.mxn, label: q.label || "Envío", days: q.days || 7, mode: "mx", carrier: q.carrier, service_code: q.service_code };
  }

  return fallback;
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

  applyPromoToTotals,
  computeShipping,

  getSiteUrlFromEnv,
};