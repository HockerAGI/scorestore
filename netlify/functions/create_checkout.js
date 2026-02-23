"use strict";

const {
  jsonResponse, handleOptions, safeJsonParse, normalizeQty, getBaseUrl, readJsonFile, getCatalogIndex,
  getEnviaQuote, getFallbackShipping, initStripe, validateZip, makeCheckoutIdempotencyKey
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const stripe = initStripe();
    const baseUrl = getBaseUrl(event);
    const body = safeJsonParse(event.body) || {};
    
    // Extracción de variables + FIX Idempotencia Front-to-Back
    const items = normalizeQty(body.items);
    const shipping_mode = String(body.shipping_mode || "pickup").trim().substring(0, 20);
    const postal_code_raw = String(body.postal_code || "").trim().substring(0, 15).replace(/[^a-zA-Z0-9-]/g, '');
    const promo_code_input = String(body.promo_code || "").trim().toUpperCase().substring(0, 30).replace(/[^A-Z0-9_-]/g, '');
    const front_req_id = String(body.req_id || "").trim().substring(0, 50); // <--- NUEVO

    if (!items || !items.length) return jsonResponse(400, { ok: false, error: "El carrito está vacío." }, origin);

    const { index: catalogIndex } = getCatalogIndex();
    if (!catalogIndex || catalogIndex.size === 0) return jsonResponse(500, { ok: false, error: "Catálogo maestro no disponible." }, origin);

    let subtotal_cents = 0;
    const items_qty = items.reduce((sum, item) => sum + item.qty, 0);

    if (items_qty <= 0 || items_qty > 200) return jsonResponse(400, { ok: false, error: "Cantidad excedida." }, origin);

    const validatedItems = items.map((item) => {
      const dbItem = catalogIndex.get(item.sku);
      if (!dbItem) throw new Error(`SKU no reconocido: ${item.sku}`);
      const realPriceCents = Number(dbItem.price_cents || 0) || 0;
      subtotal_cents += realPriceCents * item.qty;
      return { ...item, realPriceCents, title: dbItem.title || item.sku, size: String(item.size || "Unitalla").substring(0, 20) };
    });

    const subtotal_mxn = subtotal_cents / 100;

    let discountMultiplier = 1;
    let freeShippingActive = false;
    let promoApplied = "Ninguno";

    if (promo_code_input) {
      const promosData = readJsonFile("data/promos.json");
      if (promosData && Array.isArray(promosData.rules)) {
        const promo = promosData.rules.find((p) => p.code === promo_code_input && p.active);
        if (promo && (!promo.expires_at || new Date() <= new Date(promo.expires_at)) && subtotal_mxn >= (promo.min_amount_mxn || 0)) {
          promoApplied = promo.code;
          if (promo.type === "percent") discountMultiplier = Math.max(0, 1 - (Number(promo.value) || 0));
          else if (promo.type === "free_shipping") freeShippingActive = true;
          else if (promo.type === "fixed_mxn") discountMultiplier = Math.max(0, (subtotal_mxn - Number(promo.value)) / subtotal_mxn);
        }
      }
    }

    const lineItems = validatedItems.map((item) => {
      const discountedPrice = Math.max(0, Math.round(item.realPriceCents * discountMultiplier));
      return {
        price_data: { currency: "mxn", product_data: { name: `${item.title} (Talla: ${item.size})`, metadata: { sku: item.sku, size: item.size } }, unit_amount: discountedPrice },
        quantity: item.qty,
      };
    });

    const shipping_country = shipping_mode === "envia_us" ? "US" : "MX";
    const needsZip = shipping_mode === "envia_mx" || shipping_mode === "envia_us";
    const postal_code = needsZip ? validateZip(postal_code_raw, shipping_country) : "";

    let shipping_amount_cents = 0;
    let shipping_display_name = "";

    if (shipping_mode === "pickup") {
      shipping_display_name = "Pickup (Recolección en Fábrica TJ)";
    } else if (freeShippingActive) {
      shipping_display_name = shipping_country === "US" ? "Envío Internacional (CUPÓN GRATIS)" : "Envío Nacional (CUPÓN GRATIS)";
    } else {
      try {
        const quote = await getEnviaQuote({ zip: postal_code, country: shipping_country, items_qty });
        shipping_amount_cents = quote.amount_cents; shipping_display_name = quote.label;
      } catch (err) {
        const fallback = getFallbackShipping(shipping_country, items_qty);
        shipping_amount_cents = fallback.amount_cents; shipping_display_name = fallback.label;
      }
    }

    const orderSummary = validatedItems.map((i) => `${i.qty}x ${i.sku}[${i.size}]`).join(" | ").substring(0, 450);
    const allowedPaymentMethods = process.env.STRIPE_ENABLE_OXXO === "1" ? ["card", "oxxo"] : ["card"];

    // Se pasa el front_req_id para forzar Idempotencia Real
    const idempotencyKey = makeCheckoutIdempotencyKey({
      items, shipping_mode, postal_code: postal_code || "", promo_code: promo_code_input || ""
    }, front_req_id);

    const sessionPayload = {
      payment_method_types: allowedPaymentMethods,
      line_items: lineItems,
      mode: "payment",
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      phone_number_collection: { enabled: true },
      metadata: {
        source: "score_store_v2", shipping_mode, shipping_country, postal_code: postal_code || "",
        items_qty: String(items_qty), shipping_amount_cents: String(shipping_amount_cents),
        promo_code: promoApplied, items_summary: orderSummary,
      },
    };

    if (shipping_mode !== "pickup") {
      sessionPayload.shipping_address_collection = { allowed_countries: [shipping_country] };
      sessionPayload.shipping_options = [{ shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: Math.max(0, shipping_amount_cents), currency: "mxn" }, display_name: shipping_display_name || "Envío Asegurado" } }];
    }

    const session = await stripe.checkout.sessions.create(sessionPayload, { idempotencyKey });
    return jsonResponse(200, { ok: true, url: session.url }, origin);

  } catch (error) {
    console.error("Stripe Checkout Error:", error);
    return jsonResponse(500, { ok: false, error: "Interrupción en pasarela segura." }, origin);
  }
};