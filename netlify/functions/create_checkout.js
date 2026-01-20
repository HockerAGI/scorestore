// netlify/functions/create_checkout.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, safeJsonParse, supabaseAdmin, FALLBACK_MX_PRICE, FALLBACK_US_PRICE } = require("./_shared");

const TJ_FLAT = 200;

function baseUrl() {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || "http://localhost:8888";
}

function toCents(mxn) {
  const n = Number(mxn || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.round(safe * 100));
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const cartItems = Array.isArray(body.items) ? body.items : [];
    const discountFactor = Math.min(0.9, Math.max(0, Number(body.discountFactor || 0))); // 0..0.9
    const mode = String(body.mode || "pickup").toLowerCase();

    if (!cartItems.length) return jsonResponse(400, { error: "Carrito vacío" });
    if (!supabaseAdmin) return jsonResponse(500, { error: "Supabase no configurado en Functions" });

    // Org
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", "score-store")
      .single();

    if (orgErr || !org?.id) return jsonResponse(500, { error: "Tienda no configurada (org missing)" });

    // Productos DB (IDs deben ser UUID si usas DB IDs; si usas SKU, ajustamos)
    const ids = cartItems.map(i => String(i.id));
    const { data: products, error: pErr } = await supabaseAdmin
      .from("products")
      .select("id, sku, name, price, active, image_url")
      .in("id", ids)
      .eq("active", true);

    if (pErr) return jsonResponse(500, { error: pErr.message });
    if (!products || !products.length) return jsonResponse(400, { error: "Productos no disponibles" });

    const line_items = cartItems.map((item) => {
      const dbProd = products.find(p => String(p.id) === String(item.id));
      if (!dbProd) return null;

      const basePrice = Number(dbProd.price || 0);
      const finalPrice = basePrice * (1 - discountFactor);
      const unit_amount = toCents(finalPrice);

      const cleanName = String(dbProd.name || "Producto");
      const pct = discountFactor > 0 ? ` (${Math.round(discountFactor * 100)}% OFF)` : "";

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${cleanName}${pct}`,
            description: `Talla: ${String(item.size || "Unitalla")} | SKU: ${String(dbProd.sku || "").trim()}`,
            images: dbProd.image_url ? [`${baseUrl()}${dbProd.image_url}`] : [],
            metadata: { product_id: dbProd.id }
          },
          unit_amount,
        },
        quantity: Math.max(1, Number(item.qty || 1))
      };
    }).filter(Boolean);

    if (!line_items.length) return jsonResponse(400, { error: "Carrito inválido" });

    // Shipping
    let shipping_options = [];
    if (mode !== "pickup") {
      let cost = FALLBACK_MX_PRICE;
      let label = "Envío Nacional (MX)";

      if (mode === "tj") {
        cost = TJ_FLAT;
        label = "Local Express (Tijuana)";
      } else if (mode === "us") {
        cost = Number(body.shipping?.cost || FALLBACK_US_PRICE);
        label = "Envío Internacional (USA)";
      } else {
        cost = Number(body.shipping?.cost || FALLBACK_MX_PRICE);
        label = "Envío Nacional (MX)";
      }

      cost = Math.max(0, cost);

      if (cost > 0) {
        shipping_options = [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: toCents(cost), currency: "mxn" },
            display_name: label,
          }
        }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      mode: "payment",
      line_items,
      shipping_options,
      shipping_address_collection: mode === "pickup" ? undefined : { allowed_countries: ["MX", "US"] },
      success_url: `${baseUrl()}/?status=success`,
      cancel_url: `${baseUrl()}/?status=cancel`,
      metadata: {
        org_id: org.id,
        score_mode: mode,
        discount_applied: String(discountFactor),
      }
    });

    return jsonResponse(200, { url: session.url });
  } catch (err) {
    console.error("Checkout Error:", err);
    return jsonResponse(500, { error: err?.message || "Checkout failed" });
  }
};