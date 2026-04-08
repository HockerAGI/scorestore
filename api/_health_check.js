// api/health_check.js
"use strict";

const {
  jsonResponse,
  handleOptions,
  supabaseAdmin,
  initStripe,
  safeStr,
  getEnviaQuote,
  getFallbackShipping,
} = require("../lib/_shared");

const { requireAdmin } = require("./_auth");

const DEFAULT_SUPPORT = {
  email: process.env.SUPPORT_EMAIL || "ventas.unicotextil@gmail.com",
  whatsapp: process.env.SUPPORT_WHATSAPP_DISPLAY || "664 236 8701",
};

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

function getToken(req) {
  const h = req?.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const m = auth.match(/^Bearer\s+(.*)$/i);
  return m ? m[1].trim() : "";
}

async function checkAuth(req) {
  const token = getToken(req);
  if (!token) {
    return {
      ok: false,
      status: "missing",
      message: "Token requerido",
    };
  }

  const admin = requireAdmin(req);
  if (!admin?.ok) {
    return {
      ok: false,
      status: admin?.error || "forbidden",
      message: admin?.error || "Acceso no autorizado",
    };
  }

  return {
    ok: true,
    status: "ok",
    role: admin.user?.role || admin.user?.user_role || "unknown",
  };
}

async function checkDB(sb) {
  if (!sb) {
    return {
      ok: false,
      status: "unavailable",
      message: "Supabase no configurado",
    };
  }

  try {
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      sb.from("site_settings").select("org_id").limit(1),
      sb.from("products").select("id").limit(1),
    ]);

    if (e1 || e2) {
      return {
        ok: false,
        status: "error",
        message: e1?.message || e2?.message || "Error de base de datos",
      };
    }

    return {
      ok: true,
      status: "ok",
      message: "DB healthy",
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message: error?.message || "Error de conexión",
    };
  }
}

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === "OPTIONS") {
    return send(res, handleOptions({ headers: req.headers }));
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  const auth = await checkAuth(req);
  const sb = supabaseAdmin();
  const db = await checkDB(sb);
  const stripe = initStripe();

  let ship = null;
  try {
    ship = await getEnviaQuote({ zip: "22614", country: "MX", items_qty: 1 });
  } catch {
    ship = getFallbackShipping("MX", 1);
  }

  const payload = {
    ok: true,
    auth,
    db,
    stripe: !!stripe,
    support: DEFAULT_SUPPORT,
    shipping: ship,
    ts: new Date().toISOString(),
  };

  return send(res, jsonResponse(200, payload, origin));
};