const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly
} = require("./_shared");

const SITE_URL = process.env.SITE_URL || "https://scorestore.netlify.app";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body, {});
    const { mode, to } = body;

    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const cart = validateCartItems(body.items);

    if (!cart.ok) return jsonResponse(400, { error: cart.error });

    const line_items = cart.items.map(item => {
      const p = map[item.id];
      if (!p) throw new Error("Producto inválido");

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${item.size}`,
            images: [`${SITE_URL}${p.img}`]
          },
          unit_amount: Math.round(p.baseMXN * 100)
        },
        quantity: item.qty
      };
    });

    let shipping_options = [];

    if (mode === "tj") {
      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 20000, currency: "mxn" },
          display_name: "Envío Local Tijuana"
        }
      });
    }

    if (mode === "mx") {
      const zip = digitsOnly(to?.postal_code);
      let cost = 250;
      if (zip.length === 5) {
        const q = await getEnviaQuote(zip, cart.items.length);
        if (q) cost = q.mxn;
      }
      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: cost * 100, currency: "mxn" },
          display_name: "Envío Nacional"
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      success_url: `${SITE_URL}/?success=true`,
      cancel_url: `${SITE_URL}/?cancel=true`,
      shipping_options: shipping_options.length ? shipping_options : undefined,
      shipping_address_collection: mode !== "pickup" ? { allowed_countries: ["MX"] } : undefined,
      metadata: { shipping_mode: mode }
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: "Error iniciando pago" });
  }
};