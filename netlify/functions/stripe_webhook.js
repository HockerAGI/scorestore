const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");

const { jsonResponse, createEnviaLabel, supabaseAdmin, normalizeQty } = require("./_shared");

function getSig(headers) {
  return headers["stripe-signature"] || headers["Stripe-Signature"] || headers["STRIPE-SIGNATURE"] || "";
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await axios.post(
    url,
    { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true },
    { timeout: 15000 }
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const sig = getSig(event.headers || {});
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!whsec) return jsonResponse(500, { error: "STRIPE_WEBHOOK_SECRET missing" });

  try {
    const stripeEvent = stripe.webhooks.constructEvent(event.body, sig, whsec);

    if (stripeEvent.type !== "checkout.session.completed") {
      return jsonResponse(200, { ok: true });
    }

    const session = stripeEvent.data.object;

    const mode = String(session?.metadata?.shipping_mode || "pickup");
    const promoCode = String(session?.metadata?.promo_code || "");
    const total = Number(session.amount_total || 0) / 100;

    const customer = {
      name: session?.customer_details?.name || "",
      phone: session?.customer_details?.phone || "",
      address: session?.customer_details?.address
        ? `${session.customer_details.address.line1 || ""} ${session.customer_details.address.line2 || ""}, ${session.customer_details.address.city || ""}, ${session.customer_details.address.postal_code || ""}`
        : "",
      postal_code: session?.customer_details?.address?.postal_code || "",
      country: session?.customer_details?.address?.country || "MX",
    };

    let envia = null;
    let labelError = null;

    // Create Envia label only when shipping required
    if (mode !== "pickup") {
      const qty = normalizeQty(1);
      const label = await createEnviaLabel({
        zip: customer.postal_code,
        country: customer.country,
        qty,
        customer,
        items: [],
      });

      if (label.ok) envia = { tracking: label.tracking, raw: label.raw };
      else labelError = label.error || "No se pudo generar guía Envia.";
    }

    // Supabase write (optional)
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("orders").insert([
          {
            provider: "stripe",
            provider_id: session.id,
            amount_mxn: total,
            shipping_mode: mode,
            promo_code: promoCode || null,
            customer_name: customer.name || null,
            customer_phone: customer.phone || null,
            shipping_address: customer.address || null,
            tracking_number: envia?.tracking || null,
            delivery_status: mode === "pickup" ? "pickup" : "label_created",
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        console.error("Supabase order insert error:", e?.message || e);
      }
    }

    const cleanName = escapeHtml(customer.name);
    const cleanPhone = escapeHtml(customer.phone);
    const cleanPromo = escapeHtml(promoCode);

    const msg =
      `<b>✅ NUEVA ORDEN PAGADA</b>\n` +
      `SCORE Store\n` +
      `Total: <b>$${total.toFixed(2)} MXN</b>\n` +
      `Modo: <b>${mode}</b>\n` +
      (cleanPromo ? `Cupón: <b>${cleanPromo}</b>\n` : "") +
      (cleanName ? `Cliente: ${cleanName}\n` : "") +
      (cleanPhone ? `Tel: ${cleanPhone}\n` : "") +
      (envia?.tracking ? `Tracking: <b>${envia.tracking}</b>\n` : "") +
      (labelError ? `⚠️ <b>${escapeHtml(labelError)}</b>\n` : "");

    await notifyTelegram(msg);

    return jsonResponse(200, { ok: true });
  } catch (err) {
    console.error("stripe_webhook error:", err);
    return jsonResponse(500, { error: "Webhook handling failed" });
  }
};