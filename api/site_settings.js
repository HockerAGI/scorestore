"use strict";

const shared = require("./_shared");

const jsonResponse = shared.jsonResponse;
const handleOptions = shared.handleOptions;
const readPublicSiteSettings = shared.readPublicSiteSettings;

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
        : {
            ok: true,
            hero_title: null,
            hero_image: null,
            promo_active: false,
            promo_text: "",
            pixel_id: "",
            maintenance_mode: false,
            season_key: "default",
            theme: { accent: "#e10600", accent2: "#111111", particles: true },
            home: { footer_note: "", shipping_note: "", returns_note: "", support_hours: "" },
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

    return send(res, jsonResponse(200, settings, origin));
  } catch {
    return send(
      res,
      jsonResponse(
        200,
        {
          ok: true,
          hero_title: null,
          hero_image: null,
          promo_active: false,
          promo_text: "",
          pixel_id: "",
          maintenance_mode: false,
          season_key: "default",
          theme: { accent: "#e10600", accent2: "#111111", particles: true },
          home: { footer_note: "", shipping_note: "", returns_note: "", support_hours: "" },
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
        },
        origin
      )
    );
  }
};