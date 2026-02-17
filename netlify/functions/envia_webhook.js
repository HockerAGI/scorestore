"use strict";
const { jsonResponse, handleOptions, safeJsonParse, supabaseAdmin } = require("./_shared");

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;
  if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  try {
    const body = safeJsonParse(event.body);

    // Envia webhook schema varies by account/setup. We store raw payload + status if we can find it.
    const status =
      body?.status ||
      body?.event?.status ||
      body?.data?.status ||
      body?.shipment?.status ||
      body?.tracking?.status ||
      "unknown";

    const tracking =
      body?.tracking_number ||
      body?.trackingNumber ||
      body?.event?.tracking_number ||
      body?.data?.tracking_number ||
      body?.shipment?.tracking_number ||
      null;

    const stripe_session_id =
      body?.reference ||
      body?.order_reference ||
      body?.data?.order_reference ||
      body?.metadata?.stripe_session_id ||
      null;

    if (supabaseAdmin) {
      await supabaseAdmin.from("shipping_webhooks").insert({
        created_at: new Date().toISOString(),
        provider: "envia",
        status: String(status),
        tracking_number: tracking,
        stripe_session_id,
        raw: body,
      });
    }

    return jsonResponse(200, { ok: true, received: true });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: "envia webhook error", details: String(e?.message || e) });
  }
};
