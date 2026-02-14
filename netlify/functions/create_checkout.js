const fs = require("fs");
const path = require("path");

const {
  stripe,
  jsonResponse,
  handleOptions,
  safeJsonParse,
  supabaseAdmin,
  getEnviaQuote,
} = require("./_shared");

// =========================================================
// /.netlify/functions/create_checkout
// Purpose: Create a Stripe Checkout Session from cart items.
// Supports:
//  - Frontend payload: { items:[{id,size,qty}], shipping:{mode,cost,postal_code,country}, customer:{name,address,postal_code,country} }
//  - Legacy payload:   { cart:[{name,price,qty,image?}], shippingMode, shippingAmount, zip, country }
//
// Notes:
//  - Prices are always charged in MXN.
//  - Images passed to Stripe MUST be absolute URLs.
// =========================================================

const SITE_URL = (process.env.SITE_URL || "https://scorestore.netlify.app").replace(/\/$/, "");

let CATALOG_CACHE = null;
function loadCatalog() {
  if (CATALOG_CACHE) return CATALOG_CACHE;
  const file = path.join(__dirname, "..", "..", "data", "catalog.json");
  const raw = fs.readFileSync(file, "utf-8");
  const json = JSON.parse(raw);
  const map = new Map();
  (json.products || []).forEach((p) => map.set(String(p.id), p));
  CATALOG_CACHE = { json, map };
  return CATALOG_CACHE;
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
}

function toAbsImage(url) {
  if (!url) return null;
  const u = String(url).trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${SITE_URL}${u}`;
  return `${SITE_URL}/${u}`;
}

function normalizeBody(event) {
  return safeJsonParse(event.body || "{}") || {};
}

function normalizeShipping(body) {
  const mode =
    body?.shipping?.mode ||
    body?.mode ||
    body?.shipping_mode ||
    body?.shippingMode ||
    "pickup";

  const cost =
    Number(body?.shipping?.cost ?? body?.shipping_cost ?? body?.shippingAmount ?? 0) || 0;

  const country =
    String(body?.shipping?.country || body?.country || body?.shippingCountry || "MX").toUpperCase();

  const postal =
    String(
      body?.shipping?.postal_code ||
        body?.shipping?.zip ||
        body?.zip ||
        body?.postal_code ||
        body?.cp ||
        ""
    ).trim();

  return { mode: String(mode), cost, country, postal_code: postal };
}

function normalizeCustomer(body, shipping) {
  const c = body?.customer || {};
  return {
    name: String(c.name || body?.name || "").trim(),
    address: String(c.address || body?.address || body?.addr || "").trim(),
    postal_code: String(c.postal_code || shipping.postal_code || "").trim(),
    country: String(c.country || shipping.country || "MX").toUpperCase(),
  };
}

function normalizeItems(body) {
  // New format
  const items = Array.isArray(body?.items) ? body.items : null;
  if (items && items.length) {
    return items
      .map((i) => ({
        id: String(i.id || "").trim(),
        qty: Math.max(1, Number(i.qty || 1) || 1),
        size: String(i.size || "").trim(),
      }))
      .filter((i) => i.id);
  }

  // Legacy format
  const cart = Array.isArray(body?.cart) ? body.cart : [];
  return cart
    .map((i) => ({
      id: String(i.id || i.sku || i.name || "").trim(),
      qty: Math.max(1, Number(i.qty || 1) || 1),
      size: String(i.size || "").trim(),
      legacy: {
        name: i.name,
        price: i.price,
        image: i.image,
      },
    }))
    .filter((i) => i.id);
}

async function resolveProducts(items) {
  // If we have Supabase Admin and IDs look like UUIDs, prefer DB as source of truth.
  const allUuid = items.length && items.every((i) => isUuid(i.id));

  if (supabaseAdmin && allUuid) {
    const ids = items.map((i) => i.id);
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id,name,price,image_url,sku")
      .in("id", ids);

    if (!error && Array.isArray(data) && data.length) {
      const map = new Map(data.map((p) => [String(p.id), p]));
      return { source: "supabase", map };
    }
  }

  // Fallback to local catalog.json
  const { map } = loadCatalog();
  return { source: "catalog", map };
}

function buildLineItems(items, productMap, source) {
  const line_items = [];

  for (const i of items) {
    const ref = productMap.get(String(i.id));

    // If catalog source and not found, allow legacy fallback
    if (!ref && i.legacy && i.legacy.name && i.legacy.price) {
      const name = String(i.legacy.name);
      const unit = Math.max(1, Number(i.legacy.price) || 0);
      const img = toAbsImage(i.legacy.image);
      line_items.push({
        quantity: i.qty,
        price_data: {
          currency: "mxn",
          unit_amount: Math.round(unit * 100),
          product_data: {
            name: i.size ? `${name} (${i.size})` : name,
            ...(img ? { images: [img] } : {}),
          },
        },
      });
      continue;
    }

    if (!ref) {
      throw new Error(`Producto no encontrado (${source}): ${i.id}`);
    }

    const name = String(ref.name || ref.title || ref.id);
    const price = Number(ref.price ?? ref.baseMXN ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Precio inválido para ${i.id}`);
    }

    const img = toAbsImage(ref.image_url || ref.img || (ref.images && ref.images[0]));

    line_items.push({
      quantity: i.qty,
      price_data: {
        currency: "mxn",
        unit_amount: Math.round(price * 100),
        product_data: {
          name: i.size ? `${name} (${i.size})` : name,
          ...(img ? { images: [img] } : {}),
        },
      },
    });
  }

  return line_items;
}

