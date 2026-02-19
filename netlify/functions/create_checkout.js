const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { error: "STRIPE_SECRET_KEY no configurada" });
    }

    const origin = getOrigin(event);
    const body = JSON.parse(event.body || "{}");

    const items = Array.isArray(body.items) ? body.items : [];
    const shipping_mode = body.shipping_mode === "delivery" ? "delivery" : "pickup";
    const destination = body.destination || null;

    if (!items.length) return json(400, { error: "Carrito vacío" });

    const catalog = readCatalog();
    const products = Array.isArray(catalog.products) ? catalog.products : [];

    // valida items contra catálogo
    const line_items = [];
    for (const it of items) {
      const sku = String(it.sku || "").trim();
      const qty = Math.max(1, Math.min(99, Number(it.qty || 1)));
      if (!sku) return json(400, { error: "Item sin SKU" });

      const p = products.find(x => String(x.sku || x.id) === sku);
      if (!p) return json(400, { error: `SKU no encontrado: ${sku}` });

      const unit_amount = Number(p.price_cents || 0);
      if (!unit_amount || unit_amount < 100) return json(400, { error: `Precio inválido para: ${sku}` });

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "mxn",
          unit_amount: Math.round(unit_amount),
          product_data: {
            name: p.title || "Producto",
            description: (p.description || "").slice(0, 500)
          }
        }
      });
    }

    // envío real (si delivery): cotiza server-side para cobrar envío real
    let shipping_cents = 0;
    let ship_meta = null;

    if (shipping_mode === "delivery") {
      if (!destination) return json(400, { error: "destination requerido para envío" });

      const cp = String(destination.postal_code || "").trim();
      const city = String(destination.city || "").trim();
      const state = String(destination.state || "").trim();

      if (!/^\d{5}$/.test(cp) || !city || !state) {
        return json(400, { error: "destination inválido (postal_code/city/state)" });
      }

      const q = await quoteEnvia({ postal_code: cp, city, state }, items);
      shipping_cents = q.total_cents;
      ship_meta = q.meta;

      // Agrega envío como line item
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: shipping_cents,
          product_data: { name: "Envío (Envía.com)", description: ship_meta?.service ? `Servicio: ${ship_meta.service}` : "Cotización Envía.com" }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,

      success_url: `${origin}/?success=1`,
      cancel_url: `${origin}/?canceled=1`,

      // Stripe puede pedir datos para OXXO
      customer_creation: "if_required",

      metadata: {
        shipping_mode,
        envia_service: ship_meta?.service || "",
        envia_carrier: ship_meta?.carrier || ""
      },

      // Para delivery: deja que Stripe capture dirección (MX)
      shipping_address_collection: shipping_mode === "delivery"
        ? { allowed_countries: ["MX"] }
        : undefined
    });

    return json(200, { url: session.url });

  } catch (e) {
    return json(500, { error: "Server error", message: String(e && e.message ? e.message : e) });
  }
};

function getOrigin(event) {
  const h = event.headers || {};
  const proto = h["x-forwarded-proto"] || "https";
  const host = h["x-forwarded-host"] || h["host"];
  return `${proto}://${host}`;
}

function readCatalog() {
  const p = path.join(process.cwd(), "data", "catalog.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

async function quoteEnvia(destination, items) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) {
    // sin key: no rompe, pero no cobramos envío real
    return { total_cents: 0, meta: null };
  }

  const origin = {
    postal_code: String(process.env.ENVIA_ORIGIN_POSTAL || "22000"),
    city: String(process.env.ENVIA_ORIGIN_CITY || "Tijuana"),
    state: String(process.env.ENVIA_ORIGIN_STATE || "Baja California"),
    country_code: String(process.env.ENVIA_ORIGIN_COUNTRY || "MX")
  };

  const pkg = {
    content: "Score Store Merch",
    amount: Math.max(1, items.reduce((a,i)=>a + Number(i.qty||0), 0)),
    type: "box",
    dimensions: {
      length: Number(process.env.ENVIA_PKG_L || 32),
      width: Number(process.env.ENVIA_PKG_W || 24),
      height: Number(process.env.ENVIA_PKG_H || 8)
    },
    weight: Number(process.env.ENVIA_PKG_WEIGHT || 1.0)
  };

  const payload = {
    origin,
    destination: { ...destination, country_code: "MX" },
    packages: [pkg]
  };

  const endpoint = String(process.env.ENVIA_RATE_ENDPOINT || "https://api.envia.com/ship/rate/");
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data) return { total_cents: 0, meta: null };

  const rates = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
  const sorted = rates
    .map(r => ({
      carrier: r.carrier || r.carrier_name || "Carrier",
      service: r.service || r.service_name || "Servicio",
      total: Number(r.total || r.total_amount || r.price || 0)
    }))
    .filter(r => Number.isFinite(r.total) && r.total > 0)
    .sort((a,b)=>a.total-b.total);

  if (!sorted.length) return { total_cents: 0, meta: null };

  const best = sorted[0];
  return {
    total_cents: Math.round(best.total * 100),
    meta: { carrier: best.carrier, service: best.service }
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type"
    },
    body: JSON.stringify(body)
  };
}
