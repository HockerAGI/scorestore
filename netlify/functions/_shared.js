const catalogData = require("../../data/catalog.json");

/* UTILS */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}
function digitsOnly(v) {
  return (v || "").toString().replace(/\D+/g, "");
}
function toStr(v) {
  return (v || "").toString().trim();
}

/* CATALOG */
async function loadCatalog() {
  return catalogData;
}

function productMapFromCatalog(catalog) {
  const map = {};
  for (const p of catalog.products || []) map[p.id] = p;
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, error: "Carrito vacío" };
  }
  return {
    ok: true,
    items: items.map(i => ({
      id: toStr(i.id),
      qty: Math.max(1, parseInt(i.qty) || 1),
      size: toStr(i.size) || "Unitalla"
    }))
  };
}

/* ENVIA */
async function getEnviaQuote(postalCode, itemsCount = 1) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) return null;

  try {
    const weight = 0.8 + Math.max(0, itemsCount - 1) * 0.3;

    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: "22614" },
        destination: { country_code: "MX", postal_code },
        packages: [{
          content: "Ropa SCORE",
          amount: 1,
          type: "box",
          dimensions: { length: 30, width: 25, height: 10 },
          weight
        }]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const rates = (data.data || []).sort((a, b) => a.total_price - b.total_price);
    if (!rates.length) return null;

    return {
      mxn: Math.max(250, Math.ceil(rates[0].total_price)),
      label: "Envío Nacional",
      days: rates[0].delivery_estimate || "3-7"
    };
  } catch {
    return null;
  }
}

async function createEnviaLabel() {
  // reservado para automatización
  return null;
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  digitsOnly,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  createEnviaLabel
};