const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { 
  jsonResponse, safeJsonParse, getEnviaQuote, 
  FALLBACK_MX_PRICE, FALLBACK_US_PRICE, normalizeQty 
} = require("./_shared");

const TJ_FLAT = 0; // Recoger en fábrica gratis

function baseUrl() { return process.env.URL || "https://unicouniformes.com"; }
function toCents(mxn) { return Math.max(0, Math.round((Number(mxn) || 0) * 100)); }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const cartItems = Array.isArray(body.cart) ? body.cart : [];
    const shippingMode = String(body.shippingMode || "pickup").toLowerCase();
    const shippingData = body.shippingData || {};
    
    if (!cartItems.length) return jsonResponse(400, { error: "Carrito vacío" });
    
    // 1. Items
    const line_items = cartItems.map((item) => {
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: item.name,
            description: `Talla: ${item.selectedSize} | SKU: ${item.sku || 'N/A'}`,
            images: item.img ? [`${baseUrl()}${item.img}`] : [],
            metadata: { id: item.id, size: item.selectedSize }
          },
          unit_amount: toCents(item.price),
        },
        quantity: normalizeQty(item.quantity)
      };
    });

    // 2. Envío
    let shipping_options = [];
    const totalQty = cartItems.reduce((acc, i) => acc + normalizeQty(i.quantity), 0);

    if (shippingMode === "pickup") {
        shipping_options = [];
    } else {
        let rateAmount = 0;
        let rateLabel = "";
        let minDays = 3; let maxDays = 5;

        if (shippingMode === "tj") {
            rateAmount = TJ_FLAT; rateLabel = "Entrega Local Tijuana"; minDays = 1; maxDays = 2;
        } else if (shippingData.cp) {
            const countryCode = shippingMode === 'us' ? 'US' : 'MX';
            const quote = await getEnviaQuote(shippingData.cp, totalQty, countryCode);
            
            if (quote) {
                rateAmount = quote.mxn;
                rateLabel = `Envío ${quote.carrier} (Calculado)`;
            } else {
                // Fallback si falla API
                rateAmount = shippingMode === 'us' ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
                rateLabel = shippingMode === 'us' ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)";
            }
        } else {
            // Fallback sin CP
            rateAmount = shippingMode === 'us' ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
            rateLabel = "Envío Estándar";
        }

        shipping_options = [{
            shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: toCents(rateAmount), currency: "mxn" },
                display_name: rateLabel,
                delivery_estimate: { minimum: { unit: "business_day", value: minDays }, maximum: { unit: "business_day", value: maxDays } },
            },
        }];
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: [\"card\", \"oxxo\"],
      mode: \"payment\",
      line_items,
      shipping_options,
      shipping_address_collection: shippingMode !== \"pickup\" ? { allowed_countries: [\"MX\", \"US\"] } : undefined,
      success_url: `${baseUrl()}/?status=success`,
      cancel_url: `${baseUrl()}/?status=cancel`,
      metadata: {
        order_type: \"score_store_v11\",
        shipping_mode: shippingMode,
        customer_cp: shippingData.cp || \"\"
      }
    });

    return jsonResponse(200, { id: session.id, url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: err.message });
  }
};