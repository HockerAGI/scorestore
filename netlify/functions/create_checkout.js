const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  getEnviaQuote,
  getProductsFromDb,
} = require("./_shared");

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
  const raw = Array.isArray(body.items) ? body.items : [];
  return raw
    .map((it) => ({
      id: String(it.id || ""),
      sku: String(it.sku || ""),
      name: String(it.name || ""),
      img: String(it.img || ""),
      price: Number(it.price || it.baseMXN || 0),
      qty: normalizeQty(it.qty),
      size: String(it.size || "Unitalla"),
    }))
    .filter((x) => x.id && x.qty > 0 && x.price > 0);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const mode = pickShippingMode(body);
    const customer = getCustomer(body);
    const orgSlug = String(body.orgSlug || "score-store");

    const items = normalizeCartItems(body);
    if (!items.length) return jsonResponse(400, { error: "Cart is empty" });

    // (Optional) strict validation vs DB (if service role key exists)
    const db = await getProductsFromDb({ orgSlug });
    const useDbValidation = db.ok && Array.isArray(db.products) && db.products.length;

    // Build line items for Stripe
    const line_items = items.map((it) => ({
      quantity: it.qty,
      price_data: {
        currency: "mxn",
        unit_amount: Math.round(Number(it.price) * 100),
        product_data: {
          name: it.name,
          metadata: { sku: it.sku, size: it.size, pid: it.id },
          images: it.img ? [it.img] : [],
        },
      },
    }));

    // Shipping
    let shippingCostMXN = 0;
    let shippingLabel = "Recolección";
    if (mode !== "pickup") {
      const country = mode === "us" ? "US" : "MX";
      const zip = String(customer.postal_code || "").trim();
      const qty = items.reduce((a, b) => a + b.qty, 0);

      const quote = await getEnviaQuote(zip, qty, country);
      const floor = mode === "us" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
      shippingCostMXN = quote?.mxn ? Math.max(Number(quote.mxn), Number(floor)) : Number(floor);
      shippingLabel = quote?.carrier ? `Envío ${quote.carrier}` : "Envío";
    }

    const shipping_options =
      mode === "pickup"
        ? []
        : [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: Math.round(shippingCostMXN * 100), currency: "mxn" },
                display_name: shippingLabel,
              },
            },
          ];

    const success = `${process.env.PUBLIC_SITE_URL || "https://scorestore.netlify.app"}/?success=1`;
    const cancel = `${process.env.PUBLIC_SITE_URL || "https://scorestore.netlify.app"}/?canceled=1`;

    // Stripe session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      shipping_options,
      customer_creation: "if_required",
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      success_url: success,
      cancel_url: cancel,
      allow_promotion_codes: false,
      metadata: {
        shipping_mode: mode,
        org_slug: orgSlug,
        validation_mode: useDbValidation ? "strict_db" : "client_fallback",
      },
    });

    return jsonResponse(200, { ok: true, url: session.url });
  } catch (err) {
    console.error("create_checkout error:", err);
    return jsonResponse(500, { error: err.message || "Checkout error" });
  }
};