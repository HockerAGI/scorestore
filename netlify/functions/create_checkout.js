// netlify/functions/create_checkout.js
const Stripe = require("stripe");
const {
  jsonResponse,
  toStr,
  upper,
  normalizePromo,
  isMxPostal,
  scoreAddressFromPostal,
  safeJsonParse,
  validateCartItems,
  loadCatalog,
  computeShipping,
  applyPromoToTotals,
  roundMXN,
  FEATURE_ENVIADOTCOM,
} = require("./_shared");

// env vars required on Netlify:
// STRIPE_SECRET_KEY
// STRIPE_SUCCESS_URL
// STRIPE_CANCEL_URL

exports.handler = async (event) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return jsonResponse(500, { error: "Missing STRIPE_SECRET_KEY" });

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const body = safeJsonParse(event.body, {});
    const mode = toStr(body.mode) || "pickup";
    const promoCode = toStr(body.promoCode);

    const items = validateCartItems(body.items);
    if (!items.ok) return jsonResponse(400, { error: items.error });

    const catalog = await loadCatalog();
    if (!catalog.ok) return jsonResponse(500, { error: catalog.error });

    // build line items from catalog
    const line_items = [];
    let subtotal = 0;

    for (const it of items.items) {
      const p = catalog.map[it.id];
      if (!p) return jsonResponse(400, { error: `Producto inválido: ${it.id}` });

      const unit_amount = Math.round(Number(p.price) * 100);
      subtotal += Number(p.price) * it.qty;

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name}${it.size ? ` — Talla ${it.size}` : ""}`,
          },
          unit_amount,
        },
        quantity: it.qty,
      });
    }

    // shipping address info
    const rawTo = body.to || {};
    const to = {
      postal_code: digitsOnly(rawTo.postal_code),
      state_code: upper(rawTo.state_code),
      city: toStr(rawTo.city),
      address1: toStr(rawTo.address1),
      name: toStr(rawTo.name),
    };

    // For pickup, we don't need address
    if (mode !== "pickup") {
      if (!to.postal_code || to.postal_code.length !== 5) {
        return jsonResponse(400, { error: "Código postal inválido." });
      }
    }

    // Compute shipping
    const ship = await computeShipping({
      mode,
      to,
      items: items.items,
      subtotal_mxn: subtotal,
      featureEnvia: FEATURE_ENVIADOTCOM,
    });

    if (!ship.ok) return jsonResponse(400, { error: ship.error });

    const shippingCost = ship.mxn || 0;

    // Apply promo to totals
    const promo = applyPromoToTotals({
      subtotal_mxn: subtotal,
      shipping_mxn: shippingCost,
      promoCode,
    });

    const totals = promo.totals;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: process.env.STRIPE_SUCCESS_URL || "https://example.com/success",
      cancel_url: process.env.STRIPE_CANCEL_URL || "https://example.com/cancel",
      shipping_options: shippingCost > 0 ? [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: Math.round(shippingCost * 100), currency: "mxn" },
            display_name: ship.label || "Envío",
          },
        },
      ] : [],
      metadata: {
        mode,
        postal_code: to.postal_code || "",
        state_code: to.state_code || "",
        city: to.city || "",
        address1: to.address1 || "",
        name: to.name || "",
        shipping_mxn: String(shippingCost),
        promo_code: promo.promoCode || normalizePromo(promoCode),
        promo_discount_mxn: String(promo.discount_mxn || 0),
        total_mxn: String(totals.total_mxn || 0),
      },
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error(e);
    return jsonResponse(500, { error: e.message || "Server error" });
  }
};

function digitsOnly(v) {
  return toStr(v).replace(/\D+/g, "");
}