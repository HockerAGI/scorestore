const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const jsonResponse = (s, b) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b)
});

const safeJsonParse = (b, d={}) => {
  try { return JSON.parse(b); } catch { return d; }
};

const loadCatalog = async () => {
  const p = path.join(process.cwd(), "data", "catalog.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
};

const productMapFromCatalog = (cat) =>
  Object.fromEntries(cat.products.map(p => [p.id, p]));

const validateCartItems = (items) => {
  if (!Array.isArray(items) || !items.length) return { ok:false, error:"Carrito vacío" };
  return { ok:true, items };
};

const digitsOnly = (v) => (v||"").replace(/\D/g,"");

async function getEnviaQuote(zip, qty) {
  try {
    const r = await fetch("https://api.envia.com/ship/rate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ENVIA_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        origin: { postalCode: "22000", countryCode:"MX" },
        destination: { postalCode: zip, countryCode:"MX" },
        packages: [{ weight: 1, dimensions:{ length:10,width:10,height:10 }}]
      })
    });
    const d = await r.json();
    const rate = d?.data?.[0];
    if (!rate) return null;
    return { mxn: Math.max(rate.totalPrice,250), label: rate.carrier, days: rate.deliveryEstimate };
  } catch {
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