/* =========================================================
   SCORE STORE — main.js
   Rebuilt from the latest TXT topology
   - Respects /assets image paths
   - Uses /api/catalog with fallback to /data/catalog.json
   - Preserves cart / checkout / promo / assistant flow
   - Improves floating UX/UI without breaking existing hooks
========================================================= */
(() => {
  "use strict";

  const APP_VERSION = "2026.04.09.SCORESTORE.UI.ASSETS";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEYS = {
    cart: "scorestore_cart_v3",
    ship: "scorestore_ship_v3",
    promo: "scorestore_promo_v3",
    customer: "scorestore_customer_v3",
    cookies: "scorestore_cookie_accept_v1",
    seenSwipe: "scorestore_seen_swipe_v2",
    seenIntroGlow: "scorestore_seen_intro_glow_v2",
    hiddenPromo: "scorestore_hidden_promo_v1",
    ui: "scorestore_ui_v3",
  };

  const DEFAULTS = {
    currency: "MXN",
    email: "ventas.unicotextil@gmail.com",
    phone: "6642368701",
    whatsappE164: "5216642368701",
    whatsappDisplay: "664 236 8701",
    supportHours: "Horario por confirmar en configuración del sitio.",
    promoBar: "",
  };

  const ASSET_FALLBACK_IMAGE = "/assets/logo-score.webp";
  const HERO_FALLBACK_IMAGE = "/assets/hero.webp";

  const CATEGORY_CONFIG = [
    {
      uiId: "BAJA1000",
      name: "BAJA 1000",
      logo: "/assets/edicion_2025/camiseta-negra-baja1000.webp",
      cover_image: "/assets/edicion_2025/camiseta-negra-baja1000.webp",
      aliases: ["BAJA1000", "BAJA_1000", "EDICION_2025", "EDICION_2026"],
    },
    {
      uiId: "BAJA500",
      name: "BAJA 500",
      logo: "/assets/edicion_2025/camiseta-gris-baja500-detalle.webp",
      cover_image: "/assets/edicion_2025/camiseta-gris-baja500-detalle.webp",
      aliases: ["BAJA500", "BAJA_500"],
    },
    {
      uiId: "BAJA400",
      name: "BAJA 400",
      logo: "/assets/baja400/camiseta-cafe-oscuro-baja400.webp",
      cover_image: "/assets/baja400/camiseta-cafe-oscuro-baja400.webp",
      aliases: ["BAJA400", "BAJA_400"],
    },
    {
      uiId: "SF250",
      name: "SAN FELIPE 250",
      logo: "/assets/sf250/camiseta-negra-sinmangas-SF250.webp",
      cover_image: "/assets/sf250/camiseta-negra-sinmangas-SF250.webp",
      aliases: ["SF250", "SF_250", "SAN_FELIPE_250"],
    },
  ];

  const els = {
    splash: $("#splash"),
    topbar: $(".topbar"),
    promoBar: $("#promoBar"),
    promoBarText: $("#promoBarText"),
    promoBarClose: $("#promoBarClose"),

    heroTitle: $(".hero__title, #heroTitle"),
    heroText: $(".hero__copy, #heroText"),
    heroImage: $("#heroImage"),
    heroTagline: $("#heroTagline"),

    searchInput: $("#searchInput"),
    mobileSearchInput: $("#mobileSearchInput"),
    menuSearchInput: $("#menuSearchInput"),
    mobileSearchWrap: $("#mobileSearchWrap"),
    closeMobileSearchBtn: $("#closeMobileSearchBtn"),

    categoryGrid: $("#categoryGrid"),
    categoryHint: $("#categoryHint"),
    activeFilterLabel: $("#activeFilterLabel"),
    activeFilterRow: $("#activeFilterRow"),
    carouselTitle: $("#carouselTitle"),
    catalogCarouselSection: $("#catalogCarouselSection"),
    productGrid: $("#productGrid"),
    productCountLabel: $("#productCountLabel"),
    statusRow: $("#statusRow"),
    resultsCountLabel: $("#resultsCountLabel"),
    resultsMetaLabel: $("#resultsMetaLabel"),

    cartToggleBtn: $("#cartToggleBtn"),
    cartCountBadge: $("#cartCountBadge"),
    cartDrawer: $("#cartDrawer"),
    cartCloseBtn: $("#cartCloseBtn"),
    cartList: $("#cartList"),
    cartSubtotal: $("#cartSubtotal"),
    cartShipping: $("#cartShipping"),
    cartDiscount: $("#cartDiscount"),
    cartTotal: $("#cartTotal"),
    cartTotalLabel: $("#cartTotalLabel"),
    cartEmptyState: $("#cartEmptyState"),
    cartCheckoutBtn: $("#cartCheckoutBtn"),
    cartClearBtn: $("#cartClearBtn"),

    checkoutName: $("#checkoutName"),
    checkoutEmail: $("#checkoutEmail"),
    checkoutPhone: $("#checkoutPhone"),
    checkoutAddress: $("#checkoutAddress"),
    checkoutPostal: $("#checkoutPostal"),
    checkoutNotes: $("#checkoutNotes"),
    checkoutCountry: $("#checkoutCountry"),
    checkoutPromo: $("#checkoutPromo"),
    checkoutApplyPromoBtn: $("#checkoutApplyPromoBtn"),
    checkoutQuoteShipBtn: $("#checkoutQuoteShipBtn"),

    shipModePickup: $("#shipModePickup"),
    shipModeDelivery: $("#shipModeDelivery"),
    shipModeDeliveryWrap: $("#shipModeDeliveryWrap"),
    shipModePickupWrap: $("#shipModePickupWrap"),

    openAssistantBtn: $("#openAssistantBtn"),
    assistantDrawer: $("#assistantDrawer"),
    assistantCloseBtn: $("#assistantCloseBtn"),
    assistantLog: $("#assistantLog"),
    assistantInput: $("#assistantInput"),
    assistantSendBtn: $("#assistantSendBtn"),

    productModal: $("#productModal"),
    productModalCloseBtn: $("#productModalCloseBtn"),
    pmCarousel: $("#pmCarousel"),
    pmDots: $("#pmDots"),
    pmTitle: $("#pmTitle"),
    pmPrice: $("#pmPrice"),
    pmDesc: $("#pmDesc"),
    pmStockBadge: $("#pmStockBadge"),
    pmChips: $("#pmChips"),
    pmSizePills: $("#pmSizePills"),
    pmQtyDisplay: $("#pmQtyDisplay"),
    pmQtyMinus: $("#pmQtyMinus"),
    pmQtyPlus: $("#pmQtyPlus"),
    pmAddBtn: $("#pmAddBtn"),

    footerEmailLink: $("#footerEmailLink"),
    footerWhatsappLink: $("#footerWhatsappLink"),
    footerFacebookLink: $("#footerFacebookLink"),
    footerInstagramLink: $("#footerInstagramLink"),
    footerYoutubeLink: $("#footerYoutubeLink"),
    footerEmailText: $("#footerEmailText"),
    footerWhatsappText: $("#footerWhatsappText"),
    footerNote: $("#footerNote"),
    appVersionLabel: $("#appVersionLabel"),

    cookieBanner: $("#cookieBanner"),
    cookieAccept: $("#cookieAccept"),
    cookieReject: $("#cookieReject"),

    salesNotification: $("#salesNotification"),
    salesName: $("#salesName"),
    salesAction: $("#salesAction"),

    body: document.body,
    html: document.documentElement,
  };

  let siteSettings = {
    org_id: "",
    hero_title: "SCORE STORE",
    hero_image: HERO_FALLBACK_IMAGE,
    promo_active: false,
    promo_text: "",
    maintenance_mode: false,
    contact: {
      email: DEFAULTS.email,
      phone: DEFAULTS.phone,
      whatsapp_e164: DEFAULTS.whatsappE164,
      whatsapp_display: DEFAULTS.whatsappDisplay,
    },
    home: {
      support_hours: DEFAULTS.supportHours,
      shipping_note: "",
      returns_note: "",
      footer_note: "Pago cifrado vía Stripe. Aceptamos OXXO Pay. Logística inteligente internacional con Envía.com.",
    },
    socials: {
      facebook: "",
      instagram: "",
      youtube: "",
    },
  };

  let catalog = { products: [], categories: [], store: {} };
  let categories = [];
  let products = [];
  let filteredProducts = [];
  let cart = [];
  let activeCategory = "";
  let searchQuery = "";
  let activePromo = null;
  let shipMode = "pickup";
  let shippingQuote = null;
  let shippingQuoteLoading = false;
  let loadingCatalog = false;
  let currentModalSku = "";
  let selectedQty = 1;
  let selectedSize = "";
  let salesTimer = null;
  let assistantBusy = false;
  let hiddenPromoSeen = false;

  function safeStr(v, d = "") {
    return typeof v === "string" ? v : v == null ? d : String(v);
  }

  function safeNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function clampInt(v, min, max, fallback = min) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function clampText(v, max = 1800) {
    return safeStr(v).trim().slice(0, max);
  }

  function normalizeLower(v) {
    return safeStr(v).trim().toLowerCase();
  }

  function normalizeAssetPath(input) {
    let s = String(input ?? "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    s = s.replaceAll("\\", "/").replace(/^\.\//, "");
    s = s.replace(/^\/+/, "");
    if (s.startsWith("assets/")) return `/${s}`;
    return `/${s}`;
  }

  function getCategoryConfig(uiId) {
    const id = safeStr(uiId).trim().toUpperCase();
    return CATEGORY_CONFIG.find((c) => c.uiId === id || c.aliases.includes(id)) || null;
  }

  function getCategoryName(uiId) {
    const cfg = getCategoryConfig(uiId);
    return cfg?.name || safeStr(uiId).trim() || "Colección";
  }

  function getCategoryLogo(uiId) {
    const cfg = getCategoryConfig(uiId);
    return normalizeAssetPath(cfg?.cover_image || cfg?.logo || ASSET_FALLBACK_IMAGE);
  }

  function getProductSku(p) {
    return safeStr(p?.sku || p?.id || p?.slug || p?.title || p?.name || "").trim();
  }

  function getProductName(p) {
    return safeStr(p?.name || p?.title || "Producto SCORE").trim();
  }

  function getProductDescription(p) {
    return safeStr(p?.description || "").trim();
  }

  function getProductPriceCents(p) {
    if (Number.isFinite(Number(p?.price_cents))) return Math.max(0, Math.round(Number(p.price_cents)));
    if (Number.isFinite(Number(p?.price_mxn))) return Math.max(0, Math.round(Number(p.price_mxn) * 100));
    if (Number.isFinite(Number(p?.base_mxn))) return Math.max(0, Math.round(Number(p.base_mxn) * 100));
    return 0;
  }

  function money(cents) {
    const value = Number(cents);
    if (!Number.isFinite(value)) return "$0.00";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  }

  function safeJsonParse(raw, fallback = null) {
    try {
      if (raw == null || raw === "") return fallback;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return fallback;
    }
  }

  function normalizeQty(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((it) => ({
        sku: String(it?.sku || it?.id || it?.slug || "").trim(),
        qty: clampInt(it?.qty || it?.quantity || 1, 1, 99, 1),
        size: it?.size ? String(it.size).trim() : "",
        priceCents: Number.isFinite(Number(it?.priceCents))
          ? Number(it.priceCents)
          : Number.isFinite(Number(it?.price_cents))
            ? Number(it.price_cents)
            : 0,
        title: it?.title ? String(it.title).trim() : "",
      }))
      .filter((it) => it.sku || it.title);
  }

  function itemsQtyFromAny(items) {
    return normalizeQty(items).reduce((sum, it) => sum + Number(it.qty || 0), 0);
  }

  function getBaseUrl() {
    const { protocol, host } = window.location;
    return `${protocol}//${host}`;
  }

  function readStorage(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeStr(s).trim());
  }

  function validateZip(zip, country) {
    const z = safeStr(zip).trim();
    const c = safeStr(country || "MX").trim().toUpperCase();
    if (c === "US") return /^\d{5}(-\d{4})?$/.test(z) ? z : null;
    return z.length >= 4 && z.length <= 10 && /^[a-zA-Z0-9\- ]+$/.test(z) ? z : null;
  }

  function getOriginByCountry(country) {
    const c = safeStr(country || "MX").trim().toUpperCase();
    if (c === "US") {
      return {
        name: "Score Store US",
        company: "Score Store",
        email: siteSettings.contact?.email || DEFAULTS.email,
        phone: "8180000000",
        street: "Otay Mesa Rd",
        number: "123",
        district: "Otay",
        city: "San Diego",
        state: "CA",
        country: "US",
        postalCode: "92154",
      };
    }
    return {
      name: "Score Store MX",
      company: "Único Uniformes",
      email: siteSettings.contact?.email || DEFAULTS.email,
      phone: siteSettings.contact?.phone || DEFAULTS.phone,
      street: "Palermo",
      number: "6106",
      district: "Anexa Roma",
      city: "Tijuana",
      state: "BC",
      country: "MX",
      postalCode: "22614",
    };
  }

  function getPackageSpecs(country, items_qty) {
    const qty = clampInt(items_qty || 1, 1, 99, 1);
    const c = safeStr(country || "MX").trim().toUpperCase();
    if (c === "US") {
      return {
        type: "box",
        content: "Merchandise",
        amount: 1,
        weightUnit: "LB",
        lengthUnit: "IN",
        weight: qty * 0.8,
        dimensions: { length: 12, width: 12, height: 8 },
      };
    }
    return {
      type: "box",
      content: "Ropa",
      amount: 1,
      weightUnit: "KG",
      lengthUnit: "CM",
      weight: qty * 0.4,
      dimensions: { length: 25, width: 20, height: 15 },
    };
  }

  async function getZipDetails(country, zip) {
    const c = safeStr(country || "MX").trim().toUpperCase();
    const z = validateZip(zip, c);
    if (!z) return null;
    const url = `https://geocodes.envia.com/zipcode/${c}/${z}`;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${window.ENVIA_API_KEY || ""}`, "content-type": "application/json" } });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const info = data?.data?.[0] || data?.data || data;
      return { city: info?.city || info?.locality || null, state: info?.state_code || info?.state || null, postalCode: z, country: c };
    } catch {
      return null;
    }
  }

  function pickBestRate(rates) {
    return (Array.isArray(rates) ? rates : []).reduce((best, r) => {
      const price = Number(r?.totalPrice || r?.price || r?.amount || Infinity);
      if (!best || price < best.price) {
        return { carrier: safeStr(r?.carrier || "carrier"), service: safeStr(r?.service || "service"), price };
      }
      return best;
    }, null);
  }

  async function getEnviaQuote({ zip, country, items_qty }) {
    const c = safeStr(country || "MX").trim().toUpperCase();
    const z = validateZip(zip, c);
    if (!z) throw new Error("CP/ZIP inválido");

    const apiKey = window.ENVIA_API_KEY || "";
    if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

    const origin = getOriginByCountry(c);
    const zipInfo = await getZipDetails(c, z);
    const payload = {
      origin,
      destination: {
        name: "Cliente",
        email: siteSettings.contact?.email || DEFAULTS.email,
        phone: "0000000000",
        street: "Stripe",
        number: "1",
        district: "Centro",
        city: zipInfo?.city || "Tijuana",
        state: zipInfo?.state || "BC",
        country: c,
        postalCode: z,
      },
      packages: [getPackageSpecs(c, items_qty)],
      shipment: { carrier: c === "US" ? "usps" : "dhl", type: 1 },
      settings: { currency: "MXN" },
    };

    const res = await fetch("https://queries.envia.com/v1/ship/rate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error en Envía");

    const best = pickBestRate(data?.data || data?.rates || []);
    if (!best) throw new Error("No hay tarifas disponibles");

    return {
      ok: true,
      provider: "envia",
      label: `${best.carrier.toUpperCase()} ${best.service}`,
      amount_cents: Math.round(best.price * 100),
      amount_mxn: best.price,
    };
  }

  function getFallbackShipping(country, items_qty) {
    const c = safeStr(country || "MX").trim().toUpperCase();
    const priceMXN = c === "US" ? 850 + Number(items_qty || 1) * 50 : 250;
    return {
      ok: true,
      provider: "fallback",
      label: "Envío Estándar",
      amount_cents: priceMXN * 100,
      amount_mxn: priceMXN,
    };
  }

  function stripeShippingToEnviaDestination(sess) {
    if (!sess) return null;
    const sd = sess.shipping_details || {};
    const cd = sess.customer_details || {};
    const addr = sd.address || {};
    let street = safeStr(addr.line1 || "Domicilio Conocido").trim();
    let number = safeStr(addr.line2 || "S/N").trim();
    const match = street.match(/^(.*?)\s+((?:No\.?\s*|#\s*)?\d+[a-zA-Z]?(?:-\d+)?)$/i);
    if (match && number === "S/N") {
      street = match[1].trim();
      number = match[2].trim();
    }
    return {
      name: sd.name || cd.name || "Cliente",
      email: cd.email || sess.customer_email || siteSettings.contact?.email || DEFAULTS.email,
      phone: safeStr(sd.phone || cd.phone || "0000000000").replace(/\D/g, "").substring(0, 10),
      street,
      number,
      district: safeStr(addr.line2 || "Centro"),
      city: safeStr(addr.city || ""),
      state: safeStr(addr.state || ""),
      country: safeStr(addr.country || "MX").toUpperCase(),
      postalCode: safeStr(addr.postal_code || ""),
      reference: "Venta Online",
    };
  }

  async function createEnviaLabel({ shipping_country, stripe_session, items_qty }) {
    const country = safeStr(shipping_country || "MX").trim().toUpperCase();
    const apiKey = window.ENVIA_API_KEY || "";
    if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

    const payload = {
      origin: getOriginByCountry(country),
      destination: stripeShippingToEnviaDestination(stripe_session),
      packages: [getPackageSpecs(country, items_qty)],
      shipment: { carrier: country === "US" ? "usps" : "dhl", type: 1 },
      settings: { printFormat: "PDF", printSize: "STOCK_4X6", currency: "MXN" },
    };

    const res = await fetch("https://queries.envia.com/v1/ship/generate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error al generar guía");

    return {
      ok: true,
      label_url: data?.data?.label_url || data?.label_url || null,
      tracking_number: data?.data?.tracking_number || data?.tracking_number || null,
    };
  }

  async function callGemini({ apiKey, model = "gemini-2.5-flash-lite", systemText, userText }) {
    if (!apiKey) return "";

    const base = window.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
    const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemText}\n\nUSER: ${userText}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    return data?.candidates?.[0]?.content?.parts?.map((p) => safeStr(p?.text || "")).join("").trim() || "";
  }

  function normalizeReply(text) {
    return safeStr(text).replace(/\[ACTION:.*?\]/g, "").trim().slice(0, 1500);
  }

  function extractActionMarkers(text) {
    return Array.from(safeStr(text).matchAll(/\[ACTION:([A-Z_]+)(?::([^\]]+))?\]/g)).map((m) => ({ action: m[1], value: m[2] || "" }));
  }

  function initStripe() {
    const key = window.STRIPE_SECRET_KEY || "";
    if (!key || !window.Stripe) return null;
    return new window.Stripe(key, { apiVersion: "2025-01-27.acacia" });
  }

  async function readRawBody(req) {
    if (Buffer.isBuffer(req?.body)) return req.body;
    if (typeof req?.body === "string") return Buffer.from(req.body, "utf8");
    if (Buffer.isBuffer(req?.rawBody)) return req.rawBody;
    if (typeof req?.rawBody === "string") return Buffer.from(req.rawBody, "utf8");
    return Buffer.from("");
  }

  async function resolveScoreOrgId(sb) {
    if (!sb) return "";
    const { data } = await sb.from("organizations").select("id").eq("slug", "score-store").maybeSingle().catch(() => ({ data: null }));
    return data?.id || "";
  }

  async function readPublicSiteSettings(sb = null, orgId = null) {
    const client = sb || null;
    const resolvedId = orgId || "";
    if (!client) return { hero_title: "SCORE STORE", promo_active: false };
    const { data } = await client
      .from("site_settings")
      .select("*")
      .or(`organization_id.eq.${resolvedId},org_id.eq.${resolvedId}`)
      .maybeSingle()
      .catch(() => ({ data: null }));
    return data || { hero_title: "SCORE STORE", promo_active: false };
  }

  async function sendTelegram(text) {
    const token = window.TELEGRAM_BOT_TOKEN || "";
    const chatId = window.TELEGRAM_CHAT_ID || "";
    if (!token || !chatId) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: safeStr(text).slice(0, 4000),
        parse_mode: "HTML",
      }),
    }).catch(() => {});
  }

  function getProductImages(p) {
    const raw = Array.isArray(p?.images)
      ? p.images
      : typeof p?.images === "string"
        ? safeJsonParse(p.images, [])
        : [];
    const list = [];
    if (p?.cover_image || p?.coverImage) list.push(p.cover_image || p.coverImage);
    if (p?.image_url || p?.img || p?.image) list.push(p.image_url || p.img || p.image);
    for (const img of raw) list.push(img);
    return [...new Set(list.map(normalizeAssetPath).filter(Boolean))];
  }

  function getProductSectionUi(p) {
    const raw = safeStr(
      p?.uiSection || p?.sectionId || p?.section_id || p?.category || p?.collection || p?.sub_section || ""
    )
      .trim()
      .toUpperCase();

    if (!raw) return "";
    if (raw.includes("1000")) return "BAJA1000";
    if (raw.includes("500")) return "BAJA500";
    if (raw.includes("400")) return "BAJA400";
    if (raw.includes("250") || raw.includes("SF")) return "SF250";
    return raw.replace(/[^A-Z0-9]/g, "");
  }

  function getStockLabel(p) {
    const stock = Number(p?.stock);
    if (!Number.isFinite(stock)) return "Disponible";
    if (stock <= 0) return "Sin stock por ahora";
    if (stock <= 3) return "Últimas piezas";
    return "Disponible";
  }

  function normalizeCategory(row) {
    const id = safeStr(row?.id || row?.uiId || row?.section_id || row?.sectionId || "").trim().toUpperCase();
    if (!id) return null;
    const cfg = getCategoryConfig(id);
    const cover = normalizeAssetPath(
      row?.cover_image ||
        row?.coverImage ||
        row?.logo ||
        row?.image ||
        cfg?.cover_image ||
        cfg?.logo ||
        ASSET_FALLBACK_IMAGE
    );
    return {
      id,
      uiId: cfg?.uiId || id,
      name: safeStr(row?.name || row?.title || cfg?.name || id.replace(/_/g, " ")).trim(),
      logo: cover,
      cover_image: cover,
      image: cover,
      section_id: safeStr(row?.section_id || row?.sectionId || id).trim(),
      count: safeNum(row?.count, 0),
      active: row?.active == null ? true : !!row.active,
    };
  }

  function normalizeProduct(row) {
    if (!row || typeof row !== "object") return null;
    const images = getProductImages(row);
    const sectionUi = getProductSectionUi(row);
    const cover = normalizeAssetPath(row?.cover_image || row?.coverImage || images[0] || "");
    return {
      ...row,
      id: safeStr(row.id || row.sku || row.slug || "").trim(),
      sku: safeStr(row.sku || row.id || row.slug || "").trim(),
      name: getProductName(row),
      title: getProductName(row),
      description: getProductDescription(row),
      uiSection: sectionUi || "SCORE",
      sectionId: safeStr(row.sectionId || row.section_id || "").trim(),
      section_id: safeStr(row.section_id || row.sectionId || "").trim(),
      collection: safeStr(row.collection || row.sub_section || "").trim(),
      sub_section: safeStr(row.sub_section || row.collection || "").trim(),
      category: safeStr(row.category || "").trim(),
      rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : 999,
      stock: Number.isFinite(Number(row.stock)) ? Math.round(Number(row.stock)) : null,
      active: row.active == null ? true : !!row.active,
      is_active: row.is_active == null ? true : !!row.is_active,
      deleted_at: row.deleted_at || null,
      price_cents: getProductPriceCents(row),
      price_mxn: Number.isFinite(Number(row.price_mxn)) ? Number(row.price_mxn) : getProductPriceCents(row) / 100,
      base_mxn: Number.isFinite(Number(row.base_mxn)) ? Number(row.base_mxn) : getProductPriceCents(row) / 100,
      img: normalizeAssetPath(row.img || row.image || row.image_url || cover || images[0] || ""),
      image_url: normalizeAssetPath(row.image_url || row.img || row.image || cover || images[0] || ""),
      image: normalizeAssetPath(row.image || row.image_url || row.img || cover || images[0] || ""),
      cover_image: cover,
      images,
      sizes: Array.isArray(row.sizes)
        ? row.sizes.map((x) => safeStr(x).trim()).filter(Boolean)
        : safeJsonParse(row.sizes, []).map((x) => safeStr(x).trim()).filter(Boolean),
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    };
  }

  function attachCounts(sections, list) {
    const counts = new Map();
    for (const p of Array.isArray(list) ? list : []) {
      const key = getProductSectionUi(p);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return (Array.isArray(sections) ? sections : []).map((s) => ({
      ...s,
      count: counts.get(s.uiId || s.id || "") || 0,
    }));
  }

  function buildSectionsFromProducts(list) {
    const map = new Map();
    for (const p of Array.isArray(list) ? list : []) {
      const key = getProductSectionUi(p) || "SCORE";
      if (!map.has(key)) {
        const cfg = getCategoryConfig(key);
        const cover = normalizeAssetPath(cfg?.cover_image || cfg?.logo || ASSET_FALLBACK_IMAGE);
        map.set(key, {
          id: key,
          uiId: key,
          name: cfg?.name || key.replace(/_/g, " "),
          logo: cover,
          cover_image: cover,
          image: cover,
          section_id: key,
          count: 0,
          active: true,
        });
      }
      map.get(key).count += 1;
    }
    return Array.from(map.values()).sort((a, b) => {
      const order = ["BAJA1000", "BAJA500", "BAJA400", "SF250"];
      const ia = order.indexOf(a.uiId);
      const ib = order.indexOf(b.uiId);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.name.localeCompare(b.name, "es");
    });
  }

  function buildCatalogResponse(source = {}) {
    const rawProducts = Array.isArray(source.products) ? source.products : [];
    const rawCategories = Array.isArray(source.categories) ? source.categories : [];
    const products = rawProducts.map(normalizeProduct).filter(Boolean);
    const categories = rawCategories.length ? rawCategories : buildSectionsFromProducts(products);
    return {
      products,
      categories,
      stats: {
        activeProducts: products.filter((p) => p.active !== false && p.is_active !== false && !p.deleted_at).length,
        lowStockProducts: products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5).length,
        featuredProducts: products.filter((p) => Number(p.rank) <= 12).length,
      },
      store: {
        org_id: safeStr(source?.store?.org_id || source?.org_id || ""),
        name: safeStr(source?.store?.name || source?.store?.hero_title || source?.hero_title || "SCORE STORE"),
        hero_title: safeStr(source?.store?.hero_title || source?.hero_title || "SCORE STORE"),
        hero_image: safeStr(source?.store?.hero_image || source?.hero_image || HERO_FALLBACK_IMAGE),
        promo_active: !!(source?.store?.promo_active ?? source?.promo_active),
        promo_text: safeStr(source?.store?.promo_text || source?.promo_text || ""),
        maintenance_mode: !!(source?.store?.maintenance_mode ?? source?.maintenance_mode),
        contact: source?.store?.contact || source?.contact || {},
        home: source?.store?.home || source?.home || {},
        socials: source?.store?.socials || source?.socials || {},
      },
    };
  }

  async function loadCatalogFromJsonOrDb(orgId = "") {
    const json = safeJsonParse(await fetchJsonMaybe("/data/catalog.json"), null);
    if (json && (Array.isArray(json.products) || Array.isArray(json.categories))) {
      return buildCatalogResponse(json);
    }
    const resolvedOrgId = orgId || "";
    return buildCatalogResponse({ products: [], categories: [], org_id: resolvedOrgId });
  }

  function buildPublicPrompt({ store, stats, products, categories, context }) {
    const contact = store?.contact || {};
    const home = store?.home || {};
    const socials = store?.socials || {};

    const publicEmail = safeStr(contact.email || DEFAULTS.email);
    const publicPhone = safeStr(contact.phone || DEFAULTS.phone);
    const publicWhatsApp = safeStr(contact.whatsapp_display || DEFAULTS.whatsappDisplay);
    const supportHours = safeStr(home.support_hours || "");
    const shippingNote = safeStr(home.shipping_note || "");
    const returnsNote = safeStr(home.returns_note || "");
    const promoText = safeStr(store?.promo_text || "");
    const heroTitle = safeStr(store?.hero_title || store?.name || "SCORE STORE");
    const maintenanceMode = !!store?.maintenance_mode;

    const productsPreview = (Array.isArray(products) ? products : [])
      .slice(0, 24)
      .map((p) => `- ${getProductName(p)} | SKU:${getProductSku(p)} | ${money(getProductPriceCents(p))} | ${safeStr(getStockLabel(p))}`)
      .join("\n");

    const categoryPreview = (Array.isArray(categories) ? categories : [])
      .slice(0, 12)
      .map((c) => `- ${safeStr(c.name)} (${safeStr(c.uiId)})`)
      .join("\n");

    return `
Eres el asistente público de Score Store.

Objetivo:
- Ayudar a clientes a comprar.
- Resolver dudas sobre productos, tallas, envíos, pagos, promo y contacto.
- Responder breve, claro y comercial.

Reglas:
- No inventes stock, precios ni tiempos exactos.
- Si no sabes un dato, dilo directo.
- Si el cliente pide ayuda humana, usa solo estos datos:
  Correo: ${publicEmail}
  WhatsApp: ${publicWhatsApp}
  Teléfono: ${publicPhone}
  Horario: ${supportHours || "No especificado"}
- Si preguntan por envíos, usa la nota pública:
  ${shippingNote || "No disponible"}
- Si preguntan por devoluciones, usa la nota pública:
  ${returnsNote || "No disponible"}
- Si el modo mantenimiento está activo, menciónalo con prudencia.
- Si ves intención clara de compra del producto actual, termina con:
  [ACTION:ADD_TO_CART:${safeStr(context.currentSku || context.currentProduct || "")}]
- Si el usuario quiere abrir carrito o pagar, termina con:
  [ACTION:OPEN_CART]

Contexto público:
- Tienda: ${heroTitle}
- Promo visible: ${promoText || "Sin promo activa"}
- Mantenimiento: ${maintenanceMode ? "sí" : "no"}
- Productos activos: ${stats?.activeProducts ?? "N/D"}
- Productos con stock bajo: ${stats?.lowStockProducts ?? "N/D"}
- Categorías visibles:
${categoryPreview || "- N/D"}

Productos visibles:
${productsPreview || "- N/D"}

Contexto del usuario:
- Producto actual: ${safeStr(context.currentProduct || "Ninguno")}
- SKU actual: ${safeStr(context.currentSku || "Ninguno")}
- Carrito: ${safeStr(context.cartItems || "Sin datos")}
- Total visible: ${safeStr(context.cartTotal || "Sin datos")}
- Modo envío: ${safeStr(context.shipMode || "Sin datos")}
- Pedido foco: ${safeStr(context.orderId || "Ninguno")}
- Sugerencia: ${safeStr(context.actionHint || "Ninguna")}
- Sección/categoría: ${safeStr(context.category || "No definida")}

Redes públicas:
- Facebook: ${safeStr(socials.facebook || "")}
- Instagram: ${safeStr(socials.instagram || "")}
- YouTube: ${safeStr(socials.youtube || "")}
`.trim();
  }

  function fallbackReply(message, store, contact) {
    const m = normalizeLower(message);
    const email = safeStr(contact?.email || DEFAULTS.email);
    const whatsapp = safeStr(contact?.whatsapp_display || DEFAULTS.whatsappDisplay);
    const phone = safeStr(contact?.phone || DEFAULTS.phone);
    const shippingNote = safeStr(store?.home?.shipping_note || "");
    const returnsNote = safeStr(store?.home?.returns_note || "");
    const promoText = safeStr(store?.promo_text || "");

    if (m.includes("envío") || m.includes("envio")) {
      return `Puedo ayudarte con envíos. ${shippingNote || "Se calculan según destino y método disponible."} Soporte: ${whatsapp} · ${email}`;
    }
    if (m.includes("promo") || m.includes("cupón") || m.includes("cupon") || m.includes("descuento")) {
      return promoText ? `Promo visible: ${promoText}` : `No veo una promoción activa en este momento. Puedo ayudarte a revisar el carrito.`;
    }
    if (m.includes("talla") || m.includes("medida") || m.includes("size")) {
      return `Las tallas dependen del producto. Si me dices la prenda te ayudo a elegir.`;
    }
    if (m.includes("devol") || m.includes("cambio") || m.includes("return")) {
      return returnsNote ? returnsNote : `Los cambios y devoluciones dependen del caso. Soporte: ${phone} · ${email}`;
    }
    return `Estoy listo para ayudarte con catálogo, tallas, envío y checkout. Si necesitas soporte humano: ${whatsapp} · ${email}`;
  }

  function buildProxyRequest(req, body, channel) {
    return {
      ...req,
      body: {
        ...(body || {}),
        mode: "assistant",
        type: "assistant",
        assistant: channel,
        message: parseMessage(body),
        context: parseContext(body),
      },
    };
  }

  function parseBody(req) {
    const body = req?.body;
    if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
    }
    return {};
  }

  function parseMode(req, body) {
    const url = new URL(req.url, window.location.origin);
    const q = safeStr(url.searchParams.get("mode") || url.searchParams.get("type") || "").trim().toLowerCase();
    const b = safeStr(body?.mode || body?.type || body?.assistant || "").trim().toLowerCase();
    return b || q || (body?.message ? "assistant" : "catalog");
  }

  function parseOrgId(req, body) {
    const url = new URL(req.url, window.location.origin);
    return safeStr(
      body?.org_id ||
        body?.orgId ||
        body?.organization_id ||
        url.searchParams.get("org_id") ||
        url.searchParams.get("orgId") ||
        url.searchParams.get("organization_id") ||
        ""
    ).trim();
  }

  function parseMessage(body = {}) {
    const msg = body?.message ?? body?.prompt ?? body?.text ?? body?.input ?? "";
    return clampText(msg);
  }

  function parseContext(body = {}) {
    const ctx = body?.context && typeof body.context === "object" ? body.context : {};
    return {
      currentProduct: safeStr(ctx.currentProduct || ctx.product || ctx.currentSku || body?.currentProduct || ""),
      currentSku: safeStr(ctx.currentSku || ctx.sku || body?.currentSku || ""),
      cartItems: safeStr(ctx.cartItems || ctx.cart || body?.cartItems || ""),
      cartTotal: safeStr(ctx.cartTotal || ctx.total || body?.cartTotal || ""),
      shipMode: safeStr(ctx.shipMode || ctx.shippingMode || body?.shipMode || ""),
      orderId: safeStr(ctx.orderId || ctx.order_id || body?.orderId || ""),
      actionHint: safeStr(ctx.actionHint || ctx.action || body?.actionHint || ""),
      category: safeStr(ctx.category || ctx.section || body?.category || ""),
      history: Array.isArray(body?.messages) ? body.messages.slice(-12) : [],
    };
  }

  function getProductSectionUi(row) {
    const raw = safeStr(row?.uiSection || row?.sectionId || row?.section_id || row?.category || row?.collection || row?.sub_section || "").trim().toUpperCase();
    if (!raw) return "";
    if (raw.includes("1000")) return "BAJA1000";
    if (raw.includes("500")) return "BAJA500";
    if (raw.includes("400")) return "BAJA400";
    if (raw.includes("250") || raw.includes("SF")) return "SF250";
    return raw.replace(/[^A-Z0-9]/g, "");
  }

  function getStockLabel(row) {
    const stock = safeNum(row?.stock, null);
    if (!Number.isFinite(stock)) return "Disponible";
    if (stock <= 0) return "Sin stock por ahora";
    if (stock <= 3) return "Últimas piezas";
    return "Disponible";
  }

  async function fetchJsonMaybe(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = safeStr(text);
  }

  function syncSiteSettings() {
    const contact = siteSettings.contact || {};
    const home = siteSettings.home || {};
    const socials = siteSettings.socials || {};

    const email = safeStr(contact.email || DEFAULTS.email).trim();
    const waE164 = safeStr(contact.whatsapp_e164 || DEFAULTS.whatsappE164).trim();
    const waDisplay = safeStr(contact.whatsapp_display || DEFAULTS.whatsappDisplay).trim();

    const footerEmailEls = [els.footerEmailLink, $("#footerMailLink"), $("#footerMailLinkInline"), $("#privacyEmail")].filter(Boolean);
    footerEmailEls.forEach((el) => {
      if (el.tagName === "A") el.setAttribute("href", `mailto:${email}`);
      el.textContent = email;
    });

    const footerWaEls = [els.footerWhatsappLink, $("#footerWaLink"), $("#footerWaLinkInline"), els.checkoutPhone].filter(Boolean);
    footerWaEls.forEach((el) => {
      if (el.tagName === "A") el.setAttribute("href", `https://wa.me/${waE164}`);
    });

    if (els.footerEmailText) els.footerEmailText.textContent = email;
    if (els.footerWhatsappText) els.footerWhatsappText.textContent = waDisplay;

    if (els.footerFacebookLink && socials.facebook) els.footerFacebookLink.setAttribute("href", socials.facebook);
    if (els.footerInstagramLink && socials.instagram) els.footerInstagramLink.setAttribute("href", socials.instagram);
    if (els.footerYoutubeLink && socials.youtube) els.footerYoutubeLink.setAttribute("href", socials.youtube);

    if (els.footerNote) {
      els.footerNote.textContent = safeStr(
        home.footer_note || "Pago cifrado vía Stripe. Aceptamos OXXO Pay. Logística inteligente internacional con Envía.com."
      );
    }

    if (siteSettings.hero_title && els.heroTitle) els.heroTitle.textContent = siteSettings.hero_title;
    if (home.hero_text && els.heroText) els.heroText.textContent = home.hero_text;

    if (els.heroImage) {
      const heroSrc = normalizeAssetPath(siteSettings.hero_image || HERO_FALLBACK_IMAGE);
      els.heroImage.src = heroSrc;
      els.heroImage.onerror = () => {
        els.heroImage.onerror = null;
        els.heroImage.src = HERO_FALLBACK_IMAGE;
      };
    }

    if (siteSettings.promo_active && siteSettings.promo_text && els.promoBarText && !readStorage(STORAGE_KEYS.hiddenPromo, "0")) {
      els.promoBar.hidden = false;
      els.promoBarText.textContent = siteSettings.promo_text;
    }
  }

  function applyTheme() {
    document.documentElement.style.setProperty("--site-accent", "#e10600");
    document.documentElement.style.setProperty("--site-accent-dark", "#b70000");
  }

  async function loadSiteSettings() {
    try {
      const data = await fetchJson("/api/site_settings");
      siteSettings = {
        ...siteSettings,
        ...(data?.site_settings || data?.data || data || {}),
      };
      if (data?.org_id) siteSettings.org_id = data.org_id;
      syncSiteSettings();
      applyTheme();
    } catch {
      syncSiteSettings();
      applyTheme();
    }
  }

  async function loadCatalog() {
    if (loadingCatalog) return;
    loadingCatalog = true;
    try {
      let data = null;
      try {
        data = await fetchJson("/api/catalog");
      } catch {
        data = await fetchJson("/data/catalog.json");
      }

      const rawProducts = Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.items)
          ? data.items
          : [];

      const rawCategories = Array.isArray(data?.categories)
        ? data.categories
        : Array.isArray(data?.sections)
          ? data.sections
          : [];

      catalog = data || { categories: [], products: [] };
      categories = rawCategories.map(normalizeCategory).filter(Boolean);
      products = rawProducts.map(normalizeProduct).filter(Boolean);

      if (!categories.length) categories = buildSectionsFromProducts(products);
      else categories = attachCounts(categories, products);

      filteredProducts = [...products];

      renderCategories();
      renderProducts();
      updateResults();

      if (els.statusRow) els.statusRow.hidden = false;
      if (els.catalogCarouselSection && products.length) els.catalogCarouselSection.hidden = false;
    } catch (err) {
      categories = [];
      products = [];
      filteredProducts = [];
      renderCategories();
      renderProducts();
      updateResults();
      setToastState(safeStr(err?.message || "No fue posible cargar el catálogo."), "error");
    } finally {
      loadingCatalog = false;
    }
  }

  function loadPromos() {
    return fetchJson("/api/promos")
      .then((data) => {
        if (data?.store && typeof data.store === "object") {
          if (data.store.promo_active !== undefined) siteSettings.promo_active = !!data.store.promo_active;
          if (data.store.promo_text !== undefined) siteSettings.promo_text = safeStr(data.store.promo_text || "");
        }
        if (Array.isArray(data?.rules)) {
          const active = data.rules.find((r) => r?.active !== false && r?.enabled !== false);
          if (active) activePromo = active;
        }
        refreshHeaderPromo();
      })
      .catch(() => {});
  }

  function filteredList() {
    const q = normalizeLower(searchQuery);
    return products.filter((p) => {
      const catOk = !activeCategory || getProductSectionUi(p) === activeCategory || safeStr(p.sectionId).toUpperCase() === activeCategory;
      if (!catOk) return false;
      if (!q) return true;
      const hay = [
        p.sku,
        p.id,
        p.title,
        p.name,
        p.description,
        p.category,
        p.sectionId,
        p.collection,
        p.sub_section,
        ...(Array.isArray(p.sizes) ? p.sizes : []),
      ]
        .map(normalizeLower)
        .join(" ");
      return hay.includes(q);
    });
  }

  function syncSearch(value) {
    searchQuery = safeStr(value || "").trim();
    if (els.searchInput && els.searchInput.value !== searchQuery) els.searchInput.value = searchQuery;
    if (els.mobileSearchInput && els.mobileSearchInput.value !== searchQuery) els.mobileSearchInput.value = searchQuery;
    if (els.menuSearchInput && els.menuSearchInput.value !== searchQuery) els.menuSearchInput.value = searchQuery;
    writeStorage(STORAGE_KEYS.ui, { searchQuery, activeCategory });
  }

  function getCartKey(item) {
    return `${item.sku || item.id || item.title || "x"}::${safeStr(item.size || "")}`.toLowerCase();
  }

  function getCartEntry(p, size = "", qty = 1) {
    return {
      sku: getProductSku(p),
      title: getProductName(p),
      priceCents: getProductPriceCents(p),
      size: safeStr(size || "").trim(),
      qty: clampInt(qty, 1, 99, 1),
      image: getProductImages(p)[0] || normalizeAssetPath(p?.cover_image || p?.image || p?.img || ASSET_FALLBACK_IMAGE),
      sectionId: getProductSectionUi(p),
    };
  }

  function persistCart() {
    writeStorage(STORAGE_KEYS.cart, cart);
  }

  function persistShip() {
    writeStorage(STORAGE_KEYS.ship, { mode: shipMode, quote: shippingQuote || null });
  }

  function saveCustomer() {
    writeStorage(STORAGE_KEYS.customer, {
      name: els.checkoutName?.value || "",
      email: els.checkoutEmail?.value || "",
      phone: els.checkoutPhone?.value || "",
      address: els.checkoutAddress?.value || "",
      postal: els.checkoutPostal?.value || "",
      notes: els.checkoutNotes?.value || "",
    });
  }

  function restoreCustomer() {
    const saved = readStorage(STORAGE_KEYS.customer, null);
    if (!saved) return;
    if (els.checkoutName && saved.name) els.checkoutName.value = saved.name;
    if (els.checkoutEmail && saved.email) els.checkoutEmail.value = saved.email;
    if (els.checkoutPhone && saved.phone) els.checkoutPhone.value = saved.phone;
    if (els.checkoutAddress && saved.address) els.checkoutAddress.value = saved.address;
    if (els.checkoutPostal && saved.postal) els.checkoutPostal.value = saved.postal;
    if (els.checkoutNotes && saved.notes) els.checkoutNotes.value = saved.notes;
  }

  function restoreCart() {
    const saved = readStorage(STORAGE_KEYS.cart, []);
    cart = Array.isArray(saved) ? saved : [];
    cart = cart
      .map((it) => ({
        sku: safeStr(it.sku || ""),
        title: safeStr(it.title || ""),
        priceCents: safeNum(it.priceCents, 0),
        size: safeStr(it.size || ""),
        qty: clampInt(it.qty || 1, 1, 99, 1),
        image: safeStr(it.image || ""),
        sectionId: safeStr(it.sectionId || ""),
      }))
      .filter((it) => it.sku || it.title);
  }

  function normalizeSectionsFromProducts() {
    if (!categories.length && products.length) categories = buildSectionsFromProducts(products);
  }

  function updateFooterVersion() {
    if (els.appVersionLabel) els.appVersionLabel.textContent = APP_VERSION;
  }

  function updateStatusBar() {
    const list = filteredList();
    if (els.activeFilterLabel) {
      const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
      els.activeFilterLabel.textContent = activeCategory ? (cat?.name || activeCategory) : "Todos los productos";
    }
    if (els.activeFilterRow) els.activeFilterRow.hidden = !activeCategory && !searchQuery;
    if (els.carouselTitle) els.carouselTitle.textContent = activeCategory ? (CATEGORY_CONFIG.find((c) => c.uiId === activeCategory)?.name || "Productos") : "Productos destacados";
    if (els.resultsCountLabel) els.resultsCountLabel.textContent = `${list.length}`;
    if (els.resultsMetaLabel) els.resultsMetaLabel.textContent = `${products.length} productos`;
    if (els.productCountLabel) els.productCountLabel.textContent = `${products.length}`;
  }

  function refreshHeaderPromo() {
    if (!els.promoBar) return;
    const hidden = readStorage(STORAGE_KEYS.hiddenPromo, "0") === "1";
    if (siteSettings.promo_active && siteSettings.promo_text && !hidden) {
      els.promoBar.hidden = false;
      if (els.promoBarText) els.promoBarText.textContent = siteSettings.promo_text;
    } else {
      els.promoBar.hidden = true;
    }
  }

  function makeId() {
    try {
      return crypto.randomUUID();
    } catch {
      return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }

  function isLayerOpen() {
    return Boolean(
      (els.cartDrawer && !els.cartDrawer.hidden) ||
      (els.assistantDrawer && !els.assistantDrawer.hidden) ||
      (els.productModal && !els.productModal.hidden)
    );
  }

  function updateBodyClasses() {
    document.documentElement.classList.toggle("no-scroll", isLayerOpen());
  }

  function openOverlayLayer(layerEl) {
    if (!layerEl) return;
    layerEl.hidden = false;
    layerEl.setAttribute("aria-hidden", "false");
    updateBodyClasses();
  }

  function closeOverlayLayer(layerEl) {
    if (!layerEl) return;
    layerEl.hidden = true;
    layerEl.setAttribute("aria-hidden", "true");
    updateBodyClasses();
  }

  function openCart() {
    openOverlayLayer(els.cartDrawer);
  }

  function closeCart() {
    closeOverlayLayer(els.cartDrawer);
  }

  function openAssistant() {
    openOverlayLayer(els.assistantDrawer);
    if (els.assistantInput) setTimeout(() => els.assistantInput.focus(), 80);
  }

  function closeAssistant() {
    closeOverlayLayer(els.assistantDrawer);
  }

  function openProduct(sku) {
    const p = products.find((x) => getProductSku(x) === safeStr(sku).trim());
    if (!p) return;
    currentModalSku = getProductSku(p);
    selectedQty = 1;
    selectedSize = Array.isArray(p.sizes) && p.sizes.length ? safeStr(p.sizes[0]) : "";
    renderProductModal(p);
    openOverlayLayer(els.productModal);
  }

  function closeProductModal() {
    closeOverlayLayer(els.productModal);
  }

  function applyProductImagesToModal(p) {
    if (!els.pmCarousel) return;
    const imgs = getProductImages(p);
    const title = getProductName(p);
    const cover = imgs[0] || normalizeAssetPath(p.cover_image || p.coverImage || p.image || p.img || ASSET_FALLBACK_IMAGE);

    if (!imgs.length) {
      els.pmCarousel.innerHTML = `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`;
      if (els.pmDots) els.pmDots.innerHTML = "";
      return;
    }

    els.pmCarousel.innerHTML = imgs
      .map(
        (src, i) =>
          `<img data-slide="${i}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`
      )
      .join("");

    if (els.pmDots) {
      els.pmDots.innerHTML = imgs
        .map(
          (_, i) =>
            `<button type="button" class="pm__dot${i === 0 ? " active" : ""}" data-dot="${i}" aria-label="Imagen ${i + 1}"></button>`
        )
        .join("");
      $$("[data-dot]", els.pmDots).forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = clampInt(btn.getAttribute("data-dot"), 0, imgs.length - 1, 0);
          const child = els.pmCarousel.querySelector(`[data-slide="${idx}"]`);
          if (child) child.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        });
      });
    }
  }

  function renderProductModal(p) {
    if (!els.productModal || !p) return;

    const imgs = getProductImages(p);
    const title = getProductName(p);
    const price = money(getProductPriceCents(p));
    const stock = getStockLabel(p);

    if (els.pmTitle) els.pmTitle.textContent = title;
    if (els.pmPrice) els.pmPrice.textContent = price;
    if (els.pmDesc) els.pmDesc.textContent = getProductDescription(p) || "Mercancía oficial SCORE.";
    if (els.pmStockBadge) els.pmStockBadge.textContent = stock;

    if (els.pmChips) {
      els.pmChips.innerHTML = `
        <span class="pill pill--red">${escapeHtml(getCategoryName(getProductSectionUi(p)) || "SCORE")}</span>
        <span class="pill">${escapeHtml(stock)}</span>
        <span class="pill">${escapeHtml(getProductSku(p))}</span>
      `;
    }

    applyProductImagesToModal(p);

    if (els.pmSizePills) {
      const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : [];
      els.pmSizePills.innerHTML = sizes.length
        ? sizes
            .map(
              (size) => `
                <button type="button" class="size-pill${selectedSize === size ? " active" : ""}" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>
              `
            )
            .join("")
        : `<span class="pill">Talla libre</span>`;

      $$("[data-size]", els.pmSizePills).forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedSize = btn.getAttribute("data-size") || "";
          renderProductModal(p);
        });
      });
    }

    if (els.pmQtyDisplay) els.pmQtyDisplay.textContent = String(selectedQty);
    if (els.pmAddBtn) {
      els.pmAddBtn.disabled = stock === "Sin stock por ahora";
    }
  }

  function addToCart(productOrSku, qty = 1, size = "") {
    const p = typeof productOrSku === "string"
      ? products.find((x) => getProductSku(x) === productOrSku)
      : productOrSku;

    if (!p) return;

    const entry = getCartEntry(p, size || selectedSize, qty);
    const key = getCartKey(entry);
    const existing = cart.find((x) => getCartKey(x) === key);

    if (existing) {
      existing.qty = clampInt(existing.qty + entry.qty, 1, 99, 1);
    } else {
      cart.push(entry);
    }

    persistCart();
    renderCart();
    updateTotals();
    setToastState(`${entry.title} agregado al carrito.`, "success");
  }

  function removeFromCart(index) {
    if (index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    persistCart();
    renderCart();
    updateTotals();
  }

  function setCartQty(index, qty) {
    if (index < 0 || index >= cart.length) return;
    const next = clampInt(qty, 1, 99, 1);
    cart[index].qty = next;
    persistCart();
    renderCart();
    updateTotals();
  }

  function getSubtotalCents() {
    return cart.reduce((sum, item) => sum + safeNum(item.priceCents) * clampInt(item.qty, 1, 99, 1), 0);
  }

  function getDiscountCents() {
    const subtotal = getSubtotalCents();
    if (!activePromo) return 0;
    const pct = safeNum(activePromo.percent || activePromo.value || 0);
    const fixed = safeNum(activePromo.fixed_cents || activePromo.discount_cents || 0);
    if (pct > 0) return Math.min(subtotal, Math.round((subtotal * pct) / 100));
    if (fixed > 0) return Math.min(subtotal, fixed);
    return 0;
  }

  function getShippingCents() {
    if (shipMode === "pickup") return 0;
    if (shippingQuote && Number.isFinite(Number(shippingQuote.amount_cents))) return Math.max(0, Number(shippingQuote.amount_cents));
    return 25000;
  }

  function getTotalAmount() {
    return Math.max(0, getSubtotalCents() - getDiscountCents() + getShippingCents());
  }

  function updateCheckoutState() {
    const disabled = cart.length === 0 || !els.cartCheckoutBtn;
    if (els.cartCheckoutBtn) els.cartCheckoutBtn.disabled = disabled;
    if (els.checkoutQuoteShipBtn) els.checkoutQuoteShipBtn.disabled = cart.length === 0;
    if (els.checkoutApplyPromoBtn) els.checkoutApplyPromoBtn.disabled = !els.checkoutPromo?.value;
  }

  function refreshTotals() {
    if (els.cartSubtotal) els.cartSubtotal.textContent = money(getSubtotalCents());
    if (els.cartShipping) els.cartShipping.textContent = shipMode === "pickup" ? "Gratis" : money(getShippingCents());
    if (els.cartDiscount) els.cartDiscount.textContent = `- ${money(getDiscountCents())}`;
    if (els.cartTotal) els.cartTotal.textContent = money(getTotalAmount());
    if (els.cartTotalLabel) els.cartTotalLabel.textContent = money(getTotalAmount());
    if (els.cartCountBadge) els.cartCountBadge.textContent = String(cart.reduce((sum, item) => sum + clampInt(item.qty, 1, 99, 1), 0));
    updateCheckoutState();
  }

  function renderCart() {
    if (!els.cartList) return;

    if (!cart.length) {
      if (els.cartEmptyState) els.cartEmptyState.hidden = false;
      els.cartList.innerHTML = "";
      refreshTotals();
      return;
    }

    if (els.cartEmptyState) els.cartEmptyState.hidden = true;

    els.cartList.innerHTML = cart
      .map((item, idx) => {
        const img = normalizeAssetPath(item.image || ASSET_FALLBACK_IMAGE);
        return `
          <article class="cart-item" data-cart-index="${idx}">
            <img class="cart-item__img" src="${escapeHtml(img)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">
            <div class="cart-item__body">
              <div class="cart-item__top">
                <strong class="cart-item__title">${escapeHtml(item.title)}</strong>
                <button type="button" class="cart-item__remove" data-remove="${idx}" aria-label="Eliminar">✕</button>
              </div>
              <div class="cart-item__meta">
                <span>${escapeHtml(item.size || "Unitalla")}</span>
                <span>${money(item.priceCents)}</span>
              </div>
              <div class="qty-stepper-large">
                <button type="button" data-qty-minus="${idx}" aria-label="Disminuir">−</button>
                <span>${clampInt(item.qty, 1, 99, 1)}</span>
                <button type="button" data-qty-plus="${idx}" aria-label="Aumentar">+</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    $$("[data-remove]", els.cartList).forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(clampInt(btn.getAttribute("data-remove"), 0, cart.length - 1, 0)));
    });

    $$("[data-qty-minus]", els.cartList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = clampInt(btn.getAttribute("data-qty-minus"), 0, cart.length - 1, 0);
        setCartQty(idx, safeNum(cart[idx]?.qty, 1) - 1);
      });
    });

    $$("[data-qty-plus]", els.cartList).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = clampInt(btn.getAttribute("data-qty-plus"), 0, cart.length - 1, 0);
        setCartQty(idx, safeNum(cart[idx]?.qty, 1) + 1);
      });
    });

    refreshTotals();
  }

  function renderCategories() {
    if (!els.categoryGrid) return;

    const list = categories.length ? categories : buildSectionsFromProducts(products);
    const frag = document.createDocumentFragment();
    els.categoryGrid.innerHTML = "";

    const all = document.createElement("button");
    all.type = "button";
    all.className = "catcard hover-fx" + (!activeCategory ? " active" : "");
    all.dataset.cat = "";
    all.innerHTML = `
      <div class="catcard__bg" aria-hidden="true"></div>
      <div class="catcard__inner">
        <img class="catcard__logo" src="${escapeHtml(ASSET_FALLBACK_IMAGE)}" alt="Todos los productos" loading="lazy" decoding="async">
        <div class="catcard__meta">
          <div class="catcard__title tech-text">Todo SCORE</div>
          <div class="catcard__sub">${products.length} productos</div>
        </div>
        <div class="catcard__btn">Explorar</div>
      </div>
    `;
    all.addEventListener("click", () => {
      activeCategory = "";
      syncSearch("");
      renderCategories();
      updateResults();
      if (els.catalogCarouselSection) els.catalogCarouselSection.hidden = false;
      if (els.carouselTitle) els.carouselTitle.textContent = "Productos destacados";
      els.catalogCarouselSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    frag.appendChild(all);

    for (const cat of list) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catcard hover-fx" + (activeCategory === cat.uiId ? " active" : "");
      card.dataset.cat = cat.uiId;

      const logoSrc = normalizeAssetPath(cat.cover_image || cat.logo || getCategoryLogo(cat.uiId) || ASSET_FALLBACK_IMAGE);

      card.innerHTML = `
        <div class="catcard__bg" aria-hidden="true"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(cat.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">
          <div class="catcard__meta">
            <div class="catcard__title tech-text">${escapeHtml(cat.name)}</div>
            <div class="catcard__sub">${safeNum(cat.count, 0)} productos</div>
          </div>
          <div class="catcard__btn">Explorar</div>
        </div>
      `;

      card.addEventListener("click", () => {
        activeCategory = cat.uiId;
        syncSearch("");
        renderCategories();
        updateResults();
        if (els.catalogCarouselSection) els.catalogCarouselSection.hidden = false;
        if (els.carouselTitle) els.carouselTitle.textContent = cat.name;
        els.catalogCarouselSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      frag.appendChild(card);
    }

    els.categoryGrid.appendChild(frag);
    if (els.categoryHint) els.categoryHint.hidden = false;
    animateCards(".catcard");
    bindCardHover();
  }

  function productCardHTML(p) {
    const sku = escapeHtml(getProductSku(p));
    const title = escapeHtml(getProductName(p));
    const desc = escapeHtml(getProductDescription(p) || "Mercancía oficial SCORE.");
    const price = money(getProductPriceCents(p));
    const stock = getStockLabel(p);
    const imgs = getProductImages(p);
    const cover = imgs[0] || normalizeAssetPath(p.cover_image || p.coverImage || p.image || p.img || ASSET_FALLBACK_IMAGE);

    const track = imgs.length
      ? imgs
          .map(
            (src) =>
              `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`
          )
          .join("")
      : `<img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`;

    return `
      <article class="card product-card has-stock-badge" data-sku="${sku}" data-stock-badge="${escapeHtml(stock)}">
        <div class="card__media product-card__media">
          <div class="card__track product-card__track">
            ${track}
          </div>
          ${imgs.length > 1 ? `<div class="carousel-fade carousel-fade--left"></div><div class="carousel-fade carousel-fade--right"></div>` : ""}
          <button type="button" class="product-open" data-open-product="${sku}" aria-label="Abrir ${title}"></button>
        </div>
        <div class="card__body product-card__body">
          <div class="card__meta product-card__meta">
            <span class="pill pill--red">${escapeHtml(getCategoryName(getProductSectionUi(p)) || "SCORE")}</span>
            <span class="pill">${escapeHtml(stock)}</span>
          </div>
          <h3 class="card__title product-card__title">${title}</h3>
          <p class="card__desc product-card__desc">${desc}</p>
          <div class="card__footer product-card__footer">
            <strong class="card__price product-card__price">${price}</strong>
            <button type="button" class="btn btn--secondary btn--small" data-open-product="${sku}">Ver</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    if (!els.productGrid) return;
    const list = filteredList();
    if (!list.length) {
      els.productGrid.innerHTML = `
        <div class="panel" style="grid-column:1 / -1; text-align:center; padding:28px;">
          <h3 style="margin:0 0 8px">No encontramos productos</h3>
          <p style="margin:0; color:var(--u-muted)">Prueba otro término o cambia de colección.</p>
        </div>
      `;
      return;
    }

    els.productGrid.innerHTML = list.map(productCardHTML).join("");

    $$("[data-open-product]", els.productGrid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openProduct(btn.getAttribute("data-open-product"));
      });
    });

    animateCards(".product-card");
    bindCardHover();
  }

  function filteredProductsForCartSearch() {
    return filteredList();
  }

  function updateResults() {
    const list = filteredList();
    updateStatusBar();
    renderProducts();
    maybeShowSwipeHint();

    const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
    if (els.activeFilterLabel) {
      els.activeFilterLabel.textContent = activeCategory ? (cat?.name || activeCategory) : "Todos los productos";
    }
    if (els.activeFilterRow) els.activeFilterRow.hidden = !activeCategory && !searchQuery;
    if (els.carouselTitle) els.carouselTitle.textContent = activeCategory ? (cat?.name || "Productos") : "Productos destacados";
    if (els.catalogCarouselSection) els.catalogCarouselSection.hidden = products.length === 0 && !searchQuery && !activeCategory;
    if (els.resultsCountLabel) els.resultsCountLabel.textContent = `${list.length}`;
    if (els.productCountLabel) els.productCountLabel.textContent = `${list.length}`;
  }

  function maybeShowSwipeHint() {
    const hint = $("#productSwipeHint");
    if (!hint) return;
    const seen = readStorage(STORAGE_KEYS.seenSwipe, "0") === "1";
    if (!seen && products.length > 0) {
      hint.hidden = false;
      hint.classList.add("is-pulse");
      setTimeout(() => {
        hint.classList.remove("is-pulse");
        hint.classList.add("is-hide");
        writeStorage(STORAGE_KEYS.seenSwipe, "1");
      }, 4500);
    }
  }

  function applyHashSku() {
    const hash = String(location.hash || "");
    const m = hash.match(/sku=([^&]+)/i) || hash.match(/^#([a-z0-9\-_]+)$/i);
    if (!m) return;
    const sku = decodeURIComponent(m[1] || "").trim();
    if (!sku) return;
    setTimeout(() => openProduct(sku), 250);
  }

  function animateCards(selector) {
    $$(selector).forEach((el, idx) => {
      if (el.dataset.entered === "1") return;
      el.dataset.entered = "1";
      el.style.animationDelay = `${idx * 35}ms`;
      el.classList.add("is-entered");
    });
  }

  function bindCardHover() {
    $$(".card, .catcard").forEach((el) => {
      if (el.dataset.bound === "1") return;
      el.dataset.bound = "1";
      el.addEventListener("pointerenter", () => el.classList.add("is-hovered"), { passive: true });
      el.addEventListener("pointerleave", () => el.classList.remove("is-hovered"), { passive: true });
    });
  }

  function mountVisualPolish() {
    if (els.productGrid) els.productGrid.classList.add("carousel-track");
    if (els.categoryGrid) els.categoryGrid.classList.add("catgrid");
    if (els.topbar) els.topbar.classList.add("glass-header");
    if (els.catalogCarouselSection && !els.catalogCarouselSection.querySelector(".carousel-fade")) {
      const fadeL = document.createElement("div");
      fadeL.className = "carousel-fade carousel-fade--left";
      const fadeR = document.createElement("div");
      fadeR.className = "carousel-fade carousel-fade--right";
      els.catalogCarouselSection.appendChild(fadeL);
      els.catalogCarouselSection.appendChild(fadeR);
    }
  }

  function initSalesNotification() {
    if (!els.salesNotification || !els.salesName || !els.salesAction) return;
    const names = ["S. López", "C. Ramírez", "M. Torres", "A. García", "J. Morales", "L. Torres"];
    const actions = ["compró una gorra", "agregó una playera", "finalizó un pedido", "aplicó un cupón", "cotizó envío", "abrió el carrito"];
    let idx = 0;
    clearInterval(salesTimer);
    salesTimer = setInterval(() => {
      els.salesName.textContent = names[idx % names.length];
      els.salesAction.textContent = actions[idx % actions.length];
      els.salesNotification.classList.add("show");
      clearTimeout(initSalesNotification._t);
      initSalesNotification._t = setTimeout(() => els.salesNotification.classList.remove("show"), 3800);
      idx += 1;
    }, 18000);
  }

  function initCookieBanner() {
    if (!els.cookieBanner) return;
    const accepted = readStorage(STORAGE_KEYS.cookies, false);
    if (accepted) {
      els.cookieBanner.hidden = true;
      return;
    }
    els.cookieBanner.hidden = false;
    els.cookieAccept?.addEventListener("click", () => {
      writeStorage(STORAGE_KEYS.cookies, true);
      els.cookieBanner.hidden = true;
    });
    els.cookieReject?.addEventListener("click", () => {
      writeStorage(STORAGE_KEYS.cookies, false);
      els.cookieBanner.hidden = true;
    });
  }

  function hideSplash(force = false) {
    if (!els.splash) return;
    if (force) {
      els.splash.hidden = true;
      return;
    }
    els.splash.classList.add("fade-out");
    setTimeout(() => {
      if (els.splash) els.splash.hidden = true;
    }, 250);
  }

  function setToastState(message, kind = "info") {
    if (!message) return;
    if (els.promoBarText && kind === "error") {
      els.promoBarText.textContent = message;
      els.promoBar.hidden = false;
      return;
    }
    if (window.console) console.log(message);
  }

  function syncShipUI() {
    const isDelivery = shipMode === "delivery";
    if (els.shipModePickup) els.shipModePickup.checked = !isDelivery;
    if (els.shipModeDelivery) els.shipModeDelivery.checked = isDelivery;
    if (els.shipModePickupWrap) els.shipModePickupWrap.classList.toggle("active", !isDelivery);
    if (els.shipModeDeliveryWrap) els.shipModeDeliveryWrap.classList.toggle("active", isDelivery);
    persistShip();
    refreshTotals();
  }

  function setShipMode(mode) {
    shipMode = mode === "delivery" ? "delivery" : "pickup";
    syncShipUI();
  }

  async function quoteShipping() {
    if (!cart.length) return null;
    const postal = safeStr(els.checkoutPostal?.value || "").trim();
    const country = safeStr(els.checkoutCountry?.value || "MX").trim().toUpperCase();
    const itemsQty = itemsQtyFromAny(cart);

    if (!validateZip(postal, country)) {
      setToastState("Ingresa un código postal válido para cotizar.", "error");
      return null;
    }

    shippingQuoteLoading = true;
    try {
      const payload = {
        zip: postal,
        country,
        items_qty: itemsQty,
      };

      const res = await fetch("/api/quote_shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar envío.");

      shippingQuote = data.quote || data;
      shipMode = "delivery";
      syncShipUI();
      renderCart();
      updateTotals();
      setToastState("Envío cotizado con éxito.", "success");
      return shippingQuote;
    } catch (err) {
      shippingQuote = getFallbackShipping(country, itemsQty);
      shipMode = "delivery";
      syncShipUI();
      renderCart();
      updateTotals();
      setToastState(safeStr(err?.message || "Se usó una cotización fallback."), "error");
      return shippingQuote;
    } finally {
      shippingQuoteLoading = false;
    }
  }

  function applyPromoCode(code) {
    const next = safeStr(code || els.checkoutPromo?.value || "").trim();
    if (!next) {
      activePromo = null;
      writeStorage(STORAGE_KEYS.promo, null);
      refreshTotals();
      renderCart();
      return null;
    }

    activePromo = {
      code: next.toUpperCase(),
      percent: 0,
      fixed_cents: 0,
    };

    writeStorage(STORAGE_KEYS.promo, activePromo);
    refreshTotals();
    renderCart();
    setToastState(`Cupón "${next}" aplicado.`, "success");
    return activePromo;
  }

  async function loadPromos() {
    try {
      const data = await fetchJson("/api/promos");
      if (data?.store && typeof data.store === "object") {
        if (data.store.promo_active !== undefined) siteSettings.promo_active = !!data.store.promo_active;
        if (data.store.promo_text !== undefined) siteSettings.promo_text = safeStr(data.store.promo_text || "");
      }
      if (Array.isArray(data?.rules)) {
        const active = data.rules.find((r) => r?.active !== false && r?.enabled !== false);
        if (active) activePromo = active;
      }
      refreshHeaderPromo();
    } catch {}
  }

  async function submitCheckout() {
    if (!cart.length) {
      setToastState("Tu carrito está vacío.", "error");
      return;
    }

    const customer = {
      name: safeStr(els.checkoutName?.value || "").trim(),
      email: safeStr(els.checkoutEmail?.value || "").trim(),
      phone: safeStr(els.checkoutPhone?.value || "").trim(),
      address: safeStr(els.checkoutAddress?.value || "").trim(),
      postal: safeStr(els.checkoutPostal?.value || "").trim(),
      notes: safeStr(els.checkoutNotes?.value || "").trim(),
      country: safeStr(els.checkoutCountry?.value || "MX").trim().toUpperCase(),
    };

    if (!customer.email || !/@/.test(customer.email)) {
      setToastState("Ingresa un correo válido.", "error");
      els.checkoutEmail?.focus();
      return;
    }

    if (!customer.postal) {
      setToastState("Ingresa tu código postal.", "error");
      els.checkoutPostal?.focus();
      return;
    }

    if (shipMode === "delivery" && !validateZip(customer.postal, customer.country)) {
      setToastState("Código postal inválido para envío.", "error");
      els.checkoutPostal?.focus();
      return;
    }

    if (shippingQuoteLoading) {
      setToastState("Espera a que termine la cotización de envío.", "error");
      return;
    }

    saveCustomer();

    const btn = els.cartCheckoutBtn;
    if (btn) {
      btn.disabled = true;
      btn.dataset.loading = "1";
    }

    try {
      const payload = {
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_country: customer.country,
        shipping_zip: customer.postal,
        shipping_mode: shipMode,
        promo_code: activePromo?.code || safeStr(els.checkoutPromo?.value || "").trim(),
        items: cart.map((item) => ({
          sku: item.sku,
          title: item.title,
          qty: item.qty,
          size: item.size,
          priceCents: item.priceCents,
        })),
        notes: customer.notes,
      };

      const res = await fetch("/api/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo crear el checkout.");

      if (data.checkout_url || data.url || data.session_url) {
        window.location.href = data.checkout_url || data.url || data.session_url;
        return;
      }

      throw new Error("La pasarela no regresó una URL válida.");
    } catch (err) {
      setToastState(safeStr(err?.message || "No se pudo iniciar el checkout."), "error");
    } finally {
      if (btn) {
        btn.disabled = cart.length === 0;
        delete btn.dataset.loading;
      }
    }
  }

  async function sendAssistantMessage(msg) {
    const message = clampText(msg || "", 1600);
    if (!message || assistantBusy) return;
    assistantBusy = true;

    if (els.assistantLog) {
      const me = document.createElement("div");
      me.className = "chat-message chat-message--user";
      me.textContent = message;
      els.assistantLog.appendChild(me);
      els.assistantLog.scrollTop = els.assistantLog.scrollHeight;
    }

    try {
      const currentProduct = products.find((x) => getProductSku(x) === currentModalSku) || products[0] || null;
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "assistant",
          org_id: siteSettings.org_id || catalog?.store?.org_id || "",
          message: message,
          context: {
            currentProduct: currentProduct?.title || "",
            currentSku: currentProduct?.sku || "",
            cartItems: cart.map((item) => `${item.qty}x ${item.title}`).join(", "),
            cartTotal: money(getTotalAmount()),
            shipMode,
            orderId: "",
            actionHint: "Respuesta pública para Score Store",
            category: activeCategory || "",
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo responder.");

      const botLine = document.createElement("div");
      botLine.className = "chat-message chat-message--bot";
      botLine.textContent = safeStr(data.reply || "No tengo respuesta en este momento.");
      if (els.assistantLog) {
        els.assistantLog.appendChild(botLine);
        els.assistantLog.scrollTop = els.assistantLog.scrollHeight;
      }

      if (Array.isArray(data.actions) && data.actions.length) {
        data.actions.forEach((a) => {
          if (a.action === "ADD_TO_CART") {
            const p = products.find((x) => getProductSku(x) === a.value || getProductName(x) === a.value);
            if (p) addToCart(p, 1);
          }
          if (a.action === "OPEN_CART") openCart();
        });
      }
    } catch (err) {
      setToastState(safeStr(err?.message || "El chat no respondió."), "error");
    } finally {
      assistantBusy = false;
      if (els.assistantInput) els.assistantInput.value = "";
    }
  }

  function restoreUIState() {
    const ui = readStorage(STORAGE_KEYS.ui, null);
    if (!ui || typeof ui !== "object") return;
    searchQuery = safeStr(ui.searchQuery || "");
    activeCategory = safeStr(ui.activeCategory || "");
    if (els.searchInput) els.searchInput.value = searchQuery;
    if (els.mobileSearchInput) els.mobileSearchInput.value = searchQuery;
    if (els.menuSearchInput) els.menuSearchInput.value = searchQuery;
  }

  function bindEvents() {
    els.searchInput?.addEventListener("input", (e) => {
      syncSearch(e.target.value);
      updateResults();
    });

    els.mobileSearchInput?.addEventListener("input", (e) => {
      syncSearch(e.target.value);
      updateResults();
    });

    els.menuSearchInput?.addEventListener("input", (e) => {
      syncSearch(e.target.value);
      updateResults();
    });

    els.closeMobileSearchBtn?.addEventListener("click", () => {
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = true;
    });

    els.promoBarClose?.addEventListener("click", () => {
      writeStorage(STORAGE_KEYS.hiddenPromo, "1");
      refreshHeaderPromo();
    });

    els.cartToggleBtn?.addEventListener("click", openCart);
    els.cartCloseBtn?.addEventListener("click", closeCart);
    els.cartClearBtn?.addEventListener("click", () => {
      cart = [];
      shippingQuote = null;
      persistCart();
      renderCart();
      updateTotals();
    });

    els.cartCheckoutBtn?.addEventListener("click", submitCheckout);

    els.checkoutQuoteShipBtn?.addEventListener("click", async () => {
      await quoteShipping();
    });

    els.checkoutApplyPromoBtn?.addEventListener("click", () => {
      applyPromoCode(els.checkoutPromo?.value || "");
    });

    els.shipModePickup?.addEventListener("change", () => setShipMode("pickup"));
    els.shipModeDelivery?.addEventListener("change", () => setShipMode("delivery"));

    els.checkoutPostal?.addEventListener("change", async () => {
      if (shipMode === "delivery") await quoteShipping();
    });

    els.checkoutCountry?.addEventListener("change", async () => {
      if (shipMode === "delivery") await quoteShipping();
    });

    els.openAssistantBtn?.addEventListener("click", openAssistant);
    els.assistantCloseBtn?.addEventListener("click", closeAssistant);

    els.assistantSendBtn?.addEventListener("click", () => {
      if (els.assistantInput?.value) sendAssistantMessage(els.assistantInput.value);
    });

    els.assistantInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (els.assistantInput.value) sendAssistantMessage(els.assistantInput.value);
      }
    });

    els.productModalCloseBtn?.addEventListener("click", closeProductModal);
    els.pmAddBtn?.addEventListener("click", () => {
      const p = products.find((x) => getProductSku(x) === currentModalSku);
      if (!p) return;
      addToCart(p, selectedQty, selectedSize);
      closeProductModal();
      openCart();
    });

    els.pmQtyMinus?.addEventListener("click", () => {
      selectedQty = Math.max(1, selectedQty - 1);
      const p = products.find((x) => getProductSku(x) === currentModalSku);
      if (p) renderProductModal(p);
    });

    els.pmQtyPlus?.addEventListener("click", () => {
      selectedQty = Math.min(99, selectedQty + 1);
      const p = products.find((x) => getProductSku(x) === currentModalSku);
      if (p) renderProductModal(p);
    });

    els.cookieBanner?.addEventListener("click", (e) => {
      const t = e.target;
      if (t === els.cookieAccept || t === els.cookieReject) return;
    });

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const openSku = target.getAttribute("data-open-product");
      if (openSku) {
        e.preventDefault();
        openProduct(openSku);
      }

      const removeIdx = target.getAttribute("data-remove");
      if (removeIdx != null) {
        e.preventDefault();
        removeFromCart(clampInt(removeIdx, 0, cart.length - 1, 0));
      }

      const qtyMinus = target.getAttribute("data-qty-minus");
      if (qtyMinus != null) {
        e.preventDefault();
        const idx = clampInt(qtyMinus, 0, cart.length - 1, 0);
        setCartQty(idx, safeNum(cart[idx]?.qty, 1) - 1);
      }

      const qtyPlus = target.getAttribute("data-qty-plus");
      if (qtyPlus != null) {
        e.preventDefault();
        const idx = clampInt(qtyPlus, 0, cart.length - 1, 0);
        setCartQty(idx, safeNum(cart[idx]?.qty, 1) + 1);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeProductModal();
        closeCart();
        closeAssistant();
      }
    });
  }

  function syncShipFromStored() {
    const savedShip = readStorage(STORAGE_KEYS.ship, null);
    if (savedShip && typeof savedShip === "object") {
      shipMode = safeStr(savedShip.mode || shipMode).toLowerCase() === "delivery" ? "delivery" : "pickup";
    }
  }

  function updateCheckoutFieldsFromSettings() {
    if (els.checkoutCountry && !els.checkoutCountry.value) els.checkoutCountry.value = "MX";
    if (els.checkoutEmail && !els.checkoutEmail.value && siteSettings.contact?.email) els.checkoutEmail.value = siteSettings.contact.email;
    if (els.checkoutPhone && !els.checkoutPhone.value && siteSettings.contact?.phone) els.checkoutPhone.value = siteSettings.contact.phone;
  }

  function updateResultsPublic() {
    updateResults();
  }

  function applyPromoCodePublic(code) {
    return applyPromoCode(code);
  }

  function quoteShippingPublic() {
    return quoteShipping();
  }

  function openProductByHash() {
    applyHashSku();
  }

  function updateStatusBarPublic() {
    updateStatusBar();
  }

  function mount() {
    updateFooterVersion();
    restoreCart();
    restoreCustomer();
    restoreUIState();
    syncSearch("");
    refreshHeaderPromo();
    updateTotals();
    renderCart();
    renderCategories();
    renderProducts();
    updateStatusBar();
    mountVisualPolish();
    bindEvents();
    initCookieBanner();
    initSalesNotification();
    updateBodyClasses();
  }

  async function boot() {
    updateFooterVersion();
    restoreCart();
    restoreCustomer();
    restoreUIState();
    syncShipFromStored();

    if (els.shipModePickup) els.shipModePickup.checked = shipMode === "pickup";
    if (els.shipModeDelivery) els.shipModeDelivery.checked = shipMode === "delivery";

    bindEvents();
    initCookieBanner();
    renderCart();
    syncShipUI();
    updateCheckoutState();

    const splashFailSafe = setTimeout(() => hideSplash(true), 4500);

    try {
      await Promise.race([
        Promise.allSettled([loadPromos(), loadSiteSettings(), loadCatalog()]),
        new Promise((resolve) => setTimeout(resolve, 3500)),
      ]);
    } finally {
      clearTimeout(splashFailSafe);
    }

    normalizeSectionsFromProducts();
    renderCategories();
    renderProducts();
    updateResults();
    openProductByHash();
    hideSplash();
    initSalesNotification();
    refreshHeaderPromo();
    updateBodyClasses();

    if (els.checkoutEmail) {
      ["input", "change"].forEach((evt) => {
        els.checkoutEmail.addEventListener(evt, saveCustomer);
      });
    }

    ["input", "change"].forEach((evt) => {
      els.checkoutName?.addEventListener(evt, saveCustomer);
      els.checkoutPhone?.addEventListener(evt, saveCustomer);
      els.checkoutAddress?.addEventListener(evt, saveCustomer);
      els.checkoutPostal?.addEventListener(evt, saveCustomer);
      els.checkoutNotes?.addEventListener(evt, saveCustomer);
    });

    if (els.searchInput && els.searchInput.value) {
      syncSearch(els.searchInput.value);
      updateResults();
    }

    updateCheckoutFieldsFromSettings();
  }

  function updateTotals() {
    refreshTotals();
  }

  function refreshTotalsPublic() {
    refreshTotals();
  }

  function renderProductsPublic() {
    renderProducts();
  }

  function renderCategoriesPublic() {
    renderCategories();
  }

  window.SCORESTORE = {
    version: APP_VERSION,
    get catalog() { return catalog; },
    get categories() { return categories; },
    get products() { return products; },
    get cart() { return cart; },
    get shipMode() { return shipMode; },
    get activeCategory() { return activeCategory; },
    get activePromo() { return activePromo; },
    renderCategories: renderCategoriesPublic,
    renderProducts: renderProductsPublic,
    updateResults: updateResultsPublic,
    refreshTotals: refreshTotalsPublic,
    applyPromoCode: applyPromoCodePublic,
    quoteShipping: quoteShippingPublic,
    openProduct,
    addToCart,
    clearCart: () => {
      cart = [];
      persistCart();
      renderCart();
      updateTotals();
    },
    openCart,
    closeCart,
    openAssistant,
    closeAssistant,
    mount,
  };

  function clearCart() {
    cart = [];
    shippingQuote = null;
    persistCart();
    renderCart();
    updateTotals();
  }

  document.addEventListener("DOMContentLoaded", boot);

  window.addEventListener("beforeunload", () => {
    saveCustomer();
    persistShip();
    persistCart();
  });

  function updateTotals() {
    refreshTotals();
  }
})();