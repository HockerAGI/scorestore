const { jsonResponse, supabaseAdmin } = require("./_shared");

/**
 * Optional Envia webhook receiver (status updates)
 * Configure Envia to POST shipment updates to:
 *   https://YOUR_DOMAIN/.netlify/functions/envia_webhook
 *
 * If Supabase is configured, updates orders.delivery_status by tracking_number.
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const payload = JSON.parse(event.body || "{}");
    const tracking = payload.tracking_number || payload.trackingNumber || payload.tracking;
    const status = payload.status || payload.carrier_status || payload.state;

    if (tracking && status && supabaseAdmin) {
      await supabaseAdmin
        .from("orders")
        .update({ delivery_status: String(status), last_update: new Date().toISOString() })
        .eq("tracking_number", String(tracking));
    }

    return jsonResponse(200, { received: true });
  } catch (error) {
    return jsonResponse(400, { error: "Bad Request" });
  }
};