/* =========================================================
   SCORE STORE — CREATE CHECKOUT (2026_PROD_UNIFIED · REAL)
   - Precios SERVER-SIDE desde /data/catalog.json (no confiar frontend)
   - Envío: prioridad Envia (rate) -> fallback estimación si falla
   - Alineado a /js/main.js (frontend): POST /.netlify/functions/create_checkout
   - Stripe Checkout Session (MX: card+oxxo | US: card)
   ========================================================= */

const fs = require("fs");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  jsonResponse,
  safeJsonParse,
  validateZip,
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

// -----------------------------------------
// Carga robusta del catálogo (real)
// -----------------------------------------
function readCatalog() {
  const candidates = [
    path.resolve(__dirname, "../../data/catalog.json"),
    path.resolve(__dirname, "../data/catalog.json"),
    path.resolve(process.cwd(), "data/catalog.json"),
    path.resolve(process.cwd(), "public/data/catalog.json"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.products)) return data;
      }
    } catch (_) {}
  }
  return null;
}

function safeStr(s, max = 140) {
  return String(s || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function safeId(s, max = 80) {
  return String(s || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, max);
}

function resolveImageUrl(bUrl, img) {
  if (!img) return null;
  const s = String(img);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `${bUrl}${s.startsWith("/") ? s : `/${s}`}`;
}

function getProductPriceFromCatalog(catalog, id, fallbackPrice) {
  try {
    const pid = String(id || "");
    const p = catalog?.products?.find((x) => String(x.id) === pid);
    const val = Number(p?.baseMXN);
    if (Number.isFinite(val) && val > 0) return val;
  } catch (_) {}
  const fb = Number(fallbackPrice);
  return Number.isFinite(fb) && fb > 0 ? fb : 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "Stripe no está configurado (STRIPE_SECRET_KEY faltante)." });
  }

  try {
    const body = safeJsonParse(event.body);

    const mode = String(body.shippingMode || "pickup").toLowerCase(); // pickup | mx | us
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const zip = digitsOnly(body.shippingData?.postal_code || "");
    const promoCode = safeStr(body.promoCode || "", 24);

    if (!cart.length) return jsonResponse(400, { error: "Carrito vacío" });

    const catalog = readCatalog();
    if (!catalog) console.warn("catalog.json no encontrado: se usará fallback desde payload (si existe).");

    const bUrl = baseUrl(event);

    // 1) line_items con precio server-side
    const line_items = cart.map((it) => {
      const id = safeId(it.id);
      const size = safeStr(it.size || "Unitalla", 40);
      const name = safeStr(it.name || "Producto", 120);

      const realPrice = getProductPriceFromCatalog(catalog, it.id, it.price);
      const imgUrl = resolveImageUrl(bUrl, it.img);
      const images = imgUrl ? [imgUrl] : [];

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name,
            description: `Talla: ${size}`,
            images,
            metadata: { id, size },
          },
          unit_amount: toCents(realPrice),
        },
        quantity: normalizeQty(it.qty),
      };
    });

    // 2) shipping (Envia -> fallback)
    let shippingAmount = 0;
    let shippingLabel = "Pickup Tijuana (Gratis)";
    let country = "MX";

    const totalQty = cart.reduce((a, b) => a + normalizeQty(b.qty), 0);

    if (mode !== "pickup") {
      country = mode === "us" ? "US" : "MX";

      if (!zip || zip.length < 4) return jsonResponse(400, { error: "Código postal inválido" });

      const zipCheck = await validateZip(country, zip);
      if (zipCheck && zipCheck.ok === false) {
        return jsonResponse(400, { error: "Código postal no encontrado" });
      }

      let quoted = null;
      try {
        const estWeight = totalQty * 0.5;
        const estH = 10 + totalQty * 2;
        quoted = await getEnviaQuote(zip, totalQty, country, estWeight, 30, estH, 25);
      } catch (_) {
        quoted = null;
      }

      if (quoted?.mxn && Number(quoted.mxn) > 0) {
        shippingAmount = Number(quoted.mxn);
        shippingLabel = "Envío (Cotizado)";
      } else {
        shippingAmount = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
        shippingLabel = "Envío (Estimación)";
      }
    }

    const payment_method_types = mode === "us" ? ["card"] : ["card", "oxxo"];

    // ✅ CRÍTICO: Para que el webhook tenga address/phone y pueda generar guía Envia
    const requireShippingAddress = mode !== "pickup";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types,
      line_items,

      ...(requireShippingAddress
        ? {
            shipping_address_collection: { allowed_countries: mode === "us" ? ["US"] : ["MX"] },
            phone_number_collection: { enabled: true },
            customer_creation: "always",
          }
        : {
            customer_creation: "if_required",
          }),

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
        shipping_mode: safeStr(mode, 20),
        customer_zip: safeStr(zip, 12),
        country: safeStr(country, 2),
        items_qty: String(Math.max(1, totalQty)),
        promo_code: promoCode || "",
      },
    });

    return jsonResponse(200, { id: session.id, url: session.url });
  } catch (err) {
    console.error("Checkout Error:", err?.message || err);
    return jsonResponse(500, { error: "Error creando pago. Intenta de nuevo." });
  }
};