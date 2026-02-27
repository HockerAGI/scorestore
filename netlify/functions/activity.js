"use strict";

const { jsonResponse, handleOptions, supabaseAdmin } = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||"").trim());

const resolveOrgId = async (sb) => {
  const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (envId && isUuid(envId)) return String(envId).trim();

  // Filtro seguro: por default NO fugamos datos
  let orgId = DEFAULT_SCORE_ORG_ID;

  try {
    const { data: byId } = await sb.from("organizations").select("id").eq("id", orgId).limit(1).maybeSingle();
    if (byId?.id) return orgId;

    const { data: byName } = await sb
      .from("organizations")
      .select("id")
      .ilike("name", "%score%")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (byName?.id) orgId = byName.id;
  } catch {}

  return orgId;
};

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  if (event.httpMethod === "OPTIONS") return handleOptions(event);
  if (event.httpMethod !== "GET") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

  if (process.env.ENABLE_ACTIVITY_FEED !== "1") {
    return jsonResponse(200, { ok: true, events: [] }, origin);
  }

  const supabase = supabaseAdmin();
  if (!supabase) return jsonResponse(200, { ok: true, events: [] }, origin);

  try {
    const orgId = await resolveOrgId(supabase);

    const { data, error } = await supabase
      .from("orders")
      .select("customer_name, items_summary, created_at")
      .eq("organization_id", orgId)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const events = (data || []).map((order) => {
      const name = order.customer_name ? String(order.customer_name).split(" ")[0] : "Un fan";
      let item_name = "mercancía oficial";
      if (order.items_summary) {
        const match = String(order.items_summary).split("|")[0].match(/x\s([^\[]+)\[/);
        if (match && match[1]) item_name = match[1].trim();
      }
      return { buyer_name: name, item_name };
    });

    return jsonResponse(200, { ok: true, events }, origin);
  } catch (e) {
    console.error("[Activity Feed Error]:", e.message);
    return jsonResponse(500, { ok: false, error: "Error consultando DB." }, origin);
  }
};