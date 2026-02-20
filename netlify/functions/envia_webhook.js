"use strict";

const { jsonResponse, handleOptions, safeJsonParse, isSupabaseConfigured, supabaseAdmin, sendTelegram } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const payload = safeJsonParse(event.body) || {};
    
    const trackingNumber = payload.data?.trackingNumber || payload.tracking_number || null;
    const status = payload.data?.status || payload.status || "UNKNOWN";
    const carrier = payload.data?.carrier || payload.carrier || "envia";

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      if (sb) {
        try {
          await sb.from("shipping_webhooks").insert({
            provider: carrier,
            tracking_number: trackingNumber,
            status: status,
            raw: payload,
            created_at: new Date().toISOString(),
          });

          // CORRECCIÓN: Actualización directa ahora que las columnas existen en el schema.sql
          if (trackingNumber) {
            await sb.from("shipping_labels")
              .update({ 
                status: status, 
                updated_at: new Date().toISOString() 
              })
              .eq("tracking_number", trackingNumber);

            if (status.toUpperCase() === "DELIVERED" || status.toUpperCase() === "ENTREGADO") {
              try {
                await sendTelegram(`📦 ✅ <b>Paquete Entregado</b>\nTracking: <code>${trackingNumber}</code>\nCarrier: <b>${carrier.toUpperCase()}</b>\n¡El cliente ya recibió su paquete Oficial!`);
              } catch(e) {}
            }
          }
        } catch (e) {
          console.log("[shipping_webhooks] warn Supabase sync:", e?.message || e);
        }
      }
    }

    return jsonResponse(200, { ok: true, received: true }, origin);
  } catch (e) {
    console.error("[envia_webhook] fatal:", e);
    return jsonResponse(200, { ok: true, warning: String(e?.message || e) }, origin);
  }
};
