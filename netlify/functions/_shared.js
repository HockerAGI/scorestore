const catalogData = require("../../data/catalog.json");

/* ================= HELPERS ================= */

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body ?? {})
  };
}

function safeJsonParse(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}

function digitsOnly(str) {
  return String(str || "").replace(/\D/g, "");
}

/* ================= CATÁLOGO ================= */

async function loadCatalog() {
  // Fuente de verdad: archivo local en repo
  return catalogData;
}

function productMapFromCatalog(catalog) {
  const map = {};
  if (catalog && Array.isArray(catalog.products)) {
    catalog.products.forEach((p) => { if (p?.id) map[p.id] = p; });
  }
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "El carrito está vacío" };
  }

  const cleanItems = items.map((i) => ({
    id: String(i.id),
    qty: Math.max(1, parseInt(i.qty, 10) || 1),
    size: String(i.size || "Unitalla")
  }));

  return { ok: true, items: cleanItems };
}

/* ================= ENVIA.COM RATE ================= */
/* Node 18 tiene fetch nativo en Netlify Functions */

async function getEnviaQuote(zipCode, itemCount) {
  if (!process.env.ENVIA_API_KEY) return null;

  const zip = digitsOnly(zipCode);
  if (!zip || zip.length < 5) return null;

  // Aproximación de peso: 0.5kg por prenda
  const weight = Math.max(0.5, (Number(itemCount) || 1) * 0.5);

  const payload = {
    origin: { country_code: "MX", postal_code: "22000" }, // Tijuana
    destination: { country_code: "MX", postal_code: zip },
    shipment: { carrier: "fedex", type: 1 },
    packages: [{
      content: "Merch SCORE Store",
      amount: 1,
      type: "box",
      dimensions: { length: 30, width: 25, height: 15 },
      weight,
      insurance: 0,
      declared_value: 400 * Math.max(1, Number(itemCount) || 1)
    }]
  };

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => null);

    if (data && data.data && Array.isArray(data.data)) {
      const sorted = data.data
        .filter((r) => typeof r?.total_price === "number")
        .sort((a, b) => a.total_price - b.total_price);

      const best = sorted[0];
      if (best) {
        return {
          mxn: Math.ceil(best.total_price),
          carrier: best.carrier || "Envia",
          days: best.delivery_estimate || ""
        };
      }
    }

    return null;
  } catch (e) {
    console.error("Envia API Error:", e);
    return null;
  }
}

module.exports = {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly
};