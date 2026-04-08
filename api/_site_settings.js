// api/_site_settings.js
"use strict";

const shared = require("../lib/_shared");

const jsonResponse = shared.jsonResponse;
const handleOptions = shared.handleOptions;
const supabaseAdmin = shared.supabaseAdmin;
const readPublicSiteSettings = shared.readPublicSiteSettings;
const resolveScoreOrgId = shared.resolveScoreOrgId;
const safeStr = shared.safeStr || ((v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v)));

const DEFAULT_SCORE_ORG_ID =
  process.env.DEFAULT_SCORE_ORG_ID ||
  "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";

  res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body || "");
}

function getOrigin(req) {
  return req?.headers?.origin || req?.headers?.Origin || "*";
}

function parseBody(req) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === "object") return body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method === "GET") {
    const sb = supabaseAdmin();
    const orgId = await resolveScoreOrgId(sb);
    const data = await readPublicSiteSettings(sb, orgId);
    return send(res, jsonResponse(200, { ok: true, data }, origin));
  }

  if (req.method === "PATCH" || req.method === "POST") {
    const sb = supabaseAdmin();
    if (!sb) {
      return send(res, jsonResponse(500, { ok: false, error: "supabase_not_configured" }, origin));
    }

    const body = parseBody(req);
    const orgId = safeStr(body.org_id || body.orgId || body.organization_id || "").trim() || await resolveScoreOrgId(sb);

    const payload = {
      org_id: orgId,
      organization_id: orgId,
      hero_title: body.hero_title ?? null,
      hero_image: body.hero_image ?? null,
      promo_active: !!body.promo_active,
      promo_text: body.promo_text ?? "",
      pixel_id: body.pixel_id ?? "",
      maintenance_mode: !!body.maintenance_mode,
      season_key: body.season_key ?? "default",
      theme: body.theme && typeof body.theme === "object" ? body.theme : {},
      home: body.home && typeof body.home === "object" ? body.home : {},
      socials: body.socials && typeof body.socials === "object" ? body.socials : {},
      contact_email: body.contact_email ?? null,
      contact_phone: body.contact_phone ?? null,
      whatsapp_e164: body.whatsapp_e164 ?? null,
      whatsapp_display: body.whatsapp_display ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from("site_settings").upsert(payload, { onConflict: "org_id" });
    if (error) {
      return send(res, jsonResponse(500, { ok: false, error: error.message || "site_settings_failed" }, origin));
    }

    return send(res, jsonResponse(200, { ok: true, data: payload }, origin));
  }

  return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
};