"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let Stripe = null;
try {
  Stripe = require("stripe");
} catch {}

let createClient = null;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch {}

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const VERCEL_PROD_URL =
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://scorestore.vercel.app";

/* =========================================================
   CORS / RESPONSE HELPERS
   ========================================================= */

const getCorsAllowlist = () => {
  const envList = process.env.CORS_ALLOWLIST || "";
  return envList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // server-to-server / same-origin fallback
  if (origin.startsWith("http://localhost")) return true;

  // Always allow Vercel preview and production deployments
  if (origin.endsWith(".vercel.app")) return true;
  if (origin === VERCEL_PROD_URL) return true;

  const allowed = getCorsAllowlist();
  if (allowed.includes("*")) return true;

  return allowed.includes(origin);
};

const corsHeaders = (origin) => {
  const safeOrigin = isAllowedOrigin(origin) ? origin || VERCEL_PROD_URL : VERCEL_PROD_URL;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "Content-Type, stripe-signature, x-org-id, x-envia-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

const jsonResponse = (statusCode, data, origin) => {
  if (origin && !isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ error: "Forbidden Origin" }),
    };
  }

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
    body: JSON.stringify(data ?? {}),
  };
};

const handleOptions = (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return {
    statusCode: 204,
    headers: corsHeaders(origin),
    body: "",
  };
};

/* =========================================================
   SAFE UTILITIES
   ========================================================= */

const safeJsonParse = (raw) => {
  try {
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const clampInt = (v, min, max) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const normalizeQty = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      sku: String(it?.sku || it?.id || "").trim(),
      qty: clampInt(it?.qty, 1, 99),
      size: it?.size ? String(it.size).trim() : "",
      priceCents: Number.isFinite(Number(it?.priceCents))
        ? Number(it.priceCents)
        : Number.isFinite(Number(it?.price_cents))
          ? Number(it.price_cents)
          : 0,
      title: it?.title ? String(it.title).trim() : "",
    }))
    .filter((it) => it.sku);
};

const itemsQtyFromAny = (items) =>
  normalizeQty(items).reduce((sum, it) => sum + Number(it.qty || 0), 0);

const getBaseUrl = (event) => {
  const headers = event?.headers || {};
  const proto = headers["x-forwarded-proto"] || "https";
  const host =
    headers["x-forwarded-host"] ||
    headers.host ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL;

  if (!host) return VERCEL_PROD_URL;
  if (host.startsWith("http")) return host;
  return `${proto}://${host}`;
};

const readJsonFile = (relPath) => {
  try {
    let p = path.join(process.cwd(), relPath);
    if (!fs.existsSync(p)) p = path.join(__dirname, "..", "..", relPath);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    return null;
  } catch {
    return null;
  }
};

const validateZip = (zip, country) => {
  const z = String(zip || "").trim();
  const c = String(country || "").toUpperCase().trim();

  if (c === "US") {
    if (!/^\d{5}(-\d{4})?$/.test(z)) return null;
    return z;
  }

  if (z.length < 4 || z.length > 10) return null;
  if (!/^[a-zA-Z0-9\- ]+$/.test(z)) return null;
  return z;
};

const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );

const safeStr = (v, d = "") =>
  typeof v === "string" ? v : v == null ? d : String(v);

/* =========================================================
   SUPABASE
   ========================================================= */

const getSupabaseServiceKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

const isSupabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && getSupabaseServiceKey() && createClient);

const supabaseAdmin = (() => {
  let client = null;
  let initError = null;

  return () => {
    if (initError) {
      console.error("Supabase client failed to initialize:", initError);
      return null;
    }

    if (client) return client;
    if (!isSupabaseConfigured()) return null;

    try {
      client = createClient(process.env.SUPABASE_URL, getSupabaseServiceKey(), {
        auth: { persistSession: false },
        global: { headers: { "x-client-info": "scorestore-vercel-functions" } },
      });
      return client;
    } catch (e) {
      initError = e;
      console.error("Supabase client initialization failed:", e);
      return null;
    }
  };
})();

/* =========================================================
   ENVÍA / SHIPMENTS
   ========================================================= */

