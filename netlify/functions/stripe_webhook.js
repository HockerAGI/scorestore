// netlify/functions/stripe_webhook.js
// Stripe webhook (checkout.session.completed)
// - Verifica Stripe-Signature (seguridad real)
// - Inserta/actualiza orden en Supabase (ÚNICO OS) usando SERVICE ROLE si está disponible
// - Notifica Telegram (opcional)
// - Intenta generar guía Envia.com (si shippingMode != pickup y hay specs por SKU en Supabase)
// NOTA: No guardamos llaves en repo. Todo va en env vars.

import Stripe from "stripe";
import {
  ok,
  fail,
  env,
  corsHeaders,
  getSupabaseAnon,
  getSupabaseService,
  telegramNotify,
  enviaCreateShipment,
  clampInt
} from "./_shared.js";

function getRawBody(event) {
  // Netlify envía body string. Stripe necesita RAW para verificar firma.
  // OJO: si Netlify ya hizo decode, igual suele funcionar. Mantener tal cual.
  return event.body || "";
}

function getSiteUrl(event) {
  const fromEnv = process.env.SITE_URL || process.env.URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = event?.headers?.host;
  if (host) return `https://${host}`;
  return "https://scorestore.netlify.app";
}

function normalizeMode(mode) {
  const m = String(mode || "pickup").toLowerCase();
  if (m === "mx" || m === "us" || m === "pickup") return m;
  return "pickup";
}

function safe(v) {
  return (v ?? "").toString().trim();
}

// Construye paquetes desde specs en Supabase (products table)
// items: [{ sku, qty }]
async function buildPackagesFromSupabase(items) {
  const supabase = getSupabaseAnon();
  const skuIds = items.map(i => String(i.sku));

  const { data: products, error } = await supabase
    .from("products")
    .select("id, weight_kg, length_cm, width_cm, height_cm, declared_value_mxn")
    .in("id", skuIds);

  if (error) throw new Error("Error consultando productos (ÚNICO OS)");
  const map = {};
  for (const p of products || []) map[p.id] = p;

  const packages = [];
  let declaredValueTotal = 0;

  for (const it of items) {
    const sku = String(it.sku);
    const qty = clampInt(it.qty, 1, 50);
    const spec = map[sku];

    if (!spec) throw new Error(`Faltan specs del SKU ${sku} en ÚNICO OS`);

    const w = Number(spec.weight_kg);
    const l = Number(spec.length_cm);
    const wd = Number(spec.width_cm);
    const h = Number(spec.height_cm);

    if (![w, l, wd, h].every(n => Number.isFinite(n) && n > 0)) {
      throw new Error(`Specs incompletos del SKU ${sku} (peso/dimensiones)`);
    }

    const declared = Number(spec.declared_value_mxn || 0);
    for (let k = 0; k < qty; k++) {
      packages.push({ weight: w, length: l, width: wd, height: h });
      declaredValueTotal += declared > 0 ? declared : 0;
    }
  }

  return { packages, declaredValueTotal };
}

// Intenta generar guía Envia
async function tryGenerateEnviaLabel({ session, items }) {
  const shippingMode = normalizeMode(session?.metadata?.shippingMode);
  if (shippingMode === "pickup") return { ok: false, skipped: true, reason: "pickup" };

  // Requiere dirección de envío
  const ship = session?.shipping_details;
  const addr = ship?.address;
  if (!addr) return { ok: false, skipped: true, reason: "missing_shipping_address" };

  // Construimos packages reales desde Supabase
  const { packages, declaredValueTotal } = await buildPackagesFromSupabase(items);

  const country = shippingMode === "us" ? "US" : "MX";

  // Payload estándar (puede variar por cuenta Envia, pero no inventamos campos raros)
  // Si tu cuenta necesita campos extra, lo ajustamos con tu respuesta real de Envia.
  const payload = {
    origin: {
      name: "SCORE STORE / Único Uniformes",
      company: "BAJATEX",
      email: "ventas.unicotextil@gmail.com",
      phone: "0000000000",
      street: "Tijuana Centro",
      number: "S/N",
      district: "Centro",
      city: "Tijuana",
      state: "BC",
      country: "MX",
      postalCode: "22400"
    },
    destination: {
      name: ship?.name || "Cliente SCORE STORE",
      company: "",
      email: session?.customer_details?.email || "",
      phone: session?.customer_details?.phone || "",
      street: addr?.line1 || "",
      number: addr?.line2 || "",
      district: addr?.city || "",
      city: addr?.city || "",
      state: addr?.state || "",
      country: country,
      postalCode: addr?.postal_code || ""
    },
    packages,
    shipment: {
      carrier: "fedex",
      type: "package",
      // declaredValue es opcional, si no está en productos queda 0
      declaredValue: declaredValueTotal > 0 ? Math.round(declaredValueTotal) : undefined
    },
    settings: {
      // opcional: deja que Envia escoja servicio si aplica
      // service: "standard"
    }
  };

  // Limpia undefined para evitar rechazos
  if (payload.shipment && payload.shipment.declaredValue === undefined) {
    delete payload.shipment.declaredValue;
  }

  const data = await enviaCreateShipment(payload);
  return { ok: true, data };
}

