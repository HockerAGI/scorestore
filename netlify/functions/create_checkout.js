const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, getPromo, normalizeQty, getEnviaQuote } = require("./_shared");
const catalog = require("../../data/catalog.json"); // NO se modifica

function getBaseUrl(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["x-forwarded-host"] || event.headers.host || "scorestore.netlify.app";
  return `${proto}://${host}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: "Stripe no configurado (STRIPE_SECRET_KEY)." });
    }

    const BASE_URL = getBaseUrl(event);
    const body = JSON.parse(event.body || "{}");

    const cartItems = body.cart || [];
    const shippingMode = body.shippingMode || "pickup"; // pickup | mx | us
    const zip = String(body.zip || "").trim();
    const promoCode = String(body.promoCode || "").trim();

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return jsonResponse(400, { error: "El carrito está vacío" });
    }

    const promo = getPromo(promoCode);

    const line_items = [];
    let totalQty = 0;

    for (const item of cartItems) {
      const qty = normalizeQty(item.qty);
      totalQty += qty;

      const product = (catalog?.products || []).find((p) => p.id === item.id);
      if (!product) continue;

      let unit = Number(product.baseMXN || 0);
      if (!Number.isFinite(unit) || unit <= 0) {
        return jsonResponse(400, { error: `Precio inválido para ${product.id}` });
      }

      if (promo && promo.type === "percent") unit = unit - unit * promo.value;

      const sizeLabel = item.size ? `Talla: ${item.size}` : "Talla: N/A";
      const promoLabel = promoCode ? ` · Cupón: ${promoCode}` : "";

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `${sizeLabel}${promoLabel}`,
            images: [BASE_URL + product.img],
            metadata: { id: product.id, size: item.size || "" },
          },
          unit_amount: Math.round(unit * 100),
        },
        quantity: qty,
      });
    }

    if (line_items.length === 0) {
      return jsonResponse(400, { error: "Productos inválidos o no encontrados en catálogo." });
    }

    let shipping_options = [];

    if (shippingMode !== "pickup") {
      const isUS = shippingMode === "us";
      const country = isUS ? "US" : "MX";

      let quote = null;
      if (zip) quote = await getEnviaQuote(zip, totalQty, country);

      if (!quote) {
        const fallbackCost = isUS ? 800 : 250;
        shipping_options = [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: Math.round(fallbackCost * 100), currency: "mxn" },
              display_name: isUS ? "Envío USA (Fallback)" : "Envío MX (Fallback)",
              delivery_estimate: {
                minimum: { unit: "business_day", value: 3 },
                maximum: { unit: "business_day", value: isUS ? 7 : 5 },
              },
            },
          },
        ];
      } else {
        const amount = Math.round(Number(quote.mxn || 0) * 100);
        shipping_options = [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount, currency: "mxn" },
              display_name: `${quote.carrier || "Envío"} (${country})`,
              delivery_estimate: {
                minimum: { unit: "business_day", value: 2 },
                maximum: { unit: "business_day", value: 7 },
              },
            },
          },
        ];
      }
    }
const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      shipping_options,
      shipping_address_collection:
        shippingMode !== "pickup" ? { allowed_countries: ["MX", "US"] } : undefined,
      phone_number_collection: { enabled: true },

      success_url: `${BASE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?status=cancel`,

      metadata: {
        order_source: "score_store_web",
        shipping_mode: shippingMode,
        promo_code: promoCode || "NONE",
        customer_cp: zip || "N/A",
        items_qty: String(totalQty || 1),
      },

      allow_promotion_codes: false,
    });

    return jsonResponse(200, { url: session.url });
  } catch (e) {
    console.error("create_checkout error:", e);
    return jsonResponse(500, { error: "Error al iniciar pasarela de pago." });
  }
};