/**
 * create_checkout.js — FINAL MASTER V3 (CON DESCUENTOS)
 * - Valida precios en Supabase.
 * - APLICA EL DESCUENTO recibido del Frontend.
 * - Genera sesión de Stripe.
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  supabase,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
} = require("./_shared");

const TJ_FLAT = 200; // MXN Local

// Convertir números de forma segura
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

// URL Absoluta para imágenes en Stripe
function baseUrl() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    "https://scorestore.netlify.app"
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "Falta STRIPE_SECRET_KEY" });
  }

  try {
    const body = safeJsonParse(event.body);
    const cartItems = Array.isArray(body.items) ? body.items : [];
    
    // --- 1. CAPTURAR EL DESCUENTO DEL FRONTEND ---
    // Si el usuario aplicó cupón, esto será 0.10, 0.25, etc. Si no, es 0.
    const discountFactor = toNumber(body.discountFactor, 0); 

    if (!cartItems.length) return jsonResponse(400, { error: "Carrito vacío" });

    // --- 2. VALIDAR PRODUCTOS CON DB ---
    // Normalizar entrada
    const normalizedItems = cartItems
      .map((i) => ({
        id: i?.id,
        qty: normalizeQty(i?.qty),
        size: normalizeSize(i?.size),
      }))
      .filter((i) => i.id);

    // Obtener tienda
    const { data: org } = await supabase.from("organizations").select("id").eq("slug", "score-store").single();
    if (!org?.id) return jsonResponse(500, { error: "Tienda desconectada" });

    // Consultar precios reales
    const productIds = normalizedItems.map(i => i.id);
    const { data: dbProducts } = await supabase
      .from("products")
      .select("id,name,price,image_url,sku")
      .in("id", productIds)
      .eq("active", true);

    if (!dbProducts?.length) return jsonResponse(500, { error: "Productos no disponibles" });

    // --- 3. CONSTRUIR LINE ITEMS (CON MATEMÁTICA DE DESCUENTO) ---
    const line_items = normalizedItems.map((item) => {
      const product = dbProducts.find((p) => String(p.id) === String(item.id));
      if (!product) throw new Error(`Producto agotado o inválido: ${item.id}`);

      // Precio Base Real (DB)
      const basePrice = toNumber(product.price, 0);
      
      // Aplicar Descuento
      const finalPrice = basePrice * (1 - discountFactor);
      
      // Convertir a centavos para Stripe
      const unit_amount = Math.round(finalPrice * 100);

      if (unit_amount < 1) throw new Error("Error en cálculo de precio");

      // Imagen absoluta
      let img = String(product.image_url || "");
      if (img && img.startsWith("/")) img = `${baseUrl()}${img}`;
      const images = img ? [img] : [];

      // Nombre dinámico (ej: "Gorra (25% OFF)")
      let name = String(product.name).slice(0, 100);
      if (discountFactor > 0) {
        name += ` (${Math.round(discountFactor * 100)}% OFF)`;
      }

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: name,
            description: `Talla: ${item.size} | SKU: ${product.sku || 'N/A'}`,
            images: images,
            metadata: { 
                product_id: String(product.id), 
                sku: String(product.sku || "") 
            },
          },
          unit_amount, // Precio ya con descuento
        },
        quantity: item.qty,
      };
    });

    // --- 4. ENVÍO (SHIPPING) ---
    const mode = String(body.mode || "pickup").toLowerCase();
    const customer = body.customer || {};
    
    let shipping_options = [];
    let shipCost = 0;
    let shipLabel = "Recoger en Tienda";
    let allowed_countries = [];

    if (mode === "pickup") {
        shipCost = 0;
    } else {
        // Validar datos mínimos
        if (!customer.name || !customer.address || !customer.postal_code) {
             return jsonResponse(400, { error: "Datos de envío incompletos" });
        }
        allowed_countries = ["MX", "US"];

        if (mode === "tj") {
            shipCost = TJ_FLAT;
            shipLabel = "Local Express Tijuana";
        } else if (mode === "mx") {
            // Usar costo cotizado o fallback
            const q = toNumber(body.shipping?.cost, -1);
            shipCost = (q >= 0) ? q : FALLBACK_MX_PRICE;
            shipLabel = body.shipping?.label || "Envío Nacional";
        } else if (mode === "us") {
            const q = toNumber(body.shipping?.cost, -1);
            shipCost = (q >= 0) ? q : FALLBACK_US_PRICE;
            shipLabel = body.shipping?.label || "Envío USA";
        } else {
            shipCost = FALLBACK_MX_PRICE;
        }

        if (shipCost > 0) {
            shipping_options.push({
                shipping_rate_data: {
                    type: "fixed_amount",
                    fixed_amount: { amount: Math.round(shipCost * 100), currency: "mxn" },
                    display_name: String(shipLabel).slice(0, 50),
                }
            });
        }
    }

    // --- 5. CREAR SESIÓN STRIPE ---
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection: allowed_countries.length ? { allowed_countries } : undefined,
      success_url: `${baseUrl()}/?status=success`,
      cancel_url: `${baseUrl()}/?status=cancel`,
      metadata: {
        score_mode: mode,
        org_id: String(org.id),
        customer_name: String(customer.name).slice(0,100),
        discount_applied: discountFactor > 0 ? `${discountFactor*100}%` : "NONE"
      },
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: err.message || "Error interno del servidor" });
  }
};