const ENVIA_API_URL = (process.env.ENVIA_API_URL || "https://api.envia.com").replace(/\/+$/, "");
const ENVIA_GEOCODES_URL = (process.env.ENVIA_GEOCODES_URL || "https://geocodes.envia.com").replace(/\/+$/, "");

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ||
  process.env.FACTORY_EMAIL ||
  "ventas.unicotextil@gmail.com";

const SUPPORT_PHONE =
  process.env.SUPPORT_PHONE ||
  "6642368701";

const SUPPORT_WHATSAPP_E164 =
  process.env.SUPPORT_WHATSAPP_E164 ||
  "5216642368701";

const SUPPORT_WHATSAPP_DISPLAY =
  process.env.SUPPORT_WHATSAPP_DISPLAY ||
  "664 236 8701";

const requireEnviaKey = () => {
  const key = process.env.ENVIA_API_KEY;
  if (!key) throw new Error("ENVIA_API_KEY no configurada");
  return key;
};

const enviaHeaders = () => ({
  authorization: `Bearer ${requireEnviaKey()}`,
  "content-type": "application/json",
});

const getOriginByCountry = (country) => {
  const c = String(country || "MX").toUpperCase();

  if (c === "US") {
    return {
      name: process.env.ORIGIN_US_NAME || "Score Store US",
      company: process.env.ORIGIN_US_COMPANY || "Score Store",
      email: process.env.ORIGIN_US_EMAIL || SUPPORT_EMAIL,
      phone: process.env.ORIGIN_US_PHONE || "8180000000",
      street: process.env.ORIGIN_US_STREET || "Main St",
      number: process.env.ORIGIN_US_NUMBER || "1",
      district: process.env.ORIGIN_US_DISTRICT || "Other",
      city: process.env.ORIGIN_US_CITY || "San Diego",
      state: process.env.ORIGIN_US_STATE || "CA",
      country: "US",
      postalCode: process.env.ORIGIN_US_POSTAL || "92101",
      reference: process.env.ORIGIN_US_REFERENCE || "",
    };
  }

  return {
    name: process.env.ORIGIN_MX_NAME || "Score Store MX",
    company: process.env.ORIGIN_MX_COMPANY || "Único Uniformes",
    email: process.env.ORIGIN_MX_EMAIL || SUPPORT_EMAIL,
    phone: process.env.ORIGIN_MX_PHONE || SUPPORT_PHONE,
    street: process.env.ORIGIN_MX_STREET || "Palermo",
    number: process.env.ORIGIN_MX_NUMBER || "6106 Interior JK",
    district: process.env.ORIGIN_MX_DISTRICT || "Anexa Roma",
    city: process.env.ORIGIN_MX_CITY || "Tijuana",
    state: process.env.ORIGIN_MX_STATE || "Baja California",
    country: "MX",
    postalCode: process.env.ORIGIN_MX_POSTAL || "22614",
    reference: process.env.ORIGIN_MX_REFERENCE || "",
    identificationNumber: process.env.ORIGIN_MX_RFC || undefined,
  };
};

const getPackageSpecs = (country, items_qty) => {
  const qty = clampInt(items_qty || 1, 1, 99);
  const c = String(country || "MX").toUpperCase();

  if (c === "US") {
    const weightLb = Number(process.env.PACK_WEIGHT_LB || 1) * qty;
    return {
      type: "box",
      content: "Score Store Merch",
      amount: 1,
      declaredValue: 0,
      weightUnit: "LB",
      lengthUnit: "IN",
      weight: Number.isFinite(weightLb) ? weightLb : 1,
      dimensions: {
        length: Number(process.env.PACK_L_IN || 11),
        width: Number(process.env.PACK_W_IN || 15),
        height: Number(process.env.PACK_H_IN || 20),
      },
    };
  }

  const weightKg = Number(process.env.PACK_WEIGHT_KG || 1) * qty;
  return {
    type: "box",
    content: "Score Store Merch",
    amount: 1,
    declaredValue: 0,
    weightUnit: "KG",
    lengthUnit: "CM",
    weight: Number.isFinite(weightKg) ? weightKg : 1,
    dimensions: {
      length: Number(process.env.PACK_L_CM || 30),
      width: Number(process.env.PACK_W_CM || 25),
      height: Number(process.env.PACK_H_CM || 10),
    },
  };
};

