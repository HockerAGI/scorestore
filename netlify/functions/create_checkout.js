// netlify/functions/create_checkout.js
const Stripe = require("stripe");
const { json, parseBody, getSiteURL } = require("./_shared");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20"
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: "Stripe no configurado" });
  }

  const body = parseBody(event);
  if (!body || !Array.isArray(body.items) || !body.items.length) {
    return json(400, { error: "Carrito inválido" });
  }

  const line_items = body.items.map((i) => ({
    price_data: {
      currency: "mxn",
      product_data: {
        name: `${i.name}${i.size ? " - " + i.size : ""}`
      },
      unit_amount: Math.round(i.price * 100)
    },
    quantity: i.qty || 1
  }));

  // Envío ya calculado por frontend
  if (body.mode === "shipping" && body.shippingCost > 0) {
    line_items.push({
      price_data: {
        currency: "mxn",
        product_data: { name: "Envío" },
        unit_amount: Math.round(body.shippingCost * 100)
      },
      quantity: 1
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${getSiteURL(event)}/?success=1`,
      cancel_url: `${getSiteURL(event)}/?canceled=1`
    });

    return json(200, { url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return json(500, { error: "No se pudo iniciar el pago" });
  }
};