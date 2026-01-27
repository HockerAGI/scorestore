// netlify/functions/create_checkout.js
// Crea Stripe Checkout Session (real)
// - Recalcula precios en servidor desde data/catalog.json (anti-manipulación)
// - Aplica promo server-side (ej: SCORE25)
// - Cotiza envío real con Envia.com si shippingMode = mx/us
// - Si faltan specs por SKU en ÚNICO OS (Supabase), devuelve 422 (NO cobra envío inventado)
// - Devuelve { url } para redirigir al usuario a Stripe Checkout

import fs from "fs";
import path from "path";
import Stripe from "stripe";

import {
  ok,
  fail,
  parseJSON,
  env,
  corsHeaders,
  normalizeZip,
  clampInt,
  getSupabaseAnon,
  getSupabaseService,
  enviaQuote
} from "./_shared.js";

/* ---------------------- helpers ------------------------ */
function getSiteUrl(event) {
  const fromEnv = process.env.SITE_URL || process.env.URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = event?.headers?.host;
  if (host) return `https://${host}`;
  return "https://scorestore.netlify.app";
}

function readCatalog() {
  // Netlify functions corren desde /var/task, por eso resolvemos relativo al root.
  // Intentamos rutas típicas.
  const candidates = [
    path.resolve(process.cwd(), "data", "catalog.json"),
    path.resolve("/var/task", "data", "catalog.json"),
    path.resolve(process.cwd(), "..", "data", "catalog.json")
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const json = JSON.parse(raw);
        const products = Array.isArray(json?.products) ? json.products : [];
        return products;
      }
    } catch {
      // sigue intentando
    }
  }
  return [];
}

function toCentsMXN(mxn) {
  const n = Number(mxn || 0);
  return Math.max(0, Math.round(n * 100));
}

function normalizeShippingMode(mode) {
  const m = String(mode || "pickup").toLowerCase();
  if (m === "mx" || m === "us" || m === "pickup") return m;
  return "pickup";
}

function buildSkuItems(cart) {
  // Convierte cart[] a items de envío con SKU = id
  return cart.map((i) => ({
    sku: String(i.id),
    qty: clampInt(i.qty, 1, 50)
  }));
}

/* ---------------------- promo -------------------------- */
function applyPromoToUnitPrice({ unitMXN, promoCode }) {
  const code = String(promoCode || "").trim().toUpperCase();

  // Ejemplo real: SCORE25 (25% off)
  if (code === "SCORE25") {
    const discounted = Math.round(Number(unitMXN) * 0.75);
    return Math.max(0, discounted);
  }

  return Number(unitMXN);
}

/* ---------------------- shipping ----------------------- */
async function computeRealShippingMXN({ shippingMode, zip, cart }) {
  if (shippingMode === "pickup") return 0;

  const z = normalizeZip(zip);
  if (!z) {
    // No adivinamos: si quieren envío, CP requerido.
    throw Object.assign(new Error("CP requerido para envío"), { status: 422 });
  }

  const country = shippingMode === "us" ? "US" : "MX";
  const items = buildSkuItems(cart);

  // Pull specs from Supabase ÚNICO OS
  const supabase = getSupabaseAnon();
  const skuIds = items.map((x) => x.sku);

  const { data: products, error } = await supabase
    .from("products")
    .select("id, weight_kg, length_cm, width_cm, height_cm, declared_value_mxn")
    .in("id", skuIds);

  if (error) {
    throw Object.assign(new Error("Error consultando productos (ÚNICO OS)"), { status: 500 });
  }

  const map = {};
  for (const p of products || []) map[p.id] = p;

  const packages = [];
  for (const it of items) {
    const spec = map[it.sku];
    if (!spec) {
      throw Object.assign(
        new Error(`Faltan specs del SKU ${it.sku}. Configúralos en ÚNICO OS`),
        { status: 422 }
      );
    }

    // Validación estricta (no inventamos)
    const w = Number(spec.weight_kg);
    const l = Number(spec.length_cm);
    const wd = Number(spec.width_cm);
    const h = Number(spec.height_cm);

    if (![w, l, wd, h].every((n) => Number.isFinite(n) && n > 0)) {
      throw Object.assign(
        new Error(`Specs incompletos del SKU ${it.sku} (peso/dimensiones)`),
        { status: 422 }
      );
    }

    for (let k = 0; k < clampInt(it.qty, 1, 50); k++) {
      packages.push({ weight: w, length: l, width: wd, height: h });
    }
  }

  // Envia quote payload (estándar)
  const enviaPayload = {
    origin: { country: "MX", postalCode: "22400" }, // base Tijuana (ajústalo si aplica)
    destination: { country, postalCode: z },
    packages,
    shipment: { carrier: "fedex", type: "package" }
  };

  const rates = await enviaQuote(enviaPayload);
  if (!rates || !Array.isArray(rates) || rates.length === 0) {
    throw Object.assign(new Error("No hay tarifas disponibles para este destino"), { status: 404 });
  }

  const best = rates.sort((a, b) => Number(a.totalAmount) - Number(b.totalAmount))[0];
  const amount = Number(best.totalAmount || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    // si Envia regresa 0 o inválido, NO cobramos fake
    throw Object.assign(new Error("Cotización inválida de Envia"), { status: 500 });
  }

  return Math.round(amount);
}

