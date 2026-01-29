// netlify/functions/stripe_webhook.js
/* =========================================================
   SCORE STORE — STRIPE WEBHOOK v2026 (PROD · UNIFIED)
   ✅ Verificación de firma (raw body)
   ✅ Fulfillment solo cuando pago = PAID
      - checkout.session.completed (si paid)
      - checkout.session.async_payment_succeeded (async)
   ✅ Generación de guía Envia (si shipping_mode !== pickup)
   ✅ Idempotencia: guarda tracking/label en session.metadata (evita duplicados)
   ✅ Supabase: upsert/update robusto (si supabaseAdmin disponible)
   ✅ Telegram notify (HTML)
   ========================================================= */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");
const axios = require("axios");

const {
  jsonResponse,
  supabaseAdmin,
  createEnviaLabel,
  normalizeQty,
  digitsOnly,
  handleOptions,
} = require("./_shared");

// ---------- helpers ----------
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRawBody(event) {
  let rawBody = event?.body || "";
  if (event?.isBase64Encoded) rawBody = Buffer.from(rawBody, "base64").toString("utf8");
  return rawBody;
}

async function notifyTelegramHTML(html) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      { timeout: 12000 }
    );
  } catch (e) {
    console.error("[telegram] error:", e?.message || e);
  }
}

async function getItemsQtyFromStripe(sessionId) {
  // OJO: listLineItems incluye shipping line item; preferimos metadata.score_items.
  try {
    const li = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    const qty = (li?.data || []).reduce((acc, row) => acc + normalizeQty(row?.quantity || 1), 0);
    return Math.max(1, qty);
  } catch (e) {
    console.warn("[stripe] listLineItems failed:", e?.message || e);
    return 1;
  }
}

function safeMeta(meta) {
  const m = meta || {};
  return {
    shipping_mode: String(m.shipping_mode || m.score_mode || "pickup").toLowerCase(),
    customer_zip: digitsOnly(m.customer_zip || m.customer_cp || ""),
    customer_country: String(m.customer_country || m.customer_country_code || "").toUpperCase(),
    score_items: Number(String(m.score_items || m.items_qty || "").replace(/\D+/g, "")) || 0,
    shipping_label: String(m.shipping_label || "").trim(),
    shipping_source: String(m.shipping_source || "").trim(),
    cart_compact: String(m.cart_compact || "").trim(),
    tracking_number: String(m.tracking_number || "").trim(),
    label_url: String(m.label_url || "").trim(),
  };
}

async function patchSessionMetadata(sessionId, patch) {
  if (!sessionId || !patch || typeof patch !== "object") return;
  try {
    await stripe.checkout.sessions.update(sessionId, { metadata: patch });
  } catch (e) {
    console.warn("[stripe] session.update metadata failed:", e?.message || e);
  }
}

async function upsertOrderSafe(payload) {
  if (!supabaseAdmin) return;

  // 1) intento update si existe
  try {
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("orders")
      .select("id, stripe_session_id, tracking_number, label_url")
      .eq("stripe_session_id", payload.stripe_session_id)
      .maybeSingle();

    if (!selErr && existing?.id) {
      // update
      const { error: updErr } = await supabaseAdmin
        .from("orders")
        .update(payload)
        .eq("id", existing.id);

      if (!updErr) return;
      console.warn("[supabase] update error:", updErr?.message || updErr);
    }
  } catch (e) {
    console.warn("[supabase] select/update fail:", e?.message || e);
  }

  // 2) intento insert full
  try {
    const { error: insErr } = await supabaseAdmin.from("orders").insert([payload]);
    if (!insErr) return;
    console.warn("[supabase] insert error:", insErr?.message || insErr);
  } catch (e) {
    console.warn("[supabase] insert fail:", e?.message || e);
  }

  // 3) fallback minimal (por si tu tabla no trae todas las columnas)
  try {
    const minimal = {
      stripe_session_id: payload.stripe_session_id,
      total: payload.total,
      currency: payload.currency,
      status: payload.status,
      shipping_mode: payload.shipping_mode,
      customer_cp: payload.customer_cp || null,
      raw_meta: payload.raw_meta || null,
    };
    await supabaseAdmin.from("orders").insert([minimal]);
  } catch (e) {
    console.warn("[supabase] minimal insert fail:", e?.message || e);
  }
}

// ---------- webhook ----------
const RELEVANT = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

