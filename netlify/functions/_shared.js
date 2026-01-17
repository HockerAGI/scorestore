const catalogData = require("../../data/catalog.json");

/* CONFIGURACIÓN DE ORIGEN (FÁBRICA ÚNICO) */
const FACTORY_ORIGIN = {
  name: "Score Store / Unico Uniformes",
  company: "BAJATEX S DE RL DE CV",
  email: "ventas.unicotexti@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK"
};

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
  const clean = items.map(i => ({
    id: String(i.id),
    qty: Math.max(1, parseInt(i.qty) || 1),
    size: String(i.size || "Unitalla")
  }));
  return { ok: true, items: clean };
};

/* ENVIA: COTIZAR (Quote) */
async function getEnviaQuote(zip, qty, countryCode = "MX") {
  if (!process.env.ENVIA_API_KEY) return null;

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify({
        origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postalCode },
        destination: { country_code: countryCode, postal_code: zip },
        shipment: { carrier: "fedex", type: 1 }, // Type 1 = Paquete
        packages: [{
          content: "Ropa Deportiva SCORE",
          amount: 1,
          type: "box",
          weight: qty * 0.6, // Peso estimado
          dimensions: { length: 30, width: 25, height: 10 + (qty * 2) },
          declared_value: 400 * qty
        }]
      })
    });

    const data = await res.json();
    
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      // Ordenar por precio y tomar la mejor opción económica
      const best = data.data.sort((a,b) => a.total_price - b.total_price)[0];
      return {
        mxn: Math.ceil(best.total_price),
        carrier: best.carrier,
        days: best.delivery_estimate,
        serviceId: best.service_id // Útil si quieres forzar este servicio al generar guía
      };
    }
    return null;
  } catch (e) {
    console.error("Envia Quote Error:", e);
    return null;
  }
}

/* ENVIA: GENERAR GUÍA REAL (Label) */
async function createEnviaLabel(customer, itemsQty) {
  if (!process.env.ENVIA_API_KEY) {
    console.error("Falta ENVIA_API_KEY");
    return null;
  }

  try {
    // Dividir dirección de Stripe (Calle y Número)
    // Stripe suele enviar "Calle 123 Col Centro". Envia requiere separar si es posible, 
    // pero para seguridad mandamos todo en street si no hay número claro.
    const addressLine = customer.address.line1 || "";
    const addressLine2 = customer.address.line2 || "";
    
    // Payload para Envia.com
    const payload = {
      origin: {
        company: FACTORY_ORIGIN.company,
        name: FACTORY_ORIGIN.name,
        email: FACTORY_ORIGIN.email,
        phone: FACTORY_ORIGIN.phone,
        street: FACTORY_ORIGIN.street,
        number: FACTORY_ORIGIN.number,
        district: FACTORY_ORIGIN.district,
        city: FACTORY_ORIGIN.city,
        state: FACTORY_ORIGIN.state,
        country: FACTORY_ORIGIN.country,
        postal_code: FACTORY_ORIGIN.postalCode
      },
      destination: {
        name: customer.name,
        email: customer.email || "cliente@scorestore.com",
        phone: customer.phone || "0000000000",
        street: addressLine,
        number: "", // Se asume va en street si Stripe no lo separa
        district: addressLine2, // Usamos linea 2 como colonia/referencia
        city: customer.address.city,
        state: customer.address.state,
        country: customer.address.country, // MX o US
        postal_code: customer.address.postal_code
      },
      packages: [{
        content: "Merchandise SCORE International",
        amount: 1,
        type: "box",
        weight: itemsQty * 0.6,
        dimensions: { length: 30, width: 25, height: 10 + (itemsQty * 2) },
        declared_value: 400 * itemsQty // Seguro básico
      }],
      shipment: {
        carrier: "fedex", // Puedes hacer dinámico esto guardando la cotización en metadata
        type: 1
      },
      settings: {
        print_format: "PDF",
        print_size: "STOCK_4X6"
      }
    };

    console.log("Generando guía Envia...");
    const res = await fetch("https://api.envia.com/ship/generate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ENVIA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    
    if (result && result.meta === "generate") {
      const labelData = result.data[0];
      console.log("✅ Guía Generada:", labelData.tracking_number);
      return {
        tracking: labelData.tracking_number,
        labelUrl: labelData.label,
        carrier: labelData.carrier
      };
    } else {
      console.error("❌ Error Envia API:", JSON.stringify(result));
      return null;
    }

  } catch (e) {
    console.error("Create Label Error:", e);
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
  createEnviaLabel,
  digitsOnly
};
