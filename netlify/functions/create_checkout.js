const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const promos = require("../../data/promos.json");
const {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly
} = require("./_shared");

const getPromo = (code) => {
  if (!code || !Array.isArray(promos?.rules)) return null;
  return promos.rules.find(
    p => p.active && p.code === String(code).toUpperCase()
  );
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method Not Allowed" });
    }

    const body = safeJsonParse(event.body, {});
    const promo = getPromo(body.promo);

    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);

    const cartCheck = validateCartItems(body.items);
    if (!cartCheck.ok) return jsonResponse(400, cartCheck);

    // --- Construir line items seguros ---
    const line_items = cartCheck.items.map(i => {
      const p = map[i.id];
      if (!p) throw new Error(`Producto inválido: ${i.id}`);

      const qty = Math.min(Math.max(parseInt(i.qty, 10) || 1, 1), 10);
      const size = String(i.size || "").toUpperCase();

      if (!p.sizes.includes(size)) {
        throw new Error(`Talla inválida para ${p.name}`);
      }

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: p.name,
            description: `Talla ${size}`
          },
          unit_amount: p.baseMXN * 100
        },
        quantity: qty
      };
    });

    // --- Descuentos (Cupón) ---
    let discounts = [];
    if (promo && promo.type !== "free_shipping") {
      const coupon = await stripe.coupons.create(
        promo.type === "percent"
          ? { percent_off: promo.value * 100, duration: "once" }
          : { amount_off: promo.value * 100, currency: "mxn", duration: "once" }
      );
      discounts = [{ coupon: coupon.id }];
    }

    // --- Lógica de Envío ---
    let shipping_options = [];
    const isFreeShipping = promo?.type === "free_shipping";
    
    // 1. Envío Nacional (MX)
    if (body.mode === "mx") {
      if (isFreeShipping) {
        shipping_options = [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "mxn" },
            display_name: "Envío Gratis (Promoción)"
          }
        }];
      } else {
        // Cálculo de peso real (sumando cantidades)
        const totalQty = cartCheck.items.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 1), 0);
        const zip = digitsOnly(body?.to?.postal_code);
        
        let cost = 250; // Costo base fallback
        const quote = await getEnviaQuote(zip, totalQty);
        if (quote?.mxn) cost = quote.mxn;

        shipping_options = [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: cost * 100, currency: "mxn" },
            display_name: "Envío Nacional"
          }
        }];
      }
    } 
    // 2. Local Express (Tijuana)
    else if (body.mode === "tj") {
       shipping_options = [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: isFreeShipping ? 0 : 20000, currency: "mxn" }, // 200.00 MXN
            display_name: isFreeShipping ? "Envío Local Gratis" : "Entrega Local Express (Tijuana)"
          }
        }];
    }
    // 3. Pickup: No se agregan shipping_options (Stripe no cobrará envío)

    // --- Crear sesión Stripe ---
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,
      discounts: discounts.length ? discounts : undefined,
      shipping_options: shipping_options.length ? shipping_options : undefined,
      success_url: "https://scorestore.netlify.app/?success=true",
      cancel_url: "https://scorestore.netlify.app/?cancel=true",
      metadata: {
        promo: promo?.code || "",
        shipping_mode: body.mode || "",
        zip: digitsOnly(body?.to?.postal_code)
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return jsonResponse(400, { error: err.message });
  }
};