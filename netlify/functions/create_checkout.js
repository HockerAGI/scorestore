const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

// Fallbacks (funciona, pero en producción ideal: ENV)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const supabase = createClient(supabaseUrl, supabaseKey);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Shipping fallbacks (REGLAS DEL MANIFIESTO)
const FALLBACK_MX = 250; // MXN
const FALLBACK_US = 800; // MXN
const TJ_FLAT = 200;     // MXN

// Helpers
function safeJsonParse(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}
function toInt(n, def = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : def;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const body = safeJsonParse(event.body);

    const cartItems = Array.isArray(body.items) ? body.items : [];
    if (!cartItems.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Carrito vacío" }) };
    }

    // Normaliza / valida items
    const normalizedItems = cartItems
      .map((i) => ({
        id: i.id,
        qty: Math.max(1, toInt(i.qty, 1)),
        size: (i.size || "Unitalla").toString().slice(0, 12),
      }))
      .filter((i) => i.id !== undefined && i.id !== null);

    if (!normalizedItems.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Items inválidos" }) };
    }

    // 1) Org
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "score-store")
      .single();

    if (orgErr || !org?.id) throw new Error("Tienda no configurada");

    // 2) Productos reales
    const { data: dbProducts, error: prodErr } = await supabase
      .from("products")
      .select("id,name,price,image_url,active,sku")
      .eq("org_id", org.id)
      .eq("active", true);

    if (prodErr || !dbProducts?.length) throw new Error("No hay productos activos");

    // 3) Line items (precio SIEMPRE desde DB)
    const line_items = normalizedItems.map((item) => {
      const product = dbProducts.find((p) => String(p.id) === String(item.id));
      if (!product) throw new Error(`Producto no disponible: ${item.id}`);

      const unit_amount = Math.round(Number(product.price || 0) * 100);
      if (!unit_amount || unit_amount < 1) throw new Error(`Precio inválido: ${product.name}`);

      const img = product.image_url ? [product.image_url] : [];

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: img,
          },
          unit_amount,
        },
        quantity: item.qty,
      };
    });

    // 4) Shipping
    const mode = (body.mode || "pickup").toString().toLowerCase(); // pickup | tj | mx | us
    const customer = body.customer || {};
    const postal_code = (customer.postal_code || "").toString().trim();
    const address = (customer.address || "").toString().trim();
    const cname = (customer.name || "").toString().trim();

    let shipping_options = [];
    let shipping_address_collection = undefined;

    // audit/debug
    let shipCostMXN = 0;
    let shipLabel = "Gratis (Pickup)";

    if (mode !== "pickup") {
      shipping_address_collection = { allowed_countries: ["MX", "US"] };

      if (mode === "tj") {
        shipCostMXN = TJ_FLAT;
        shipLabel = "Local Express Tijuana";
      } else if (mode === "mx") {
        const quoted = body.shipping && body.shipping.cost != null ? Number(body.shipping.cost) : NaN;
        shipCostMXN = Number.isFinite(quoted) && quoted > 0 ? quoted : FALLBACK_MX;
        shipLabel =
          body.shipping?.label ||
          (Number.isFinite(quoted) ? "Envío Nacional" : "Envío Nacional (Estándar)");
      } else if (mode === "us") {
        const quoted = body.shipping && body.shipping.cost != null ? Number(body.shipping.cost) : NaN;
        shipCostMXN = Number.isFinite(quoted) && quoted > 0 ? quoted : FALLBACK_US;
        shipLabel =
          body.shipping?.label ||
          (Number.isFinite(quoted) ? "Envío USA" : "Envío USA (Estándar)");
      } else {
        shipCostMXN = FALLBACK_MX;
        shipLabel = "Envío (Estándar)";
      }

      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(shipCostMXN * 100), currency: "mxn" },
          display_name: shipLabel,
        },
      });

      if (!cname || !address || !postal_code) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan datos de envío" }) };
      }
    }

    // 5) URLs
    const baseUrl = process.env.URL || "https://scorestore.netlify.app";

    // 6) Crear sesión
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection,
      success_url: `${baseUrl}/?status=success`,
      cancel_url: `${baseUrl}/?status=cancel`,
      metadata: {
        score_mode: mode,
        org_id: String(org.id),
        customer_name: cname ? cname.slice(0, 200) : "",
        customer_address: address ? address.slice(0, 500) : "",
        customer_postal_code: postal_code ? postal_code.slice(0, 20) : "",
        promo_active: body.promo ? "true" : "false",
        shipping_cost_mxn: String(shipCostMXN || 0),
        shipping_label: shipLabel ? shipLabel.slice(0, 120) : "",
      },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || "Error" }) };
  }
};