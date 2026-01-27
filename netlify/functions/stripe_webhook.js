const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, supabaseAdmin, notifyTelegram, createEnviaLabel } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) return jsonResponse(500, { error: "Falta STRIPE_WEBHOOK_SECRET" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, whsec);
  } catch (err) {
    return jsonResponse(400, { error: `Webhook Error: ${err.message}` });
  }

  try {
    if (stripeEvent.type !== "checkout.session.completed") {
      return jsonResponse(200, { received: true, ignored: stripeEvent.type });
    }

    const session = stripeEvent.data.object;

    const orderRow = {
      stripe_session_id: session.id,
      payment_intent: session.payment_intent || null,
      customer_email: session.customer_details?.email || null,
      customer_name: session.customer_details?.name || null,
      customer_phone: session.customer_details?.phone || null,
      amount_total: session.amount_total || 0,
      currency: session.currency || "mxn",
      shipping_details: session.shipping_details || null,
      metadata: session.metadata || {},
      status: "paid",
      created_at: new Date().toISOString()
    };

    if (supabaseAdmin) {
      await supabaseAdmin.from("orders").insert(orderRow);
    }

    await notifyTelegram(
      `🏁 <b>NUEVA COMPRA (SCORE STORE)</b>\n` +
      `👤 <b>${orderRow.customer_name || "Cliente"}</b>\n` +
      `📧 ${orderRow.customer_email || "N/A"}\n` +
      `💰 $${(orderRow.amount_total / 100).toFixed(2)} ${String(orderRow.currency).toUpperCase()}\n` +
      `🧾 Session: <code>${orderRow.stripe_session_id}</code>`
    );

    const addr = session.shipping_details?.address;
    if (addr) {
      const customer = {
        name: session.shipping_details?.name || orderRow.customer_name || "Cliente",
        email: orderRow.customer_email || "no-email@scorestore",
        phone: orderRow.customer_phone || "N/A",
        street: addr.line1,
        district: addr.line2 || "",
        city: addr.city,
        state: addr.state,
        country: addr.country,
        postal_code: addr.postal_code
      };

      const qty = parseInt(session.metadata?.items_qty || "1", 10) || 1;
      const label = await createEnviaLabel({ customer, qty });

      if (label && supabaseAdmin) {
        await supabaseAdmin
          .from("orders")
          .update({
            tracking_number: label.tracking,
            shipping_label_url: label.label_url,
            carrier: label.carrier
          })
          .eq("stripe_session_id", session.id);
      }

      if (label) {
        await notifyTelegram(
          `📦 <b>GUÍA GENERADA</b>\n` +
          `🚚 ${String(label.carrier).toUpperCase()}\n` +
          `🔎 Tracking: <code>${label.tracking}</code>`
        );
      }
    }

    return jsonResponse(200, { received: true });
  } catch (e) {
    console.error("stripe_webhook handler error:", e);
    return jsonResponse(500, { error: "Webhook internal error" });
  }
};