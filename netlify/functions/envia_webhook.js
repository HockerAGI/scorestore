// netlify/functions/envia_webhook.js
// Webhook para actualizaciones de Envia → actualiza status por tracking en Supabase
//
// Requiere (opcional pero recomendado):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Espera payload tipo:
// { tracking_number | trackingNumber: "...", status | carrier_status: "..." }

const { jsonResponse, supabaseAdmin, safeJsonParse } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const payload = safeJsonParse(event.body);

    const tracking = payload.tracking_number || payload.trackingNumber || payload.tracking;
    const status = payload.status || payload.carrier_status || payload.delivery_status;

    if (tracking && status && supabaseAdmin) {
      await supabaseAdmin
        .from("orders")
        .update({
          delivery_status: String(status),
          last_update: new Date().toISOString(),
        })
        .eq("tracking_number", String(tracking));
    }

    return jsonResponse(200, { received: true });
  } catch (error) {
    return jsonResponse(400, { error: "Bad Request" });
  }
};