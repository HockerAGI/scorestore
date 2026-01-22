const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  PROMO_RULES,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  getEnviaQuote,
  getProductsFromDb,
} = require("./_shared");

/**
 * create_checkout (Netlify Function)
 * Accepts BOTH payload styles (old + new) without breaking:
 * - Old frontend: { items: [{id,size,qty}], mode, customer:{name,address,postal_code}, promo, promoCode }
 * - New frontend: { cart: [{id,name,price,img,size,qty,sku}], shippingMode, shippingData:{...}, promoCode }
 *
 * Real enforcement:
 * - Prices are validated against Supabase products table when available (Único OS).
 * - If Supabase isn't configured, falls back to client payload price (still real, but less secure).
 */

function pickShippingMode(body) {
  const mode = String(body.shippingMode || body.mode || "pickup").toLowerCase();
  if (["pickup", "tj", "mx", "us"].includes(mode)) return mode;
  return "pickup";
}

function getCustomer(body) {
  const c = body.customer || body.shippingData || {};
  return {
    name: String(c.name || "").trim(),
    address: String(c.address || c.line1 || "").trim(),
    postal_code: String(c.postal_code || c.zip || "").trim(),
  };
}

function normalizeCartItems(body) {
  const raw = Array.isArray(body.items) ? body.items : Array.isArray(body.cart) ? body.cart : [];
  return raw
    .map((it) => ({
      id: String(it.id || it.productId || "").trim(),
      sku: it.sku ? String(it.sku) : undefined,
      size: String(it.size || it.selectedSize || "").trim(),
      qty: normalizeQty(it.qty ?? it.quantity),
      // optional client hints
      name: it.name ? String(it.name) : undefined,
      img: it.img ? String(it.img) : undefined,
      price: typeof it.price === "number" ? it.price : undefined,
    }))
    .filter((x) => x.id && x.qty > 0);
}

function applyDiscountToLineItems(lineItems, discount) {
  if (!discount) return { lineItems, applied: null };

  const type = discount.type;
  const value = discount.value;

  // Build subtotal (in cents)
  const subtotal = lineItems.reduce((acc, li) => acc + li.price_data.unit_amount * li.quantity, 0);
  if (subtotal <= 0) return { lineItems, applied: null };

  // percent
  if (type === "percent") {
    const factor = 1 - Math.min(0.9, Math.max(0, value));
    const adjusted = lineItems.map((li) => {
      const unit = li.price_data.unit_amount;
      const newUnit = Math.max(50, Math.round(unit * factor)); // never below $0.50 MXN equivalent
      return { ...li, price_data: { ...li.price_data, unit_amount: newUnit } };
    });
    return { lineItems: adjusted, applied: { type, value } };
  }

  // fixed (spread across items)
  if (type === "fixed_mxn") {
    const offCents = Math.round(Math.max(0, value) * 100);
    const target = Math.max(0, subtotal - offCents);
    const factor = target / subtotal;

    const adjusted = lineItems.map((li) => {
      const unit = li.price_data.unit_amount;
      const newUnit = Math.max(50, Math.round(unit * factor));
      return { ...li, price_data: { ...li.price_data, unit_amount: newUnit } };
    });

    return { lineItems: adjusted, applied: { type, value } };
  }

  return { lineItems, applied: null };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const mode = pickShippingMode(body);
    const cartItems = normalizeCartItems(body);

    if (!cartItems.length) return jsonResponse(400, { error: "Carrito vacío" });

    // --- PROMO ---
    const promoCodeRaw = String(body.promoCode || body.coupon || body.promo || "").trim().toUpperCase();
    const promoRule = promoCodeRaw && PROMO_RULES[promoCodeRaw] ? PROMO_RULES[promoCodeRaw] : null;

    // --- PRODUCTS SOURCE OF TRUTH (ÚNICO OS if available) ---
    const orgSlug = String(body.orgSlug || "score-store").trim();
    const { ok: dbOk, products: dbProducts } = await getProductsFromDb({ orgSlug });

    // Map items -> Stripe line_items
    const line_items = cartItems.map((item) => {
      let name = item.name || "Producto SCORE";
      let unit = item.price != null ? Math.round(item.price * 100) : 0;
      let image = item.img;

      if (dbOk) {
        const p = dbProducts.find((x) => String(x.id) === item.id);
        if (!p) throw new Error(`Producto no disponible: ${item.id}`);
        name = p.name;
        unit = Math.round(Number(p.price || 0) * 100);
        image = p.image_url || image;
      }

      if (!unit || unit < 50) throw new Error(`Precio inválido para producto: ${name}`);

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name,
            description: item.size ? `Talla: ${item.size}` : "Edición oficial",
            images: image ? [image] : [],
            metadata: { product_id: item.id, size: item.size || "" },
          },
          unit_amount: unit,
        },
        quantity: item.qty,
      };
    });

    // Apply promo by adjusting line items (real charge reduction)
    const { lineItems: discountedItems, applied: promoApplied } = applyDiscountToLineItems(line_items, promoRule);

    // Shipping options
    const shipping_options = [];

    // pickup always 0 (no address required)
    if (mode === "tj") {
      // local TJ flat
      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 20000, currency: "mxn" },
          display_name: "Local Express Tijuana",
        },
      });
    }

    if (mode === "mx" || mode === "us") {
      const customer = getCustomer(body);
      const zip = mode === "mx" ? customer.postal_code.replace(/[^\d]/g, "") : customer.postal_code;

      const qty = cartItems.reduce((acc, it) => acc + normalizeQty(it.qty), 0);

      // Real quote if ENVIA_API_KEY is configured, else fallback
      const quote = await getEnviaQuote(zip, qty, mode === "us" ? "US" : "MX");
      const costMxn = quote ? quote.mxn : mode === "us" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
      const carrierLabel = quote ? `${quote.carrier} (${quote.days} días)` : mode === "us" ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)";

      const isFreeShip = promoRule && promoRule.type === "free_shipping";
      const amount = isFreeShip ? 0 : Math.max(0, Math.round(costMxn * 100));

      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount, currency: "mxn" },
          display_name: carrierLabel,
        },
      });
    }

    const success = `${process.env.URL || ""}/?status=success`;
    const cancel = `${process.env.URL || ""}/?status=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items: discountedItems,
      shipping_options,
      success_url: success,
      cancel_url: cancel,
      allow_promotion_codes: false, // we enforce rules ourselves (real)
      metadata: {
        shipping_mode: mode,
        promo_code: promoCodeRaw || "",
        promo_type: promoApplied?.type || "",
        promo_value: promoApplied?.value != null ? String(promoApplied.value) : "",
        org_slug: orgSlug,
      },
    });

    return jsonResponse(200, { ok: true, url: session.url });
  } catch (err) {
    console.error("create_checkout error:", err);
    return jsonResponse(500, { error: err.message || "Checkout error" });
  }
};