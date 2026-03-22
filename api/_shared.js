'''"use strict";

const fs = require("fs");
const path = require("path");

let Stripe = null;
try { Stripe = require("stripe"); } catch {}

let createClient = null;
try { ({ createClient } = require("@supabase/supabase-js")); } catch {}

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
// Vercel-aware URL generation
const VERCEL_PROD_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://scorestore.vercel.app';

const getCorsAllowlist = () => {
  const envList = process.env.CORS_ALLOWLIST || "";
  return envList.split(",").map((s) => s.trim()).filter(Boolean);
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Server-to-server
  // Automatically allow Vercel preview deployments and the production URL
  if (origin.endsWith('.vercel.app')) return true;
  const allowed = getCorsAllowlist();
  // Allow any if wildcard is present
  if (allowed.includes('*')) return true;
  return allowed.includes(origin) || origin.startsWith("http://localhost");
};

const corsHeaders = (origin) => {
  // Fallback to the production URL if the origin is not explicitly allowed.
  const safeOrigin = isAllowedOrigin(origin) ? origin : VERCEL_PROD_URL;
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "Content-Type, stripe-signature, x-org-id, x-envia-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
};

const jsonResponse = (statusCode, data, origin) => {
  if (origin && !isAllowedOrigin(origin)) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden Origin" }) };
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
  return { statusCode: 204, headers: corsHeaders(origin), body: "" };
};

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
      sku: String(it?.sku || "").trim(),
      qty: clampInt(it?.qty, 1, 99),
      size: it?.size ? String(it.size).trim() : "",
      priceCents: it?.priceCents ? Number(it.priceCents) : 0,
      title: it?.title ? String(it.title).trim() : "",
    }))
    .filter((it) => it.sku);
};

const getBaseUrl = (event) => {
  const headers = event?.headers || {};
  const proto = headers["x-forwarded-proto"] || "https";
  const host =
    headers["x-forwarded-host"] ||
    headers.host ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL;

  // Fallback to the Vercel production URL
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

const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));

const isSupabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && createClient);

const supabaseAdmin = (() => {
  let client = null;
  return () => {
    if (!isSupabaseConfigured()) return null;
    if (client) return client;

    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      // Updated client info for Vercel environment
      global: { headers: { "x-client-info": "scorestore-vercel-functions" } },
    });

    return client;
  };
})();

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
      carrier: process.env.ENVIA_DEFAULT_CARRIER || undefined,
      type: process.env.ENVIA_DEFAULT_TYPE || undefined,
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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "No se pudo cotizar envío");

  const rates = data?.data || data?.rates || data || [];
  const best = pickBestRate(rates);
  if (!best) throw new Error("No se encontró tarifa para ese CP/ZIP");

  const priceMXN = Number(best.price);
  if (!Number.isFinite(priceMXN) || priceMXN <= 0) {
    throw new Error("Tarifa inválida");
  }

  const amount_cents = Math.round(priceMXN * 100);

  return {
    ok: true,
    provider: "envia",
    label: `${best.carrier.toUpperCase()} · ${best.service}`,
    country: c,
    amount_cents,
    amount_mxn: priceMXN,
  };
};

const initStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY no configurada");
  if (!Stripe) throw new Error("Dependencia 'stripe' no instalada");
  return new Stripe(key, { apiVersion: "2024-06-20" });
};

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

module.exports = {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  clampInt,
  normalizeQty,
  getBaseUrl,
  readJsonFile,
  validateZip,
  isUuid,
  safeStr,
  supabaseAdmin,
  getOriginByCountry,
  getEnviaQuote,
  initStripe,
  resolveScoreOrgId,
  readPublicSiteSettings,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP_E164,
  SUPPORT_WHATSAPP_DISPLAY,
};'''