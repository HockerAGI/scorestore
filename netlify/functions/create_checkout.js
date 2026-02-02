const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  supabaseAdmin,
  baseUrl,
  getEnviaQuote,
} = require("./_shared");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

function sumQty(cart) {
  return (cart || []).reduce((acc, it) => acc + Number(it.qty || 0), 0);
}

function money(n) {
  return Math.round(Number(n || 0));
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  const body = safeJsonParse(event.body || "{}") || {};
  const {
    cart = [],
    shipping = 0,
    shippingMode = "fallback",
    shippingData = {},
    cancel_url,
    success_url,
    email,
    phone,
    name,
  } = body;

  if (!Array.isArray(cart) || cart.length === 0) {
    return jsonResponse(400, { ok: false, error: "Cart empty" });
  }

  const items_qty = sumQty(cart);
  const zip = (shippingData?.postal_code || shippingData?.zip || "").toString();

  // if shipping is missing or zero, re-quote safely
  let shippingAmount = money(shipping);
  let shippingLabel = "Envío";
  let shipping_mode = shippingMode;

  if (!shippingAmount || shippingAmount < 1) {
    const q = await getEnviaQuote({ zip, items_qty });
    shippingAmount = money(q.amount);
    shippingLabel = q.label || "Envío";
    shipping_mode = q.mode || "fallback";
  }

  // Build line items
  const line_items = cart.map((it) => ({
    price_data: {
      currency: "mxn",
      product_data: {
        name: it.name || "Producto",
        images: it.image ? [it.image] : [],
      },
      unit_amount: money(it.price) * 100,
    },
    quantity: money(it.qty),
  }));

  // Add shipping as line item
  line_items.push({
    price_data: {
      currency: "mxn",
      product_data: { name: shippingLabel },
      unit_amount: shippingAmount * 100,
    },
    quantity: 1,
  });

  // URLs
  const origin = baseUrl(event) || "";
  const okSuccess =
    (success_url && success_url.toString()) ||
    (origin ? `${origin}/?success=1` : "");
  const okCancel =
    (cancel_url && cancel_url.toString()) ||
    (origin ? `${origin}/?cancel=1` : "");

  try {
    // Create Stripe session first
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: okSuccess,
      cancel_url: okCancel,
      customer_email: email || undefined,
      phone_number_collection: { enabled: true },
      metadata: {
        items_qty: String(items_qty),
        customer_name: name || "",
        customer_phone: phone || "",
        customer_email: email || "",
        customer_cp: zip || "",
        shipping_mode: shipping_mode || "fallback",
      },
    });

    // Insert pending order
    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert({
        stripe_session_id: session.id,
        status: "pending",
        currency: "MXN",
        total: money(session.amount_total ? session.amount_total / 100 : 0),
        shipping_mode,
        customer_cp: zip || null,
        items_qty,
        raw_meta: JSON.stringify({
          cart,
          shipping: shippingAmount,
          shippingLabel,
          email,
          phone,
          name,
        }),
      });
    }

    return jsonResponse(200, { ok: true, id: session.id, url: session.url });
  } catch (err) {
    const msg =
      err?.raw?.message ||
      err?.message ||
      "Stripe checkout failed";
    return jsonResponse(500, { ok: false, error: msg });
  }
};