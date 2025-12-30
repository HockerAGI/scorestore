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
    // ya es url absoluta
    new URL(v);
    return v;
  } catch {
    // path relativo
    try {
      return new URL(v.startsWith("/") ? v : `/${v}`, siteUrl).toString();
    } catch {
      return "";
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: "Falta STRIPE_SECRET_KEY en Netlify." });
    }

    const siteUrl = getSiteUrlFromEnv(event);
    if (!siteUrl) return jsonResponse(500, { error: "No se pudo resolver URL del sitio (URL/URL_SCORE)." });

    const body = safeJsonParse(event.body, {});
    const items = body.items || [];
    const rawTo = body.to || {};
    const mode = toStr(body.mode) || "pickup";
    const promoCode = toStr(body.promoCode);

    // 1) Validar carrito
    const cartCheck = validateCartItems(items);
    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    // 2) Catálogo real
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog);

    // 3) Validar tallas
    const sizeCheck = validateSizes(cartCheck.items, productMap);
    if (!sizeCheck.ok) return jsonResponse(400, { error: sizeCheck.error });

    // 4) Line items
    const line_items = [];
    let subtotal_mxn = 0;

    for (const it of cartCheck.items) {
      const p = productMap[it.id];
      if (!p) return jsonResponse(400, { error: `Producto no disponible: ${it.id}` });

      const unit = Number(p.baseMXN || 0);
      if (!Number.isFinite(unit) || unit <= 0) return jsonResponse(400, { error: `Precio inválido en catálogo: ${p.id}` });

      subtotal_mxn += unit * it.qty;

      const unit_amount = Math.round(unit * 100);
      const imgAbs = p.img ? absUrl(siteUrl, p.img) : "";

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name} (${it.size})`,
            ...(imgAbs ? { images: [imgAbs] } : {}),
          },
          unit_amount,
        },
        quantity: it.qty,
      });
    }

    // 5) Shipping compute (Envia rate si se puede, si no fijo)
    const to = {
      postal_code: digitsOnly(rawTo.postal_code),
      state_code: upper(rawTo.state_code),
      city: toStr(rawTo.city),
      address1: toStr(rawTo.address1),
      name: toStr(rawTo.name),
    };

    const ship = await computeShipping({ mode, to, items: cartCheck.items });
    const shipping_mxn = ship?.ok ? Number(ship.mxn || 0) : 0;

    // 6) Promo (informativo)
    const promo = await applyPromoToTotals({
      promoCode,
      subtotalMXN: subtotal_mxn,
      shippingMXN: shipping_mxn,
    });

    // 7) Stripe session
    const sessionConfig = {
      mode: "payment",
      line_items,

      // URLs
      success_url: `${siteUrl}/?status=success`,
      cancel_url: `${siteUrl}/?status=cancel`,

      // UX pro
      locale: "es-419",
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",

      // Facturación (manual): capturamos y avisamos
      custom_fields: [
        {
          key: "factura",
          label: { type: "custom", custom: "¿Requieres factura?" },
          type: "dropdown",
          dropdown: { options: [{ label: "No", value: "no" }, { label: "Sí", value: "si" }] },
        },
        {
          key: "rfc",
          label: { type: "custom", custom: "RFC (si requieres factura)" },
          type: "text",
          optional: true,
          text: { minimum_length: 10, maximum_length: 13 },
        },
        {
          key: "razon_social",
          label: { type: "custom", custom: "Razón social (opcional)" },
          type: "text",
          optional: true,
          text: { minimum_length: 2, maximum_length: 120 },
        },
        {
          key: "uso_cfdi",
          label: { type: "custom", custom: "Uso de CFDI (opcional)" },
          type: "text",
          optional: true,
          text: { minimum_length: 2, maximum_length: 20 },
        },
      ],

      metadata: {
        // control
        shipping_mode: mode,
        promo_code: normalizePromo(promoCode),
        subtotal_mxn: String(Math.round(subtotal_mxn)),
        shipping_mxn: String(Math.round(shipping_mxn)),
        discount_mxn: String(Math.round(promo.discountMXN || 0)),
        final_total_calc: String(Math.round(promo.totalMXN || (subtotal_mxn + shipping_mxn))),

        // Envia hint (si vino de rate)
        ship_label: toStr(ship?.label),
        ship_days: String(Number(ship?.days || 7)),
        ship_carrier: toStr(ship?.carrier || ""),
        ship_service_code: toStr(ship?.service_code || ""),

        // Facturación manual
        invoice_instructions: "Enviar datos fiscales a ventas.unicotextil@gmail.com",
      },
    };

    // Shipping address solo si el usuario eligió envío
    if (mode !== "pickup") {
      sessionConfig.shipping_address_collection = { allowed_countries: ["MX"] };
    }

    // Cobro de envío (fixed)
    if (shipping_mxn > 0) {
      sessionConfig.shipping_options = [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: Math.round(shipping_mxn * 100), currency: "mxn" },
            display_name: ship?.label || "Envío",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: Number(ship?.days || 7) },
            },
          },
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return jsonResponse(200, { url: session.url });
  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "No se pudo iniciar el pago. Intenta de nuevo." });
  }
};