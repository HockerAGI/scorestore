const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const cart = body.items;

    if (!Array.isArray(cart) || cart.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Carrito vacío" })
      };
    }

    const line_items = cart.map(item => {
      const imageUrl = item.img?.startsWith("http")
        ? item.img
        : `${process.env.URL_SCORE}/${item.img.replace(/^\//, "")}`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${item.name} (Talla: ${item.size || "Única"})`,
            images: imageUrl ? [imageUrl] : [],
            metadata: {
              product_id: item.id,
              size: item.size || "Única"
            }
          },
          unit_amount: Math.round(item.price * 100)
        },
        quantity: item.qty
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      phone_number_collection: { enabled: true },
      shipping_address_collection: {
        allowed_countries: ["MX"]
      },

      line_items,

      success_url: `${process.env.URL_SCORE}/?status=success`,
      cancel_url: `${process.env.URL_SCORE}/?status=cancel`
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error("Checkout error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};