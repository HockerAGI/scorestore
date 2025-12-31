// netlify/functions/create_checkout.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  digitsOnly,
  normalizePromo,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeShipping,
  applyPromoToTotals,
  getSiteUrlFromEnv,
} = require("./_shared");

function absUrl(siteUrl, maybePathOrUrl) {
  const v = toStr(maybePathOrUrl);
  if (!v) return "";
  try {
    new URL(v);
    return v;
  } catch {
    try {
      const base = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
      const path = v.startsWith("/") ? v : `/${v}`;
      return `${base}${path}`;
    } catch {
      return "";
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: "Error interno: Falta configuración de pagos." });
    }

    const siteUrl = getSiteUrlFromEnv(event);
    const body = safeJsonParse(event.body, {});
    const items = body.items || [];
    const rawTo = body.to || {};
    const mode = toStr(body.mode) || "pickup";
    const promoCode = toStr(body.promoCode);

    // 1) Validaciones
    const cartCheck = validateCartItems(items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);
    const sizeCheck = validateSizes(cartCheck.items, productMap);
    if (!sizeCheck.ok) return jsonResponse(400, { error: sizeCheck.error });

    // 2) Line Items
    const line_items = [];
    let subtotal_mxn = 0;

    for (const it of cartCheck.items) {
      const p = productMap[it.id];
      if (!p) return jsonResponse(400, { error: `Producto no disponible: ${it.id}` });
      if (p.status === "sold_out") return jsonResponse(400, { error: `Agotado: ${p.name}` });

      const unit = Number(p.baseMXN || 0);
      subtotal_mxn += unit * it.qty;

      const imgAbs = p.img ? absUrl(siteUrl, p.img) : "";
      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name} (${it.size})`,
            ...(p.sku ? { description: `SKU: ${p.sku}` } : {}),
            ...(imgAbs ? { images: [imgAbs] } : {}),
          },
          unit_amount: Math.round(unit * 100),
        },
        quantity: it.qty,
      });
    }

    // 3) Shipping & Promos
    const to = {
      postal_code: digitsOnly(rawTo.postal_code),
      state_code: upper(rawTo.state_code),
      city: toStr(rawTo.city),
      address1: toStr(rawTo.address1),
      name: toStr(rawTo.name),
    };

    const ship = await computeShipping({ mode, to, items: cartCheck.items });
    const shipping_mxn = ship?.ok ? Number(ship.mxn || 0) : 0;

    const promo = await applyPromoToTotals({
      promoCode,
      subtotalMXN: subtotal_mxn,
      shippingMXN: shipping_mxn,
    });

    // 4) Session Config
    const sessionConfig = {
      mode: "payment",
      line_items,
      success_url: `${siteUrl}/?status=success`,
      cancel_url: `${siteUrl}/?status=cancel`,
      locale: "es-419",
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      custom_fields: [
        { key: "factura", label: { type: "custom", custom: "¿Requieres factura?" }, type: "dropdown", dropdown: { options: [{ label: "No", value: "no" }, { label: "Sí", value: "si" }] } },
        { key: "rfc", label: { type: "custom", custom: "RFC" }, type: "text", optional: true },
        { key: "razon_social", label: { type: "custom", custom: "Razón Social" }, type: "text", optional: true }
      ],
      metadata: {
        shipping_mode: mode,
        promo_code: normalizePromo(promoCode),
        subtotal_mxn: String(Math.round(subtotal_mxn)),
        shipping_mxn: String(Math.round(shipping_mxn)),
        // GUARDAMOS DATOS DE COTIZACIÓN PARA QUE EL WEBHOOK LOS USE
        ship_label: toStr(ship?.label),
        ship_carrier: toStr(ship?.carrier || ""), 
        ship_service_code: toStr(ship?.service_code || ""),
        items_sku: cartCheck.items.map((i) => productMap[i.id]?.sku || i.id).join(","),
      },
    };

    if (mode !== "pickup") {
      sessionConfig.shipping_address_collection = { allowed_countries: ["MX"] };
    }

    if (shipping_mxn > 0) {
      sessionConfig.shipping_options = [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: Math.round(shipping_mxn * 100), currency: "mxn" },
          display_name: ship?.label || "Envío",
          delivery_estimate: { minimum: { unit: "business_day", value: 3 }, maximum: { unit: "business_day", value: Number(ship?.days || 7) } },
        },
      }];
    }

    // Cupones de descuento (Stripe nativo)
    if (promo.discountMXN > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(promo.discountMXN * 100),
        currency: 'mxn',
        duration: 'once',
        name: `Promo ${promoCode || 'Descuento'}`,
      });
      sessionConfig.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return jsonResponse(200, { url: session.url });
  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "No se pudo iniciar el pago." });
  }
};