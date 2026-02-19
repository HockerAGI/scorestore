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
  // Ahora capturamos correctamente el origen de la respuesta para seguridad
  const origin = event?.headers?.origin || event?.headers?.Origin;

  try {
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const stripe = initStripe();
    // Stripe o Netlify pueden bajar a minúsculas, por seguridad buscamos estandarizado
    const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !whSecret) {
      console.log("[stripe_webhook] missing signature or STRIPE_WEBHOOK_SECRET");
      return jsonResponse(200, { received: true, warning: "Webhook secret/signature missing" }, origin);
    }

    const buf = readRawBody(event);

    let evt;
    try {
      evt = stripe.webhooks.constructEvent(buf, sig, whSecret);
    } catch (err) {
      console.log("[stripe_webhook] signature invalid:", err?.message || err);
      return jsonResponse(400, { received: false, error: "Invalid signature" }, origin);
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object || {};
      const meta = session.metadata || {};
      const shipping_mode = String(meta.shipping_mode || "pickup");
      const shipping_country = String(meta.shipping_country || session?.shipping_details?.address?.country || (shipping_mode === "envia_us" ? "US" : "MX")).toUpperCase();

      const items_qty = Number(meta.items_qty || 0) || 0;
      const shipping_amount_cents = Number(meta.shipping_amount_cents || 0) || 0;

      if (isSupabaseConfigured()) {
        const sb = supabaseAdmin();
        if (sb) {
          try {
            const row = {
              stripe_session_id: session.id,
              stripe_payment_intent: session.payment_intent || null,
              customer_email: session.customer_details?.email || null,
              amount_total_cents: Number(session.amount_total || 0),
              currency: session.currency || "mxn",
              status: "paid",
              shipping_mode,
              postal_code: meta.postal_code || null,
              shipping_amount_cents,
              shipping_address: session.shipping_details?.address || null,
              raw: session,
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
                  provider: "envia",
                  country: shipping_country,
                  payload: labelData,
                  created_at: new Date().toISOString(),
                });
              } catch (e) {
                console.log("[shipping_labels] warn insert:", e?.message || e);
              }
            }
          }

          await sendTelegram(
            `✅ <b>Pago confirmado</b>\nSession: <code>${session.id}</code>\nModo: <b>${shipping_mode}</b>\nPaís: <b>${shipping_country}</b>\nGuía generada (envía).`
          );
        } catch (e) {
          console.log("[envia] label error:", e?.response?.data || e?.message || e);
          await sendTelegram(
            `⚠️ <b>Pago confirmado</b> pero <b>falló guía Envía</b>\nSession: <code>${session.id}</code>\nError: <code>${String(e?.message || e).slice(0, 500)}</code>`
          );
        }
      } else {
        await sendTelegram(`✅ <b>Pago confirmado</b>\nSession: <code>${session.id}</code>\nModo: <b>pickup</b> (Recoger en fábrica)`);
      }
    }

    return jsonResponse(200, { received: true }, origin);
  } catch (e) {
    console.log("[stripe_webhook] fatal:", e?.message || e);
    return jsonResponse(200, { received: true, warning: String(e?.message || e) }, origin);
  }
};
