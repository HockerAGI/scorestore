const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, PROMO_RULES } = require("./_shared");
const catalogFallback = require("../../data/catalog.json");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });
  try {
    const { cart, shippingMode, promoCode } = JSON.parse(event.body);
    if (!cart || !cart.length) return jsonResponse(400, { error: "Carrito vacío" });

    const validItems = [];
    const promo = PROMO_RULES[promoCode?.toUpperCase()];

    for (const item of cart) {
        const product = catalogFallback.products.find(p => p.id === item.id);
        if (product) {
            let unitPrice = product.baseMXN;
            if (promo) unitPrice = unitPrice * (1 - promo.value);

            validItems.push({
                price_data: {
                    currency: "mxn",
                    product_data: {
                        name: product.name,
                        description: `Talla: ${item.size} ${promo ? '(Desc. Aplicado)' : ''}`,
                        images: [product.img.startsWith('http') ? product.img : `https://scorestore.netlify.app${product.img}`],
                        metadata: { id: item.id, size: item.size }
                    },
                    unit_amount: Math.round(unitPrice * 100),
                },
                quantity: item.qty || 1,
            });
        }
    }

    let shipping_options = [];
    if (shippingMode !== "pickup") {
        const isUS = shippingMode === 'us';
        const cost = isUS ? 80000 : 25000;
        shipping_options = [{
            shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: cost, currency: "mxn" },
                display_name: isUS ? "FedEx USA" : "FedEx Nacional",
                delivery_estimate: { minimum: { unit: "business_day", value: 3 }, maximum: { unit: "business_day", value: 7 } },
            },
        }];
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items: validItems,
      mode: "payment",
      shipping_options,
      shipping_address_collection: shippingMode !== "pickup" ? { allowed_countries: ["MX", "US"] } : undefined,
      phone_number_collection: { enabled: true },
      success_url: `${process.env.URL}/?status=success`,
      cancel_url: `${process.env.URL}/?status=cancel`,
      metadata: { shipping_mode: shippingMode, promo_code: promoCode || "NONE" }
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Stripe Error:", e);
    return jsonResponse(500, { error: "Error de pago" });
  }
};