const getZipDetails = async (country, zip) => {
  const c = String(country || "MX").toUpperCase();
  const z = validateZip(zip, c);
  if (!z) return null;

  try {
    const url = `${ENVIA_GEOCODES_URL}/zipcode/${encodeURIComponent(c)}/${encodeURIComponent(z)}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${requireEnviaKey()}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const city =
      data?.city ||
      data?.locality ||
      data?.town ||
      data?.data?.city ||
      data?.data?.locality ||
      (Array.isArray(data?.data) ? data.data[0]?.city : null);

    const state =
      data?.state ||
      data?.state_code ||
      data?.stateCode ||
      data?.data?.state ||
      data?.data?.state_code ||
      (Array.isArray(data?.data) ? (data.data[0]?.state_code || data.data[0]?.state) : null);

    return {
      city: city ? String(city) : null,
      state: state ? String(state).toUpperCase() : null,
      postalCode: z,
      country: c,
    };
  } catch {
    return null;
  }
};

const pickBestRate = (rates) => {
  const arr = Array.isArray(rates) ? rates : [];
  let best = null;

  for (const r of arr) {
    const price = Number(
      r?.totalPrice ??
        r?.totalAmount ??
        r?.basePrice ??
        r?.price ??
        r?.amount ??
        r?.rate ??
        NaN
    );

    if (!Number.isFinite(price) || price <= 0) continue;

    if (!best || price < best.price) {
      best = {
        carrier: String(r?.carrier || r?.carrierDescription || "carrier"),
        service: String(r?.serviceDescription || r?.service || "service"),
        deliveryEstimate: String(r?.deliveryEstimate || ""),
        price,
      };
    }
  }

  return best;
};

const getEnviaQuote = async ({ zip, country, items_qty }) => {
  const c = String(country || "MX").toUpperCase();
  const z = validateZip(zip, c);
  if (!z) throw new Error("CP/ZIP inválido");

  const origin = getOriginByCountry(c);
  const zipInfo = await getZipDetails(c, z);

  const destination = {
    name: "Cliente",
    company: "",
    email: process.env.QUOTE_DEST_EMAIL || SUPPORT_EMAIL,
    phone: "0000000000",
    street: "Stripe Temp",
    number: "1",
    district: "Other",
    city: zipInfo?.city || "",
    state: zipInfo?.state || (c === "US" ? "CA" : "BC"),
    country: c,
    postalCode: z,
    reference: "",
  };

  const pkg = getPackageSpecs(c, items_qty || 1);

  const payload = {
    origin,
    destination,
    packages: [pkg],
    shipment: {
      carrier: c === "US"
        ? (process.env.ENVIA_US_DEFAULT_CARRIER || "usps")
        : (process.env.ENVIA_MX_DEFAULT_CARRIER || "dhl"),
      type: Number(process.env.ENVIA_DEFAULT_TYPE || 1),
    },
    settings: { currency: "MXN" },
  };

  const url = `${ENVIA_API_URL}/ship/rate`;
  let res;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: enviaHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("No se pudo conectar con los servidores de paquetería.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Respuesta inválida del servidor de envíos (${res.status}).`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "No se pudo cotizar envío");

  const rates = data?.data || data?.rates || data || [];
  const best = pickBestRate(rates);
  if (!best) throw new Error("No se encontró tarifa (Envía.com) para ese CP/ZIP");

  let priceMXN = Number(best.price);
  if (!Number.isFinite(priceMXN) || priceMXN <= 0) throw new Error("Tarifa inválida");

  const fx = Number(process.env.FX_USD_TO_MXN) || 18;
  if (String(c) === "US" && String(process.env.ENVIA_FORCE_USD_TO_MXN || "0") === "1") {
    if (Number.isFinite(fx) && fx > 0) priceMXN = priceMXN * fx;
  }

  const amount_cents = Math.round(priceMXN * 100);

  return {
    ok: true,
    provider: "envia",
    label: `${String(best.carrier || "").toUpperCase()} · ${String(best.service || "")}`,
    country: c,
    amount_cents,
    amount_mxn: priceMXN,
    raw: data,
  };
};

