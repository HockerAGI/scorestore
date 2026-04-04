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
} = require("./_shared");

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
    const [orders, products, settings] = await Promise.all([
      sb.from("orders").select("id", { count: "exact", head: true }).limit(1),
      sb.from("products").select("id", { count: "exact", head: true }).limit(1),
      sb.from("site_settings").select("organization_id", { count: "exact", head: true }).limit(1),
    ]);

    const error = orders.error || products.error || settings.error;
    if (error) {
      return {
        ok: false,
        status: "error",
        message: error.message || "Error consultando base de datos",
      };
    }

    return {
      ok: true,
      status: "ok",
      message: "Supabase operativo",
    };
  } catch (e) {
    return {
      ok: false,
      status: "error",
      message: String(e?.message || e || "Fallo al consultar la base de datos"),
    };
  }
}

async function checkStripeHealth() {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return {
        ok: false,
        status: "missing",
        message: "STRIPE_SECRET_KEY no configurada",
      };
    }

    const stripe = initStripe ? initStripe() : null;
    if (!stripe) {
      return {
        ok: false,
        status: "unavailable",
        message: "Stripe no inicializado",
      };
    }

    const account = await stripe.accounts.retrieve();
    return {
      ok: true,
      status: "ok",
      message: "Stripe operativo",
      account_id: account?.id || null,
      country: account?.country || null,
      charges_enabled: !!account?.charges_enabled,
      payouts_enabled: !!account?.payouts_enabled,
    };
  } catch (e) {
    return {
      ok: false,
      status: "error",
      message: String(e?.message || e || "Stripe no responde"),
    };
  }
}

async function checkEnviaHealth() {
  try {
    if (!process.env.ENVIA_API_KEY) {
      return {
        ok: false,
        status: "missing",
        message: "ENVIA_API_KEY no configurada",
      };
    }

    const quote = await getEnviaQuote
      ? await Promise.race([
          getEnviaQuote({ zip: "22614", country: "MX", items_qty: 1 }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 12000)
          ),
        ]).catch(() => null)
      : null;

    if (quote?.ok) {
      return {
        ok: true,
        status: "ok",
        message: "Envía.com operativo",
        provider: quote.provider || "envia",
        label: quote.label || null,
        amount_cents: quote.amount_cents || null,
      };
    }

    const fallback = getFallbackShipping
      ? getFallbackShipping("MX", 1)
      : null;

    return {
      ok: true,
      status: "degraded",
      message: "Envía.com con fallback local",
      provider: fallback?.provider || "fallback",
      amount_cents: fallback?.amount_cents || null,
    };
  } catch (e) {
    return {
      ok: false,
      status: "error",
      message: String(e?.message || e || "Envía no responde"),
    };
  }
}

async function checkIA() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

  return {
    ok: Boolean(apiKey),
    status: apiKey ? "ok" : "missing",
    message: apiKey ? "IA configurada" : "IA no configurada",
    provider: apiKey ? (process.env.GEMINI_API_KEY ? "gemini" : "openai") : "none",
    model: apiKey ? model : null,
    endpoint: "/api/ai",
  };
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

    const auth = await checkAuth(req);
    if (!auth.ok) {
      return send(
        res,
        jsonResponse(
          401,
          {
            ok: false,
            error: auth.message,
            checks: {
              auth,
            },
          },
          origin
        )
      );
    }

    const sb = supabaseAdmin();
    const [db, stripe, envia, ia] = await Promise.all([
      checkDB(sb),
      checkStripeHealth(),
      checkEnviaHealth(),
      checkIA(),
    ]);

    const ok = auth.ok && db.ok && stripe.ok && envia.ok && ia.ok;

    return send(
      res,
      jsonResponse(
        200,
        {
          ok,
          timestamp: new Date().toISOString(),
          support: DEFAULT_SUPPORT,
          checks: {
            auth,
            db,
            stripe,
            envia,
            ia,
          },
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
          error: err?.message || "No fue posible completar el health check.",
        },
        origin
      )
    );
  }
}

module.exports = main;
module.exports.default = main;