/* ---------------------- handler ------------------------ */
export async function handler(event) {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders() };
  }

  if (event.httpMethod !== "POST") {
    return fail(405, "Method not allowed");
  }

  try {
    const stripeSecret = env("STRIPE_SECRET_KEY", { required: true });
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    const body = parseJSON(event.body);

    const cart = Array.isArray(body.cart) ? body.cart : [];
    const shippingMode = normalizeShippingMode(body.shippingMode);
    const zip = String(body.zip || "").trim();
    const promoCode = String(body.promoCode || "").trim();

    if (!cart.length) return fail(422, "Carrito vacío");

    // Leer catálogo real para reconstruir precios
    const products = readCatalog();
    if (!products.length) {
      return fail(500, "No se pudo leer catalog.json en el servidor");
    }

    // Reconstruir line items desde catálogo (anti-manipulación)
    const lineItems = [];
    for (const item of cart) {
      const id = String(item.id || "").trim();
      const size = String(item.size || "M").trim().toUpperCase();
      const qty = clampInt(item.qty, 1, 50);

      const p = products.find((x) => String(x.id) === id);
      if (!p) return fail(422, `Producto inválido: ${id}`);

      const baseMXN = Number(p.baseMXN || p.price || 0);
      if (!Number.isFinite(baseMXN) || baseMXN <= 0) {
        return fail(500, `Precio inválido en catálogo para: ${id}`);
      }

      const unitMXN = applyPromoToUnitPrice({ unitMXN: baseMXN, promoCode });

      lineItems.push({
        quantity: qty,
        price_data: {
          currency: "mxn",
          unit_amount: toCentsMXN(unitMXN),
          product_data: {
            name: `${String(p.name)} (${size})`,
            images: p.img ? [String(p.img).startsWith("http") ? String(p.img) : `${getSiteUrl(event)}${p.img}`] : [],
            metadata: { sku: id, size }
          }
        }
      });
    }

    // Cotizar envío real (si aplica)
    let shippingMXN = 0;
    if (shippingMode !== "pickup") {
      shippingMXN = await computeRealShippingMXN({ shippingMode, zip, cart });
      // En Stripe lo metemos como “line item” de envío (simple, transparente)
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: toCentsMXN(shippingMXN),
          product_data: {
            name: shippingMode === "us" ? "Envío (USA) — Envia/FedEx" : "Envío (MX) — Envia/FedEx",
            metadata: { type: "shipping", mode: shippingMode }
          }
        }
      });
    }

    const siteUrl = getSiteUrl(event);

    // Métodos de pago: card + (OXXO solo para MX)
    const paymentMethods = shippingMode === "us" ? ["card"] : ["card", "oxxo"];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethods,
      locale: "es",
      line_items: lineItems,
      success_url: `${siteUrl}/?status=success`,
      cancel_url: `${siteUrl}/?status=cancel`,

      phone_number_collection: { enabled: true },
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: shippingMode === "us" ? ["US"] : ["MX", "US"]
      },

      metadata: {
        store: "scorestore",
        promoCode: promoCode || "",
        shippingMode,
        zip: zip || "",
        shippingMXN: String(shippingMXN || 0)
      }
    });

    // (Opcional) Crear “orden pending” en ÚNICO OS si existe tabla orders
    // No fallamos si aún no tienes la tabla: NO invento tu schema.
    try {
      const sb = getSupabaseService();
      if (sb) {
        await sb.from("orders").insert([{
          status: "pending",
          stripe_session_id: session.id,
          promo_code: promoCode || null,
          shipping_mode: shippingMode,
          ship_zip: zip || null,
          shipping_mxn: shippingMXN || 0,
          cart_json: cart
        }]);
      }
    } catch (e) {
      // Silencioso: no rompemos checkout por schema faltante
      console.warn("Supabase orders insert skipped:", e?.message || e);
    }

    return ok({ url: session.url });

  } catch (e) {
    console.error("create_checkout error:", e);

    const status = e?.status || 500;
    const msg = e?.message || "Error creando checkout";
    return fail(status, msg);
  }
}