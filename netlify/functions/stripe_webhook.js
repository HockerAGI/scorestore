// netlify/functions/stripe_webhook.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { supabaseAdmin, jsonResponse, createEnviaLabel } = require("./_shared");

function toMoneyFromCents(cents) {
  const n = Number(cents || 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

async function getScoreOrgId() {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();
  if (error || !data?.id) return null;
  return data.id;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  if (!sig || !webhookSecret) {
    console.error("Webhook Error: Missing signature or secret.");
    return jsonResponse(400, { error: "Missing Signature/Secret" });
  }

  const payload = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return jsonResponse(400, { error: `Webhook Error: ${err.message}` });
  }

  // Solo nos importa completed
  if (stripeEvent.type !== "checkout.session.completed") {
    return jsonResponse(200, { received: true });
  }

  try {
    if (!supabaseAdmin) {
      console.error("SupabaseAdmin missing (set SUPABASE_SERVICE_ROLE_KEY).");
      return jsonResponse(200, { received: true, warning: "supabase_admin_missing" });
    }

    const session = stripeEvent.data.object;
    const stripe_session_id = session.id;

    const mode = String(session.metadata?.score_mode || "pickup").toLowerCase();
    const org_id = session.metadata?.org_id || (await getScoreOrgId());

    const customer = session.customer_details || {};
    const shipping = session.shipping_details || null;

    const customer_email = customer.email || null;
    const currency = String(session.currency || "mxn").toUpperCase();
    const total = toMoneyFromCents(session.amount_total);
    const shipping_cost = toMoneyFromCents(session.total_details?.amount_shipping || 0);

    const address = (shipping && shipping.address) ? shipping.address : (customer.address || null);

    // Line items
    let items = [];
    try {
      const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      items = (li.data || []).map((x) => ({
        description: x.description || null,
        quantity: Number(x.quantity || 0),
        amount_total: toMoneyFromCents(x.amount_total),
        currency,
      }));
    } catch (e) {
      console.warn("Line items fetch failed:", e?.message || e);
    }

    const upsertPayload = {
      org_id,
      stripe_session_id,
      customer_email,
      total,
      currency,
      status: "paid",
      shipping_mode: mode,
      shipping_cost,
      address_json: address || null,
      items_json: items?.length ? items : null,
    };

    const { data: order, error: upErr } = await supabaseAdmin
      .from("orders")
      .upsert(upsertPayload, { onConflict: "stripe_session_id" })
      .select("*")
      .single();

    if (upErr) {
      console.error("Supabase order upsert error:", upErr);
      return jsonResponse(200, { received: true, warning: "supabase_upsert_failed" });
    }

    // Generar guía si aplica
    const needsLabel = (mode === "mx" || mode === "us");
    const hasTracking = Boolean(order?.tracking_number);

    if (needsLabel && !hasTracking && address?.postal_code) {
      const qty = (items || []).reduce((acc, x) => acc + Number(x.quantity || 0), 0) || 1;

      const shipment = await createEnviaLabel(
        {
          name: shipping?.name || customer?.name || "Cliente",
          email: customer_email || "cliente@scorestore.com",
          phone: customer?.phone || "0000000000",
          address,
        },
        qty
      );

      if (shipment?.tracking) {
        console.log("Envia label OK:", shipment.tracking);
        await supabaseAdmin
          .from("orders")
          .update({
            tracking_number: shipment.tracking,
            label_url: shipment.labelUrl,
            carrier: shipment.carrier,
            status: "shipped",
          })
          .eq("stripe_session_id", stripe_session_id);
      } else {
        console.warn("Envia label NOT generated (check ENVIA_API_KEY / saldo / address).");
      }
    }

    return jsonResponse(200, { received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return jsonResponse(200, { received: true, error: err?.message || "webhook_failed" });
  }
};