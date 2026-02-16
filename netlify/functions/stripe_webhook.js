const Stripe = require("stripe");
const {
  jsonResponse,
  handleOptions,
  readRawBody,
  sendTelegram,
  isEnviaConfigured,
  createEnviaLabel,
  isSupabaseConfigured,
  supabase,
} = require("./_shared");

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return handleOptions();
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET_KEY) return jsonResponse(500, { error: "STRIPE_SECRET_KEY no configurada" });
    if (!STRIPE_WEBHOOK_SECRET) return jsonResponse(500, { error: "STRIPE_WEBHOOK_SECRET no configurada" });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const sig = event.headers["stripe-signature"];
    if (!sig) return jsonResponse(400, { error: "Missing stripe-signature" });

    const rawBody = await readRawBody(event);

    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return jsonResponse(400, { error: "Invalid signature", details: String(err?.message || err) });
    }

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;
      const meta = session.metadata || {};
      const shippingMode = String(meta.shipping_mode || "").toLowerCase();

      // Save paid order (optional)
      try {
        if (isSupabaseConfigured()) {
          await supabase.from("orders").insert({
            created_at: new Date().toISOString(),
            stripe_session_id: session.id,
            status: "paid",
            amount_total: session.amount_total,
            currency: session.currency,
            customer_email: session.customer_details?.email || null,
            customer_phone: session.customer_details?.phone || null,
            shipping_mode: shippingMode || null,
            promo_code: meta.promo_code || null,
            metadata: meta,
            raw: session,
          });
        }
      } catch (_) {}

      // Generate label ONLY for Envia modes
      let labelResult = null;
      const shouldGenerateLabel = shippingMode === "envia_mx" || shippingMode === "envia_us";

      if (shouldGenerateLabel && isEnviaConfigured()) {
        try {
          const address = session.shipping_details?.address;
          const name = session.shipping_details?.name || session.customer_details?.name || "Cliente";
          const phone = session.customer_details?.phone || "";

          if (address && address.postal_code && address.country) {
            labelResult = await createEnviaLabel({
              stripe_session_id: session.id,
              destination: {
                name,
                company: "",
                email: session.customer_details?.email || "",
                phone: phone,
                street: address.line1 || "",
                number: "",
                district: address.line2 || "",
                city: address.city || "",
                state: address.state || "",
                country_code: address.country === "US" ? "USA" : "MEX",
                postal_code: address.postal_code || "",
                reference: "",
              },
              meta: {
                items_qty: Number(meta.items_qty) || 1,
              },
            });

            try {
              if (isSupabaseConfigured() && labelResult?.ok && labelResult?.label?.carrier) {
                await supabase.from("shipping_labels").insert({
                  created_at: new Date().toISOString(),
                  stripe_session_id: session.id,
                  provider: "envia",
                  carrier: labelResult.label.carrier || null,
                  tracking_number: labelResult.label.tracking_number || null,
                  file: labelResult.label.file || null,
                  raw: labelResult,
                });
              }
            } catch (_) {}
          } else {
            labelResult = { ok: false, error: "Shipping address missing for label generation" };
          }
        } catch (e) {
          labelResult = { ok: false, error: String(e?.message || e) };
        }
      } else if (shouldGenerateLabel) {
        labelResult = { ok: false, error: "Envia not configured" };
      } else {
        labelResult = { ok: true, skipped: true, reason: "Shipping mode does not require Envia label" };
      }

      // Telegram notify (optional)
      try {
        const amount = (session.amount_total || 0) / 100;
        const deliveryText =
          shippingMode === "pickup"
            ? "Pickup en fábrica"
            : shippingMode === "local_tj"
              ? "Envío local TJ (Uber/Didi)"
              : shippingMode === "envia_us"
                ? "Envío USA (Envia.com)"
                : shippingMode === "envia_mx"
                  ? "Envío Nacional (Envia.com)"
                  : "Entrega";

        const customer = session.customer_details || {};
        const shipping = session.shipping_details || {};
        const addr = shipping.address || {};

        const msg =
          `🧾 *Nuevo pago confirmado (Score Store)*\n\n` +
          `• Sesión: \`${session.id}\`\n` +
          `• Total: *$${amount.toFixed(2)} ${String(session.currency || "mxn").toUpperCase()}*\n` +
          `• Entrega: *${deliveryText}*\n` +
          (meta.promo_code ? `• Promo: *${meta.promo_code}*\n` : "") +
          `\n👤 *Cliente*\n` +
          `• Nombre: ${escapeTg(shipping.name || customer.name || "N/D")}\n` +
          `• Email: ${escapeTg(customer.email || "N/D")}\n` +
          `• Tel: ${escapeTg(customer.phone || "N/D")}\n` +
          (addr && (addr.line1 || addr.postal_code)
            ? `\n📍 *Dirección*\n` +
              `• ${escapeTg([addr.line1, addr.line2].filter(Boolean).join(", "))}\n` +
              `• ${escapeTg([addr.city, addr.state].filter(Boolean).join(", "))}\n` +
              `• ${escapeTg([addr.postal_code, addr.country].filter(Boolean).join(" "))}\n`
            : "") +
          (labelResult?.ok && labelResult?.label?.tracking_number
            ? `\n🚚 *Guía Envia*\n` +
              `• Carrier: ${escapeTg(labelResult.label.carrier || "N/D")}\n` +
              `• Tracking: \`${escapeTg(labelResult.label.tracking_number)}\`\n`
            : labelResult?.skipped
              ? `\n🚚 *Guía Envia*: (no aplica)\n`
              : "");

        await sendTelegram({ text: msg, parse_mode: "Markdown" });
      } catch (_) {}
    }

    return jsonResponse(200, { received: true });
  } catch (e) {
    return jsonResponse(500, { error: "Webhook error", details: String(e?.message || e) });
  }
};

function escapeTg(str) {
  return String(str || "").replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
