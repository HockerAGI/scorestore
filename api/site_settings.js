// api/site_settings.js
"use strict";

const shared = require("./_shared");

const jsonResponse = shared.jsonResponse;
const handleOptions = shared.handleOptions;
const readPublicSiteSettings = shared.readPublicSiteSettings;

const DEFAULT_SETTINGS = {
  ok: true,
  hero_title: null,
  hero_image: null,
  promo_active: false,
  promo_text: "",
  pixel_id: "",
  maintenance_mode: false,
  season_key: "default",
  theme: {
    accent: "#e10600",
    accent2: "#111111",
    particles: true,
  },
  home: {
    footer_note: "",
    shipping_note: "",
    returns_note: "",
    support_hours: "",
  },
  socials: {
    facebook: "https://www.facebook.com/uniforme.unico/",
    instagram: "https://www.instagram.com/uniformes.unico",
    youtube: "https://youtu.be/F4lw1EcehIA?si=jFBT9skFLs566g8N",
    tiktok: "",
  },
  contact: {
    email: "ventas.unicotextil@gmail.com",
    phone: "6642368701",
    whatsapp_e164: "5216642368701",
    whatsapp_display: "664 236 8701",
  },
  updated_at: null,
};

const withNoStore = (resp) => {
  const out = resp || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";
  return out;
};

const send = (res, resp) => {
  const out = withNoStore(resp);
  if (out.headers) {
    Object.keys(out.headers).forEach((key) => res.setHeader(key, out.headers[key]));
  }
  res.status(out.statusCode || 200).send(out.body);
};

function normalizeSettings(input) {
  const data = input && typeof input === "object" ? input : {};
  const theme = data.theme && typeof data.theme === "object" ? data.theme : {};
  const home = data.home && typeof data.home === "object" ? data.home : {};
  const socials = data.socials && typeof data.socials === "object" ? data.socials : {};
  const contact = data.contact && typeof data.contact === "object" ? data.contact : {};

  return {
    ...DEFAULT_SETTINGS,
    ...data,
    ok: true,
    theme: {
      ...DEFAULT_SETTINGS.theme,
      ...theme,
    },
    home: {
      ...DEFAULT_SETTINGS.home,
      ...home,
    },
    socials: {
      ...DEFAULT_SETTINGS.socials,
      ...socials,
    },
    contact: {
      ...DEFAULT_SETTINGS.contact,
      ...contact,
    },
  };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "*";

  if (req.method === "OPTIONS") {
    const optionsRes =
      handleOptions?.({ headers: { origin } }) ||
      {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: "",
      };

    return send(res, optionsRes);
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  try {
    const settings =
      typeof readPublicSiteSettings === "function"
        ? await readPublicSiteSettings()
        : DEFAULT_SETTINGS;

    return send(
      res,
      jsonResponse(
        200,
        {
          ...normalizeSettings(settings),
          ok: true,
        },
        origin
      )
    );
  } catch (error) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: String(error?.message || error || "No se pudieron cargar los ajustes"),
        },
        origin
      )
    );
  }
};