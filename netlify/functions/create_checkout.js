const Stripe = require("stripe");

const {
  corsHeaders,
  json,
  ok,
  bad,
  readBody,
  validateCheckoutPayload,
  getProductById,
  computeItemsSubtotalMXN,
  getEnviaQuote
} = require("./_shared");

function getBaseUrl(event) {
  // 1) override explícito
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) return envBase.replace(/\/+$/, "");

  // 2) headers (Netlify)
  const xfProto = (event.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const xfHost =
    (event.headers["x-forwarded-host"] || event.headers["host"] || "").split(",")[0].trim();

  if (xfHost) return `${xfProto}://${xfHost}`.replace(/\/+$/, "");

  // 3) fallback seguro (no debería pasar en Netlify)
  return "https://YOURDOMAIN.COM";
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  if (event.httpMethod !== "POST") {
    return bad(405, { error: "Method not allowed" });
  }

  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) return bad(500, { error: "Missing STRIPE_SECRET_KEY env var" });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const body = await readBody(event);
    const val = validateCheckoutPayload(body);
    if (!val.ok) return bad(400, { error: val.error });

    const baseUrl = getBaseUrl(event);

    // items => stripe line_items
    const line_items = body.items.map((it) => {
      const p = getProductById(it.id);
      if (!p) throw new Error(`Unknown product id: ${it.id}`);

      const unit_amount = Math.round(Number(p.baseMXN) * 100);

      const imgUrl = new URL(p.img, baseUrl).toString();

      return {
        quantity: it.qty,
        price_data: {
          currency: "mxn",
          unit_amount,
          product_data: {
            name: p.name,
            images: [imgUrl],
            metadata: {
              product_id: p.id,
              sku: p.sku || "",
              size: it.size || ""
            }
          }
        }
      };
    });

    // Shipping
    let shippingCostMXN = 0;
    if (body.mode === "delivery") {
      const subtotal = computeItemsSubtotalMXN(body.items);

      const quote = await getEnviaQuote({
        to: body.to,
        subtotalMXN: subtotal
      });

      shippingCostMXN = Math.max(0, Math.round(Number(quote.totalMXN || 0)));
    }

    if (shippingCostMXN > 0) {
      line_items.unshift({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: shippingCostMXN * 100,
          product_data: { name: "Envío" }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,
      success_url: `${baseUrl}/?paid=1`,
      cancel_url: `${baseUrl}/?canceled=1`,
      metadata: {
        shipping_mode: body.mode,
        shipping_to_zip: body.to?.zip || ""
      }
    });

    return ok({ url: session.url });
  } catch (err) {
    console.error("[create_checkout] error:", err);
    return bad(500, { error: "Checkout error", detail: String(err.message || err) });
  }
};