"use strict";

const { jsonResponse, handleOptions, safeJsonParse, isSupabaseConfigured, supabaseAdmin } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const payload = safeJsonParse(event.body) || {};

    if (isSupabaseConfigured()) {
      const sb = supabaseAdmin();
      if (sb) {
        try {
          await sb.from("shipping_webhooks").insert({
            provider: "envia",
            payload,
            created_at: new Date().toISOString(),
          });
        } catch (e) {
          console.log("[shipping_webhooks] warn insert:", e?.message || e);
        }
      }
    }

    return jsonResponse(200, { ok: true }, origin);
  } catch (e) {
    return jsonResponse(200, { ok: true, warning: String(e?.message || e) }, origin);
  }
};
