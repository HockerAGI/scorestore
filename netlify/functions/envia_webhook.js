"use strict";

const { jsonResponse, handleOptions, safeJsonParse, isSupabaseConfigured, supabaseAdmin, sendTelegram } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const payload = safeJsonParse(event.body) || {};
    
    // Extraer datos clave del Webhook de Envia.com
    const trackingNumber = payload.data?.trackingNumber || payload.tracking_number || null;
    const status = payload.data?.status || payload.status || "UNKNOWN";
    const carrier = payload.data?.carrier || payload.carrier || "envia";

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      if (sb) {
        try {
          // 1. Registrar el evento crudo para auditoría
          await sb.from("shipping_webhooks").insert({
            provider: carrier,
            tracking_number: trackingNumber,
            status: status,
            raw: payload,
            created_at: new Date().toISOString(),
          });

          // 2. Si hay tracking, actualizar la tabla de shipping_labels para UnicOs
          if (trackingNumber) {
            await sb.from("shipping_labels")
              .update({ 
                status: status, 
                updated_at: new Date().toISOString() 
              })
              .eq("tracking_number", trackingNumber);

            // 3. Notificar por Telegram si el paquete fue entregado
            if (status.toUpperCase() === "DELIVERED" || status.toUpperCase() === "ENTREGADO") {
              await sendTelegram(`📦 ✅ <b>Paquete Entregado</b>\nTracking: <code>${trackingNumber}</code>\nCarrier: <b>${carrier.toUpperCase()}</b>\n¡El cliente ya tiene su Merch Oficial!`);
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
