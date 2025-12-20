// netlify/functions/create_checkout.js
// Secure Stripe Checkout creation (MXN) + shipping rules.
// IMPORTANT: Prices are validated server-side using data/catalog.json.

const Stripe = require("stripe");

const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  isMxPostal,
  isTijuanaPostal,
  looksLikeTijuana,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeSubtotalMXN,
  applyPromoToTotals,
  getBaseUrlFromEnv,
  quoteEnviaMXN,
} = require("./_shared");

const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

function summarizeItems(items) {
  return items
    .map((it) => `${toStr(it.id)}:${toStr(it.size || "NA")}x${Number(it.qty || 0)}`)
    .slice(0, 12)
    .join("|");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido." }, { Allow: "POST" });
  }

  const secretKey = toStr(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) return jsonResponse(500, { ok: false, error: "Falta STRIPE_SECRET_KEY en Netlify env." });

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  const body = safeJsonParse(event.body, {});
  const items = body?.items || body?.cart || [];
  const promoCode = toStr(body?.promoCode || body?.promo || "");
  const ship = body?.shipping || {};
  const shipMode = toStr(ship?.mode || body?.shippingMode || "envia"); // pickup | tijuana_delivery | envia
  const to = ship?.to || body?.shipTo || {};

  const v = validateCartItems(items);
  if (!v.ok) return jsonResponse(400, { ok: false, error: v.error });

  const catalog = await loadCatalog();
  const productMap = productMapFromCatalog(catalog);

  const sizeCheck = validateSizes(items, productMap);
  if (!sizeCheck.ok) return jsonResponse(400, { ok: false, error: sizeCheck.error });

  // Subtotal from catalog (never trust client price)
  const subtotalMXN = computeSubtotalMXN(items, productMap);
  if (subtotalMXN <= 0) return jsonResponse(400, { ok: false, error: "Subtotal inválido." });

  // Shipping
  let shippingMXN = 0;
  let finalShipMode = shipMode || "envia";

  const postal = toStr(to?.postal_code || to?.postalCode);
  const state = upper(to?.state_code || to?.state);
  const city = toStr(to?.city);
  const address1 = toStr(to?.address1 || to?.street);

  const likelyTijuana = (isTijuanaPostal(postal) && state === "BC") || (looksLikeTijuana(city) && state === "BC");

  if (finalShipMode === "pickup") {
    shippingMXN = 0;
  } else if (finalShipMode === "tijuana_delivery") {
    // Only allow the $200 local delivery if it looks like Tijuana.
    if (likelyTijuana) {
      shippingMXN = TIJUANA_DELIVERY_MXN;
    } else {
      // fall back to "envia" rules
      finalShipMode = "envia";
    }
  }

  if (finalShipMode === "envia") {
    // If address incomplete, charge minimum (and Stripe will still collect shipping address).
    if (!isMxPostal(postal) || !state || !city || !address1) {
      shippingMXN = MIN_OUTSIDE_TJ_MXN;
    } else {
      const q = await quoteEnviaMXN({
        to: { postal_code: postal, state_code: state, city, address1 },
        items,
        productMap,
      });

      if (!q.ok) {
        shippingMXN = MIN_OUTSIDE_TJ_MXN;
      } else {
        const raw = Number(q.quote.mxn || 0);
        shippingMXN = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05));
      }
    }
  }

  // Apply promo (can modify shipping)
  const promo = await applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN });
  const totalMXN = Math.max(0, Math.round(promo.totalMXN));

  if (totalMXN <= 0) {
    return jsonResponse(400, { ok: false, error: "Total inválido (revisa cupón/promos)." });
  }

  // URLs
  const baseUrl = getBaseUrlFromEnv() || (event.headers?.host ? `https://${event.headers.host}` : "");
  if (!baseUrl) return jsonResponse(500, { ok: false, error: "No se pudo determinar la URL base del sitio." });

  const success_url = `${baseUrl}/?success=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = `${baseUrl}/?canceled=1`;

  // Stripe line items: single item with server-calculated total (prevents any mismatch)
  const line_items = [
    {
      price_data: {
        currency: "mxn",
        product_data: {
          name: "Pedido — SCORE Store",
          description: "Subtotal + envío (según reglas) y cupón (si aplica).",
        },
        unit_amount: Math.round(totalMXN) * 100,
      },
      quantity: 1,
    },
  ];

  const metadata = {
    items_summary: summarizeItems(items),
    promo_code: upper(promo.code || ""),
    discount_mxn: String(Math.round(promo.discountMXN || 0)),
    subtotal_mxn: String(Math.round(subtotalMXN)),
    shipping_mxn: String(Math.round(promo.shippingMXN || 0)),
    total_mxn: String(Math.round(totalMXN)),
    shipping_mode: finalShipMode,
    ship_postal: postal,
    ship_state: state,
    ship_city: city,
  };

  try {
    const sessionParams = {
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,
      success_url,
      cancel_url,
      phone_number_collection: { enabled: true },
      metadata,
    };

    // Only collect shipping address when we actually ship.
    if (finalShipMode !== "pickup") {
      sessionParams.shipping_address_collection = { allowed_countries: ["MX"] };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return jsonResponse(200, { ok: true, url: session.url });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: `Stripe error: ${err?.message || "unknown"}` });
  }
};