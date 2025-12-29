// netlify/functions/create_checkout.js

const Stripe = require("stripe");
const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  normalizePromo,
  validateCartItems,
  validateSizes,
  loadCatalog,
  computeSubtotalMXN,
  computeShipping,
  applyPromoToTotals,
} = require("./_shared");

// ENV VARS REQUIRED (Netlify):
// STRIPE_SECRET_KEY
// STRIPE_SUCCESS_URL
// STRIPE_CANCEL_URL

exports.handler = async (event) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return jsonResponse(500, { error: "Missing STRIPE_SECRET_KEY" });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    /* ---------- INPUT ---------- */
    const body = safeJsonParse(event.body, {});
    const mode = toStr(body.mode) || "pickup";
    const promoCode = toStr(body.promoCode);

    /* ---------- CART ---------- */
    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) {
      return jsonResponse(400, { error: cartCheck.error });
    }

    const items = cartCheck.items;

    /* ---------- CATALOG ---------- */
    const catalog = await loadCatalog();
    const productMap = catalog.map;

    /* ---------- SIZE VALIDATION ---------- */
    const sizeCheck = validateSizes(items, productMap);
    if (!sizeCheck.ok) {
      return jsonResponse(400, { error: sizeCheck.error });
    }

    /* ---------- LINE ITEMS ---------- */
    const line_items = [];

    for (const it of items) {
      const p = productMap[it.id];
      if (!p) {
        return jsonResponse(400, { error: `Producto inválido: ${it.id}` });
      }

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name}${it.size ? ` — Talla ${it.size}` : ""}`,
          },
          unit_amount: Math.round(Number(p.price) * 100),
        },
        quantity: it.qty,
      });
    }

    /* ---------- SUBTOTAL ---------- */
    const subtotal_mxn = computeSubtotalMXN(items, productMap);

    /* ---------- ADDRESS ---------- */
    const rawTo = body.to || {};
    const to = {
      postal_code: digitsOnly(rawTo.postal_code),
      state_code: upper(rawTo.state_code),
      city: toStr(rawTo.city),
      address1: toStr(rawTo.address1),
      name: toStr(rawTo.name),
    };

    if (mode !== "pickup") {
      if (!to.postal_code || to.postal_code.length !== 5) {
        return jsonResponse(400, { error: "Código postal inválido." });
      }
    }

    /* ---------- SHIPPING ---------- */
    const ship = await computeShipping({
      mode,
      to,
      items,
    });

    if (!ship.ok) {
      return jsonResponse(400, { error: ship.error });
    }

    const shipping_mxn = ship.mxn || 0;

    /* ---------- PROMO / TOTALS ---------- */
    const promo = applyPromoToTotals({
      promoCode,
      subtotal_mxn,
      shipping_mxn,
    });

    const totals = promo.totals;

    /* ---------- STRIPE SESSION ---------- */
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url:
        process.env.STRIPE_SUCCESS_URL || "https://example.com/success",
      cancel_url:
        process.env.STRIPE_CANCEL_URL || "https://example.com/cancel",
      shipping_options:
        shipping_mxn > 0
          ? [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  fixed_amount: {
                    amount: Math.round(shipping_mxn * 100),
                    currency: "mxn",
                  },
                  display_name: ship.label || "Envío",
                },
              },
            ]
          : [],
      metadata: {
        mode,
        postal_code: to.postal_code || "",
        state_code: to.state_code || "",
        city: to.city || "",
        address1: to.address1 || "",
        name: to.name || "",
        shipping_mxn: String(shipping_mxn),
        promo_code: promo.promoCode || normalizePromo(promoCode),
        discount_mxn: String(promo.discount_mxn || 0),
        total_mxn: String(totals.total_mxn || 0),
      },
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(500, { error: err.message || "Server error" });
  }
};