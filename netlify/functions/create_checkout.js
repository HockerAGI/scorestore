const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly,
  getPromo,
  getSiteUrl,
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST")
    return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body, {});
    const { mode, to, promo } = body; // mode: pickup | tj | mx

    if (!process.env.STRIPE_SECRET_KEY)
      return jsonResponse(500, { error: "Stripe no configurado (missing STRIPE_SECRET_KEY)" });

    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const cartCheck = validateCartItems(body.items);

    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    const siteUrl = getSiteUrl();

    // Line items con precio backend (seguro)
    const line_items = cartCheck.items.map((item) => {
      const product = map[item.id];
      if (!product) throw new Error(`Producto no encontrado: ${item.id}`);

      const imgUrl = product.img.startsWith("http")
        ? product.img
        : `${siteUrl}${product.img}`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${item.size}`,
            images: [imgUrl],
            metadata: {
              id: item.id,
              size: item.size,
              sku: product.sku || item.id,
            },
          },
          unit_amount: Math.round(product.baseMXN * 100),
        },
        quantity: item.qty,
      };
    });

    // PROMO
    const promoObj = getPromo(promo);
    const freeShipping = promoObj && promoObj.type === "free_shipping";

    // Shipping options
    let shipping_options = [];

    if (mode === "pickup") {
      // sin envío
    } else if (freeShipping) {
      // ENVIOFREE: sin shipping
      shipping_options = [];
    } else if (mode === "tj") {
      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 20000, currency: "mxn" },
          display_name: "Envío Local Express (Tijuana)",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 1 },
            maximum: { unit: "business_day", value: 2 },
          },
        },
      });
    } else {
      // mx: cotización real + fallback
      let cost = 250;
      const zip = digitsOnly(to?.postal_code);
      if (zip.length === 5) {
        const quote = await getEnviaQuote(zip, cartCheck.items.length);
        if (quote) cost = quote.mxn;
      }

      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: cost * 100, currency: "mxn" },
          display_name: "Envío Nacional Estándar",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 3 },
            maximum: { unit: "business_day", value: 7 },
          },
        },
      });
    }

    // Descuentos (percent / fixed) aplicados REAL en Stripe
    let discounts = [];
    if (promoObj && (promoObj.type === "percent" || promoObj.type === "fixed_mxn")) {
      let coupon;

      if (promoObj.type === "percent") {
        coupon = await stripe.coupons.create({
          percent_off: Math.round((Number(promoObj.value) || 0) * 100),
          duration: "once",
          name: promoObj.code,
        });
      } else {
        coupon = await stripe.coupons.create({
          amount_off: Math.round((Number(promoObj.value) || 0) * 100),
          currency: "mxn",
          duration: "once",
          name: promoObj.code,
        });
      }

      discounts.push({ coupon: coupon.id });
    }

    // Create session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      success_url: `${siteUrl}/?success=true`,
      cancel_url: `${siteUrl}/?cancel=true`,
      shipping_options: shipping_options.length ? shipping_options : undefined,
      shipping_address_collection:
        mode !== "pickup" ? { allowed_countries: ["MX"] } : undefined,

      discounts: discounts.length ? discounts : undefined,

      customer_email: (to?.email || "").trim() || undefined,

      metadata: {
        shipping_mode: mode || "pickup",
        customer_name: (to?.name || "").trim(),
        customer_email: (to?.email || "").trim(),
        customer_phone: (to?.phone || "").trim(),
        promo_code: promoObj?.code || "",
        free_shipping: freeShipping ? "1" : "0",
      },
    });

    return jsonResponse(200, { url: session.url });
  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "Error iniciando pago. Intente nuevamente." });
  }
};