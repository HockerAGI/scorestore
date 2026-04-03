// api/order_detail.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  safeStr,
} = require("./_shared");

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store";

  res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body || "");
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || "*";

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false }, origin));
  }

  try {
    const url = new URL(req.url, "http://x");
    const id = safeStr(url.searchParams.get("id"));

    if (!id) {
      return send(res, jsonResponse(400, { ok: false, error: "id_required" }, origin));
    }

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("orders")
      .select(`
        *,
        shipping_labels (*),
        shipping_webhooks (*)
      `)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return send(res, jsonResponse(404, { ok: false }, origin));
    }

    return send(res, jsonResponse(200, { ok: true, order: data }, origin));
  } catch (e) {
    return send(res, jsonResponse(500, { ok: false, error: "order_detail_failed" }, origin));
  }
};