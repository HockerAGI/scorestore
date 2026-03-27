"use strict";

const shared = require("./_shared");

const jsonResponse = shared.jsonResponse;
const handleOptions = shared.handleOptions;
const supabaseAdmin = shared.supabaseAdmin;
const initStripe = shared.initStripe;
const safeStr = shared.safeStr || ((v, d = "") => (typeof v === "string" && v.trim() ? v.trim() : d));
const resolveScoreOrgId = shared.resolveScoreOrgId;

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

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

const getSessionId = (req) => {
  if (req?.query?.session_id) return String(req.query.session_id).trim();
  if (req?.query?.checkout_session_id) return String(req.query.checkout_session_id).trim();

  try {
    const url = new URL(req.url, "http://localhost");
    return String(url.searchParams.get("session_id") || url.searchParams.get("checkout_session_id") || "").trim();
  } catch {
    return "";
  }
};

const parseMoney = (cents) => {
  const n = Number(cents || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return safe / 100;
};

const normalizeShippingMode = (mode) => {
  const m = String(mode || "").toLowerCase().trim();
  if (m === "pickup") return "pickup";
  if (m === "delivery") return "delivery";
  if (m === "envia_mx") return "delivery";
  if (m === "envia_us") return "delivery";
  return m || "pickup";
};

const mapStripeSession = (session) => {
  const shippingMode = normalizeShippingMode(session?.metadata?.shipping_mode || session?.metadata?.ship_mode);
  const shippingAddress = session?.shipping_details?.address || session?.customer_details?.address || {};

  return {
    ok: true,
    source: "stripe",
    session_id: session?.id || "",
    status: safeStr(session?.status || "open", "open"),
    payment_status: safeStr(session?.payment_status || "unpaid", "unpaid"),
    currency: String(session?.currency || "mxn").toUpperCase(),
    amount_subtotal_cents: Number(session?.amount_subtotal || 0) || 0,
    amount_total_cents: Number(session?.amount_total || 0) || 0,
    amount_total_mxn: parseMoney(session?.amount_total || 0),
    amount_subtotal_mxn: parseMoney(session?.amount_subtotal || 0),
    customer_email: safeStr(session?.customer_details?.email || session?.customer_email || ""),
    customer_name: safeStr(session?.customer_details?.name || ""),
    shipping_mode: shippingMode,
    shipping_country: safeStr(shippingAddress?.country || session?.customer_details?.address?.country || ""),
    shipping_postal: safeStr(shippingAddress?.postal_code || session?.customer_details?.address?.postal_code || ""),
    shipping_details: session?.shipping_details || null,
    customer_details: session?.customer_details || null,
    metadata: session?.metadata || {},
    created_at: session?.created || null,
  };
};

const mapOrderRow = (row) => {
  const shippingMode = normalizeShippingMode(row?.shipping_mode || row?.ship_mode);

  return {
    ok: true,
    source: "supabase",
    session_id: safeStr(row?.stripe_session_id || row?.checkout_session_id || row?.session_id || row?.id || ""),
    status: safeStr(row?.status || "open", "open"),
    payment_status: safeStr(row?.payment_status || row?.status || "unpaid", "unpaid"),
    currency: safeStr(row?.currency || "MXN", "MXN").toUpperCase(),
    amount_subtotal_cents: Number(row?.subtotal_cents || row?.amount_subtotal_cents || 0) || 0,
    amount_total_cents: Number(row?.total_cents || row?.amount_total_cents || 0) || 0,
    amount_total_mxn: parseMoney(row?.total_cents || row?.amount_total_cents || 0),
    amount_subtotal_mxn: parseMoney(row?.subtotal_cents || row?.amount_subtotal_cents || 0),
    customer_email: safeStr(row?.customer_email || ""),
    customer_name: safeStr(row?.customer_name || ""),
    shipping_mode: shippingMode,
    shipping_country: safeStr(row?.shipping_country || ""),
    shipping_postal: safeStr(row?.shipping_postal_code || row?.postal_code || ""),
    shipping_details: row?.shipping_details || null,
    customer_details: row?.customer_details || null,
    metadata: row?.metadata || {},
    created_at: row?.created_at || null,
  };
};

const resolveOrgId = async (sb) => {
  if (typeof resolveScoreOrgId === "function") {
    try {
      return await resolveScoreOrgId(sb);
    } catch {}
  }

  const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (envId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(envId).trim())) {
    return String(envId).trim();
  }
  return DEFAULT_SCORE_ORG_ID;
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

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return send(res, jsonResponse(400, { ok: false, error: "session_id requerido" }, origin));
  }

  try {
    const stripe = initStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer_details"],
    });

    if (session) {
      return send(res, jsonResponse(200, mapStripeSession(session), origin));
    }
  } catch {}

  try {
    const sb = supabaseAdmin?.();
    if (sb) {
      const orgId = await resolveOrgId(sb);

      const { data } = await sb
        .from("orders")
        .select("*")
        .or(
          `stripe_session_id.eq.${sessionId},checkout_session_id.eq.${sessionId},session_id.eq.${sessionId},id.eq.${sessionId}`
        )
        .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
        .limit(1)
        .maybeSingle();

      if (data) {
        return send(res, jsonResponse(200, mapOrderRow(data), origin));
      }
    }
  } catch {}

  return send(
    res,
    jsonResponse(
      404,
      {
        ok: false,
        error: "No se encontró la sesión de checkout",
        session_id: sessionId,
      },
      origin
    )
  );
};