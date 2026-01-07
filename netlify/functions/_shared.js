const catalogData = require("../../data/catalog.json");

/* HELPERS */
const jsonResponse = (status, body) => ({
  statusCode: status,
  headers: { 
    "Content-Type": "application/json", 
    "Access-Control-Allow-Origin": "*" 
  },
  body: JSON.stringify(body)
});

const safeJsonParse = (str) => {
  try { return JSON.parse(str); } catch { return {}; }
};

const digitsOnly = (str) => (str || "").replace(/\D/g, "");

/* CATALOG */
const loadCatalog = async () => catalogData;

const productMapFromCatalog = (catalog) => {
  const map = {};
  if(catalog.products) catalog.products.forEach(p => map[p.id] = p);
  return map;
};

const validateCartItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "El carrito está vacío" };
  }
  // Sanitizar datos de entrada
  const clean = items.map(i => ({
    id: String(i.id),
    qty: Math.max(1, parseInt(i.qty) || 1),
    size: String(i.size || "Unitalla")
  }));
  return { ok: true, items: clean };
};

/* ENVIA QUOTE (Con manejo de errores robusto) */
async function getEnviaQuote(zip, qty) {
  // Si no hay API KEY, devolvemos null para usar el fallback ($250)
  if (!process.env.ENVIA_API_KEY) return null;

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: "22000" },
        destination: { country_code: "MX", postal_code: zip },
        shipment: { carrier: "fedex", type: 1 },
        packages: [{
          content: "Ropa Deportiva",
          amount: 1,
          type: "box",
          weight: qty * 0.5, // 0.5kg por prenda aprox
          dimensions: { length: 30, width: 25, height: 15 },
          declared_value: 400 * qty
        }]
      })
    });

    const data = await res.json();
    
    // Si la API responde con opciones, tomamos la mejor
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      const best = data.data.sort((a,b) => a.total_price - b.total_price)[0];
      return {
        mxn: Math.ceil(best.total_price),
        carrier: best.carrier,
        days: best.delivery_estimate
      };
    }
    return null;
  } catch (e) {
    console.error("Envia API Error:", e);
    return null; // Retornar null activa el fallback de precio fijo
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
