"use strict";

/**
 * =========================================================
 * create_checkout.js (Netlify Function)
 * Endpoint: /.netlify/functions/create_checkout
 *
 * SECURE V2026-02-21 PRO (NIVEL NASA / META):
 * - Prevención DoS por longitud de inputs.
 * - Validación cruzada estricta (Zero-Trust) contra catálogo.
 * - Corrección de Precisión Flotante en Stripe (Evita rechazos por decimales).
 * =========================================================
 */

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  normalizeQty,
  getBaseUrl,
  readJsonFile,
  getCatalogIndex,
  getEnviaQuote,
  getFallbackShipping,
  initStripe,
  validateZip,
  makeCheckoutIdempotencyKey,
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const stripe = initStripe();
    const baseUrl = getBaseUrl(event);

    const body = safeJsonParse(event.body) || {};
    const items = normalizeQty(body.items);
    
    // Sanitización y límites de longitud preventivos (Anti-DoS)
    const shipping_mode = String(body.shipping_mode || "pickup").trim().substring(0, 20);
    const postal_code_raw = String(body.postal_code || "").trim().substring(0, 15).replace(/[^a-zA-Z0-9-]/g, '');
    const promo_code_input = String(body.promo_code || "").trim().toUpperCase().substring(0, 30).replace(/[^A-Z0-9_-]/g, '');

    if (!items || !items.length) return jsonResponse(400, { ok: false, error: "El carrito está vacío." }, origin);

    const { index: catalogIndex } = getCatalogIndex();
    if (!catalogIndex || catalogIndex.size === 0) {
      return jsonResponse(500, { ok: false, error: "Catálogo maestro no disponible. Intenta en unos minutos." }, origin);
    }

    let subtotal_cents = 0;
    const items_qty = items.reduce((sum, item) => sum + item.qty, 0);

    // Protección contra manipulación de carrito masiva
    if (items_qty <= 0 || items_qty > 200) {
      return jsonResponse(400, { ok: false, error: "Cantidad de artículos no permitida para una sola transacción." }, origin);
    }

    const validatedItems = items.map((item) => {
      const dbItem = catalogIndex.get(item.sku);
      if (!dbItem) throw new Error(`Producto retirado o no reconocido: ${item.sku}`);

      const realPriceCents = Number(dbItem.price_cents || 0) || 0;
      if (realPriceCents <= 0) throw new Error(`Inconsistencia de precio en catálogo para SKU: ${item.sku}`);

      subtotal_cents += realPriceCents * item.qty;

      return {
        ...item,
        realPriceCents,
        title: dbItem.title || item.sku,
        size: String(item.size || "Unitalla").substring(0, 20)
      };
    });

    const subtotal_mxn = subtotal_cents / 100;

    // --- LÓGICA DE CUPONES (Server-Side Segura) ---
    let discountMultiplier = 1;
    let freeShippingActive = false;
    let promoApplied = "Ninguno";

    if (promo_code_input) {
      const promosData = readJsonFile("data/promos.json");
      if (promosData && Array.isArray(promosData.rules)) {
        const promo = promosData.rules.find((p) => p.code === promo_code_input && p.active);
        if (promo) {
          const now = new Date();
          const expiry = promo.expires_at ? new Date(promo.expires_at) : null;

          if ((!expiry || now <= expiry) && subtotal_mxn >= (promo.min_amount_mxn || 0)) {
            promoApplied = promo.code;

            if (promo.type === "percent") {
              discountMultiplier = Math.max(0, 1 - (Number(promo.value) || 0));
            } else if (promo.type === "free_shipping") {
              freeShippingActive = true;
            } else if (promo.type === "fixed_mxn") {
              const discountRatio = (subtotal_mxn - Number(promo.value)) / subtotal_mxn;
              discountMultiplier = Math.max(0, discountRatio);
            }
          }
        }
      }
    }

    const lineItems = validatedItems.map((item) => {
      // FIX CRÍTICO: Math.round evita decimales corruptos que Stripe rechaza
      const discountedPrice = Math.max(0, Math.round(item.realPriceCents * discountMultiplier));

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${item.title} (Talla: ${item.size})`,
            metadata: { sku: item.sku, size: item.size },
          },
          unit_amount: discountedPrice,
        },
        quantity: item.qty,
      };
    });

    // ---- RESOLUCIÓN DE LOGÍSTICA (Envía.com) ----
    const shipping_country = shipping_mode === "envia_us" ? "US" : "MX";
    const needsZip = shipping_mode === "envia_mx" || shipping_mode === "envia_us";

    const postal_code = needsZip ? validateZip(postal_code_raw, shipping_country) : "";
    if (needsZip && !postal_code) {
      return jsonResponse(400, { ok: false, error: "Código Postal / ZIP inválido para la región seleccionada." }, origin);
    }

    let shipping_amount_cents = 0;
    let shipping_display_name = "";

    if (shipping_mode === "pickup") {
      shipping_amount_cents = 0;
      shipping_display_name = "Pickup (Recolección en Fábrica TJ)";
    } else {
      if (freeShippingActive) {
        shipping_amount_cents = 0;
        shipping_display_name = shipping_country === "US" ? "Envío Internacional (CUPÓN GRATIS)" : "Envío Nacional (CUPÓN GRATIS)";
      } else {
        try {
          const quote = await getEnviaQuote({ zip: postal_code, country: shipping_country, items_qty });
          shipping_amount_cents = Math.round(Number(quote.amount_cents) || 0);
          shipping_display_name = String(quote.label || "Envío Estándar").substring(0, 50);
        } catch (err) {
          console.warn("[create_checkout] Fallo en API logística, activando fallback.", err.message);
          const fallback = getFallbackShipping(shipping_country, items_qty);
          shipping_amount_cents = Math.round(Number(fallback.amount_cents) || 0);
          shipping_display_name = String(fallback.label || "Envío Asegurado").substring(0, 50);
        }
      }
    }

    // ---- PAYLOAD A STRIPE ----
    const orderSummary = validatedItems
      .map((i) => `${i.qty}x ${i.sku}[${i.size}]`)
      .join(" | ")
      .substring(0, 450);

    const allowedPaymentMethods = process.env.STRIPE_ENABLE_OXXO === "1" ? ["card", "oxxo"] : ["card"];

    const idempotencyKey = makeCheckoutIdempotencyKey({
      items,
      shipping_mode,
      postal_code: postal_code || "",
      promo_code: promo_code_input || "",
    });

    const sessionPayload = {
      payment_method_types: allowedPaymentMethods,
      line_items: lineItems,
      mode: "payment",
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      phone_number_collection: { enabled: true },
      metadata: {
        source: "score_store_v2",
        shipping_mode,
        shipping_country,
        postal_code: postal_code || "",
        items_qty: String(items_qty),
        shipping_amount_cents: String(shipping_amount_cents),
        promo_code: promoApplied,
        items_summary: orderSummary,
      },
    };

    if (shipping_mode !== "pickup") {
      sessionPayload.shipping_address_collection = { allowed_countries: [shipping_country] };
      sessionPayload.shipping_options = [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: Math.max(0, shipping_amount_cents), currency: "mxn" },
            display_name: shipping_display_name || "Envío Asegurado",
          },
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionPayload, { idempotencyKey });

    return jsonResponse(200, { ok: true, url: session.url }, origin);
  } catch (error) {
    console.error("Stripe Checkout Error Crítico:", error);
    return jsonResponse(500, { ok: false, error: String(error.message || "Interrupción en pasarela segura. No se realizó ningún cargo.") }, origin);
  }
};