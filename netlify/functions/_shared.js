const catalogData = require("../../data/catalog.json");

function jsonResponse(status, body) {
  return {
    statusCode: status,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function safeJsonParse(str) { 
  try { return JSON.parse(str); } catch { return {}; } 
}

function digitsOnly(str) { 
  return (str || "").replace(/\D/g, ""); 
}

async function loadCatalog() { 
  return catalogData; 
}

function productMapFromCatalog(c) { 
  const m = {}; 
  if (c.products) c.products.forEach(p => m[p.id] = p); 
  return m; 
}

function validateCartItems(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "Carrito vacío" };
  const clean = items.map(i => ({
    id: String(i.id),
    qty: Math.max(1, parseInt(i.qty)||1),
    size: String(i.size||"Unitalla")
  }));
  return { ok: true, items: clean };
}

async function getEnviaQuote(zip, qty) {
  if (!process.env.ENVIA_API_KEY) return null;
  
  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.ENVIA_API_KEY}` },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: "22000" },
        destination: { country_code: "MX", postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{ 
          content: "Ropa Deportiva", 
          amount: 1, 
          type: "box", 
          weight: qty * 0.5, 
          dimensions: { length: 30, width: 25, height: 15 }, 
          declared_value: 400 * qty 
        }]
      })
    });
    const data = await res.json();
    if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
      const best = data.data.sort((a,b) => a.total_price - b.total_price)[0];
      return { mxn: Math.ceil(best.total_price), carrier: best.carrier, days: best.delivery_estimate };
    }
    return null;
  } catch (e) {
    console.error("Envia Error:", e);
    return null;
  }
}

module.exports = { jsonResponse, safeJsonParse, loadCatalog, productMapFromCatalog, validateCartItems, getEnviaQuote, digitsOnly };
