/* =========================================================
   SCORE STORE — Netlify Function: create_checkout
   Route: /api/checkout  ->  /.netlify/functions/create_checkout

   ✅ Alineado a BLOQUE 1/2/3:
   - Frontend manda: { items:[{sku,qty,size}], shipping_mode:"pickup|delivery", postal_code:"", promo_code:"" }
   - Catálogo: data/catalog.json (products[].sku, title, price_cents, images[])
   - Stripe Checkout: card + oxxo

   ENV:
   - STRIPE_SECRET_KEY (required)
   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (optional: guardar order)
   - ENVIA_API_KEY (optional: cotización real Envia; si no existe, usa fallback)
   ========================================================= */

const Stripe = require("stripe");
const {
  handleOptions,
  json,
  readJson,
  clampInt,
  getBaseUrl,
  absImageUrl,
  supabaseAdmin,
  getEnviaQuote,
  getFallbackShipping,
  isUSZip,
} = require("./_shared");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function normalizeShippingMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "delivery") return "delivery";
  return "pickup";
}

async function loadCatalog(event) {
  // 1) Try local file (cuando Netlify incluye el repo completo en build)
  try {
    const local = await readJson("data/catalog.json");
    if (local && Array.isArray(local.products)) return local;
  } catch (_) {}

  // 2) Fallback: fetch del catálogo desde el sitio (si el bundle no incluye data/)
  const baseUrl = getBaseUrl(event);
  const url = `${baseUrl}/data/catalog.json`;
  const res = await fetch(url, { headers: { "cache-control": "no-store" } });
  if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
  const data = await res.json();
  if (!data || !Array.isArray(data.products)) throw new Error("catalog invalid");
  return data;
}

function getProductPriceCents(p) {
  if (Number.isFinite(Number(p.price_cents))) return Math.round(Number(p.price_cents));
  if (Number.isFinite(Number(p.baseMXN))) return Math.round(Number(p.baseMXN) * 100);
  if (Number.isFinite(Number(p.priceMXN))) return Math.round(Number(p.priceMXN) * 100);
  return 0;
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" }, event);
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { error: "Missing STRIPE_SECRET_KEY" }, event);
    }

    const body = JSON.parse(event.body || "{}");
    const baseUrl = getBaseUrl(event);

    const itemsIn = Array.isArray(body.items) ? body.items : [];
    const shipping_mode = normalizeShippingMode(body.shipping_mode);
    const postal_code = String(body.postal_code || "").trim();
    const promo_code = String(body.promo_code || "").trim();

    if (!itemsIn.length) {
      return json(400, { error: "No items" }, event);
    }

    // Normaliza items
    const items = itemsIn
      .map((it) => ({
        sku: String(it.sku || "").trim(),
        qty: clampInt(it.qty, 1, 99),
        size: String(it.size || "").trim(),
      }))
      .filter((it) => it.sku);

    if (!items.length) {
      return json(400, { error: "Invalid items" }, event);
    }

    // Shipping validation
    if (shipping_mode === "delivery") {
      if (!/^\d{5}$/.test(postal_code)) {
        return json(400, { error: "postal_code invalid (5 digits)" }, event);
      }
    }

    // Load catalog
    const catalog = await loadCatalog(event);
    const products = Array.isArray(catalog.products) ? catalog.products : [];

    const line_items = [];
    let subtotal_cents = 0;

    for (const it of items) {
      const p = products.find((x) => x.sku === it.sku || x.id === it.sku);
      if (!p) {
        return json(400, { error: `Unknown sku: ${it.sku}` }, event);
      }

      const unit_amount = getProductPriceCents(p);
      if (!unit_amount || unit_amount < 50) {
        return json(400, { error: `Invalid price for sku: ${it.sku}` }, event);
      }

      const name = String(p.title || p.name || "Producto");
      const images = Array.isArray(p.images) ? p.images : (p.img ? [p.img] : []);
      const img0 = images[0] ? absImageUrl(baseUrl, images[0]) : null;

      line_items.push({
        quantity: it.qty,
        price_data: {
          currency: "mxn",
          unit_amount,
          product_data: {
            name: it.size ? `${name} (${it.size})` : name,
            images: img0 ? [img0] : [],
            metadata: {
              sku: it.sku,
              size: it.size || "",
              section: String(p.sectionId || p.categoryId || ""),
            },
          },
        },
      });

      subtotal_cents += unit_amount * it.qty;
    }

    // Shipping quote (delivery)
    let shipping_amount_mxn = 0;
    let shipping_provider = "none";

    if (shipping_mode === "delivery") {
      const to_country = isUSZip(postal_code) ? "US" : "MX";

      let quote = null;
      if (process.env.ENVIA_API_KEY) {
        quote = await getEnviaQuote({
          to_postal_code: postal_code,
          to_country,
          items,
        });
        shipping_provider = "envia";
      }

      if (!quote) {
        quote = getFallbackShipping({ postal_code, items });
        shipping_provider = "fallback";
      }

      shipping_amount_mxn = Math.round(quote?.amount_mxn ?? 0);

      if (!shipping_amount_mxn || shipping_amount_mxn < 1) {
        return json(400, { error: "No se pudo cotizar envío. Intenta de nuevo." }, event);
      }

      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: shipping_amount_mxn * 100,
          product_data: {
            name: "Envío",
            metadata: {
              shipping_mode: "delivery",
              postal_code,
              provider: shipping_provider,
            },
          },
        },
      });
    }

    // Stripe Checkout URLs
    const success_url = `${baseUrl}/?success=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${baseUrl}/?canceled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      metadata: {
        app: "scorestore",
        shipping_mode,
        postal_code: shipping_mode === "delivery" ? postal_code : "",
        promo_code: promo_code || "",
      },
    });

    // Save order (best effort)
    if (supabaseAdmin) {
      try {
        const total_cents = subtotal_cents + shipping_amount_mxn * 100;
        const orderRow = {
          id: session.id,
          stripe_session_id: session.id,
          status: "created",
          currency: "MXN",
          amount_total_cents: total_cents,
          subtotal_cents,
          shipping_amount_mxn,
          shipping_provider,
          shipping_mode,
          postal_code: shipping_mode === "delivery" ? postal_code : null,
          promo_code: promo_code || null,
          items,
          created_at: new Date().toISOString(),
        };

        await supabaseAdmin.from("orders").insert(orderRow);
      } catch (e) {
        console.warn("orders insert failed:", e?.message || e);
      }
    }

    return json(200, { url: session.url }, event);
  } catch (err) {
    console.error("create_checkout error:", err);
    return json(500, { error: "Checkout init failed" }, event);
  }
};
