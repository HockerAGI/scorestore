"use strict";

const {
  jsonResponse,
  readRawBody,
  initStripe,
  isSupabaseConfigured,
  supabaseAdmin,
  createEnviaLabel,
  sendTelegram,
} = require("./_shared");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, "*");

    const stripe = initStripe();
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whSecret) {
      console.log("[stripe_webhook] Missing signature or STRIPE_WEBHOOK_SECRET");
      return jsonResponse(200, { received: true, warning: "Webhook secret missing" }, "*");
    }

    const buf = readRawBody(event);

    let evt;
    try {
      evt = stripe.webhooks.constructEvent(buf, sig, whSecret);
    } catch (err) {
      console.log("[stripe_webhook] Signature invalid:", err?.message || err);
      return jsonResponse(400, { received: false, error: "Invalid signature" }, "*");
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object || {};
      const meta = session.metadata || {};
      const shipping_mode = String(meta.shipping_mode || "pickup");
      const shipping_country = String(meta.shipping_country || session?.shipping_details?.address?.country || (shipping_mode === "envia_us" ? "US" : "MX")).toUpperCase();

      const items_qty = Number(meta.items_qty || 0) || 0;
      const shipping_amount_cents = Number(meta.shipping_amount_cents || 0) || 0;
      
      // Respaldo de Email por si el usuario pago con métodos como Apple Pay que lo ocultan a veces.
      const customer_email = session.customer_details?.email || session.customer_email || "no-reply@scorestore.com";

      if (isSupabaseConfigured()) {
        const sb = supabaseAdmin();
        if (sb) {
          try {
            const row = {
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent || null,
              email: customer_email,
              customer_name: session.customer_details?.name || "Cliente",
              amount_total_mxn: Number(session.amount_total || 0) / 100,
              currency: (session.currency || "mxn").toUpperCase(),
              status: "paid",
              shipping_mode: shipping_mode,
              postal_code: meta.postal_code || session.shipping_details?.address?.postal_code || null,
              amount_shipping_mxn: shipping_amount_cents / 100,
              metadata: { 
                shipping_address: session.shipping_details?.address || null,
                raw_session: session 
              },
            };

            await sb.from("orders").upsert(row, { onConflict: "stripe_session_id" });
          } catch (e) {
            console.log("[orders] warn upsert:", e?.message || e);
          }
        }
      }

      if (shipping_mode === "envia_mx" || shipping_mode === "envia_us") {
        try {
          const labelData = await createEnviaLabel({
            shipping_country,
            stripe_session: session,
            items_qty,
          });

          if (isSupabaseConfigured()) {
            const sb = supabaseAdmin();
            if (sb) {
              try {
                await sb.from("shipping_labels").insert({
                  stripe_session_id: session.id,
                  carrier: "envia",
                  tracking_number: labelData.trackingNumber || labelData[0]?.trackingNumber || null,
                  label_url: labelData.labelUrl || labelData[0]?.label || null,
                  raw: labelData,
                });
              } catch (e) {
                console.log("[shipping_labels] warn insert:", e?.message || e);
              }
            }
          }

          // CORRECCIÓN HOCKER: Manejo seguro para que Telegram no rompa el Webhook
          try {
            await sendTelegram(
              `✅ <b>Pago confirmado</b>\nSession: <code>${session.id}</code>\nModo: <b>${shipping_mode}</b>\nPaís: <b>${shipping_country}</b>\nGuía generada (envía).`
            );
          } catch(err) { /* ignore telegram fail */ }

        } catch (e) {
          console.log("[envia] label error:", e?.message || e);
          try {
            await sendTelegram(
              `⚠️ <b>Pago confirmado</b> pero <b>falló la guía de Envía</b>\nSession: <code>${session.id}</code>\nError: <code>${String(e?.message || e).slice(0, 500)}</code>`
            );
          } catch(err) { /* ignore telegram fail */ }
        }
      } else {
        try {
          await sendTelegram(`✅ <b>Pago confirmado</b>\nSession: <code>${session.id}</code>\nModo: <b>pickup</b> (Recoger en fábrica)`);
        } catch(err) { /* ignore telegram fail */ }
      }
    }

    // Respuesta rápida y segura a Stripe
    return jsonResponse(200, { received: true }, "*");
  } catch (e) {
    console.log("[stripe_webhook] fatal:", e?.message || e);
    // CORRECCIÓN HOCKER: Siempre devolver 200 a Stripe para evitar bucles infinitos de reintentos
    return jsonResponse(200, { received: true, warning: String(e?.message || e) }, "*");
  }
};
