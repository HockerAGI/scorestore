const fs = require("fs/promises");
const path = require("path");

const FEATURE_ENVIADOTCOM = true; 
const DEFAULT_NATIONAL_SHIPPING = 280; 
const TIJUANA_DELIVERY_PRICE = 200;    

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body),
  };
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }
function digitsOnly(v) { return toStr(v).replace(/\D+/g, ""); }
function normalizePromo(code) { return upper(code).replace(/\s+/g, ""); }
function roundMXN(v) { return Math.round(Number(v) || 0); }

function isMxPostal(cp) { return /^\d{5}$/.test(toStr(cp)); }
function isTijuanaPostal(cp) { const p = toStr(cp); return isMxPostal(p) && p.startsWith("22"); }
function looksLikeTijuana(city) { const c = toStr(city).toLowerCase(); return c.includes("tijuana") || c.includes("tj"); }

async function loadCatalog() {
  try {
    const file = path.join(process.cwd(), "data", "catalog.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (e) { return { products: [] }; }
}

async function loadPromos() {
  try {
    const file = path.join(process.cwd(), "data", "promos.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (e) { return { rules: [] }; }
}

function productMapFromCatalog(catalog) {
  const map = {};
  (catalog.products || []).forEach(p => map[p.id] = p);
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "Carrito vacío" };
  const valid = [];
  for (const it of items) {
    const qty = parseInt(it.qty);
    if (it.id && qty > 0) valid.push({ id: toStr(it.id), qty, size: toStr(it.size) });
  }
  return valid.length ? { ok: true, items: valid } : { ok: false, error: "Items inválidos" };
}

function computeSubtotalMXN(items, map) {
  let sub = 0;
  items.forEach(it => {
    const p = map[it.id];
    if (p) sub += (Number(p.baseMXN || 0) * it.qty);
  });
  return roundMXN(sub);
}

async function quoteEnviaMXN({ to, items, subtotal }) {
  if (!FEATURE_ENVIADOTCOM || !process.env.ENVIA_API_KEY) return { ok: false };
  const weight = Math.round((1 + items.reduce((s,i)=>s+i.qty,0)*0.4)*100)/100;
  
  try {
    const res = await fetch("https://api.envia.com/ship/rate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify({
        origin: {
          name: "SCORE Store", company: "Unico Uniformes",
          email: "ventas@scorestore.com", phone: "6646374355",
          street: "Palermo", number: "6106", district: "Anexa Roma",
          city: "Tijuana", state: "BC", country: "MX", postalCode: "22614"
        },
        destination: {
          name: to.name, street: to.address1, number: "S/N", district: "",
          city: to.city, state: to.state_code, country: "MX", postalCode: to.postal_code
        },
        packages: [{ content: "Ropa", amount: 1, type: "box", weight, insurance: 0, declaredValue: Math.min(5000, subtotal), length: 30, width: 20, height: 10 }],
        shipment: { carrier: "fedex,estafeta,redpack,dhl", type: 1 }
      })
    });
    
    const data = await res.json();
    if (!data.meta || data.meta !== "generate") throw new Error("API Error");
    
    const rates = (data.data || []).filter(r => r.totalPrice > 0).sort((a,b) => a.totalPrice - b.totalPrice);
    if (!rates.length) throw new Error("Sin cobertura");
    
    return { ok: true, quote: { mxn: rates[0].totalPrice, carrier: rates[0].carrierDescription } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function computeShipping({ mode, to, items, map }) {
  const m = toStr(mode).toLowerCase();
  if (m === "pickup") return { ok: true, mxn: 0, label: "Pickup (TJ)" };
  if (m === "tj" || (to.postal_code.startsWith("22") && to.state_code === "BC")) {
    return { ok: true, mxn: TIJUANA_DELIVERY_MXN, label: "Entrega Local TJ" };
  }
  const subtotal = computeSubtotalMXN(items, map);
  const q = await quoteEnviaMXN({ to, items, subtotal });
  if (q.ok) return { ok: true, mxn: Math.ceil(q.quote.mxn * 1.05), label: q.quote.carrier };
  return { ok: true, mxn: DEFAULT_NATIONAL_SHIPPING, label: "Envío Nacional" };
}

async function applyPromoToTotals({ promoCode, subtotal, shipping }) {
  const code = normalizePromo(promoCode);
  const data = await loadPromos();
  const rule = data.rules.find(r => normalizePromo(r.code) === code && r.active);
  let discount = 0;
  if (rule) {
    if (rule.type === "percent") discount = Math.round(subtotal * rule.value);
    else if (rule.type === "fixed_mxn") discount = rule.value;
    else if (rule.type === "free_shipping") discount = shipping;
  }
  discount = Math.min(discount, subtotal + shipping);
  return { promoCode: discount > 0 ? code : null, discount, total: (subtotal + shipping) - discount };
}

function getBaseUrlFromEnv() { return process.env.URL || "https://scorestore.netlify.app"; }

module.exports = {
  jsonResponse, safeJsonParse, toStr, upper, digitsOnly, normalizePromo,
  loadCatalog, productMapFromCatalog, validateCartItems, computeSubtotalMXN,
  computeShipping, applyPromoToTotals, getBaseUrlFromEnv
};
