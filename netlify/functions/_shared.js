const catalogData = require("../../data/catalog.json");

/* HELPERS GLOBALES */
function jsonResponse(status, body) {
  return {
    statusCode: status,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*" 
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

/* LÓGICA DEL CATÁLOGO */
async function loadCatalog() {
  // En un caso real podrías cargar esto de una DB, aquí usamos el JSON local
  return catalogData;
}

function productMapFromCatalog(catalog) {
  const map = {};
  if (catalog && Array.isArray(catalog.products)) {
    catalog.products.forEach(p => map[p.id] = p);
  }
  return map;
}

function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "El carrito está vacío" };
  }
  // Sanitización estricta
  const cleanItems = items.map(i => ({
    id: String(i.id),
    qty: Math.max(1, parseInt(i.qty) || 1),
    size: String(i.size || "Unitalla")
  }));
  return { ok: true, items: cleanItems };
}

/* COTIZACIÓN ENVIA.COM (Nativo Node 18) */
async function getEnviaQuote(zipCode, itemCount) {
  if (!process.env.ENVIA_API_KEY) return null;

  // Lógica de peso volumétrico aproximado: 0.5kg por prenda
  const weight = itemCount * 0.5; 
  
  const payload = {
    origin: { country_code: "MX", postal_code: "22000" }, // Tijuana
    destination: { country_code: "MX", postal_code: zipCode },
    shipment: { carrier: "fedex", type: 1 },
    packages: [{
      content: "Ropa Deportiva SCORE",
      amount: 1,
      type: "box",
      dimensions: { length: 30, width: 25, height: 15 },
      weight: weight,
      insurance: 0,
      declared_value: 400 * itemCount
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

    const data = await res.json();
    
    // Buscar la mejor opción económica en la respuesta de Envia
    if (data && data.data && Array.isArray(data.data)) {
      const sorted = data.data.sort((a, b) => a.total_price - b.total_price);
      const best = sorted[0];
      
      if (best) {
        return {
          mxn: Math.ceil(best.total_price),
          carrier: best.carrier,
          days: best.delivery_estimate
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