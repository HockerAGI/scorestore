const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { 
  jsonResponse, safeJsonParse, getEnviaQuote, getProductDetails, getPromo,
  FALLBACK_MX_PRICE, FALLBACK_US_PRICE, normalizeQty 
} = require("./_shared");

// --- CORRECCIÓN DE DOMINIO ---
// Netlify provee process.env.URL automáticamente, pero si falla, usamos tu dominio real.
function baseUrl() { 
  return process.env.URL || "https://scorestore.netlify.app"; 
}

function toCents(mxn) { return Math.max(0, Math.round((Number(mxn) || 0) * 100)); }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const cartItems = Array.isArray(body.cart) ? body.cart : [];
    const shippingMode = String(body.shippingMode || "pickup").toLowerCase();
    const zip = String(body.zip || "").trim();
    const promoCode = String(body.promoCode || "").trim();
    
    if (!cartItems.length) return jsonResponse(400, { error: "El carrito está vacío" });

    // 1. Validación de Precios (Server-Side)
    const validItems = [];
    const promo = getPromo(promoCode); 

    for (const item of cartItems) {
        const productDb = getProductDetails(item.id); 
        
        if (!productDb) {
            console.warn(`Producto omitido (ID no válido): ${item.id}`);
            continue; 
        }

        let finalPrice = productDb.price_mxn || productDb.baseMXN;
        if (promo && promo.type === 'percent') {
            finalPrice = finalPrice * (1 - promo.value);
        }

        // Construcción segura de la URL de la imagen para Stripe
        let imgUrl = productDb.image || productDb.img || "";
        if (imgUrl && !imgUrl.startsWith("http")) {
            imgUrl = `${baseUrl()}${imgUrl}`; // Ahora usa scorestore.netlify.app
        }

        validItems.push({
            price_data: {
                currency: "mxn",
                product_data: {
                    name: productDb.name,
                    description: `Talla: ${item.selectedSize || item.size} ${promo ? `(Cupón ${promoCode})` : ''}`,
                    images: imgUrl ? [imgUrl] : [],
                    metadata: { 
                        id: item.id, 
                        size: item.selectedSize || item.size,
                        sku: productDb.sku || 'N/A'
                    }
                },
                unit_amount: toCents(finalPrice),
            },
            quantity: normalizeQty(item.quantity || item.qty),
        });
    }

    if (validItems.length === 0) return jsonResponse(400, { error: "Error: Productos no válidos." });

    // 2. Envío Dinámico
    let shipping_options = [];
    const totalQty = validItems.reduce((acc, i) => acc + i.quantity, 0);

    if (shippingMode === "pickup") {
        shipping_options = [];
    } else {
        let rateAmount = 0;
        let rateLabel = "Envío Estándar";
        let minDays = 3; let maxDays = 7;

        if (zip) {
            const country = shippingMode === 'us' ? 'US' : 'MX';
            const quote = await getEnviaQuote(zip, totalQty, country);
            
            if (quote) {
                rateAmount = quote.price || quote.mxn;
                rateLabel = `Envío ${quote.carrier} (Express)`;
                if(quote.days) maxDays = parseInt(quote.days) + 1;
            } else {
                rateAmount = shippingMode === 'us' ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
            }
        } else {
            rateAmount = shippingMode === 'us' ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
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

    // 3. Crear Sesión Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items: validItems,
      mode: "payment",
      shipping_options,
      shipping_address_collection: shippingMode !== "pickup" ? { allowed_countries: ["MX", "US"] } : undefined,
      phone_number_collection: { enabled: true },
      // Redirección corregida al dominio scorestore.netlify.app
      success_url: `${baseUrl()}/?status=success`,
      cancel_url: `${baseUrl()}/?status=cancel`,
      metadata: {
        order_source: "score_store_web",
        shipping_mode: shippingMode,
        promo_code: promo ? promoCode : "NONE",
        customer_cp: zip
      },
      allow_promotion_codes: false 
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "Error al iniciar pago. Intenta de nuevo." });
  }
};
