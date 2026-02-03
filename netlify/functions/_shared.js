/* =========================================================
   SCORE STORE / UNICOS — SHARED HELPERS (PROD) v2026
   ✅ Compatible con tus Netlify Functions actuales
   ✅ ENVIA_API_KEY (preferred) + fallback ENVIA_API_TOKEN
   ✅ UnicOs Ready: DEFAULT_ORG_ID + getOrgIdFromEvent()
   ✅ safeJsonParse devuelve {} (no null) para evitar crashes
   ✅ Mantiene exports que tu repo YA usa
   ========================================================= */

const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

/* -----------------------
   1) ENV (Supabase)
------------------------ */
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.URL ||
  "";

const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/* -----------------------
   2) UnicOs multi-tenant default org (Score Store)
------------------------ */
const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.SCORE_STORE_ORG_ID ||
  "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

function getOrgIdFromEvent(event, fallback = DEFAULT_ORG_ID) {
  const qp = event?.queryStringParameters || {};
  const headers = event?.headers || {};
  const fromHeader =
    headers["x-org-id"] || headers["X-Org-Id"] || headers["X-ORG-ID"] || "";

  const candidate =
    qp.org_id ||
    qp.orgId ||
    qp.org ||
    fromHeader ||
    "";

  const v = (candidate || "").toString().trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    return v;

  return fallback;
}

/* -----------------------
   3) ENVIA (clave)
------------------------ */
// ✅ Preferred: ENVIA_API_KEY
// ✅ Fallback: ENVIA_API_TOKEN (por compatibilidad)
const ENVIA_KEY = process.env.ENVIA_API_KEY || process.env.ENVIA_API_TOKEN || "";

/* -----------------------
   4) Fallback Shipping Prices
------------------------ */
const FALLBACK_MX_PRICE = {
  base: 180,
  per_item: 35,
  max: 380,
};

const FALLBACK_US_PRICE = {
  base: 800,
  per_item: 90,
  max: 1600,
};

/* -----------------------
   5) Factory Origin (MX)
------------------------ */
const FACTORY_ORIGIN = {
  name: "Único Uniformes",
  phone: "+52 664 000 0000",
  email: "ventas.unicotextil@gmail.com",
  address1: "Tijuana, BC",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postal_code: "22000",
};

/* -----------------------
   6) Promo Rules (kill switch support future)
------------------------ */
const PROMO_RULES = {
  default: { active: false, percent: 0 },
  "80OFF": { active: true, percent: 80 },
};

/* -----------------------
   7) CORS
------------------------ */
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, X-Chat-Token, X-Webhook-Token, X-Envia-Webhook-Token, X-Org-Id",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

/* -----------------------
   8) Supabase clients
------------------------ */
const supabase =
  SUPABASE_URL && SUPABASE_ANON
    ? createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: false },
      })
    : null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

/* -----------------------
   9) Utils
------------------------ */
function jsonResponse(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...HEADERS, ...extraHeaders },
    body: JSON.stringify(data),
  };
}

