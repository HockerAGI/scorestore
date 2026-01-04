const fs = require("fs/promises");
const path = require("path");

const jsonResponse = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const safeJsonParse = (body, fallback = {}) => {
  try {
    return JSON.parse(body);
  } catch {
    return fallback;
  }
};

const loadCatalog = async () => {
  const p = path.join(process.cwd(), "data", "catalog.json");
  const raw = await fs.readFile(p, "utf8");
  const catalog = JSON.parse(raw);

  if (!catalog?.products || !Array.isArray(catalog.products)) {
    throw new Error("Catálogo inválido");
  }

  return catalog;
};

const productMapFromCatalog = (catalog) => {
  if (!catalog?.products) return {};
  return Object.fromEntries(
    catalog.products.map(p => [p.id, p])
  );
};

const validateCartItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Carrito vacío" };
  }
  return { ok: true, items };
};

const digitsOnly = (v) => String(v || "").replace(/\D/g, "");

async function getEnviaQuote(zip, qty = 1) {
  if (!process.env.ENVIA_KEY) {
    throw new Error("ENVIA_KEY no configurada");
  }

  try {
    const cleanZip = digitsOnly(zip);
    if (cleanZip.length !== 5) return null;

    const weightPerItem = 0.5; // kg
    const totalWeight = Math.max(1, qty * weightPerItem);

    const res = await fetch("https://api.envia.com/ship/rate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ENVIA_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        origin: { postalCode: "22000", countryCode: "MX" },
        destination: { postalCode: cleanZip, countryCode: "MX" },
        packages: [
          {
            weight: totalWeight,
            dimensions: { length: 20, width: 20, height: 15 }
          }
        ]
      })
    });

    if (!res.ok) return null;

    const data = await res.json();
    const rate = data?.data?.[0];
    if (!rate) return null;

    return {
      mxn: Math.max(rate.totalPrice, 250),
      label: rate.carrier,
      days: rate.deliveryEstimate
    };
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
  digitsOnly,
  getEnviaQuote
};