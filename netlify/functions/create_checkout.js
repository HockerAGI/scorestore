// netlify/functions/create_checkout.js
const fs = require("fs");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {
  jsonResponse,
  safeJsonParse,
  getEnviaQuote,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  normalizeQty,
  digitsOnly,
  baseUrl,
} = require("./_shared");

function toCents(mxn) {
  return Math.max(0, Math.round((Number(mxn) || 0) * 100));
}

// Carga robusta del catálogo
function getProductPrice(id, fallbackPrice) {
  try {
    // En Lambda/Netlify, la ruta puede variar. Intentamos resolverla.
    const catalogPath = path.resolve(__dirname, "../../data/catalog.json");
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, "utf8");
      const data = JSON.parse(raw);
      const product = data.products.find(p => p.id === id);
      if (product) return product.baseMXN;
    }
  } catch (e) {
    console.warn("Catalog load error:", e.message);
  }
  return fallbackPrice || 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const mode = String(body.shippingMode || "pickup").toLowerCase();
    const items = body.cart || [];
    const zip = digitsOnly(body.shippingData?.postal_code);
    
    if (!items.length) return jsonResponse(400, { error: "Carrito vacío" });

    // 1. Construir Line Items (Precios del servidor)
    const bUrl = baseUrl(event);
    const line_items = items.map((it) => {
      // Seguridad: Recuperar precio real del catálogo, no confiar en el frontend
      const realPrice = getProductPrice(it.id, it.price); 
      
      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: it.name,
            description: `Talla: ${it.size}`,
            images: it.img ? [(it.img.startsWith("http") ? it.img : `${bUrl}${it.img}`)] : [],
            metadata: { id: it.id, size: it.size }
          },
          unit_amount: toCents(realPrice),
        },
        quantity: normalizeQty(it.qty),
      };
    });

    // 2. Calcular Envío (Lógica idéntica a quote_shipping)
    let shippingAmount = 0;
    let shippingLabel = "Recoger en Tienda";
    
    if (mode === "pickup") {
      shippingAmount = 0;
    } else {
      const country = mode === "us" ? "US" : "MX";
      const totalQty = items.reduce((a,b) => a + normalizeQty(b.qty), 0);
      
      // Intentar cotizar real para cobrar lo justo
      try {
        const estWeight = totalQty * 0.5;
        const quote = await getEnviaQuote(zip, totalQty, country, estWeight, 30, 5 + (totalQty*2), 25);
        if (quote?.mxn) {
          shippingAmount = Number(quote.mxn);
          shippingLabel = `Envío (${quote.carrier})`;
        } else {
          throw new Error("No quote");
        }
      } catch (e) {
        // Fallback
        shippingAmount = (country === "US") ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
        shippingLabel = "Envío Estándar";
      }
    }

    // 3. Crear Sesión Stripe
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: mode === "us" ? ["card"] : ["card", "oxxo"],
      line_items,
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: toCents(shippingAmount), currency: "mxn" },
            display_name: shippingLabel,
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 7 },
            },
          },
        },
      ],
      success_url: `${bUrl}/?status=success`,
      cancel_url: `${bUrl}/?status=cancel`,
      metadata: {
        order_type: "score_store",
        shipping_mode: mode,
        customer_zip: zip
      },
    });

    return jsonResponse(200, { id: session.id, url: session.url });

  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: "Error creando pago. Intenta de nuevo." });
  }
};