const getFallbackShipping = (country, items_qty) => {
  const c = String(country || "MX").toUpperCase();
  const qty = clampInt(items_qty || 1, 1, 99);
  const base = c === "US"
    ? Number(process.env.FALLBACK_US_PRICE_MXN || 850)
    : Number(process.env.FALLBACK_MX_PRICE_MXN || 250);
  const perItem = Number(process.env.FALLBACK_PER_ITEM_MXN || 50);
  const price = (Number.isFinite(base) ? base : 0) + (Number.isFinite(perItem) ? perItem * Math.max(0, qty - 1) : 0);
  const priceMXN = Math.max(0, price);

  return {
    ok: true,
    provider: "fallback",
    label: c === "US" ? "Envío USA (estimado)" : "Envío MX (estimado)",
    country: c,
    amount_cents: Math.round(priceMXN * 100),
    amount_mxn: priceMXN,
  };
};

const stripeShippingToEnviaDestination = (stripe_session_or_shipping_details) => {
  const sess = stripe_session_or_shipping_details && stripe_session_or_shipping_details.shipping_details
    ? stripe_session_or_shipping_details
    : null;

  const sd = sess ? (sess.shipping_details || {}) : (stripe_session_or_shipping_details || {});
  const cd = sess ? (sess.customer_details || {}) : {};
  const addr = sd.address || {};
  const country = String(addr.country || "").toUpperCase();

  let calle = String(addr.line1 || "Domicilio Conocido").trim();
  let numStreet = String(addr.line2 || "").trim();

  if (!numStreet || numStreet.toLowerCase() === "s/n") {
    const match = calle.match(/^(.*?)\s+((?:No\.?\s*|#\s*)?\d+[a-zA-Z]?(?:-\d+)?)$/i);
    if (match) {
      calle = match[1].trim();
      numStreet = match[2].trim();
    } else {
      numStreet = "S/N";
    }
  }

  let telefonoSeguro = String(sd.phone || cd.phone || "").replace(/\D/g, "");
  if (telefonoSeguro.length < 10) telefonoSeguro = "0000000000";

  const emailSeguro =
    cd.email ||
    sess?.customer_email ||
    process.env.DEFAULT_CUSTOMER_EMAIL ||
    "cliente@scorestore.com";

  return {
    name: sd.name || cd.name || "Cliente Final",
    company: "",
    email: emailSeguro,
    phone: telefonoSeguro,
    street: calle.substring(0, 100),
    number: numStreet.substring(0, 20),
    district: String(addr.line2 || "").substring(0, 100) || "Centro",
    city: String(addr.city || "").substring(0, 50),
    state: String(addr.state || "").substring(0, 50),
    country: country || "MX",
    postalCode: String(addr.postal_code || addr.postalCode || "").substring(0, 10),
    reference: "Venta Stripe Webhook",
  };
};

const createEnviaLabel = async ({ shipping_country, stripe_session, items_qty }) => {
  const country = String(shipping_country || "MX").toUpperCase();
  const origin = getOriginByCountry(country);
  const destination = stripeShippingToEnviaDestination(stripe_session);

  if (!destination?.postalCode || !destination?.state || !destination?.country) {
    throw new Error("Dirección incompleta en Stripe para generar guía automáticamente");
  }

  const pkg = getPackageSpecs(country, items_qty || 1);
  const payload = {
    origin,
    destination,
    packages: [pkg],
    shipment: {
      carrier: country === "US"
        ? (process.env.ENVIA_US_DEFAULT_CARRIER || "usps")
        : (process.env.ENVIA_MX_DEFAULT_CARRIER || "dhl"),
      type: Number(process.env.ENVIA_DEFAULT_TYPE || 1),
    },
    settings: { printFormat: "PDF", printSize: "STOCK_4X6", currency: "MXN" },
  };

  const url = `${ENVIA_API_URL}/ship/generate`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: enviaHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Conexión fallida al servidor de Envía.");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Respuesta no-JSON de Envía (${res.status})`);
  }

  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || "Error al crear la guía en Envía.com");
  return data?.data || data;
};

/* =========================================================
   STRIPE
   ========================================================= */

const initStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurada");
  if (!Stripe) throw new Error("Dependencia 'stripe' no instalada");
  return new Stripe(key, { apiVersion: "2024-06-20" });
};

const readRawBody = (event) => {
  const body = event?.body || "";
  if (event?.isBase64Encoded) return Buffer.from(body, "base64");
  return Buffer.from(body, "utf8");
};

const makeCheckoutIdempotencyKey = (params, req_id) => {
  if (req_id) return String(req_id);
  const raw = JSON.stringify(params || {});
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return `checkout_req_${hash}`;
};

