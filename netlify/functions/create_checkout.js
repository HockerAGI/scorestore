const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, safeJsonParse, loadCatalog, productMapFromCatalog, validateCartItems, getEnviaQuote, digitsOnly } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const SITE_URL = process.env.URL || "http://localhost:8888";

    // Validar Carrito
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // Line Items
    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto no encontrado ID: ${i.id}`);
      
      const imgUrl = p.img.startsWith("http") ? p.img : `${SITE_URL}${p.img}`;
      
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${i.size}`,
            images: [imgUrl]
          },
          unit_amount: Math.round(p.baseMXN * 100)
        },
        quantity: i.qty
      };
    });

    // Envío
    const mode = body.mode || "pickup";
    const zip = digitsOnly(body.customer?.postal_code);
    let shipping_options = [];
    let shipping_address_collection = undefined;

    if (mode !== "pickup") {
      shipping_address_collection = { allowed_countries: ["MX"] };
      
      if (mode === "tj") {
        shipping_options.push({
          shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: 20000, currency: 'mxn' }, display_name: 'Local Tijuana (Express)' }
        });
      } else if (mode === "mx") {
        const qty = cartCheck.items.reduce((s, i) => s + i.qty, 0);
        const quote = await getEnviaQuote(zip, qty);
        const cost = quote ? quote.mxn : 250;
        const label = quote ? `Nacional (${quote.carrier})` : 'Nacional Estándar';

        shipping_options.push({
          shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: cost * 100, currency: 'mxn' }, display_name: label }
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection,
      success_url: `${SITE_URL}/?status=success`,
      cancel_url: `${SITE_URL}/?status=cancel`,
      metadata: { score_mode: mode, customer_zip: zip }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: "Error al procesar el pago." });
  }
};
