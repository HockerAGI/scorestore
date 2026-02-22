"use strict";

/**
 * =========================================================
 * stripe_webhook.js (Netlify Function)
 *
 * SECURE V2026-02-21 PRO (NIVEL NASA / META):
 * - Resiliencia Absoluta: Upsert a DB garantizado aunque falle Envía.
 * - Buffer de lectura seguro contra firmas corruptas.
 * =========================================================
 */

const {
  jsonResponse,
  readRawBody,
  initStripe,
  isSupabaseConfigured,
  supabaseAdmin,
  createEnviaLabel,
  sendTelegram,
} = require("./_shared");

const safeUpper = (v) => String(v || "").toUpperCase().trim();
const nowIso = () => new Date().toISOString();

const shouldFulfillNow = (eventType, session) => {
  if (eventType === "checkout.session.async_payment_succeeded") return true;
  if (eventType === "checkout.session.completed") return String(session.payment_status) === "paid";
  return false;
};

const fetchAllLineItems = async (stripe, sessionId) => {
  const out = [];
  let starting_after = undefined;

  for (let i = 0; i < 20; i++) {
    const resp = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      ...(starting_after ? { starting_after } : {}),
      expand: ["data.price.product"],
    });

    if (Array.isArray(resp?.data)) out.push(...resp.data);
    if (!resp?.has_more) break;

    const last = resp.data?.[resp.data.length - 1];
    starting_after = last?.id;
    if (!starting_after) break;
  }

  return out;
};

const normalizeOrderItems = (lineItems) => {
  const arr = Array.isArray(lineItems) ? lineItems : [];
  return arr
    .map((li) => {
      const productObj = li?.price?.product && typeof li.price.product === "object" ? li.price.product : null;
      const meta = productObj?.metadata || {};
      const sku = meta.sku || meta.SKU || null;
      const size = meta.size || meta.talla || null;

      return {
        sku,
        size,
        name: productObj?.name || li?.description || null,
        description: li?.description || productObj?.description || null,
        qty: Number(li?.quantity || 0) || 0,
        amount_subtotal_mxn: Number(li?.amount_subtotal || 0) / 100,
        amount_total_mxn: Number(li?.amount_total || 0) / 100,
        currency: safeUpper(li?.currency || "mxn"),
        price_id: li?.price?.id || null,
        product_id: productObj?.id || (typeof li?.price?.product === "string" ? li.price.product : null),
        metadata: meta || {},
      };
    })
    .filter((x) => x.qty > 0);
};

const buildItemsSummary = (items) =>
  (Array.isArray(items) ? items : [])
    .map((i) => `${i.qty}x ${(i.sku || i.name || "ITEM")}[${i.size || "N/A"}]`)
    .join(" | ")
    .substring(0, 450);

const upsertOrder = async (sb, session, status, items) => {
  const meta = session.metadata || {};
  const customer = session.customer_details || {};
  const shipping = session.shipping_details || {};
  const addr = shipping.address || {};

  const totalDetails = session.total_details || {};
  const amount_discount_mxn =
    Number(totalDetails.amount_discount || 0) / 100 ||
    (Number(session.amount_subtotal || 0) - Number(session.amount_total || 0)) / 100 ||
    0;

  const amount_shipping_mxn =
    Number(totalDetails.amount_shipping || 0) / 100 ||
    Number(meta.shipping_amount_cents || 0) / 100 ||
    0;

  const normalizedItems = Array.isArray(items) ? items : [];

  const row = {
    stripe_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id || null),
    stripe_customer_id:
      typeof session.customer === "string" ? session.customer : (session.customer?.id || null),

    email: customer.email || session.customer_email || null,
    customer_name: customer.name || shipping.name || "Cliente",
    phone: customer.phone || null,

    currency: safeUpper(session.currency || "mxn"),
    amount_total_mxn: Number(session.amount_total || 0) / 100,
    amount_subtotal_mxn: Number(session.amount_subtotal || 0) / 100,
    amount_shipping_mxn,
    amount_discount_mxn,
    promo_code: meta.promo_code || "Ninguno",
    items_summary: meta.items_summary || buildItemsSummary(normalizedItems) || "Sin detalles",
    items: normalizedItems,

    shipping_mode: meta.shipping_mode || null,
    postal_code: meta.postal_code || addr.postal_code || null,

    status,
    updated_at: nowIso(),

    metadata: {
      shipping_address: addr || null,
      raw_session: session,
    },
  };

  await sb.from("orders").upsert(row, { onConflict: "stripe_session_id" });
};