/* =========================================================
   SCORE ORG / SITE SETTINGS
   ========================================================= */

const resolveScoreOrgId = async (sb) => {
  const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (envId && isUuid(envId)) return String(envId).trim();

  let orgId = DEFAULT_SCORE_ORG_ID;

  try {
    const { data: byId } = await sb
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .limit(1)
      .maybeSingle();

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

const getDefaultPublicSiteSettings = () => ({
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
    facebook: process.env.SOCIAL_FACEBOOK || "https://www.facebook.com/uniforme.unico/",
    instagram: process.env.SOCIAL_INSTAGRAM || "https://www.instagram.com/uniformes.unico",
    youtube: process.env.SOCIAL_YOUTUBE || "https://youtu.be/F4lw1EcehIA?si=jFBT9skFLs566g8N",
    tiktok: process.env.SOCIAL_TIKTOK || "",
  },
  contact: {
    email: SUPPORT_EMAIL,
    phone: SUPPORT_PHONE,
    whatsapp_e164: SUPPORT_WHATSAPP_E164,
    whatsapp_display: SUPPORT_WHATSAPP_DISPLAY,
  },
  updated_at: null,
});

const readPublicSiteSettings = async () => {
  const defaults = getDefaultPublicSiteSettings();
  const sb = supabaseAdmin();
  if (!sb) return defaults;

  try {
    const orgId = await resolveScoreOrgId(sb);

    const { data, error } = await sb
      .from("site_settings")
      .select(`
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
        updated_at,
        created_at,
        contact_email,
        contact_phone,
        whatsapp_e164,
        whatsapp_display
      `)
      .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return defaults;

    const theme = data.theme && typeof data.theme === "object" ? data.theme : {};
    const home = data.home && typeof data.home === "object" ? data.home : {};
    const socials = data.socials && typeof data.socials === "object" ? data.socials : {};

    return {
      ...defaults,
      hero_title: safeStr(data.hero_title) || defaults.hero_title,
      hero_image: safeStr(data.hero_image) || defaults.hero_image,
      promo_active: !!data.promo_active,
      promo_text: safeStr(data.promo_text),
      pixel_id: safeStr(data.pixel_id),
      maintenance_mode: !!data.maintenance_mode,
      season_key: safeStr(data.season_key || "default"),
      theme: {
        ...defaults.theme,
        ...theme,
      },
      home: {
        ...defaults.home,
        ...home,
      },
      socials: {
        ...defaults.socials,
        ...socials,
      },
      contact: {
        ...defaults.contact,
        email: safeStr(data.contact_email) || defaults.contact.email,
        phone: safeStr(data.contact_phone) || defaults.contact.phone,
        whatsapp_e164: safeStr(data.whatsapp_e164) || defaults.contact.whatsapp_e164,
        whatsapp_display: safeStr(data.whatsapp_display) || defaults.contact.whatsapp_display,
      },
      updated_at: data.updated_at || null,
    };
  } catch {
    return defaults;
  }
};

/* =========================================================
   CATALOG / TELEGRAM / MISC
   ========================================================= */

const getCatalogIndex = () => {
  const cat = readJsonFile("data/catalog.json");
  const products = Array.isArray(cat?.products) ? cat.products : [];
  const idx = new Map();

  for (const p of products) {
    const sku = String(p?.sku || p?.id || "").trim();
    if (!sku) continue;
    idx.set(sku, p);
  }

  return { catalog: cat, index: idx };
};

const sendTelegram = async (text) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text || "").slice(0, 3500),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.log("[telegram] warn:", e?.message || e);
  }
};

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  clampInt,
  normalizeQty,
  itemsQtyFromAny,
  getBaseUrl,
  readJsonFile,
  getCatalogIndex,
  validateZip,
  isUuid,
  safeStr,
  supabaseAdmin,
  isSupabaseConfigured,
  getOriginByCountry,
  getEnviaQuote,
  getFallbackShipping,
  stripeShippingToEnviaDestination,
  createEnviaLabel,
  initStripe,
  readRawBody,
  makeCheckoutIdempotencyKey,
  resolveScoreOrgId,
  readPublicSiteSettings,
  sendTelegram,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP_E164,
  SUPPORT_WHATSAPP_DISPLAY,
  VERCEL_PROD_URL,
};