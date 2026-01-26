const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, safeJsonParse, getEnviaQuote, FALLBACK_MX_PRICE, FALLBACK_US_PRICE, normalizeQty } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  try {
    const body = safeJsonParse(event.body);
    const cart = body.cart || [];
    const mode = String(body.shippingMode || "pickup").toLowerCase();
    const zip = body.zip || "";

    const line_items = cart.map(it => ({
      price_data: {
        currency: "mxn",
        product_data: { 
          name: it.name, 
          description: `Talla: ${it.size}`,
          images: [`https://unicouniformes.com${it.img}`] 
        },
        unit_amount: Math.round(it.baseMXN * 100),
      },
      quantity: normalizeQty(it.qty)
    }));

    let shipping_options = [];
    if (mode !== "pickup") {
      const country = mode === "us" ? "US" : "MX";
      const quote = await getEnviaQuote(zip, cart.length, country);
      const amount = quote ? quote.mxn : (mode === "us" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE);
      
      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: amount * 100, currency: "mxn" },
          display_name: quote ? `Envío ${quote.carrier}` : "Envío Estándar",
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      shipping_options,
      mode: "payment",
      shipping_address_collection: mode !== "pickup" ? { allowed_countries: ["MX", "US"] } : undefined,
      phone_number_collection: { enabled: true },
      success_url: `https://unicouniformes.com/?status=success`,
      cancel_url: `https://unicouniformes.com/?status=cancel`,
      metadata: { shipping_mode: mode, customer_zip: zip }
    });

    return jsonResponse(200, { url: session.url });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};