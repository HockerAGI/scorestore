import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const { cart = [], promoCode = "", shipTo = {} } = body;

    let subtotal = cart.reduce((a, b) => a + (b.priceMXN * b.qty), 0);
    let discount = 0;

    if (promoCode === "SCORE10") discount = subtotal * 0.10;
    if (promoCode === "BAJA200") discount = 200;
    if (promoCode === "GRTS10") subtotal = 0;

    const total = Math.max(0, subtotal - discount);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items: cart.map(i => ({
        price_data: {
          currency: "mxn",
          product_data: { name: i.name },
          unit_amount: Math.round(i.priceMXN * 100)
        },
        quantity: i.qty
      })),
      mode: "payment",
      success_url: `${process.env.URL_SCORE}/success`,
      cancel_url: `${process.env.URL_SCORE}/cancel`,
      shipping_address_collection: { allowed_countries: ["MX"] },
      metadata: { promoCode, envio: JSON.stringify(shipTo) }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, url: session.url })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
}