function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }
  return null;
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function baseUrl(event) {
  const headers = event.headers || {};
  const proto =
    headers["x-forwarded-proto"] ||
    headers["X-Forwarded-Proto"] ||
    "https";

  const host =
    headers["x-forwarded-host"] ||
    headers["X-Forwarded-Host"] ||
    headers.host ||
    headers.Host ||
    "";

  const explicit = process.env.SITE_URL || process.env.DEPLOY_PRIME_URL || "";

  if (explicit) return explicit.replace(/\/$/, "");
  if (!host) return "";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function digitsOnly(s) {
  return (s || "").toString().replace(/[^\d]/g, "");
}

function normalizeZip(zip) {
  return digitsOnly(zip).slice(0, 5);
}

function validateZip(zip) {
  const z = normalizeZip(zip);
  return z.length === 5;
}

function normalizeQty(n) {
  return Math.max(1, Math.min(99, Math.round(Number(n || 1))));
}

function getFallbackShipping({ country = "MX", items_qty = 1 }) {
  const qty = normalizeQty(items_qty);

  if (String(country || "MX").toUpperCase() === "US") {
    const calc = FALLBACK_US_PRICE.base + (qty - 1) * FALLBACK_US_PRICE.per_item;
    return Math.min(FALLBACK_US_PRICE.max, calc);
  }

  const calc = FALLBACK_MX_PRICE.base + (qty - 1) * FALLBACK_MX_PRICE.per_item;
  return Math.min(FALLBACK_MX_PRICE.max, calc);
}

/* -----------------------
   10) Parcel estimation (conservador)
------------------------ */
function getPackageSpecs(items_qty = 1) {
  const qty = normalizeQty(items_qty);
  const weightKg = Math.max(1, qty * 0.7);

  return {
    weight: weightKg,
    length: 30,
    width: 25,
    height: Math.min(35, 8 + qty * 4),
  };
}

function estimateParcel(items) {
  const qty = Array.isArray(items)
    ? items.reduce((a, b) => a + normalizeQty(b?.qty), 0)
    : 1;
  return getPackageSpecs(qty);
}

/* -----------------------
   11) Envía Quote (live or fallback)
------------------------ */
async function getEnviaQuote({ zip, country = "MX", items_qty = 1 }) {
  if (!validateZip(zip)) {
    return {
      ok: false,
      mode: "fallback",
      cost: getFallbackShipping({ country, items_qty }),
      label: "CP inválido (estimación)",
      carrier: null,
      raw: null,
    };
  }

  if (!ENVIA_KEY) {
    return {
      ok: false,
      mode: "fallback",
      cost: getFallbackShipping({ country, items_qty }),
      label: "Envío (estimación)",
      carrier: null,
      raw: null,
      error: "ENVIA_API_KEY missing",
    };
  }

  try {
    const pkg = getPackageSpecs(items_qty);

    const url = "https://api.envia.com/ship/rate/";
    const payload = {
      origin: { country_code: "MX", postal_code: FACTORY_ORIGIN.postal_code },
      destination: { country_code: country, postal_code: normalizeZip(zip) },
      packages: [
        {
          content: "merch",
          amount: 1,
          type: "box",
          weight: pkg.weight,
          length: pkg.length,
          width: pkg.width,
          height: pkg.height,
        },
      ],
    };

    const r = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_KEY}`,
      },
      timeout: 15000,
    });

    const data = r.data || {};
    const rates = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    const normalized = rates
      .map((x) => ({
        carrier: x?.carrier || x?.carrier_name || x?.provider || null,
        service: x?.service || x?.service_name || null,
        amount: Number(x?.total || x?.amount || x?.price || 0),
        raw: x,
      }))
      .filter((x) => x.amount > 0);

    if (!normalized.length) {
      return {
        ok: false,
        mode: "fallback",
        cost: getFallbackShipping({ country, items_qty }),
        label: "Envío (estimación)",
        carrier: null,
        raw: data,
        error: "No rates",
      };
    }

    normalized.sort((a, b) => a.amount - b.amount);
    const best = normalized[0];

    return {
      ok: true,
      mode: "live",
      cost: Math.round(best.amount),
      label: `${best.carrier || "Paquetería"}${best.service ? " · " + best.service : ""}`,
      carrier: best.carrier,
      raw: best.raw,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "fallback",
      cost: getFallbackShipping({ country, items_qty }),
      label: "Envío (estimación)",
      carrier: null,
      raw: err?.response?.data || null,
      error: err?.message || "Envía error",
    };
  }
}

/* -----------------------
   12) Envía Label (used by stripe_webhook)
------------------------ */
async function createEnviaLabel({ order, destination }) {
  if (!ENVIA_KEY) {
    return {
      ok: false,
      skipped: true,
      error: "ENVIA_API_KEY missing",
      tracking_number: null,
      label_url: null,
      carrier: null,
      raw: null,
    };
  }

  try {
    const pkg = getPackageSpecs(order?.items_qty || 1);

    const url = "https://api.envia.com/ship/generate/";
    const payload = {
      order_reference: order?.id || order?.stripe_session_id || "",
      origin: {
        name: FACTORY_ORIGIN.name,
        phone: FACTORY_ORIGIN.phone,
        email: FACTORY_ORIGIN.email,
        address1: FACTORY_ORIGIN.address1,
        city: FACTORY_ORIGIN.city,
        state: FACTORY_ORIGIN.state,
        country: FACTORY_ORIGIN.country,
        postal_code: FACTORY_ORIGIN.postal_code,
      },
      destination: destination || {},
      packages: [
        {
          content: "merch",
          amount: 1,
          type: "box",
          weight: pkg.weight,
          length: pkg.length,
          width: pkg.width,
          height: pkg.height,
        },
      ],
    };

    const r = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_KEY}`,
      },
      timeout: 20000,
    });

    const data = r.data || {};
    const shipment = data?.data || data?.shipment || data;

    return {
      ok: true,
      tracking_number: shipment?.tracking_number || shipment?.trackingNumber || null,
      label_url: shipment?.label_url || shipment?.labelUrl || null,
      carrier: shipment?.carrier || shipment?.carrier_name || null,
      raw: shipment,
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err?.message || "Envía label error",
      tracking_number: null,
      label_url: null,
      carrier: null,
      raw: err?.response?.data || null,
    };
  }
}

/* -----------------------
   13) Products loader (optional UnicOs use)
------------------------ */
async function getProductsFromDb(supabaseAdminClient, orgSlug = "score-store") {
  if (!supabaseAdminClient) return [];
  try {
    const { data: org } = await supabaseAdminClient
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();

    const org_id = org?.id || DEFAULT_ORG_ID;

    const { data: prods } = await supabaseAdminClient
      .from("products")
      .select("*")
      .eq("org_id", org_id)
      .eq("active", true);

    return Array.isArray(prods) ? prods : [];
  } catch {
    return [];
  }
}

/* -----------------------
   14) Exports (mantiene estructura usada por tus functions)
------------------------ */
module.exports = {
  HEADERS,

  SUPABASE_URL,
  SUPABASE_ANON,
  supabase,
  supabaseAdmin,

  DEFAULT_ORG_ID,
  getOrgIdFromEvent,

  ENVIA_KEY,

  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,

  FACTORY_ORIGIN,
  PROMO_RULES,

  jsonResponse,
  handleOptions,
  safeJsonParse,
  baseUrl,

  digitsOnly,
  normalizeZip,
  validateZip,
  normalizeQty,

  getFallbackShipping,
  getPackageSpecs,
  estimateParcel,

  getEnviaQuote,
  createEnviaLabel,

  getProductsFromDb,
};