async function computeShipping(shipping, items) {
  const mode = String(shipping.mode || "pickup");

  // Pickup = no shipping
  if (mode === "pickup") {
    return { amount: 0, label: "Pickup" };
  }

  // Local TJ fixed
  if (mode === "tj") {
    return { amount: 200, label: "Local Express TJ" };
  }

  // If frontend already quoted a cost, trust it (but clamp)
  if (Number(shipping.cost) > 0) {
    const amt = Math.max(0, Math.min(100000, Number(shipping.cost)));
    return { amount: amt, label: "Envío" };
  }

  // Try quote via Envia
  if (shipping.postal_code) {
    try {
      // getEnviaQuote expects items array with qty fields
      const enviaItems = [{ qty: items.reduce((a, it) => a + (Number(it.qty) || 1), 0) }];
      const q = await getEnviaQuote({
        zip: shipping.postal_code,
        country: shipping.country || "MX",
        items: enviaItems,
      });

      if (q?.ok && Number(q.amount_mxn) >= 0) {
        return { amount: Number(q.amount_mxn), label: q.label || "Envío" };
      }
    } catch (e) {
      // ignore
    }
  }

  // Fallback
  const fallback = (String(shipping.country || "MX").toUpperCase() === "US") ? 800 : 250;
  return { amount: fallback, label: "Envío Estándar" };
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  if (!stripe) {
    return jsonResponse(500, { ok: false, error: "Stripe no configurado (STRIPE_SECRET_KEY missing)" });
  }

  try {
    const body = normalizeBody(event);

    const items = normalizeItems(body);
    if (!items.length) {
      return jsonResponse(400, { ok: false, error: "Carrito vacío" });
    }

    const shipping = normalizeShipping(body);
    const customer = normalizeCustomer(body, shipping);

    const { source, map } = await resolveProducts(items);
    const line_items = buildLineItems(items, map, source);

    const ship = await computeShipping(shipping, items);

    // Add shipping as line item (keeps everything in MXN)
    if (ship.amount > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: Math.round(Number(ship.amount) * 100),
          product_data: { name: `Envío (${ship.label})` },
        },
      });
    }

    const success_url = `${SITE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${SITE_URL}/?status=cancel`;

    const needsAddress = shipping.mode !== "pickup";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url,
      cancel_url,

      phone_number_collection: { enabled: true },

      ...(needsAddress
        ? {
            shipping_address_collection: {
              allowed_countries: ["MX", "US"],
            },
          }
        : {}),

      metadata: {
        app: "score-store",
        version: "2026_PROD_UNIFIED_361",
        shipping_mode: String(shipping.mode),
        shipping_country: String(shipping.country || "MX"),
        shipping_postal_code: String(shipping.postal_code || ""),
        shipping_amount_mxn: String(ship.amount || 0),
        customer_name: customer.name,
        customer_address: customer.address,
      },
    });

    // Optional: store order in Supabase (no rompe checkout si falla)
    if (supabaseAdmin) {
      try {
        const raw_meta = {
          source,
          items,
          shipping: { ...shipping, computed_amount: ship.amount, label: ship.label },
          customer,
          stripe: { id: session.id },
        };

        await supabaseAdmin
          .from("orders")
          .insert({
            stripe_session_id: session.id,
            status: "pending",
            shipping_mode: String(shipping.mode),
            shipping_amount_mxn: Number(ship.amount || 0),
            total_mxn: null,
            raw_meta: JSON.stringify(raw_meta),
          });
      } catch (e) {
        console.warn("orders insert skipped:", e?.message || e);
      }
    }

    return jsonResponse(200, { ok: true, url: session.url, id: session.id });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err?.message || String(err) });
  }
};