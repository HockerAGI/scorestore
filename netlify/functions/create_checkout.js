// netlify/functions/create_checkout.js
// Stripe Checkout — PRODUCCIÓN (Node 18, Netlify)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  safeJsonParse,
  toStr,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
} = require("./_shared");

exports.handler = async (event) => {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido." });
  }

  try {
    const body = safeJsonParse(event.body, {});
    const items = body.items || [];

    // 1. Validar carrito
    const v = validateCartItems(items);
    if (!v.ok) return jsonResponse(400, { ok: false, error: v.error });

    // 2. Validar contra catálogo real
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    const v2 = validateSizes(items, productMap);
    if (!v2.ok) return jsonResponse(400, { ok: false, error: v2.error });

    // 3. Construir line_items Stripe
    const baseUrl =
      toStr(process.env.URL_SCORE) ||
      toStr(process.env.URL || process.env.DEPLOY_PRIME_URL);

    const line_items = items.map((it) => {
      const p = productMap.get(it.id);

      const img =
        p.img && p.img.startsWith("http")
          ? p.img
          : `${baseUrl}/${toStr(p.img).replace(/^\//, "")}`;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name}${it.size ? ` (Talla: ${it.size})` : ""}`,
            images: img ? [img] : [],
            metadata: {
              product_id: p.id,
              size: it.size || "Única",
            },
          },
          unit_amount: Math.round(Number(p.baseMXN) * 100),
        },
        quantity: Number(it.qty),
      };
    });

    // 4. Crear sesión Stripe
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      phone_number_collection: { enabled: true },
      shipping_address_collection: {
        allowed_countries: ["MX"],
      },

      line_items,

      success_url: `${baseUrl}/?status=success`,
      cancel_url: `${baseUrl}/?status=cancel`,
    });

    return jsonResponse(200, { ok: true, url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return jsonResponse(500, { ok: false, error: err.message });
  }
};