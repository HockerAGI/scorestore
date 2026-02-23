"use strict";

const { jsonResponse, handleOptions, supabaseAdmin } = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  if (event.httpMethod === "OPTIONS") return handleOptions(event);
  if (event.httpMethod !== "GET") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

  // Switch maestro: Si no está en 1, apaga el neuromarketing para proteger rendimiento
  if (process.env.ENABLE_ACTIVITY_FEED !== "1") {
    return jsonResponse(200, { ok: true, events: [] }, origin);
  }

  const supabase = supabaseAdmin();
  if (!supabase) {
    return jsonResponse(200, { ok: true, events: [] }, origin);
  }

  try {
    // Consulta a Supabase: Últimas 10 órdenes pagadas
    const { data, error } = await supabase
      .from("orders")
      .select("customer_name, items_summary, created_at")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    // Sanitización y parseo para el Front-end
    const events = (data || []).map(order => {
        // Solo el primer nombre por privacidad
        const name = order.customer_name ? order.customer_name.split(" ")[0] : "Un fan";
        
        // Extraer el nombre del primer producto del summary (ej. "1x SKU[M] | ...")
        let item_name = "mercancía oficial";
        if (order.items_summary) {
            const match = order.items_summary.split("|")[0].match(/x\s([^\[]+)\[/);
            if (match && match[1]) {
                item_name = match[1].trim();
            }
        }
        
        return { buyer_name: name, item_name };
    });

    return jsonResponse(200, { ok: true, events }, origin);
  } catch (e) {
    console.error("[Activity Feed Error]:", e.message);
    return jsonResponse(500, { ok: false, error: "Error consultando DB." }, origin);
  }
};