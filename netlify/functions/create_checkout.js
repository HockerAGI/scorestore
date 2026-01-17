const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, safeJsonParse, loadCatalog, productMapFromCatalog, validateCartItems, getEnviaQuote, digitsOnly, FALLBACK_US_PRICE, FALLBACK_MX_PRICE } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const SITE_URL = process.env.URL || "http://localhost:8888";

    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto no encontrado ID: ${i.id}`);
      
      const imgUrl = p.img.startsWith("http") ? p.img : `${SITE_URL}${p.img}`;
      const isPromo = body.promo === true;
      const finalPrice = isPromo ? Math.round(p.baseMXN * 0.20) : p.baseMXN;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${i.size} ${isPromo ? '(Promo Inauguración)' : ''}`,
            images: [imgUrl]
          },
          unit_amount: Math.round(finalPrice * 100)
        },
        quantity: i.qty
      };
    });

    const mode = body.mode || "pickup";
    const rawZip = body.customer?.postal_code || "";
    let shipping_options = [];
    let shipping_address_collection = undefined;

    if (mode !== "pickup") {
      shipping_address_collection = { allowed_countries: ["MX", "US"] };
      
      if (mode === "tj") {
        shipping_options.push({
          shipping_rate_data: { 
            type: 'fixed_amount', 
            fixed_amount: { amount: 20000, currency: 'mxn' }, 
            display_name: 'Local Tijuana (Express / Uber)' 
          }
        });
      } else {
        // MX o US
        const qty = cartCheck.items.reduce((s, i) => s + i.qty, 0);
        const countryCode = (mode === "us") ? "US" : "MX";
        const quote = await getEnviaQuote(rawZip, qty, countryCode);
        
        let cost, label;
        if (quote) {
          cost = quote.mxn;
          label = `Envío ${countryCode} (${quote.carrier})`;
        } else {
          cost = (countryCode === "US") ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
          label = (countryCode === "US") ? "Envío USA Estándar" : "Envío Nacional Estándar";
        }

        shipping_options.push({
          shipping_rate_data: { 
            type: 'fixed_amount', 
            fixed_amount: { amount: cost * 100, currency: 'mxn' }, 
            display_name: label,
            delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } }
          }
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection,
      phone_number_collection: { enabled: true },
      success_url: `${SITE_URL}/?status=success`,
      cancel_url: `${SITE_URL}/?status=cancel`,
      metadata: { score_mode: mode, customer_zip: rawZip }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: "Error al procesar el pago." });
  }
};
