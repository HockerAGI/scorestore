const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { jsonResponse, supabaseAdmin, createEnviaLabel } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;
    if (!whsec) return jsonResponse(500, { error: "Falta STRIPE_WEBHOOK_SECRET en env." });

    const sig = event.headers["stripe-signature"];
    const rawBody = event.body;

    const stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, whsec);

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;

      const order = {
        stripe_session_id: session.id,
        customer_email: session.customer_details?.email || null,
        customer_name: session.customer_details?.name || null,
        phone: session.customer_details?.phone || null,
        amount_total: session.amount_total || 0,
        currency: session.currency || "mxn",
        shipping: session.shipping_details || null,
        metadata: session.metadata || {},
        status: "paid",
        created_at: new Date().toISOString(),
      };

      if (supabaseAdmin) {
        await supabaseAdmin.from("orders").insert(order);
      } else {
        console.warn("Supabase SERVICE ROLE no configurado: no se guardó order.");
      }

      // guía real (si hay shipping)
      if (session.shipping_details?.address) {
        const customer = {
          name: session.shipping_details.name || session.customer_details?.name || "Cliente",
          email: session.customer_details?.email || "no-email@scorestore",
          phone: session.customer_details?.phone || "N/A",
          address: session.shipping_details.address,
        };

        const itemsQty = parseInt(session.metadata?.items_qty || "1", 10) || 1;
        const label = await createEnviaLabel(customer, itemsQty);

        if (label && supabaseAdmin) {
          await supabaseAdmin
            .from("orders")
            .update({
              shipping_label_url: label.labelUrl || null,
              tracking_number: label.tracking || null,
              carrier: label.carrier || null,
            })
            .eq("stripe_session_id", session.id);
        }
      }
    }

    return jsonResponse(200, { received: true });
  } catch (e) {
    console.error("stripe_webhook error:", e);
    return jsonResponse(400, { error: "Webhook error" });
  }
};