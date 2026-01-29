// netlify/functions/create_checkout.js
/* =========================================================
   SCORE STORE — CREATE CHECKOUT (Stripe) v2026 PROD
   ✅ Precios server-side desde /data/catalog.json (anti-tamper)
   ✅ Shipping server-side (Envia si hay key, fallback si no)
   ✅ No modifica precios del catálogo
   ✅ Metadata lista para stripe_webhook.js (labels + supabase)
   ========================================================= */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");

const {
  handleOptions,
  jsonResponse,
  safeJsonParse,
  baseUrl,
  digitsOnly,
  normalizeQty,
  getEnviaQuote,
  validateZip,
  getFallbackShipping,
  supabaseAdmin,
} = require("./_shared");

let CATALOG_CACHE = { ts: 0, data: null };
const CATALOG_TTL_MS = 2 * 60 * 1000; // 2 min

function now() {
  return Date.now();
}

function sumQty(cart) {
  if (!Array.isArray(cart) || !cart.length) return 0;
  return cart.reduce((acc, row) => acc + normalizeQty(row?.qty || row?.quantity || 1), 0);
}

function safeStr(s, max = 140) {
  return String(s || "").trim().slice(0, max);
}

function toCentsMXN(mxn) {
  const n = Number(mxn || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

// Construye URL absoluta para imágenes (Stripe requiere URL absoluta)
function absUrl(site, path) {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith("/")) return site.replace(/\/+$/, "") + p;
  return site.replace(/\/+$/, "") + "/" + p;
}

// Evita romper por nombres con espacios en assets
function encodePathIfNeeded(url) {
  try {
    const u = new URL(url);
    u.pathname = u.pathname
      .split("/")
      .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
      .join("/");
    return u.toString();
  } catch {
    // si no es URL completa, encode parcial
    if (url.startsWith("/")) {
      return url
        .split("/")
        .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
        .join("/");
    }
    return url;
  }
}

async function loadCatalog(event) {
  const fresh = CATALOG_CACHE.data && now() - CATALOG_CACHE.ts < CATALOG_TTL_MS;
  if (fresh) return CATALOG_CACHE.data;

  const site = baseUrl(event);
  const url = site.replace(/\/+$/, "") + "/data/catalog.json";

  // 1) fetch desde el site (ideal)
  try {
    const r = await fetch(url, { headers: { "cache-control": "no-store" } });
    if (r.ok) {
      const data = await r.json();
      if (data && (Array.isArray(data.products) || Array.isArray(data))) {
        CATALOG_CACHE = { ts: now(), data };
        return data;
      }
    }
  } catch (e) {
    console.warn("[catalog] fetch fail:", e?.message || e);
  }

  // 2) fallback FS (por si fetch no funciona en tu build)
  try {
    const fs = require("fs");
    const path = require("path");
    const p1 = path.join(process.cwd(), "data", "catalog.json");
    const p2 = path.join(__dirname, "..", "..", "data", "catalog.json");
    const filePath = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null;

    if (filePath) {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      CATALOG_CACHE = { ts: now(), data };
      return data;
    }
  } catch (e) {
    console.warn("[catalog] fs fail:", e?.message || e);
  }

  return null;
}

function buildProductMap(catalog) {
  const list = Array.isArray(catalog?.products)
    ? catalog.products
    : Array.isArray(catalog)
    ? catalog
    : [];

  const map = new Map();
  for (const p of list) {
    if (!p?.id) continue;
    map.set(String(p.id), {
      id: String(p.id),
      sku: String(p.sku || ""),
      name: String(p.name || "Producto"),
      baseMXN: Number(p.baseMXN || 0),
      img: String(p.img || ""),
      images: Array.isArray(p.images) ? p.images.map(String) : [],
    });
  }
  return map;
}

async function computeShipping({ event, mode, zip, qty, country }) {
  const m = String(mode || "pickup").toLowerCase();
  const cc = String(country || (m === "us" ? "US" : "MX")).toUpperCase();

  if (m === "pickup") {
    return { ok: true, cost: 0, label: "Pickup Tijuana (Gratis)", source: "pickup" };
  }

  const z = digitsOnly(zip || "");
  if (!z || z.length < 4) {
    return { ok: false, error: "ZIP_INVALID" };
  }

  // valida zip (si hay key, si no, ok:true)
  const v = await validateZip(cc, z);
  if (v?.ok === false) {
    return { ok: false, error: v?.error || "ZIP_NOT_FOUND" };
  }

  // intenta Envia real (si hay key)
  const quote = await getEnviaQuote(z, Math.max(1, Number(qty) || 1), cc);
  if (quote?.ok && Number(quote.mxn) > 0) {
    const carrierTxt = quote.carrier ? String(quote.carrier).toUpperCase() : "ENVIA";
    const serviceTxt = quote.service ? ` ${quote.service}` : "";
    const daysTxt =
      Number.isFinite(quote.days) && quote.days > 0 ? ` · ${quote.days}d` : "";

    return {
      ok: true,
      cost: Number(quote.mxn),
      label: `${carrierTxt}${serviceTxt}${daysTxt}`.trim(),
      source: "envia",
    };
  }

  // fallback
  const fb = getFallbackShipping(cc);
  return { ok: true, cost: fb, label: "Envío (Estimación)", source: "fallback" };
}

exports.handler = async (event) => {
  // Preflight
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });
  }

  try {
    const body = safeJsonParse(event.body);

    const cart = Array.isArray(body.cart) ? body.cart : [];
    if (!cart.length) return jsonResponse(400, { ok: false, error: "CART_EMPTY" });
    if (cart.length > 60) return jsonResponse(400, { ok: false, error: "CART_TOO_LARGE" });

    // URLs
    const site = baseUrl(event);
    const success_url = safeStr(body.success_url) || `${site}/?status=success`;
    const cancel_url = safeStr(body.cancel_url) || `${site}/?status=cancel`;

    // Shipping mode + zip
    const mode = String(body.shippingMode || body.shipping_mode || body?.shipping?.mode || "pickup").toLowerCase();

    const zip =
      digitsOnly(
        body?.shippingData?.postal_code ||
          body?.shippingData?.zip ||
          body?.shippingData?.cp ||
          body?.shipping?.postal_code ||
          body?.shipping?.zip ||
          body?.shipping?.cp ||
          ""
      ) || "";

    const country =
      String(body?.shippingData?.country || body?.shipping?.country || (mode === "us" ? "US" : "MX")).toUpperCase();

    // Carga catálogo (canónico)
    const catalog = await loadCatalog(event);
    if (!catalog) return jsonResponse(500, { ok: false, error: "CATALOG_NOT_AVAILABLE" });

    const productMap = buildProductMap(catalog);

    // Construye line_items desde catálogo (anti-tamper)
    const line_items = [];
    let itemsQty = 0;

    for (const row of cart) {
      const id = String(row?.id || "").trim();
      const size = safeStr(row?.size || row?.talla || "Unitalla", 18);
      const qty = normalizeQty(row?.qty || row?.quantity || 1);

      const p = productMap.get(id);
      if (!p) return jsonResponse(400, { ok: false, error: `PRODUCT_NOT_FOUND:${id}` });

      const unitAmount = toCentsMXN(p.baseMXN);
      if (!unitAmount) return jsonResponse(400, { ok: false, error: `PRICE_INVALID:${id}` });

      // imagen
      const imgCandidate = p.images?.[0] || p.img || "";
      const imgAbs = imgCandidate ? encodePathIfNeeded(absUrl(site, imgCandidate)) : "";

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "mxn",
          unit_amount: unitAmount,
          product_data: {
            name: `${p.name} — Talla ${size}`,
            description: p.sku ? `SKU: ${p.sku}` : undefined,
            images: imgAbs ? [imgAbs] : undefined,
            metadata: {
              product_id: p.id,
              sku: p.sku || "",
              size,
            },
          },
        },
      });

      itemsQty += qty;
    }

    itemsQty = Math.max(1, itemsQty);

    // Shipping server-side (re-cotiza)
    const shippingCalc = await computeShipping({
      event,
      mode,
      zip,
      qty: itemsQty,
      country,
    });

    if (!shippingCalc.ok) {
      // si no es pickup y no hay zip válido
      return jsonResponse(400, { ok: false, error: shippingCalc.error || "SHIPPING_INVALID" });
    }

    const shippingCost = Number(shippingCalc.cost || 0);

    // ✅ Shipping como line item (simple, estable)
    if (mode !== "pickup" && shippingCost > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: toCentsMXN(shippingCost),
          product_data: {
            name: country === "US" ? "Envío internacional" : "Envío nacional",
            description: shippingCalc.label || "Envío",
          },
        },
      });
    }

    // Compact cart para metadata (no exceder)
    const compact = cart
      .slice(0, 40)
      .map((r) => `${safeStr(r?.id, 32)}:${safeStr(r?.size || "U", 6)}:${normalizeQty(r?.qty || 1)}`)
      .join("|")
      .slice(0, 450);

    // Stripe session
    const sessionParams = {
      mode: "payment",
      line_items,
      success_url,
      cancel_url,

      // Checkout UX
      billing_address_collection: "auto",
      phone_number_collection: { enabled: true },

      // Solo pedir shipping address si NO es pickup
      ...(mode !== "pickup"
        ? {
            shipping_address_collection: {
              allowed_countries: ["MX", "US"],
            },
          }
        : {}),

      // Pagos
      automatic_payment_methods: { enabled: true },
      payment_method_options: {
        oxxo: { expires_after_days: 2 }, // si tu cuenta lo soporta, lo mostrará
      },

      // Metadata para webhook + Supabase
      metadata: {
        source: "score_store",
        shipping_mode: mode,
        customer_zip: zip || "",
        customer_country: country || "",
        score_items: String(itemsQty),
        shipping_label: safeStr(shippingCalc.label || "", 120),
        shipping_source: safeStr(shippingCalc.source || "", 30),
        cart_compact: compact,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Opcional: guarda un “pending order” (no rompe si no hay supabaseAdmin)
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("orders").insert([
          {
            stripe_session_id: session.id,
            status: "checkout_created",
            currency: "mxn",
            total: null,
            shipping_mode: mode,
            customer_cp: zip || null,
            items_qty: itemsQty,
            raw_meta: JSON.stringify(sessionParams.metadata || {}),
          },
        ]);
      } catch (e) {
        console.warn("[supabase] pending insert fail:", e?.message || e);
      }
    }

    return jsonResponse(200, {
      ok: true,
      id: session.id,
      url: session.url, // main.js redirige directo si viene url
    });
  } catch (e) {
    console.error("[create_checkout] error:", e?.message || e);
    return jsonResponse(500, { ok: false, error: "CHECKOUT_FAILED" });
  }
};