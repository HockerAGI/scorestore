const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  supabaseAdmin,
  baseUrl,
  getEnviaQuote,
  DEFAULT_ORG_ID,
  isUuid,
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

function pickShippingAmount(shipping) {
  // soporta número o objeto {amount|cost|quote}
  if (typeof shipping === "number") return money(shipping);
  if (shipping && typeof shipping === "object") {
    return money(shipping.amount ?? shipping.cost ?? shipping.quote ?? 0);
  }
  return 0;
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { ok: false, error: "STRIPE_SECRET_KEY missing" });
  }

  const body = safeJsonParse(event.body || "{}") || {};

  const {
    org_id,
    cart = [],
    shipping = 0,
    shippingLabel = "Envío",
    shippingMode = "fallback",
    shippingData = {},
    cancel_url,
    success_url,
    email,
    phone,
    name,
  } = body;

  const orgId = isUuid(org_id) ? String(org_id) : DEFAULT_ORG_ID;

  if (!Array.isArray(cart) || cart.length === 0) {
    return jsonResponse(400, { ok: false, error: "Cart empty" });
  }

  const items_qty = sumQty(cart);
  const zip = String(shippingData?.postal_code || shippingData?.zip || "").trim();
  const country = String(shippingData?.country || "MX").trim().toUpperCase();

  // shipping parse
  let shippingAmount = pickShippingAmount(shipping);
  let shipping_label = String(shippingLabel || "Envío");
  let shipping_mode = String(shippingMode || "fallback");

  // if shipping is missing or zero, re-quote safely
  if (!shippingAmount || shippingAmount < 1) {
    const q = await getEnviaQuote({ zip, country, items_qty });
    shippingAmount = money(q.amount);
    shipping_label = q.label || shipping_label;
    shipping_mode = q.mode || shipping_mode;
  }

  // Build line items
  const line_items = cart.map((it) => {
    const unit = money(it.price);
    const qty = money(it.qty);
    const img = it.img || it.image || "";

    return {
      price_data: {
        currency: "mxn",
        product_data: {
          name: it.name || "Producto",
          images: img ? [String(img)] : [],
        },
        unit_amount: unit * 100,
      },
      quantity: qty,
    };
  });

  // Add shipping as line item (simple)
  if (shippingAmount > 0) {
    line_items.push({
      price_data: {
        currency: "mxn",
        product_data: { name: shipping_label },
        unit_amount: shippingAmount * 100,
      },
      quantity: 1,
    });
  }

  const origin = baseUrl(event) || "";
  const okSuccess = (success_url && String(success_url)) || (origin ? `${origin}/?status=success` : "");
  const okCancel = (cancel_url && String(cancel_url)) || (origin ? `${origin}/?status=cancel` : "");

  // payments
  const payment_method_types = ["card"];
  if (process.env.STRIPE_ENABLE_OXXO === "1") payment_method_types.push("oxxo");

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types,
      line_items,
      success_url: okSuccess,
      cancel_url: okCancel,
      customer_email: email || undefined,
      phone_number_collection: { enabled: true },
      metadata: {
        org_id: orgId,
        items_qty: String(items_qty),
        customer_name: name || "",
        customer_phone: phone || "",
        customer_email: email || "",
        customer_cp: zip || "",
        customer_country: country || "MX",
        shipping_mode: shipping_mode || "fallback",
        shipping_label: shipping_label || "Envío",
      },
    });

    // Insert pending order
    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert({
        org_id: orgId,
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
          shippingLabel: shipping_label,
          shippingMode: shipping_mode,
          email,
          phone,
          name,
          country,
        }),
      });
    }

    return jsonResponse(200, { ok: true, id: session.id, url: session.url });
  } catch (err) {
    const msg = err?.raw?.message || err?.message || "Stripe checkout failed";
    return jsonResponse(500, { ok: false, error: msg });
  }
};