const getExistingLabel = async (sb, sessionId) => {
  try {
    const { data, error } = await sb
      .from("shipping_labels")
      .select("id, tracking_number, label_url, status")
      .eq("stripe_session_id", sessionId)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
};

const upsertLabel = async (sb, sessionId, labelData, status = "created") => {
  const row = {
    stripe_session_id: sessionId,
    carrier: "envia",
    tracking_number: labelData.trackingNumber || labelData[0]?.trackingNumber || null,
    label_url: labelData.labelUrl || labelData[0]?.label || null,
    status,
    updated_at: nowIso(),
    raw: labelData || {},
  };
  await sb.from("shipping_labels").upsert(row, { onConflict: "stripe_session_id" });
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, "*");

    const stripe = initStripe();
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whSecret) {
      console.error("[stripe_webhook] Missing signature or webhook secret");
      return jsonResponse(401, { received: false, error: "Unauthorized" }, "*");
    }

    let buf;
    try {
      buf = readRawBody(event);
    } catch (err) {
      return jsonResponse(400, { received: false, error: "Malformed payload body" }, "*");
    }

    let evt;
    try {
      evt = stripe.webhooks.constructEvent(buf, sig, whSecret);
    } catch (err) {
      console.error("[stripe_webhook] Invalid signature:", err?.message);
      return jsonResponse(400, { received: false, error: "Invalid signature" }, "*");
    }

    const type = String(evt.type || "");
    const session = evt?.data?.object || {};
    if (!session?.id) return jsonResponse(200, { received: true }, "*");

    const meta = session.metadata || {};
    const shipping_mode = String(meta.shipping_mode || "pickup");
    const shipping_country = safeUpper(
      meta.shipping_country ||
        session?.shipping_details?.address?.country ||
        (shipping_mode === "envia_us" ? "US" : "MX")
    );
    const items_qty = Number(meta.items_qty || 0) || 0;

    let orderStatus = "pending";
    if (type === "checkout.session.async_payment_failed") orderStatus = "payment_failed";
    else if (type === "checkout.session.async_payment_succeeded") orderStatus = "paid";
    else if (type === "checkout.session.completed") orderStatus = String(session.payment_status) === "paid" ? "paid" : "pending_payment";
    else return jsonResponse(200, { received: true, ignored: true }, "*");

    let orderItems = [];
    try {
      const lineItems = await fetchAllLineItems(stripe, session.id);
      orderItems = normalizeOrderItems(lineItems);
    } catch (e) {
      console.warn("[stripe_webhook] line_items error:", e?.message);
    }

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      if (sb) {
        try {
          await upsertOrder(sb, session, orderStatus, orderItems);
        } catch (e) {
          console.error("[orders] upsert error:", e?.message);
        }
      }
    }

    const shouldFulfill = shouldFulfillNow(type, session);
    const needsLabel = shipping_mode === "envia_mx" || shipping_mode === "envia_us";

    if (shouldFulfill && needsLabel) {
      const sb = isSupabaseConfigured() ? supabaseAdmin() : null;

      if (sb) {
        const existing = await getExistingLabel(sb, session.id);
        if (existing?.tracking_number || existing?.label_url) {
          return jsonResponse(200, { received: true, message: "Label already generated" }, "*");
        }
      }

      try {
        const labelData = await createEnviaLabel({ shipping_country, stripe_session: session, items_qty });
        if (sb) {
          try { await upsertLabel(sb, session.id, labelData, "created"); } catch (e) {}
        }
        await sendTelegram(`✅ <b>Pago confirmado</b>\nSession: <code>${session.id}</code>\nModo: <b>${shipping_mode}</b>\nGuía generada exitosamente.`);
      } catch (e) {
        if (isSupabaseConfigured()) {
          const sb2 = supabaseAdmin();
          if (sb2) {
            try { await upsertLabel(sb2, session.id, { error: String(e?.message || e) }, "failed"); } catch {}
          }
        }
        await sendTelegram(`⚠️ <b>Pago confirmado</b> pero <b>falló guía Envía</b>\nSession: <code>${session.id}</code>\nError: <code>${String(e?.message || e).slice(0, 300)}</code>`);
      }
    } else {
      try {
        if (orderStatus === "paid" && shipping_mode === "pickup") {
          await sendTelegram(`✅ <b>Pago confirmado</b>\nSession: <code>${session.id}</code>\nModo: <b>Pickup en fábrica</b>`);
        } else if (orderStatus === "pending_payment") {
          await sendTelegram(`🕒 <b>Pedido OXXO / Pendiente</b>\nSession: <code>${session.id}</code>`);
        }
      } catch {}
    }

    return jsonResponse(200, { received: true }, "*");
  } catch (e) {
    console.error("[stripe_webhook] fatal error:", e?.message);
    return jsonResponse(500, { received: false, error: "Internal Server Error" }, "*");
  }
};