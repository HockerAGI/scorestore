const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  supabaseAdmin,
  createEnviaLabel,
  sendTelegram,
} = require("./_shared");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

function getRawBody(event) {
  if (!event.body) return "";
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64").toString("utf8");
  }
  return event.body;
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  const sig =
    (event.headers && (event.headers["stripe-signature"] || event.headers["Stripe-Signature"])) ||
    "";

  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";

  if (!secret) {
    return jsonResponse(500, { ok: false, error: "STRIPE_WEBHOOK_SECRET missing" });
  }

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, secret);
  } catch (err) {
    return jsonResponse(400, { ok: false, error: `Webhook Error: ${err.message}` });
  }

  try {
    const type = stripeEvent.type;
    const obj = stripeEvent.data.object;

    // We only care about checkout.session.completed
    if (type !== "checkout.session.completed") {
      return jsonResponse(200, { ok: true, ignored: true, type });
    }

    const session = obj;
    const sessionId = session.id;

    const items_qty = Number(session?.metadata?.items_qty || 0) || null;
    const shipping_mode = session?.metadata?.shipping_mode || null;

    const customer_name = session?.metadata?.customer_name || null;
    const customer_phone = session?.metadata?.customer_phone || null;
    const customer_email = session?.metadata?.customer_email || session?.customer_details?.email || null;
    const customer_cp = session?.metadata?.customer_cp || null;

    const currency = (session.currency || "mxn").toUpperCase();
    const total = Number(session.amount_total ? session.amount_total / 100 : 0);

    // Try to create Envia label (safe: if not configured, it will skip)
    const label = await createEnviaLabel({
      order: { stripe_session_id: sessionId },
      destination: {
        postal_code: customer_cp,
        name: customer_name,
        phone: customer_phone,
        email: customer_email,
        country_code: "MX",
      },
    });

    const tracking_number = label?.tracking_number || null;
    const label_url = label?.label_url || null;
    const carrier = label?.carrier || null;

    // Persist in DB
    if (supabaseAdmin) {
      const payload = {
        stripe_session_id: sessionId,
        status: "paid",
        currency,
        total,
        shipping_mode,
        customer_name,
        customer_phone,
        customer_email,
        customer_cp,
        items_qty,
        tracking_number,
        label_url,
        carrier,
        raw_meta: JSON.stringify({
          session,
          envia: label,
        }),
      };

      // Update if exists, else insert (keep it simple)
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      if (!exErr && existing?.id) {
        await supabaseAdmin.from("orders").update(payload).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("orders").insert(payload);
      }
    }

    // Telegram notification (optional)
    const msg = `✅ Pago confirmado\nSession: ${sessionId}\nTotal: ${total} ${currency}\nCliente: ${customer_name || "-"}\nCP: ${customer_cp || "-"}\nTracking: ${tracking_number || "-"}`;
    await sendTelegram(msg);

    return jsonResponse(200, { ok: true });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err?.message || "Webhook handler failed" });
  }
};