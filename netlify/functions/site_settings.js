"use strict";

const { jsonResponse, handleOptions, supabaseAdmin } = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

const withNoStore = (resp) => {
  resp.headers = resp.headers || {};
  resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  resp.headers["Pragma"] = "no-cache";
  resp.headers["Expires"] = "0";
  return resp;
};

const resolveOrgId = async (sb) => {
  const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (envId && isUuid(envId)) return String(envId).trim();

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
  if (event.httpMethod !== "GET") {
    return withNoStore(jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  const defaults = {
    ok: true,
    org_id: DEFAULT_SCORE_ORG_ID,
    season_key: "default",
    maintenance_mode: false,
    hero_title: null,
    hero_image: null,
    promo_active: false,
    promo_text: "",
    pixel_id: "",
    contact_email: process.env.SUPPORT_EMAIL || "ventas.unicotextil@gmail.com",
    theme: {
      accent: "#e10600",
      accent2: "#111827",
      vfx_level: 0.8,
      particles: true,
      bg_glow: true,
      hero_bg_url: "",
      logo_url: "",
      season_badge_url: "",
    },
    home: {
      hero_subtitle: "",
      cta_primary: "Explorar Colecciones",
      cta_secondary: "Abrir Carrito",
      section_categories: "Colecciones",
      section_catalog: "Catálogo",
    },
    socials: {
      facebook: process.env.SOCIAL_FACEBOOK || "https://www.facebook.com/uniforme.unico/",
      instagram: process.env.SOCIAL_INSTAGRAM || "https://www.instagram.com/uniformes.unico",
      youtube: process.env.SOCIAL_YOUTUBE || "https://youtu.be/F4lw1EcehIA?si=jFBT9skFLs566g8N",
      whatsapp_e164: process.env.SUPPORT_WHATSAPP_E164 || "5216642368701",
      whatsapp_display: process.env.SUPPORT_WHATSAPP_DISPLAY || "664 236 8701",
    },
    updated_at: null,
  };

  const sb = supabaseAdmin();
  if (!sb) return withNoStore(jsonResponse(200, defaults, origin));

  try {
    const orgId = await resolveOrgId(sb);

    const { data, error } = await sb
      .from("site_settings")
      .select(
        "org_id, season_key, maintenance_mode, hero_title, hero_image, promo_active, promo_text, pixel_id, contact_email, theme, home, socials, updated_at"
      )
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return withNoStore(jsonResponse(200, { ...defaults, org_id: orgId }, origin));
    }

    const safeJson = (v, fallback) => {
      if (!v || typeof v !== "object") return fallback;
      return v;
    };

    return withNoStore(
      jsonResponse(
        200,
        {
          ...defaults,
          org_id: data.org_id || orgId,
          season_key: String(data.season_key || "default"),
          maintenance_mode: !!data.maintenance_mode,
          hero_title: data.hero_title || null,
          hero_image: data.hero_image || null,
          promo_active: !!data.promo_active,
          promo_text: data.promo_text || "",
          pixel_id: data.pixel_id || "",
          contact_email: data.contact_email || defaults.contact_email,
          theme: safeJson(data.theme, defaults.theme),
          home: safeJson(data.home, defaults.home),
          socials: safeJson(data.socials, defaults.socials),
          updated_at: data.updated_at || null,
        },
        origin
      )
    );
  } catch {
    return withNoStore(jsonResponse(200, defaults, origin));
  }
};