// api/site_settings.js
"use strict";

const shared = require("./_shared");

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

function getQueryValue(req, key) {
  try {
    const url = new URL(req.url, "http://localhost");
    return safeStr(url.searchParams.get(key));
  } catch {
    return "";
  }
}

function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true") return true;
  if (v === 0 || v === "0" || v === "false") return false;
  return fallback;
}

function normalizeTheme(theme) {
  const obj = theme && typeof theme === "object" ? theme : {};
  return {
    accent: safeStr(obj.accent || "#e10600"),
    accent2: safeStr(obj.accent2 || "#111111"),
    particles: toBool(obj.particles, true),
  };
}

function normalizeHome(home) {
  const obj = home && typeof home === "object" ? home : {};
  return {
    footer_note: safeStr(obj.footer_note || "Pago cifrado vía Stripe. Aceptamos OXXO Pay.\nLogística inteligente internacional con Envía.com."),
    shipping_note: safeStr(obj.shipping_note || ""),
    returns_note: safeStr(obj.returns_note || ""),
    support_hours: safeStr(obj.support_hours || ""),
    hero_text: safeStr(obj.hero_text || ""),
  };
}

function normalizeSocials(socials) {
  const obj = socials && typeof socials === "object" ? socials : {};
  return {
    facebook: safeStr(obj.facebook || ""),
    instagram: safeStr(obj.instagram || ""),
    youtube: safeStr(obj.youtube || ""),
    tiktok: safeStr(obj.tiktok || ""),
  };
}

function normalizeContact(row) {
  return {
    email: safeStr(
      row?.contact_email ||
        row?.contact?.email ||
        process.env.SUPPORT_EMAIL ||
        "ventas.unicotextil@gmail.com"
    ),
    phone: safeStr(
      row?.contact_phone ||
        row?.contact?.phone ||
        process.env.SUPPORT_PHONE ||
        "6642368701"
    ),
    whatsapp_e164: safeStr(
      row?.whatsapp_e164 ||
        row?.contact?.whatsapp_e164 ||
        process.env.SUPPORT_WHATSAPP_E164 ||
        "5216642368701"
    ),
    whatsapp_display: safeStr(
      row?.whatsapp_display ||
        row?.contact?.whatsapp_display ||
        process.env.SUPPORT_WHATSAPP_DISPLAY ||
        "664 236 8701"
    ),
  };
}

function shapeSettings(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    org_id: safeStr(r.org_id || r.organization_id || ""),
    hero_title: safeStr(r.hero_title || "SCORE STORE"),
    hero_image: safeStr(r.hero_image || ""),
    promo_active: toBool(r.promo_active, false),
    promo_text: safeStr(r.promo_text || ""),
    pixel_id: safeStr(r.pixel_id || ""),
    maintenance_mode: toBool(r.maintenance_mode, false),
    season_key: safeStr(r.season_key || "default"),
    theme: normalizeTheme(r.theme),
    home: normalizeHome(r.home),
    socials: normalizeSocials(r.socials),
    contact: normalizeContact(r),
    updated_at: r.updated_at || null,
    created_at: r.created_at || null,
  };
}

async function fetchSettingsForOrg(sb, orgId) {
  if (typeof readPublicSiteSettings === "function") {
    try {
      const data = await readPublicSiteSettings(sb, orgId);
      return shapeSettings(data);
    } catch {}
  }

  const { data, error } = await sb
    .from("site_settings")
    .select(
      `
      organization_id,
      org_id,
      hero_title,
      hero_image,
      promo_active,
      promo_text,
      pixel_id,
      maintenance_mode,
      season_key,
      theme,
      home,
      socials,
      contact_email,
      contact_phone,
      whatsapp_e164,
      whatsapp_display,
      updated_at,
      created_at
    `
    )
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return shapeSettings(null);
  }

  return shapeSettings(data);
}

async function resolveOrg(sb, req) {
  const direct =
    getQueryValue(req, "org_id") ||
    getQueryValue(req, "orgId") ||
    getQueryValue(req, "organization_id");

  if (direct) return direct;

  if (typeof resolveScoreOrgId === "function") {
    try {
      const resolved = await resolveScoreOrgId(sb);
      if (resolved) return resolved;
    } catch {}
  }

  return DEFAULT_SCORE_ORG_ID;
}

async function main(req, res) {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method !== "GET") {
      return send(
        res,
        jsonResponse(405, { ok: false, error: "Method not allowed" }, origin)
      );
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return send(
        res,
        jsonResponse(500, { ok: false, error: "Supabase not configured" }, origin)
      );
    }

    const orgId = await resolveOrg(sb, req);
    const site_settings = await fetchSettingsForOrg(sb, orgId);

    return send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          org_id: orgId,
          site_settings,
          data: site_settings,
          ...site_settings,
        },
        origin
      )
    );
  } catch (err) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: err?.message || "No se pudieron cargar los ajustes del sitio.",
        },
        getOrigin(req)
      )
    );
  }
}

module.exports = main;
module.exports.default = main;