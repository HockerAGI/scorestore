const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
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

function pickAddressFromSession(session) {
  // Si NO recolectas address en checkout, esto vendrá vacío.
  const addr = session?.customer_details?.address || session?.shipping_details?.address || null;
  const name = session?.shipping_details?.name || session?.customer_details?.name || session?.metadata?.customer_name || "";
  const phone = session?.customer_details?.phone || session?.metadata?.customer_phone || "";
  const email = session?.customer_details?.email || session?.metadata?.customer_email || "";

  if (!addr) return null;

  return {
    name,
    phone,
    email,
    address1: addr.line1 || "",
    address2: addr.line2 || "",
    city: addr.city || "",
    state: addr.state || "",
    postal_code: addr.postal_code || session?.metadata?.customer_cp || "",
    country_code: (addr.country || session?.metadata?.customer_country || "MX").toUpperCase(),
  };
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  const sig = (event.headers && (event.headers["stripe-signature"] || event.headers["Stripe-Signature"])) || "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return jsonResponse(500, { ok: false, error: "STRIPE_WEBHOOK_SECRET missing" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), sig, secret);
  } catch (err) {
    return jsonResponse(400, { ok: false, error: `Webhook Error: ${err.message}` });
  }

  try {
    const type = stripeEvent.type;
    const session = stripeEvent.data.object;

    if (type !== "checkout.session.completed") {
      return jsonResponse(200, { ok: true, ignored: true, type });
    }

    const sessionId = session.id;

    const org_id = session?.metadata?.org_id || null;
    const items_qty = Number(session?.metadata?.items_qty || 0) || null;
    const shipping_mode = session?.metadata?.shipping_mode || null;

    const customer_name = session?.metadata?.customer_name || session?.customer_details?.name || null;
    const customer_phone = session?.metadata?.customer_phone || session?.customer_details?.phone || null;
    const customer_email = session?.metadata?.customer_email || session?.customer_details?.email || null;
    const customer_cp = session?.metadata?.customer_cp || session?.customer_details?.address?.postal_code || null;
    const customer_country = session?.metadata?.customer_country || session?.customer_details?.address?.country || "MX";

    const currency = (session.currency || "mxn").toUpperCase();
    const total = Number(session.amount_total ? session.amount_total / 100 : 0);

    // Intentar label SOLO si hay address completo
    const destination = pickAddressFromSession(session);

    let label = { ok: false, skipped: true };
    if (destination) {
      label = await createEnviaLabel({
        order: { stripe_session_id: sessionId, items_qty },
        destination,
      });
    }

    const tracking_number = label?.tracking_number || null;
    const label_url = label?.label_url || null;
    const carrier = label?.carrier || null;

    if (supabaseAdmin) {
      const payload = {
        org_id,
        stripe_session_id: sessionId,
        status: "paid",
        currency,
        total,
        shipping_mode,
        customer_name,
        customer_phone,
        customer_email,
        customer_cp,
        customer_country,
        items_qty,
        tracking_number,
        label_url,
        carrier,
        raw_meta: JSON.stringify({ session, envia: label }),
      };

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

    const msg =
      `✅ Pago confirmado\n` +
      `Session: ${sessionId}\n` +
      `Total: ${total} ${currency}\n` +
      `Cliente: ${customer_name || "-"}\n` +
      `País: ${String(customer_country || "MX").toUpperCase()}\n` +
      `CP: ${customer_cp || "-"}\n` +
      `Tracking: ${tracking_number || "(pendiente)"}`;

    await sendTelegram(msg);

    return jsonResponse(200, { ok: true, label: label?.ok ? "created" : "skipped" });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err?.message || "Webhook handler failed" });
  }
};