export async function handler(event) {
  // Preflight (Stripe no lo usa, pero lo dejamos bien)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders() };
  }

  if (event.httpMethod !== "POST") {
    return fail(405, "Method not allowed");
  }

  const stripeSecret = env("STRIPE_SECRET_KEY", { required: true });
  const webhookSecret = env("STRIPE_WEBHOOK_SECRET", { required: true });

  const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

  try {
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    if (!sig) return fail(400, "Missing Stripe-Signature header");

    const rawBody = getRawBody(event);
    const stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);

    // Solo procesamos el evento que necesitamos
    if (stripeEvent.type !== "checkout.session.completed") {
      return ok({ received: true, ignored: stripeEvent.type });
    }

    const session = stripeEvent.data.object;

    // Traemos line_items para reconstruir items por sku
    const sessionFull = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price.product"]
    });

    const lineItems = sessionFull?.line_items?.data || [];
    // Extraer sku/size desde metadata del product (lo pusimos en create_checkout.js)
    const items = [];
    for (const li of lineItems) {
      const product = li?.price?.product;
      const md = product?.metadata || {};
      const sku = safe(md.sku);
      const size = safe(md.size);
      const qty = clampInt(li?.quantity, 1, 50);

      // Ignora el line item "shipping" que metimos con metadata.type=shipping
      if (safe(md.type) === "shipping") continue;
      if (!sku) continue;

      items.push({ sku, size, qty });
    }

    const shippingMode = normalizeMode(sessionFull?.metadata?.shippingMode);
    const zip = safe(sessionFull?.metadata?.zip);
    const shippingMXN = Number(sessionFull?.metadata?.shippingMXN || 0);

    const customerEmail = safe(sessionFull?.customer_details?.email);
    const customerPhone = safe(sessionFull?.customer_details?.phone);
    const amountTotal = Number(sessionFull?.amount_total || 0) / 100;

    const siteUrl = getSiteUrl(event);

    // 1) Guardar en Supabase (ÚNICO OS) si service role existe
    let supaSaved = false;
    let orderId = null;

    try {
      const sb = getSupabaseService();
      if (sb) {
        // Insert/update flexible:
        // - Si existe tabla orders con columnas comunes: insert
        // - Si ya existe por session_id: update
        // No adivinamos: intentamos upsert con onConflict si columna existe.
        const payload = {
          status: "paid",
          stripe_session_id: sessionFull.id,
          stripe_payment_intent: sessionFull.payment_intent || null,
          email: customerEmail || null,
          phone: customerPhone || null,
          shipping_mode: shippingMode,
          ship_zip: zip || null,
          shipping_mxn: Number.isFinite(shippingMXN) ? shippingMXN : 0,
          amount_total_mxn: Number.isFinite(amountTotal) ? Math.round(amountTotal) : null,
          items_json: items,
          raw_stripe: sessionFull
        };

        // Intento 1: upsert
        const { data, error } = await sb
          .from("orders")
          .upsert([payload], { onConflict: "stripe_session_id" })
          .select("id")
          .maybeSingle();

        if (!error) {
          supaSaved = true;
          orderId = data?.id ?? null;
        } else {
          // Intento 2: insert (si onConflict no existe)
          const { data: d2, error: e2 } = await sb
            .from("orders")
            .insert([payload])
            .select("id")
            .maybeSingle();

          if (!e2) {
            supaSaved = true;
            orderId = d2?.id ?? null;
          } else {
            console.warn("Supabase save failed:", e2.message);
          }
        }
      }
    } catch (e) {
      console.warn("Supabase save skipped:", e?.message || e);
    }

    // 2) Intentar guía Envia (si aplica)
    let enviaResult = { ok: false, skipped: true };
    try {
      enviaResult = await tryGenerateEnviaLabel({ session: sessionFull, items });
    } catch (e) {
      // No rompemos webhook por Envia
      enviaResult = { ok: false, error: e?.message || "envia error" };
      console.warn("Envia label skipped:", enviaResult);
    }

    // Si se generó etiqueta y hay Supabase, intentamos guardar tracking/label
    try {
      if (supaSaved && orderId && enviaResult?.ok) {
        const sb = getSupabaseService();
        if (sb) {
          const label = enviaResult?.data?.label || enviaResult?.data?.files?.label || null;
          const tracking = enviaResult?.data?.tracking || enviaResult?.data?.trackingNumber || null;

          await sb
            .from("orders")
            .update({
              envia_raw: enviaResult.data,
              envia_label: label,
              tracking_number: tracking,
              status: "fulfilled" // si quieres dejarlo paid y fulfillment separado, lo cambiamos
            })
            .eq("id", orderId);
        }
      }
    } catch (e) {
      console.warn("Supabase update (envia) skipped:", e?.message || e);
    }

    // 3) Notificar Telegram (opcional)
    const telegramText =
      `🏁 NUEVA VENTA — SCORE STORE\n` +
      `Session: ${sessionFull.id}\n` +
      `Total: $${amountTotal} MXN\n` +
      `Modo envío: ${shippingMode}${zip ? " (" + zip + ")" : ""}\n` +
      `Email: ${customerEmail || "N/A"}\n` +
      `Items: ${items.map(i => `${i.qty}x ${i.sku}${i.size ? " (" + i.size + ")" : ""}`).join(", ")}\n` +
      `Supabase: ${supaSaved ? "OK" : "SKIP"}\n` +
      `Envia: ${enviaResult?.ok ? "OK" : (enviaResult?.skipped ? "SKIP" : "FAIL")}\n` +
      `Admin: Único OS\n` +
      `Store: ${siteUrl}`;

    await telegramNotify(telegramText);

    return ok({ received: true });

  } catch (e) {
    console.error("stripe_webhook error:", e);
    // Stripe requiere 2xx para no reintentar en bucle, pero si falla firma, debe ser 400.
    const msg = e?.message || "Webhook error";
    if (msg.includes("No signatures found") || msg.includes("Signature verification failed")) {
      return fail(400, "Stripe signature verification failed");
    }
    return fail(500, "Webhook processing failed", { detail: msg });
  }
}