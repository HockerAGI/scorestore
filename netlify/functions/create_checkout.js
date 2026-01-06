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

function resolveSiteUrl() {
  // Netlify expone varias URLs dependiendo del tipo de deploy
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    "http://localhost:8888"
  ).replace(/\/$/, "");
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });

  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("Missing STRIPE_SECRET_KEY");
      return jsonResponse(500, { error: "Server misconfigured (Stripe key missing)" });
    }

    const body = safeJsonParse(event.body);
    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);

    const SITE_URL = resolveSiteUrl();

    // 1) Validar carrito
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 2) Validar modo y datos del cliente
    const mode = String(body.mode || "pickup");
    const customerName = String(body.customer?.name || "");
    const customerAddr = String(body.customer?.address || "");
    const customerZip = digitsOnly(body.customer?.postal_code);

    if (!["pickup", "tj", "mx"].includes(mode)) {
      return jsonResponse(400, { error: "Modo de entrega inválido" });
    }

    if (mode !== "pickup") {
      if (!customerName || !customerAddr || !customerZip) {
        return jsonResponse(400, { error: "Faltan datos de envío" });
      }
      if (mode === "mx" && customerZip.length < 5) {
        return jsonResponse(400, { error: "Código postal inválido" });
      }
    }

    // 3) Construir line_items
    const line_items = cartCheck.items.map((i) => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto ID inválido: ${i.id}`);

      // Imagen absoluta (Stripe exige URL pública)
      let imgUrl = p.img;
      if (imgUrl && !imgUrl.startsWith("http")) {
        imgUrl = `${SITE_URL}${imgUrl.startsWith("/") ? "" : "/"}${imgUrl}`;
      }

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla: ${i.size}`,
            images: imgUrl ? [imgUrl] : undefined,
          },
          unit_amount: Math.round(Number(p.baseMXN) * 100), // centavos
        },
        quantity: i.qty,
      };
    });

    // 4) Shipping options (solo si NO es pickup)
    let shipping_options = undefined;
    let shipping_address_collection = undefined;

    if (mode !== "pickup") {
      shipping_address_collection = { allowed_countries: ["MX"] };
      shipping_options = [];

      if (mode === "tj") {
        shipping_options.push({
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 20000, currency: "mxn" }, // $200.00
            display_name: "Entrega Local (Tijuana)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 1 },
              maximum: { unit: "business_day", value: 2 },
            },
          },
        });
      }

      if (mode === "mx") {
        const totalQty = cartCheck.items.reduce((acc, item) => acc + item.qty, 0);
        const quote = await getEnviaQuote(customerZip, totalQty);

        const finalCost = quote ? quote.mxn : 250;
        const label = quote ? `Envío Nacional (${quote.carrier})` : "Envío Nacional Estándar";

        shipping_options.push({
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: Math.round(finalCost * 100), currency: "mxn" },
            display_name: label,
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 7 },
            },
          },
        });
      }
    }

    // 5) Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,

      // Shipping config (condicional)
      shipping_options,
      shipping_address_collection,

      // URLs
      success_url: `${SITE_URL}/?status=success`,
      cancel_url: `${SITE_URL}/?status=cancel`,

      // Metadata útil para webhook / operaciones
      metadata: {
        score_mode: mode,
        customer_provided_zip: customerZip || "",
        customer_name: customerName || "",
        customer_address: customerAddr || "",
      },

      // UX
      phone_number_collection: { enabled: true },
    });

    return jsonResponse(200, { url: session.url });
  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: "Error interno al procesar pago." });
  }
};