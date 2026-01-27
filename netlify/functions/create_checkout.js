const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  getPromo,
  quoteShipping,
  getCatalogProduct
} = require("./_shared");

function getBaseUrl(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["x-forwarded-host"] || event.headers.host || "scorestore.netlify.app";
  return `${proto}://${host}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "Stripe no configurado: falta STRIPE_SECRET_KEY" });
  }

  const BASE_URL = getBaseUrl(event);
  const body = safeJsonParse(event.body);

  const cart = Array.isArray(body.cart) ? body.cart : [];
  const shippingMode = String(body.shippingMode || "pickup"); // pickup | mx | us
  const zip = String(body.zip || "").trim();
  const promoCode = String(body.promoCode || "").trim();

  if (!cart.length) return jsonResponse(400, { error: "Carrito vacío" });

  const promo = getPromo(promoCode);

  const line_items = [];
  let totalQty = 0;

  for (const item of cart) {
    const qty = normalizeQty(item.qty);
    const id = String(item.id || "");
    const size = String(item.size || "");

    const product = getCatalogProduct(id);
    if (!product) continue;

    totalQty += qty;

    let unitMXN = Number(product.baseMXN || 0);
    if (!Number.isFinite(unitMXN) || unitMXN <= 0) {
      return jsonResponse(400, { error: `Precio inválido en catálogo para ${id}` });
    }

    if (promo && promo.type === "percent") unitMXN = unitMXN - unitMXN * promo.value;

    line_items.push({
      price_data: {
        currency: "mxn",
        product_data: {
          name: product.name,
          description: `Talla: ${size || "N/A"}${promoCode ? ` · Cupón: ${promoCode}` : ""}`,
          images: [BASE_URL + product.img],
          metadata: { id, size }
        },
        unit_amount: Math.round(unitMXN * 100)
      },
      quantity: qty
    });
  }

  if (!line_items.length) return jsonResponse(400, { error: "No hay productos válidos" });

  let shipping_options = [];
  const needsShipping = shippingMode !== "pickup";
  const country_code = shippingMode === "us" ? "US" : "MX";

  if (needsShipping) {
    let quote = null;
    if (zip) quote = await quoteShipping({ postal_code: zip, country_code, qty: totalQty });

    if (quote) {
      shipping_options = [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(quote.mxn * 100), currency: "mxn" },
          display_name: `Envío ${String(quote.carrier).toUpperCase()} (${country_code})`,
          delivery_estimate: {
            minimum: { unit: "business_day", value: 2 },
            maximum: { unit: "business_day", value: 7 }
          }
        }
      }];
    } else {
      const fallback = country_code === "US" ? 800 : 250;
      shipping_options = [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(fallback * 100), currency: "mxn" },
          display_name: country_code === "US" ? "Envío USA (Fallback)" : "Envío MX (Fallback)",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 3 },
            maximum: { unit: "business_day", value: country_code === "US" ? 8 : 6 }
          }
        }
      }];
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,
      shipping_options,
      shipping_address_collection: needsShipping ? { allowed_countries: ["MX", "US"] } : undefined,
      phone_number_collection: { enabled: true },

      success_url: `${BASE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/?status=cancel`,

      metadata: {
        order_source: "score_store_web",
        shipping_mode: shippingMode,
        customer_cp: zip || "N/A",
        promo_code: promoCode || "NONE",
        items_qty: String(totalQty || 1)
      }
    });

    return jsonResponse(200, { url: session.url });
  } catch (e) {
    console.error("Stripe create session error:", e);
    return jsonResponse(500, { error: "Error creando sesión de checkout" });
  }
};