exports.handler = async (event) => {
  const pre = handleOptions(event);
  if (pre) return pre;

  if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) return jsonResponse(500, { ok: false, error: "Missing STRIPE_SECRET_KEY" });

  const sig =
    event.headers?.["stripe-signature"] ||
    event.headers?.["Stripe-Signature"] ||
    event.headers?.["STRIPE-SIGNATURE"];

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return jsonResponse(500, { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" });
  if (!sig) return jsonResponse(400, { ok: false, error: "Missing Signature" });

  const rawBody = getRawBody(event);

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe_webhook] signature verify failed:", err?.message || err);
    return jsonResponse(400, { ok: false, error: "Invalid signature" });
  }

  if (!RELEVANT.has(stripeEvent.type)) {
    return jsonResponse(200, { received: true, ignored: true, type: stripeEvent.type });
  }

  try {
    const sessionLite = stripeEvent.data.object;
    const sessionId = sessionLite?.id;
    if (!sessionId) return jsonResponse(200, { received: true });

    // Traemos la sesión “real” por seguridad (campos completos)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer_details"],
    });

    const meta0 = safeMeta(session?.metadata || {});
    const mode = meta0.shipping_mode || "pickup";
    const zip = meta0.customer_zip || "";
    const country = meta0.customer_country || (mode === "us" ? "US" : "MX");

    const customerName = escapeHtml(session.customer_details?.name || session.shipping_details?.name || "Cliente");
    const customerEmail = escapeHtml(session.customer_details?.email || "");
    const customerPhone = escapeHtml(session.customer_details?.phone || "");

    const amountTotal = (Number(session.amount_total || 0) / 100).toFixed(2);
    const currency = String(session.currency || "mxn").toUpperCase();
    const paymentStatus = String(session.payment_status || "unpaid");

    // Status por evento
    if (stripeEvent.type === "checkout.session.expired") {
      await upsertOrderSafe({
        stripe_session_id: session.id,
        status: "expired",
        total: Number(session.amount_total || 0) / 100,
        currency: String(session.currency || "mxn"),
        shipping_mode: mode,
        customer_cp: zip || null,
        raw_meta: session.metadata ? JSON.stringify(session.metadata) : null,
      });
      return jsonResponse(200, { received: true });
    }

    if (stripeEvent.type === "checkout.session.async_payment_failed") {
      await upsertOrderSafe({
        stripe_session_id: session.id,
        status: "payment_failed",
        total: Number(session.amount_total || 0) / 100,
        currency: String(session.currency || "mxn"),
        shipping_mode: mode,
        customer_cp: zip || null,
        raw_meta: session.metadata ? JSON.stringify(session.metadata) : null,
      });

      const msg =
        `<b>⚠️ PAGO FALLIDO - SCORE STORE</b>\n` +
        `👤 <b>${customerName}</b>\n` +
        `💰 <b>$${escapeHtml(amountTotal)} ${escapeHtml(currency)}</b>\n` +
        `Estado: <b>FAILED</b>\n` +
        `🔗 Session: <code>${escapeHtml(session.id)}</code>`;
      await notifyTelegramHTML(msg);

      return jsonResponse(200, { received: true });
    }

    // ¿Se considera pagado ya?
    const isPaid =
      paymentStatus === "paid" ||
      stripeEvent.type === "checkout.session.async_payment_succeeded";

    // qty: preferimos metadata.score_items (anti shipping line item)
    let itemsQty = meta0.score_items;
    if (!itemsQty) itemsQty = await getItemsQtyFromStripe(session.id);
    itemsQty = Math.max(1, Number(itemsQty) || 1);

    // Si no está pagado aún (OXXO pending), guardamos status pending y NO generamos guía
    if (!isPaid) {
      await upsertOrderSafe({
        stripe_session_id: session.id,
        status: "pending_payment",
        total: Number(session.amount_total || 0) / 100,
        currency: String(session.currency || "mxn"),
        shipping_mode: mode,
        customer_cp: zip || null,
        items_qty: itemsQty,
        customer_name: session.customer_details?.name || session.shipping_details?.name || null,
        customer_email: session.customer_details?.email || null,
        customer_phone: session.customer_details?.phone || null,
        raw_meta: session.metadata ? JSON.stringify(session.metadata) : null,
      });

      const emojiMode = mode === "pickup" ? "🏪 PICKUP" : "🚛 ENVÍO";
      const cpMsg = zip ? `\n📍 <b>CP/ZIP:</b> ${escapeHtml(zip)}` : "";
      const msg =
        `<b>⏳ PAGO PENDIENTE - SCORE STORE</b>\n` +
        `➖➖➖➖➖➖➖➖➖➖\n` +
        `👤 <b>${customerName}</b>\n` +
        `💰 <b>$${escapeHtml(amountTotal)} ${escapeHtml(currency)}</b>\n` +
        `${emojiMode}\n` +
        `💳 Estado: <b>${escapeHtml(paymentStatus)}</b>\n` +
        `📦 Items: <b>${escapeHtml(itemsQty)}</b>` +
        `${cpMsg}\n` +
        `🔗 Session: <code>${escapeHtml(session.id)}</code>`;
      await notifyTelegramHTML(msg);

      return jsonResponse(200, { received: true });
    }

    // Paid → fulfillment (label Envia si aplica)
    let trackingInfo = meta0.tracking_number || "";
    let labelUrl = meta0.label_url || "";
    let carrierName = "";

    const shippingDetails = session.shipping_details;

    if (mode !== "pickup" && shippingDetails?.address) {
      // idempotencia: si ya existe en metadata, NO regenerar
      if (!trackingInfo || !labelUrl) {
        try {
          const customerData = {
            name: shippingDetails?.name || session.customer_details?.name || "Cliente",
            email: session.customer_details?.email || "cliente@scorestore.com",
            phone: session.customer_details?.phone || "0000000000",
            address: {
              line1: shippingDetails.address.line1 || "",
              line2: shippingDetails.address.line2 || "",
              city: shippingDetails.address.city || "",
              state: shippingDetails.address.state || "",
              country: shippingDetails.address.country || country || "MX",
              postal_code: shippingDetails.address.postal_code || zip || "",
              // number/reference opcionales (Stripe no los separa)
              number: "",
              reference: "",
            },
          };

          const shipment = await createEnviaLabel(customerData, Math.max(1, Number(itemsQty) || 1));

          if (shipment?.ok) {
            trackingInfo = shipment.tracking || "";
            labelUrl = shipment.labelUrl || "";
            carrierName = shipment.carrier || "";

            // guarda en metadata para evitar duplicados si Stripe reintenta webhook
            await patchSessionMetadata(session.id, {
              ...session.metadata,
              tracking_number: trackingInfo || "",
              label_url: labelUrl || "",
              fulfillment: "label_generated",
            });
          }
        } catch (e) {
          console.error("[envia label] error:", e?.message || e);
        }
      }
    }

    // Supabase upsert/update (paid)
    await upsertOrderSafe({
      stripe_session_id: session.id,
      total: Number(session.amount_total || 0) / 100,
      currency: String(session.currency || "mxn"),
      status: "paid",
      shipping_mode: mode,
      customer_cp: zip || null,
      items_qty: Number(itemsQty) || null,
      customer_name: session.customer_details?.name || shippingDetails?.name || null,
      customer_email: session.customer_details?.email || null,
      customer_phone: session.customer_details?.phone || null,
      tracking_number: trackingInfo || null,
      label_url: labelUrl || null,
      carrier: carrierName || null,
      raw_meta: session.metadata ? JSON.stringify(session.metadata) : null,
    });

    // Telegram notify (paid)
    const emojiMode = mode === "pickup" ? "🏪 PICKUP" : "🚛 ENVÍO";
    const trackingMsg = trackingInfo ? `\n📦 <b>Guía:</b> ${escapeHtml(trackingInfo)}` : "";
    const labelMsg = labelUrl ? `\n📄 <b>Etiqueta:</b> ${escapeHtml(labelUrl)}` : "";
    const cpMsg = zip ? `\n📍 <b>CP/ZIP:</b> ${escapeHtml(zip)}` : "";
    const shipLabelMsg = meta0.shipping_label ? `\n🚚 <b>Servicio:</b> ${escapeHtml(meta0.shipping_label)}` : "";
    const shipSourceMsg = meta0.shipping_source ? `\n🧠 <b>Ship:</b> ${escapeHtml(meta0.shipping_source)}` : "";

    const msg =
      `<b>🏆 NUEVA VENTA - SCORE STORE</b>\n` +
      `➖➖➖➖➖➖➖➖➖➖\n` +
      `👤 <b>${customerName}</b>\n` +
      `💰 <b>$${escapeHtml(amountTotal)} ${escapeHtml(currency)}</b>\n` +
      `${emojiMode}\n` +
      `💳 Estado: <b>PAID</b>\n` +
      `📦 Items: <b>${escapeHtml(itemsQty)}</b>` +
      `${cpMsg}` +
      `${shipLabelMsg}` +
      `${shipSourceMsg}` +
      `${trackingMsg}` +
      `${labelMsg}` +
      `\n➖➖➖➖➖➖➖➖➖➖\n` +
      `${customerEmail ? `✉️ ${customerEmail}\n` : ""}` +
      `${customerPhone ? `📱 ${customerPhone}\n` : ""}` +
      `🔗 Session: <code>${escapeHtml(session.id)}</code>`;

    await notifyTelegramHTML(msg);

    return jsonResponse(200, { received: true });
  } catch (err) {
    console.error("[stripe_webhook] handler error:", err?.message || err);
    // Importante: responder 200 evita reintentos infinitos si algo no crítico falla
    return jsonResponse(200, { received: true, warned: true });
  }
};