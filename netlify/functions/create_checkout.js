// netlify/functions/create_checkout.js
// Creates Stripe Checkout Session for SCORE Store
// ✅ Acepta payload NUEVO y VIEJO (compat):
// - NUEVO: { orgSlug, items, mode, customer, promoCode }
//   items: [{ id, size, qty }]
// - VIEJO: { cart, shippingMode, shippingData }
//   cart: [{ id, name, price, quantity, selectedSize, sku, img }]
//
// Requiere env:
// - STRIPE_SECRET_KEY
//
// Opcional:
// - ENVIA_API_KEY (cotización dinámica si CP/ZIP existe)
// - URL / SITE_URL / DEPLOY_PRIME_URL (Netlify) para base url

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

function loadCatalog() {
  const p = path.join(process.cwd(), "data", "catalog.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function sumQty(items) {
  return (items || []).reduce((acc, it) => acc + normalizeQty(it.qty || it.quantity || 1), 0);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return jsonResponse(500, { error: "Falta STRIPE_SECRET_KEY en env" });
    }

    const body = safeJsonParse(event.body);

    // Compat payloads
    const orgSlug = String(body.orgSlug || "score-store");
    const mode = String(body.mode || body.shippingMode || "pickup").toLowerCase();

    const itemsNew = Array.isArray(body.items) ? body.items : [];
    const itemsOld = Array.isArray(body.cart) ? body.cart : [];
    const items = itemsNew.length ? itemsNew : itemsOld;

    const customer = body.customer || body.shippingData || {};
    const promoCode = String(body.promoCode || "").trim();

    if (!Array.isArray(items) || !items.length) {
      return jsonResponse(400, { error: "Carrito vacío" });
    }

    // Cargar catálogo real si viene formato NUEVO (o para normalizar todo)
    let catalog = null;
    try {
      catalog = loadCatalog();
    } catch {
      if (!itemsOld.length) {
        return jsonResponse(500, { error: "No se pudo leer /data/catalog.json" });
      }
    }

    const products = Array.isArray(catalog?.products) ? catalog.products : [];
    const getProductById = (id) => products.find((p) => p.id === id);

    const bUrl = baseUrl(event);

    const line_items = items.map((it) => {
      const id = String(it.id || "");
      const qty = normalizeQty(it.qty || it.quantity || 1);

      const p = getProductById(id);

      const name = String(p?.name || it.name || id || "Producto");
      const sku = String(p?.sku || it.sku || "");
      const size = String(it.size || it.selectedSize || (p?.sizes?.[0] || "")).trim();
      const priceMXN = Number(p?.baseMXN ?? it.price ?? 0);

      const img =
        String(
          p?.img ||
            it.img ||
            (Array.isArray(p?.images) ? p.images[0] : "") ||
            ""
        ) || "";

      const imageUrl = img ? (img.startsWith("http") ? img : `${bUrl}${img}`) : null;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name,
            description: `Talla: ${size || "N/A"}${sku ? ` · SKU: ${sku}` : ""}`,
            images: imageUrl ? [imageUrl] : [],
            metadata: { id, size, sku },
          },
          unit_amount: toCents(priceMXN),
        },
        quantity: qty,
      };
    });

    // ---- Shipping ----
    const totalQty = sumQty(items);

    let shippingAmount = 0;
    let shippingLabel = "Recoger en fábrica";
    let minDays = 1;
    let maxDays = 2;

    const rawZip = String(customer.postal_code || customer.cp || customer.zip || "").trim();
    const zip = digitsOnly(rawZip);

    if (mode === "pickup") {
      shippingAmount = 0;
      shippingLabel = "Recoger en fábrica (Tijuana)";
      minDays = 1;
      maxDays = 1;
    } else if (mode === "tj") {
      shippingAmount = 200;
      shippingLabel = "Local Express Tijuana";
      minDays = 1;
      maxDays = 2;
    } else {
      const countryCode = mode === "us" ? "US" : "MX";

      let quoted = null;
      if (zip && zip.length >= 4) {
        quoted = await getEnviaQuote(zip, totalQty, countryCode);
      }

      if (quoted?.mxn) {
        shippingAmount = Number(quoted.mxn || 0);
        shippingLabel = `Envío (${quoted.carrier || "Envia"})`;
        minDays = 3;
        maxDays = 7;
      } else {
        shippingAmount = mode === "us" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
        shippingLabel = mode === "us" ? "Envío USA (Estimado)" : "Envío Nacional (Estimado)";
        minDays = 3;
        maxDays = 7;
      }
    }

    const shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: toCents(shippingAmount), currency: "mxn" },
          display_name: shippingLabel,
          delivery_estimate: {
            minimum: { unit: "business_day", value: minDays },
            maximum: { unit: "business_day", value: maxDays },
          },
        },
      },
    ];

    const successUrl = `${bUrl}/?status=success`;
    const cancelUrl = `${bUrl}/?status=cancel`;

    // ✅ Campo promoCode existe (no aplicamos cupón automático aún)
    // Lo guardamos en metadata para auditoría/activación futura.
    const payment_method_types = mode === "us" ? ["card"] : ["card", "oxxo"];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types,
      line_items,
      shipping_options,
      shipping_address_collection:
        mode === "pickup" ? undefined : { allowed_countries: ["MX", "US"] },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        order_type: "score_store",
        org_slug: orgSlug,

        // ✅ compat: dos nombres para webhooks viejos/nuevos
        shipping_mode: mode,
        score_mode: mode,

        customer_cp: zip || "",
        score_items: String(totalQty),
        promo_code: promoCode || "",
      },
    });

    return jsonResponse(200, { id: session.id, url: session.url });
  } catch (err) {
    console.error("[create_checkout] error:", err);
    return jsonResponse(500, { error: err?.message || "Checkout error" });
  }
};