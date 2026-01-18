/**
 * create_checkout.js — FINAL MASTER (unificado)
 * - Precios SIEMPRE desde DB (Supabase)
 * - Envíos: pickup=0, tj=200, mx=fallback 250, us=fallback 800 (o cotización válida)
 * - CORS + utils vía _shared.js
 * - Metadata lista para webhook/órdenes
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  supabase,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
} = require("./_shared");

// Constantes del manifiesto
const TJ_FLAT = 200; // MXN

function toNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(n, min, max) {
  const x = toNumber(n, min);
  return Math.max(min, Math.min(max, x));
}

function normalizeQty(qty) {
  const n = Math.floor(toNumber(qty, 1));
  return Math.max(1, Math.min(99, n));
}

function normalizeSize(size) {
  const s = String(size || "Unitalla").trim();
  return s.slice(0, 12) || "Unitalla";
}

function baseUrl() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    "https://scorestore.netlify.app"
  );
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "STRIPE_SECRET_KEY no configurada" });
  }

  try {
    const body = safeJsonParse(event.body);

    const cartItems = Array.isArray(body.items) ? body.items : [];
    if (!cartItems.length) return jsonResponse(400, { error: "Carrito vacío" });

    // 1) Normalizar items (nunca confiar en price del cliente)
    const normalizedItems = cartItems
      .map((i) => ({
        id: i?.id,
        qty: normalizeQty(i?.qty),
        size: normalizeSize(i?.size),
      }))
      .filter((i) => i.id !== undefined && i.id !== null && String(i.id).length > 0);

    if (!normalizedItems.length) return jsonResponse(400, { error: "Items inválidos" });

    // 2) Org
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", "score-store")
      .single();

    if (orgErr || !org?.id) return jsonResponse(500, { error: "Tienda no configurada" });

    // 3) Productos reales (solo activos)
    const { data: dbProducts, error: prodErr } = await supabase
      .from("products")
      .select("id,name,price,image_url,active,sku")
      .eq("org_id", org.id)
      .eq("active", true);

    if (prodErr || !dbProducts?.length) return jsonResponse(500, { error: "No hay productos activos" });

    // 4) Line items (precio SIEMPRE desde DB)
    const line_items = normalizedItems.map((item) => {
      const product = dbProducts.find((p) => String(p.id) === String(item.id));
      if (!product) throw new Error(`Producto no disponible: ${item.id}`);

      const unit_amount = Math.round(toNumber(product.price, 0) * 100);
      if (!unit_amount || unit_amount < 1) throw new Error(`Precio inválido: ${product.name}`);

      // Stripe espera URLs absolutas públicas para images; pero si tu image_url ya es pública, ok.
      const images = product.image_url ? [String(product.image_url)] : [];

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: String(product.name || "Producto").slice(0, 120),
            description: `Talla: ${item.size}`,
            images,
            metadata: {
              product_id: String(product.id),
              sku: product.sku ? String(product.sku).slice(0, 64) : "",
            },
          },
          unit_amount,
        },
        quantity: item.qty,
      };
    });

    // 5) Shipping
    const mode = String(body.mode || "pickup").toLowerCase(); // pickup | tj | mx | us
    const customer = body.customer || {};
    const postal_code = String(customer.postal_code || "").trim().slice(0, 20);
    const address = String(customer.address || "").trim().slice(0, 500);
    const cname = String(customer.name || "").trim().slice(0, 200);

    let shipping_options = [];
    let shipping_address_collection = undefined;

    // audit/debug
    let shipCostMXN = 0;
    let shipLabel = "Gratis (Pickup)";

    if (mode !== "pickup") {
      // En Stripe, esto abre el form de dirección (MX/US permitido).
      shipping_address_collection = { allowed_countries: ["MX", "US"] };

      if (mode === "tj") {
        shipCostMXN = TJ_FLAT;
        shipLabel = "Local Express Tijuana";
      } else if (mode === "mx") {
        // Solo aceptar quote si es válido y razonable (anti-abuso)
        const quoted = body.shipping && body.shipping.cost != null ? toNumber(body.shipping.cost, NaN) : NaN;
        const validQuote = Number.isFinite(quoted) && quoted > 0;

        shipCostMXN = validQuote ? clamp(quoted, 50, 3000) : FALLBACK_MX_PRICE;
        shipLabel = String(body.shipping?.label || (validQuote ? "Envío Nacional" : "Envío Nacional (Estándar)")).slice(0, 120);
      } else if (mode === "us") {
        const quoted = body.shipping && body.shipping.cost != null ? toNumber(body.shipping.cost, NaN) : NaN;
        const validQuote = Number.isFinite(quoted) && quoted > 0;

        shipCostMXN = validQuote ? clamp(quoted, 100, 9000) : FALLBACK_US_PRICE;
        shipLabel = String(body.shipping?.label || (validQuote ? "Envío USA" : "Envío USA (Estándar)")).slice(0, 120);
      } else {
        // modo desconocido -> nacional estándar
        shipCostMXN = FALLBACK_MX_PRICE;
        shipLabel = "Envío (Estándar)";
      }

      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(shipCostMXN * 100), currency: "mxn" },
          display_name: shipLabel,
        },
      });

      // Validación mínima del lado server (tu main.js ya valida)
      if (!cname || !address || !postal_code) {
        return jsonResponse(400, { error: "Faltan datos de envío" });
      }
    }

    // 6) Crear sesión
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection,
      success_url: `${baseUrl()}/?status=success`,
      cancel_url: `${baseUrl()}/?status=cancel`,
      metadata: {
        score_mode: mode,
        org_id: String(org.id),

        // Cliente (para orden/webhook)
        customer_name: cname,
        customer_address: address,
        customer_postal_code: postal_code,

        // Promo (solo etiqueta; precios reales vienen DB)
        promo_active: body.promo ? "true" : "false",

        // Shipping (para webhook)
        shipping_cost_mxn: String(shipCostMXN || 0),
        shipping_label: shipLabel,
      },
    });

    return jsonResponse(200, { url: session.url });
  } catch (err) {
    console.error("create_checkout error:", err);
    return jsonResponse(500, { error: err?.message || "Error" });
  }
};