/* =========================================================
   SCORE STORE — main.js
   Current structure compatible
   - Cinematic intro with fixed 4s minimum visible time
   - /api/catalog as source for products + IA
   - /api/site_settings, /api/promos, /api/quote_shipping, /api/create_checkout
========================================================= */
(() => {
  "use strict";

  const APP_VERSION = "2026.04.10-intro-4s-final";
  const INTRO_MIN_VISIBLE_MS = 4000;
  const INTRO_FADE_MS = 800;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEYS = {
    cart: "scorestore_cart_v3",
    ship: "scorestore_ship_v3",
    promo: "scorestore_promo_v3",
    customer: "scorestore_customer_v3",
    cookies: "scorestore_cookie_accept_v1",
    seenSwipe: "scorestore_seen_swipe_v2",
    hiddenPromo: "scorestore_hidden_promo_v1",
    ui: "scorestore_ui_v3",
  };

  const DEFAULTS = {
    currency: "MXN",
    email: "ventas.unicotextil@gmail.com",
    phone: "6642368701",
    whatsappE164: "5216642368701",
    whatsappDisplay: "664 236 8701",
  };

  const CATEGORY_CONFIG = [
    {
      uiId: "BAJA1000",
      name: "BAJA 1000",
      logo: "/assets/products/baja1000/edicion_2025/camiseta-negra-baja1000.webp",
      cover_image: "/assets/products/baja1000/edicion_2025/camiseta-negra-baja1000.webp",
      aliases: ["BAJA1000", "BAJA_1000", "EDICION_2025", "EDICION_2026"],
    },
    {
      uiId: "BAJA500",
      name: "BAJA 500",
      logo: "/assets/products/baja1000/edicion_2025/camiseta-gris-baja500-detalle.webp",
      cover_image: "/assets/products/baja1000/edicion_2025/camiseta-gris-baja500-detalle.webp",
      aliases: ["BAJA500", "BAJA_500"],
    },
    {
      uiId: "BAJA400",
      name: "BAJA 400",
      logo: "/assets/products/baja400/camiseta-cafe--oscuro-baja400.webp",
      cover_image: "/assets/products/baja400/camiseta-cafe--oscuro-baja400.webp",
      aliases: ["BAJA400", "BAJA_400"],
    },
    {
      uiId: "SF250",
      name: "SAN FELIPE 250",
      logo: "/assets/products/sf250/camiseta-negra-sinmangas-sf250.webp",
      cover_image: "/assets/products/sf250/camiseta-negra-sinmangas-sf250.webp",
      aliases: ["SF250", "SF_250"],
    },
  ];

  const els = {
    splash: $("#splash"),

    topbar: $(".topbar"),
    promoBar: $("#promoBar"),
    promoBarText: $("#promoBarText"),
    promoBarClose: $("#promoBarClose"),

    heroTitle: $("#heroTitle"),
    heroText: $("#heroText"),
    heroTagline: $("#heroTagline"),
    heroImage: $("#heroImage"),

    categoryGrid: $("#categoryGrid"),
    categoryHint: $("#categoryHint"),
    activeFilterLabel: $("#activeFilterLabel"),
    activeFilterRow: $("#activeFilterRow"),
    clearFilterBtn: $("#clearFilterBtn"),
    carouselTitle: $("#carouselTitle"),
    catalogCarouselSection: $("#catalogCarouselSection"),
    productGrid: $("#productGrid"),
    statusRow: $("#statusRow"),

    searchInput: $("#searchInput"),
    mobileSearchInput: $("#mobileSearchInput"),
    menuSearchInput: $("#menuSearchInput"),
    sortSelect: $("#sortSelect"),
    scrollLeftBtn: $("#scrollLeftBtn"),
    scrollRightBtn: $("#scrollRightBtn"),
    scrollToCategoriesBtn: $("#scrollToCategoriesBtn"),

    cartToggleBtn: $("#cartToggleBtn"),
    cartCountBadge: $("#cartCountBadge"),
    cartDrawer: $("#cartDrawer"),
    closeCartBtn: $("#closeCartBtn"),
    cartItems: $("#cartItems"),
    cartEmptyState: $("#cartEmptyState"),
    cartSubtotal: $("#cartSubtotal"),
    cartShipping: $("#cartShipping"),
    cartDiscount: $("#cartDiscount"),
    cartTotal: $("#cartTotal"),

    checkoutName: $("#checkoutName"),
    checkoutEmail: $("#checkoutEmail"),
    checkoutPhone: $("#checkoutPhone"),
    checkoutAddress: $("#checkoutAddress"),
    checkoutPostal: $("#checkoutPostal"),
    checkoutNotes: $("#checkoutNotes"),
    checkoutCountry: $("#checkoutCountry"),
    checkoutPromo: $("#checkoutPromo"),
    checkoutQuoteShipBtn: $("#checkoutQuoteShipBtn"),
    checkoutApplyPromoBtn: $("#checkoutApplyPromoBtn"),
    cartCheckoutBtn: $("#cartCheckoutBtn"),
    cartClearBtn: $("#cartClearBtn"),

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

    cookieBanner: $("#cookieBanner"),
    cookieAccept: $("#cookieAccept"),
    cookieReject: $("#cookieReject"),

    footerNote: $("#footerNote"),
    footerEmailLink: $("#footerEmailLink"),
    footerWhatsappLink: $("#footerWhatsappLink"),
    footerFacebookLink: $("#footerFacebookLink"),
    footerInstagramLink: $("#footerInstagramLink"),
    footerYoutubeLink: $("#footerYoutubeLink"),
    appVersionLabel: $("#appVersionLabel"),

    salesNotification: $("#salesNotification"),
    salesName: $("#salesName"),
    salesAction: $("#salesAction"),

    overlay: $("#overlay"),
    scrollTopBtn: $("#scrollTopBtn"),
    mobileSearchWrap: $("#mobileSearchWrap"),
    closeMobileSearchBtn: $("#closeMobileSearchBtn"),
  };

  let catalog = { categories: [], products: [] };
  let categories = [];
  let products = [];
  let filteredProducts = [];
  let activeCategory = "";
  let searchQuery = "";
  let cart = [];
  let shipMode = "pickup";
  let shippingQuote = null;
  let activePromo = null;
  let siteSettings = {
    org_id: "",
    hero_title: "SCORE STORE",
    hero_image: "/assets/hero.webp",
    promo_active: false,
    promo_text: "",
    maintenance_mode: false,
    theme: { accent: "#e10600", accent2: "#111111", particles: true },
    home: {
      footer_note: "Pago cifrado vía Stripe. Aceptamos OXXO Pay. Logística inteligente internacional con Envía.com.",
      shipping_note: "",
      returns_note: "",
      support_hours: "",
    },
    socials: { facebook: "", instagram: "", youtube: "", tiktok: "" },
    contact: {
      email: DEFAULTS.email,
      phone: DEFAULTS.phone,
      whatsapp_e164: DEFAULTS.whatsappE164,
      whatsapp_display: DEFAULTS.whatsappDisplay,
    },
  };

  let currentProduct = null;
  let selectedQty = 1;
  let selectedSize = "";
  let loadingCatalog = false;
  let assistantBusy = false;
  let salesTimer = null;
  let introStartedAt = 0;
  let introExitTimer = null;
  let introFailSafeTimer = null;
  let introClosing = false;
  let serviceWorkerRegistered = false;

  const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
  const safeNum = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const clampInt = (v, min, max, fallback = min) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  const safeJsonParse = (raw, fallback = null) => {
    try {
      if (raw == null || raw === "") return fallback;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return fallback;
    }
  };
  const normalizeLower = (v) => safeStr(v).trim().toLowerCase();
  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  function money(cents) {
    const n = Number(cents);
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  }

  
  const legacyAssetUrl = (u) => {
    let s = String(u || "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/i.test(s)) return s;

    s = s
      .replace(/\.jpg\.webp$/ig, ".webp")
      .replace(/\.png\.webp$/ig, ".webp")
      .replace(/^\/?assets\/EDICION_2025\//i, "/assets/products/baja1000/edicion_2025/")
      .replace(/^\/?assets\/BAJA_1000\//i, "/assets/products/baja1000/edicion_2025/")
      .replace(/^\/?assets\/BAJA1000\//i, "/assets/products/baja1000/edicion_2025/")
      .replace(/^\/?assets\/OTRAS_EDICIONES\//i, "/assets/products/baja1000/otras_ediciones/")
      .replace(/^\/?assets\/BAJA_500\//i, "/assets/products/baja500/")
      .replace(/^\/?assets\/BAJA500\//i, "/assets/products/baja500/")
      .replace(/^\/?assets\/BAJA_400\//i, "/assets/products/baja400/")
      .replace(/^\/?assets\/BAJA400\//i, "/assets/products/baja400/")
      .replace(/^\/?assets\/SF_250\//i, "/assets/products/sf250/")
      .replace(/^\/?assets\/SF250\//i, "/assets/products/sf250/");

    if (s.startsWith("/")) return s;
    if (s.startsWith("assets/")) return `/${s}`;
    return s;
  };

  const safeUrl = legacyAssetUrl;
  const normalizeAssetPath = legacyAssetUrl;


  function getCategoryConfig(uiId) {
    const id = safeStr(uiId).trim().toUpperCase();
    return CATEGORY_CONFIG.find((c) => c.uiId === id || c.aliases.includes(id)) || null;
  }

  function getCategoryName(uiId) {
    return getCategoryConfig(uiId)?.name || safeStr(uiId).trim() || "Colección";
  }

  function getCategoryLogo(uiId) {
    const cfg = getCategoryConfig(uiId);
    return normalizeAssetPath(cfg?.cover_image || cfg?.logo || "/assets/logo-score.webp");
  }

  function getProductSku(p) {
    return safeStr(p?.sku || p?.id || p?.slug || "").trim();
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
    const stock = safeNum(p?.stock, null);
    if (!Number.isFinite(stock)) return "Disponible";
    if (stock <= 0) return "Sin stock";
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
        "/assets/logo-score.webp"
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
        const cover = normalizeAssetPath(cfg?.cover_image || cfg?.logo || "/assets/logo-score.webp");
        map.set(key, {
          id: key,
          uiId: cfg?.uiId || key,
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

    const out = Array.from(map.values());
    const order = CATEGORY_CONFIG.map((c) => c.uiId);
    out.sort((a, b) => {
      const ia = order.indexOf(a.uiId);
      const ib = order.indexOf(b.uiId);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.name.localeCompare(b.name, "es");
    });
    return out;
  }

  function getOrigin(req) {
    return req?.headers?.origin || req?.headers?.Origin || "";
  }

  function send(res, payload) {
    const out = payload || {};
    const headers = out.headers || {};
    res.statusCode = out.statusCode || 200;
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.end(out.body || "");
  }

  function jsonResponse(statusCode, data, origin = "") {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    };
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    return { statusCode, headers, body: JSON.stringify(data) };
  }

  function handleOptions({ headers = {} } = {}) {
    const origin = headers.origin || headers.Origin || "";
    return jsonResponse(204, null, origin);
  }

  function supabaseAdmin() {
    try {
      const { createClient } = require("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const key =
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE ||
        "";
      if (!url || !key) return null;
      return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    } catch {
      return null;
    }
  }

  async function resolveScoreOrgId(sb) {
    if (!sb) return "";
    const { data } = await sb.from("site_settings").select("organization_id, org_id").limit(1).maybeSingle();
    return safeStr(data?.organization_id || data?.org_id || "");
  }

  async function readPublicSiteSettings(sb, orgId = "") {
    if (!sb) return null;
    const tries = [];
    if (orgId) {
      tries.push(`organization_id.eq.${orgId}`);
      tries.push(`org_id.eq.${orgId}`);
    }
    for (const filter of tries.length ? tries : [null]) {
      try {
        let query = sb.from("site_settings").select("*");
        if (filter) query = query.or(filter);
        const { data, error } = await query.maybeSingle();
        if (!error && data) return data;
      } catch {}
    }
    return null;
  }

  async function selectByOrgMany(sb, table, columns, orgId) {
    if (!sb) return [];
    const tries = [];
    if (orgId) {
      tries.push(`organization_id.eq.${orgId}`);
      tries.push(`org_id.eq.${orgId}`);
    }
    for (const filter of tries.length ? tries : [null]) {
      try {
        let query = sb.from(table).select(columns);
        if (filter) query = query.or(filter);
        const { data, error } = await query;
        if (!error && Array.isArray(data)) return data;
      } catch {}
    }
    return [];
  }

  async function loadCatalogFromJsonOrDb(orgId = "") {
    const json = readJsonFile("data/catalog.json");
    if (json && (Array.isArray(json.products) || Array.isArray(json.categories) || Array.isArray(json.sections))) {
      return {
        ...buildCatalogResponse(json),
        source: "json",
      };
    }

    const sb = supabaseAdmin();
    if (!sb) {
      return {
        ...buildCatalogResponse({ products: [], categories: [], sections: [] }),
        source: "fallback",
      };
    }

    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      try {
        resolvedOrgId = await resolveScoreOrgId(sb);
      } catch {
        resolvedOrgId = "";
      }
    }

    const [settings, productsDb, categoriesDb] = await Promise.all([
      typeof readPublicSiteSettings === "function"
        ? readPublicSiteSettings(sb, resolvedOrgId).catch(() => null)
        : Promise.resolve(null),
      selectByOrgMany(
        sb,
        "products",
        "id, name, title, sku, description, price_cents, price_mxn, base_mxn, stock, category, section_id, sub_section, rank, img, image_url, images, sizes, active, is_active, deleted_at, metadata, created_at, updated_at",
        resolvedOrgId
      ),
      selectByOrgMany(sb, "site_categories", "*", resolvedOrgId).catch(() => []),
    ]);

    return {
      ...buildCatalogResponse({
        products: productsDb,
        categories: categoriesDb,
        sections: categoriesDb,
        org_id: resolvedOrgId,
        ...settings,
        store: settings || {},
      }),
      source: "db",
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
    const url = new URL(req.url, "http://localhost");
    const q = safeStr(url.searchParams.get("mode") || url.searchParams.get("type") || "").trim().toLowerCase();
    const b = safeStr(body?.mode || body?.type || body?.assistant || "").trim().toLowerCase();
    return b || q || (body?.message ? "assistant" : "catalog");
  }

  function parseOrgId(req, body) {
    const url = new URL(req.url, "http://localhost");
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
    const msg = body?.message ?? body?.prompt ?? body?.text ?? body?.input ?? body?.query ?? body?.question ?? "";
    return safeStr(msg).trim().slice(0, 1800);
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

  function moneyShort(cents) {
    const n = Number(cents);
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  }

  function buildPublicPrompt({ store, stats, products, categories, context }) {
    const contact = store?.contact || {};
    const home = store?.home || {};
    const socials = store?.socials || {};

    const publicEmail = safeStr(contact.email || process.env.SUPPORT_EMAIL || DEFAULTS.email);
    const publicPhone = safeStr(contact.phone || process.env.SUPPORT_PHONE || DEFAULTS.phone);
    const publicWhatsApp = safeStr(contact.whatsapp_display || process.env.SUPPORT_WHATSAPP_DISPLAY || DEFAULTS.whatsappDisplay);
    const supportHours = safeStr(home.support_hours || "");
    const shippingNote = safeStr(home.shipping_note || "");
    const returnsNote = safeStr(home.returns_note || "");
    const promoText = safeStr(store?.promo_text || "");
    const heroTitle = safeStr(store?.hero_title || store?.name || "SCORE STORE");
    const maintenanceMode = !!store?.maintenance_mode;

    const productsPreview = (Array.isArray(products) ? products : [])
      .slice(0, 24)
      .map((p) => `- ${getProductName(p)} | SKU:${getProductSku(p)} | ${moneyShort(getProductPriceCents(p))} | ${getStockLabel(p)}`)
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
    const email = safeStr(contact?.email || process.env.SUPPORT_EMAIL || DEFAULTS.email);
    const whatsapp = safeStr(contact?.whatsapp_display || process.env.SUPPORT_WHATSAPP_DISPLAY || DEFAULTS.whatsappDisplay);
    const phone = safeStr(contact?.phone || process.env.SUPPORT_PHONE || DEFAULTS.phone);
    const shippingNote = safeStr(store?.home?.shipping_note || "");
    const returnsNote = safeStr(store?.home?.returns_note || "");
    const promoText = safeStr(store?.promo_text || "");

    if (m.includes("envío") || m.includes("envio")) {
      return `Puedo ayudarte con envíos. ${shippingNote || "Se calculan según destino y método disponible."} Soporte: ${whatsapp} · ${email}`;
    }

    if (m.includes("promo") || m.includes("cupón") || m.includes("cupon") || m.includes("descuento")) {
      return promoText
        ? `Promo visible: ${promoText}`
        : `No veo una promoción activa en este momento. Puedo ayudarte a revisar el carrito.`;
    }

    if (m.includes("talla") || m.includes("medida") || m.includes("size")) {
      return `Las tallas dependen del producto. Si me dices la prenda te ayudo a elegir.`;
    }

    if (m.includes("devol") || m.includes("cambio") || m.includes("return")) {
      return returnsNote
        ? returnsNote
        : `Los cambios y devoluciones dependen del caso. Soporte: ${phone} · ${email}`;
    }

    return `Estoy listo para ayudarte con catálogo, tallas, envío y checkout. Si necesitas soporte humano: ${whatsapp} · ${email}`;
  }

  function normalizeReply(text) {
    return safeStr(text || "")
      .replace(/\[ACTION:[A-Z_]+(?::[^\]]+)?\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function extractActionMarkers(text) {
    const out = [];
    const re = /\[ACTION:([A-Z_]+)(?::([^\]]+))?\]/g;
    let m;
    while ((m = re.exec(String(text || "")))) {
      out.push({ action: m[1], value: safeStr(m[2] || "").trim() });
    }
    return out;
  }

  function normalizeGeminiError(err) {
    const msg = String(err?.message || err || "");
    if (/model.*not found|404/i.test(msg)) return "El modelo de IA configurado no está disponible.";
    if (/api key|unauth|permission|denied|401|403/i.test(msg)) return "La IA no tiene permiso o llave válida.";
    return "La IA no pudo completar la solicitud.";
  }

  async function maybeNotifyTelegram(message) {
    try {
      const { sendTelegram } = require("../_shared");
      if (typeof sendTelegram !== "function") return;
      await sendTelegram(message);
    } catch {}
  }

  async function callGemini({ apiKey, model, systemText, userText }) {
    const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemText}\n\nUSUARIO:\n${userText}` }],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          topP: 0.9,
          maxOutputTokens: 1024,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => safeStr(p?.text || ""))
        .join("")
        .trim() || "";

    return text || "";
  }

  async function handleCatalog(req) {
    const origin = getOrigin(req);
    const body = parseBody(req);
    const mode = parseMode(req, body);

    if (mode !== "assistant") {
      const orgId = parseOrgId(req, body);
      const catalogData = await loadCatalogFromJsonOrDb(orgId);

      return jsonResponse(
        200,
        {
          ok: true,
          mode: "catalog",
          ...catalogData,
        },
        origin
      );
    }

    const message = parseMessage(body);
    if (!message) {
      return jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin);
    }

    const orgId = parseOrgId(req, body);
    const context = parseContext(body);
    const catalogData = await loadCatalogFromJsonOrDb(orgId);

    let resolvedOrgId = orgId || catalogData?.store?.org_id || "";
    if (!resolvedOrgId) {
      const sb = supabaseAdmin();
      if (sb) {
        try {
          resolvedOrgId = await resolveScoreOrgId(sb);
        } catch {
          resolvedOrgId = "";
        }
      }
    }

    const systemText = buildPublicPrompt({
      store: catalogData.store,
      stats: catalogData.stats,
      products: catalogData.products,
      categories: catalogData.categories,
      context,
    });

    const preferredModel = safeStr(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim();
    const fallbackModel = safeStr(process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash").trim();

    let replyText = "";
    let usedModel = preferredModel || "fallback";

    if (process.env.GEMINI_API_KEY) {
      try {
        replyText = await callGemini({
          apiKey: process.env.GEMINI_API_KEY,
          model: preferredModel,
          systemText,
          userText: message,
        });
      } catch (e) {
        const errMsg = String(e?.message || e || "");
        const looksLikeModelIssue = /model.*not found|404/i.test(errMsg);

        if (looksLikeModelIssue && fallbackModel && fallbackModel !== preferredModel) {
          usedModel = fallbackModel;
          replyText = await callGemini({
            apiKey: process.env.GEMINI_API_KEY,
            model: fallbackModel,
            systemText,
            userText: message,
          });
        } else {
          replyText = fallbackReply(message, catalogData.store, catalogData.store?.contact || {});
          usedModel = "fallback";
        }
      }
    } else {
      replyText = fallbackReply(message, catalogData.store, catalogData.store?.contact || {});
      usedModel = "fallback";
    }

    const rawReply = safeStr(replyText || fallbackReply(message, catalogData.store, catalogData.store?.contact || {}));
    const reply = normalizeReply(rawReply).slice(0, 1400);
    const actions = extractActionMarkers(rawReply);

    if (actions.length) {
      await maybeNotifyTelegram(
        [
          "💬 <b>Score Store AI</b>",
          `Org: ${resolvedOrgId || catalogData.store?.org_id || "N/D"}`,
          `Actions: ${actions.map((a) => `${a.action}${a.value ? `:${a.value}` : ""}`).join(", ")}`,
          `Model: ${usedModel}`,
        ].join("\n")
      );
    }

    return jsonResponse(
      200,
      {
        ok: true,
        endpoint: "catalog",
        mode: "assistant",
        org_id: resolvedOrgId || catalogData.store?.org_id || "",
        reply,
        actions,
        model: usedModel,
        store: {
          name: catalogData.store?.name || "SCORE STORE",
          hero_title: catalogData.store?.hero_title || "SCORE STORE",
          promo_active: !!catalogData.store?.promo_active,
          promo_text: safeStr(catalogData.store?.promo_text || ""),
        },
      },
      origin
    );
  }


  const legacyVisualBootstrap = () => {
    document.documentElement.classList.add("legacy-visual-ready");
    document.body.classList.add("legacy-visual");

    const touch = (el, ...classes) => {
      if (!el) return;
      classes.forEach((c) => el.classList.add(c));
    };

    touch(els.splash, "splash");
    touch(els.promoBar, "promo-bar");
    touch(els.heroImage, "hero__desert", "hero-vfx-float");
    touch(els.categoryGrid, "catgrid");
    touch(els.catalogCarouselSection, "vfx-glass-container");
    touch(els.productGrid, "carousel-track", "custom-scrollbar");
    touch(els.cartDrawer, "glass-panel");
    touch(els.assistantDrawer, "glass-panel");
    touch(els.productModal, "vfx-modal-panel");
    touch(els.cookieBanner, "cookie-banner");
    touch(els.salesNotification, "sales-toast");
    touch(els.scrollTopBtn, "floating-scroll");
    touch(els.openAssistantBtn, "tech-glow");
  };

  function updateFooterVersion() {
    if (els.appVersionLabel) els.appVersionLabel.textContent = APP_VERSION;
  }

  function setBodyNoScroll(locked) {
    document.body.classList.toggle("no-scroll", !!locked);
    document.documentElement.classList.toggle("no-scroll", !!locked);
  }

  function updateBodyLocks() {
    const open = Boolean(
      (els.cartDrawer && !els.cartDrawer.hidden) ||
      (els.assistantDrawer && !els.assistantDrawer.hidden) ||
      (els.productModal && !els.productModal.hidden) ||
      (els.splash && !els.splash.hidden)
    );
    setBodyNoScroll(open);
    if (els.overlay) els.overlay.hidden = !open;
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

  function syncSiteSettings() {
    const contact = siteSettings.contact || {};
    const home = siteSettings.home || {};
    const socials = siteSettings.socials || {};

    const email = safeStr(contact.email || DEFAULTS.email).trim();
    const waE164 = safeStr(contact.whatsapp_e164 || DEFAULTS.whatsappE164).trim();
    const waDisplay = safeStr(contact.whatsapp_display || DEFAULTS.whatsappDisplay).trim();

    if (els.footerEmailLink) {
      els.footerEmailLink.setAttribute("href", `mailto:${email}`);
      els.footerEmailLink.textContent = email;
    }

    if (els.footerWhatsappLink) {
      els.footerWhatsappLink.setAttribute("href", `https://wa.me/${waE164}`);
      els.footerWhatsappLink.textContent = waDisplay;
    }

    if (els.footerNote) {
      els.footerNote.textContent = safeStr(
        home.footer_note || "Pago cifrado vía Stripe. Aceptamos OXXO Pay. Logística inteligente internacional con Envía.com."
      );
    }

    if (els.heroTitle && siteSettings.hero_title) els.heroTitle.textContent = siteSettings.hero_title;
    if (els.heroText && home.hero_text) els.heroText.textContent = home.hero_text;
    if (els.heroTagline && siteSettings.hero_title) els.heroTagline.textContent = "Official Merchandise";

    if (els.heroImage && siteSettings.hero_image) {
      els.heroImage.src = normalizeAssetPath(siteSettings.hero_image);
      els.heroImage.onerror = () => {
        els.heroImage.onerror = null;
        els.heroImage.src = "/assets/hero.webp";
      };
    }

    if (siteSettings.promo_active && siteSettings.promo_text && els.promoBarText && !readStorage(STORAGE_KEYS.hiddenPromo, "0")) {
      els.promoBar.hidden = false;
      els.promoBarText.textContent = siteSettings.promo_text;
    }

    if (els.footerFacebookLink && socials.facebook) els.footerFacebookLink.setAttribute("href", socials.facebook);
    if (els.footerInstagramLink && socials.instagram) els.footerInstagramLink.setAttribute("href", socials.instagram);
    if (els.footerYoutubeLink && socials.youtube) els.footerYoutubeLink.setAttribute("href", socials.youtube);
  }

  function applyTheme() {
    const theme = siteSettings.theme || {};
    const root = document.documentElement;
    if (theme.accent) root.style.setProperty("--red", safeStr(theme.accent));
    if (theme.accent2) root.style.setProperty("--black-btn", safeStr(theme.accent2));
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    });
  }

  async function loadPromos() {
    try {
      const data = await fetchJson("/api/promos");
      const rules = Array.isArray(data?.rules) ? data.rules : Array.isArray(data?.promos) ? data.promos : [];
      activePromo = rules.find((r) => r && (r.active !== false && r.enabled !== false)) || null;
    } catch {
      try {
        const data = await fetchJson("/data/promos.json");
        const rules = Array.isArray(data?.rules) ? data.rules : Array.isArray(data?.promos) ? data.promos : [];
        activePromo = rules.find((r) => r && (r.active !== false && r.enabled !== false)) || null;
      } catch {
        activePromo = null;
      }
    }
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
      console.error(err);
    } finally {
      loadingCatalog = false;
    }
  }

  function filteredList() {
    const q = normalizeLower(searchQuery);
    const cat = safeStr(activeCategory).trim().toUpperCase();

    let list = products.filter((p) => p.active !== false && p.is_active !== false && !p.deleted_at);

    if (cat) {
      list = list.filter((p) => getProductSectionUi(p) === cat);
    }

    if (q) {
      list = list.filter((p) => {
        const hay = [
          getProductName(p),
          getProductDescription(p),
          p.sku,
          p.collection,
          p.sub_section,
          p.sectionId,
          p.section_id,
          p.uiSection,
          p.category,
          ...(Array.isArray(p.sizes) ? p.sizes : []),
        ]
          .map((x) => safeStr(x).toLowerCase())
          .join(" | ");
        return hay.includes(q);
      });
    }

    const sortValue = safeStr(els.sortSelect?.value || "featured");
    const sorted = [...list];

    switch (sortValue) {
      case "price_asc":
        sorted.sort((a, b) => getProductPriceCents(a) - getProductPriceCents(b));
        break;
      case "price_desc":
        sorted.sort((a, b) => getProductPriceCents(b) - getProductPriceCents(a));
        break;
      case "name_asc":
        sorted.sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es"));
        break;
      case "featured":
      default:
        sorted.sort((a, b) => safeNum(a.rank, 999) - safeNum(b.rank, 999) || getProductName(a).localeCompare(getProductName(b), "es"));
        break;
    }

    filteredProducts = sorted;
    return sorted;
  }

  function updateStatus(count) {
    if (!els.statusRow) return;
    els.statusRow.innerHTML = `<span class="status">${count} producto${count === 1 ? "" : "s"} encontrado${count === 1 ? "" : "s"}</span>`;
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

  function renderCategories() {
    if (!els.categoryGrid) return;

    const list = categories.length ? categories : buildSectionsFromProducts(products);
    categories = list;
    els.categoryGrid.innerHTML = "";

    const frag = document.createDocumentFragment();

    const all = document.createElement("button");
    all.type = "button";
    all.className = "catcard hover-fx" + (!activeCategory ? " active" : "");
    all.dataset.cat = "";
    all.innerHTML = `
      <div class="catcard__bg" aria-hidden="true"></div>
      <div class="catcard__inner">
        <img class="catcard__logo" src="${escapeHtml("/assets/logo-score.webp")}" alt="Todas las colecciones" loading="lazy" decoding="async">
        <div class="catcard__meta">
          <div class="catcard__title tech-text">Todos los productos</div>
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
      els.catalogCarouselSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    frag.appendChild(all);

    for (const cat of list) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catcard hover-fx" + (activeCategory === cat.uiId ? " active" : "");
      card.dataset.cat = cat.uiId;
      const logoSrc = normalizeAssetPath(cat.cover_image || cat.logo || getCategoryLogo(cat.uiId) || "/assets/logo-score.webp");
      card.innerHTML = `
        <div class="catcard__bg" aria-hidden="true"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(cat.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/logo-score.webp'">
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
    const stock = escapeHtml(getStockLabel(p));
    const imgs = getProductImages(p);

    const track = imgs.length
      ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/logo-score.webp'">`).join("")
      : `<img src="${escapeHtml(normalizeAssetPath(p.cover_image || p.image || p.img || "/assets/logo-score.webp"))}" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/logo-score.webp'">`;

    return `
      <article class="card product-card has-stock-badge" data-sku="${sku}" data-stock-badge="${stock}">
        <div class="card__media product-card__media">
          <div class="card__track product-card__track custom-scrollbar">
            ${track}
          </div>
          ${imgs.length > 1 ? `<div class="carousel-fade carousel-fade--left"></div><div class="carousel-fade carousel-fade--right"></div>` : ""}
          <button type="button" class="product-open" data-open-product="${sku}" aria-label="Abrir ${title}"></button>
        </div>
        <div class="card__body product-card__body">
          <div class="card__meta product-card__meta">
            <span class="pill pill--red">${escapeHtml(getCategoryName(getProductSectionUi(p)) || "SCORE")}</span>
            <span class="pill">${stock}</span>
          </div>
          <h3 class="card__title product-card__title">${title}</h3>
          <p class="card__desc product-card__desc">${desc}</p>
          <div class="card__footer product-card__footer">
            <strong class="card__price product-card__price">${price}</strong>
            <button type="button" class="btn btn-link--secondary btn--small" data-open-product="${sku}">Ver</button>
          </div>
        </div>
      </article>
    `;
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

  function renderProducts() {
    if (!els.productGrid) return;
    const list = filteredList();
    els.productGrid.innerHTML = list.length
      ? list.map(productCardHTML).join("")
      : `<div class="panel" style="grid-column:1 / -1; text-align:center; padding:28px;"><h3 style="margin:0 0 8px">No encontramos productos</h3><p style="margin:0; color:var(--text-soft)">Prueba otro término o cambia de colección.</p></div>`;

    $$("[data-open-product]", els.productGrid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openProduct(btn.getAttribute("data-open-product"));
      });
    });

    animateCards(".product-card");
    bindCardHover();
    updateStatus(list.length);
    maybeShowSwipeHint();
  }

  function updateResults() {
    const list = filteredList();
    updateStatus(list.length);
    renderProducts();
    maybeShowSwipeHint();

    const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
    if (els.activeFilterLabel) {
      els.activeFilterLabel.textContent = activeCategory ? (cat?.name || activeCategory) : "Todos los productos";
    }
    if (els.activeFilterRow) els.activeFilterRow.hidden = !activeCategory && !searchQuery;
    if (els.carouselTitle) els.carouselTitle.textContent = activeCategory ? (cat?.name || "Productos") : "Productos destacados";
    if (els.catalogCarouselSection) els.catalogCarouselSection.hidden = products.length === 0 && !searchQuery && !activeCategory;
  }

  function getCartKey(item) {
    return `${safeStr(item.sku || item.id || item.title || "x")}::${safeStr(item.size || "")}`.toLowerCase();
  }

  function getCartEntry(product, size = "", qty = 1) {
    return {
      sku: getProductSku(product),
      title: getProductName(product),
      priceCents: getProductPriceCents(product),
      size: safeStr(size || "").trim(),
      qty: clampInt(qty, 1, 99, 1),
      image: getProductImages(product)[0] || normalizeAssetPath(product?.cover_image || product?.image || product?.img || "/assets/logo-score.webp"),
      sectionId: getProductSectionUi(product),
    };
  }

  function persistCart() {
    writeStorage(STORAGE_KEYS.cart, cart);
  }

  function persistShip() {
    writeStorage(STORAGE_KEYS.ship, { mode: shipMode, quote: shippingQuote || null });
  }

  function restoreCart() {
    const saved = readStorage(STORAGE_KEYS.cart, []);
    cart = Array.isArray(saved)
      ? saved
          .map((it) => ({
            sku: safeStr(it.sku || ""),
            title: safeStr(it.title || ""),
            priceCents: safeNum(it.priceCents ?? it.price_cents, 0),
            size: safeStr(it.size || ""),
            qty: clampInt(it.qty || 1, 1, 99, 1),
            image: safeStr(it.image || it.image_url || ""),
            sectionId: safeStr(it.sectionId || ""),
          }))
          .filter((it) => it.sku || it.title)
      : [];
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

  function refreshTotals() {
    if (els.cartSubtotal) els.cartSubtotal.textContent = money(getSubtotalCents());
    if (els.cartShipping) els.cartShipping.textContent = shipMode === "pickup" ? "Gratis" : money(getShippingCents());
    if (els.cartDiscount) els.cartDiscount.textContent = `- ${money(getDiscountCents())}`;
    if (els.cartTotal) els.cartTotal.textContent = money(getTotalAmount());
    if (els.cartCountBadge) els.cartCountBadge.textContent = String(cart.reduce((sum, item) => sum + clampInt(item.qty, 1, 99, 1), 0));
    updateCheckoutState();
  }

  function updateCheckoutState() {
    const disabled = cart.length === 0;
    if (els.cartCheckoutBtn) els.cartCheckoutBtn.disabled = disabled;
    if (els.checkoutQuoteShipBtn) els.checkoutQuoteShipBtn.disabled = disabled;
    if (els.pmAddBtn && currentProduct) {
      const stock = Number(currentProduct.stock);
      els.pmAddBtn.disabled = Number.isFinite(stock) && stock <= 0;
    }
  }

  function renderCart() {
    if (!els.cartItems) return;
    if (!cart.length) {
      if (els.cartEmptyState) els.cartEmptyState.hidden = false;
      els.cartItems.innerHTML = "";
      refreshTotals();
      updateCheckoutState();
      return;
    }

    if (els.cartEmptyState) els.cartEmptyState.hidden = true;

    els.cartItems.innerHTML = cart
      .map((item, idx) => {
        const img = normalizeAssetPath(item.image || "/assets/logo-score.webp");
        return `
          <article class="cart-item" data-cart-index="${idx}">
            <img class="cart-item__img" src="${escapeHtml(img)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/logo-score.webp'">
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

    $$("[data-remove]", els.cartItems).forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(clampInt(btn.getAttribute("data-remove"), 0, cart.length - 1, 0)));
    });
    $$("[data-qty-minus]", els.cartItems).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = clampInt(btn.getAttribute("data-qty-minus"), 0, cart.length - 1, 0);
        setCartQty(idx, safeNum(cart[idx]?.qty, 1) - 1);
      });
    });
    $$("[data-qty-plus]", els.cartItems).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = clampInt(btn.getAttribute("data-qty-plus"), 0, cart.length - 1, 0);
        setCartQty(idx, safeNum(cart[idx]?.qty, 1) + 1);
      });
    });

    refreshTotals();
    updateCheckoutState();
  }

  function removeFromCart(index) {
    if (index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    persistCart();
    renderCart();
  }

  function setCartQty(index, qty) {
    if (index < 0 || index >= cart.length) return;
    cart[index].qty = clampInt(qty, 1, 99, 1);
    persistCart();
    renderCart();
  }

  function addToCart(productOrSku, qty = 1, size = "") {
    const p = typeof productOrSku === "string"
      ? products.find((x) => getProductSku(x) === productOrSku)
      : productOrSku;
    if (!p) return;

    const entry = getCartEntry(p, size || selectedSize, qty);
    const key = getCartKey(entry);
    const existing = cart.find((x) => getCartKey(x) === key);

    if (existing) existing.qty = clampInt(existing.qty + entry.qty, 1, 99, 1);
    else cart.push(entry);

    persistCart();
    renderCart();
    setToastState(`${entry.title} agregado al carrito.`, "success");
  }

  function setToastState(message, kind = "info") {
    if (!els.salesNotification) return;
    els.salesNotification.dataset.kind = kind;
    if (message) {
      els.salesName.textContent = kind === "error" ? "Error" : "SCORE";
      els.salesAction.textContent = message;
      els.salesNotification.classList.add("show");
      clearTimeout(salesTimer);
      salesTimer = setTimeout(() => els.salesNotification.classList.remove("show"), 3500);
    }
  }

  function openCart() {
    if (!els.cartDrawer) return;
    els.cartDrawer.hidden = false;
    els.cartDrawer.setAttribute("aria-hidden", "false");
    setBodyNoScroll(true);
    if (els.overlay) els.overlay.hidden = false;
    updateBodyLocks();
  }

  function closeCart() {
    if (!els.cartDrawer) return;
    els.cartDrawer.hidden = true;
    els.cartDrawer.setAttribute("aria-hidden", "true");
    if (els.overlay) els.overlay.hidden = true;
    updateBodyLocks();
  }

  function openAssistant() {
    if (!els.assistantDrawer) return;
    els.assistantDrawer.hidden = false;
    els.assistantDrawer.setAttribute("aria-hidden", "false");
    setBodyNoScroll(true);
    if (els.overlay) els.overlay.hidden = false;
    updateBodyLocks();
    if (els.assistantInput) setTimeout(() => els.assistantInput.focus(), 80);
    if (els.assistantLog && els.assistantLog.childElementCount === 0) {
      appendAssistant("bot", "Hola. Soy el asistente de SCORE STORE. ¿Qué buscas hoy?");
    }
  }

  function closeAssistant() {
    if (!els.assistantDrawer) return;
    els.assistantDrawer.hidden = true;
    els.assistantDrawer.setAttribute("aria-hidden", "true");
    if (els.overlay) els.overlay.hidden = true;
    updateBodyLocks();
  }

  function appendAssistant(kind, text) {
    if (!els.assistantLog) return;
    const line = document.createElement("div");
    line.className = `chat-message chat-message--${kind === "me" ? "user" : "bot"}`;
    line.textContent = safeStr(text);
    els.assistantLog.appendChild(line);
    els.assistantLog.scrollTop = els.assistantLog.scrollHeight;
  }

  async function sendAssistantMessage(message) {
    const msg = safeStr(message || els.assistantInput?.value || "").trim();
    if (!msg || assistantBusy) return;
    assistantBusy = true;

    if (els.assistantInput) els.assistantInput.value = "";
    appendAssistant("me", msg);

    const context = {
      currentProduct: currentProduct?.title || "",
      currentSku: currentProduct?.sku || "",
      cartItems: cart.map((item) => `${item.qty}x ${item.title}`).join(", "),
      cartTotal: money(getTotalAmount()),
      shipMode,
      orderId: "",
      actionHint: "Respuesta pública para Score Store",
      category: activeCategory || "",
    };

    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "assistant",
          org_id: siteSettings.org_id || catalog?.store?.org_id || "",
          message: msg,
          context,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo responder.");

      appendAssistant("bot", safeStr(data.reply || "No tengo respuesta en este momento."));

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
    }
  }

  function buildProductModal(p) {
    currentProduct = p;
    selectedQty = 1;
    selectedSize = Array.isArray(p?.sizes) && p.sizes.length ? safeStr(p.sizes[0]) : "";

    if (els.pmTitle) els.pmTitle.textContent = getProductName(p);
    if (els.pmPrice) els.pmPrice.textContent = money(getProductPriceCents(p));
    if (els.pmDesc) els.pmDesc.textContent = getProductDescription(p) || "Mercancía oficial SCORE.";
    if (els.pmStockBadge) els.pmStockBadge.textContent = getStockLabel(p);
    if (els.pmQtyDisplay) els.pmQtyDisplay.textContent = String(selectedQty);

    if (els.pmChips) {
      els.pmChips.innerHTML = `
        <span class="pill pill--red">${escapeHtml(getCategoryName(getProductSectionUi(p)) || "SCORE")}</span>
        <span class="pill">${escapeHtml(getStockLabel(p))}</span>
        <span class="pill">${escapeHtml(getProductSku(p))}</span>
      `;
    }

    if (els.pmCarousel) {
      const imgs = getProductImages(p);
      els.pmCarousel.innerHTML = imgs.length
        ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(getProductName(p))}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/logo-score.webp'">`).join("")
        : `<img src="${escapeHtml(normalizeAssetPath(p.cover_image || p.image || p.img || "/assets/logo-score.webp"))}" alt="${escapeHtml(getProductName(p))}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/assets/logo-score.webp'">`;
    }

    if (els.pmSizePills) {
      const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : [];
      els.pmSizePills.innerHTML = sizes.length
        ? sizes.map((size) => `<button type="button" class="size-pill${selectedSize === size ? " active" : ""}" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("")
        : `<span class="pill">Talla libre</span>`;
      $$("[data-size]", els.pmSizePills).forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedSize = btn.getAttribute("data-size") || "";
          buildProductModal(p);
        });
      });
    }

    if (els.pmAddBtn) {
      const stock = Number(p.stock);
      els.pmAddBtn.disabled = Number.isFinite(stock) && stock <= 0;
    }
  }

  function openProduct(sku) {
    const p = products.find((x) => getProductSku(x) === safeStr(sku).trim());
    if (!p || !els.productModal) return;
    buildProductModal(p);
    els.productModal.hidden = false;
    els.productModal.classList.add("modal--open");
    setBodyNoScroll(true);
    if (els.overlay) els.overlay.hidden = false;
    updateBodyLocks();
    setTimeout(() => els.pmAddBtn?.focus(), 50);
  }

  function closeProductModal() {
    if (!els.productModal) return;
    els.productModal.classList.remove("modal--open");
    setTimeout(() => {
      els.productModal.hidden = true;
      if (els.overlay) els.overlay.hidden = true;
      updateBodyLocks();
    }, 350);
  }

  function applyPromoCode(code) {
    const next = safeStr(code || "").trim().toUpperCase();
    if (!next) {
      activePromo = null;
      writeStorage(STORAGE_KEYS.promo, null);
      refreshTotals();
      renderCart();
      return null;
    }
    activePromo = { code: next, percent: 0, fixed_cents: 0 };
    writeStorage(STORAGE_KEYS.promo, activePromo);
    refreshTotals();
    renderCart();
    setToastState(`Cupón "${next}" aplicado.`, "success");
    return activePromo;
  }

  async function quoteShipping() {
    if (!cart.length) return null;
    const postal = safeStr(els.checkoutPostal?.value || "").trim();
    const country = safeStr(els.checkoutCountry?.value || "MX").trim().toUpperCase();
    const itemsQty = cart.reduce((sum, item) => sum + clampInt(item.qty, 1, 99, 1), 0);

    if (!postal) {
      setToastState("Ingresa un código postal válido para cotizar.", "error");
      return null;
    }

    try {
      const res = await fetch("/api/quote_shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: postal, country, items_qty: itemsQty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar envío.");
      shippingQuote = data.quote || data;
      shipMode = "delivery";
      persistShip();
      refreshTotals();
      renderCart();
      setToastState("Envío cotizado con éxito.", "success");
      return shippingQuote;
    } catch (err) {
      shippingQuote = { ok: true, provider: "fallback", label: "Envío Estándar", amount_cents: 25000, amount_mxn: 250 };
      shipMode = "delivery";
      persistShip();
      refreshTotals();
      renderCart();
      setToastState(safeStr(err?.message || "Se usó una cotización fallback."), "error");
      return shippingQuote;
    }
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
        promo_code: activePromo?.code || "",
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

  function openProductByHash() {
    const raw = String(location.hash || "");
    const m = raw.match(/sku=([^&]+)/i) || raw.match(/^#([a-z0-9\-_]+)$/i);
    if (!m) return;
    const sku = decodeURIComponent(m[1] || "").trim();
    if (sku) setTimeout(() => openProduct(sku), 180);
  }

  function registerServiceWorker() {
    if (serviceWorkerRegistered) return;
    if (!("serviceWorker" in navigator)) return;
    serviceWorkerRegistered = true;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  function hideSplash(force = false) {
    if (!els.splash || els.splash.hidden || introClosing) return;
    introClosing = true;

    const elapsed = performance.now() - introStartedAt;
    const wait = force ? 0 : Math.max(0, INTRO_MIN_VISIBLE_MS - elapsed);

    const doExit = () => {
      if (!els.splash || els.splash.hidden) return;
      els.splash.classList.add("fade-out");
      introExitTimer = window.setTimeout(() => {
        if (els.splash) els.splash.hidden = true;
        introClosing = false;
        updateBodyLocks();
      }, INTRO_FADE_MS);
    };

    if (wait > 0) {
      introExitTimer = window.setTimeout(doExit, wait);
    } else {
      doExit();
    }
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

    els.promoBarClose?.addEventListener("click", () => {
      writeStorage(STORAGE_KEYS.hiddenPromo, "1");
      refreshHeaderPromo();
    });

    els.cartToggleBtn?.addEventListener("click", openCart);
    els.closeCartBtn?.addEventListener("click", closeCart);
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

    els.pmAddBtn?.addEventListener("click", () => {
      if (!currentProduct) return;
      addToCart(currentProduct, selectedQty, selectedSize);
      closeProductModal();
      openCart();
    });

    els.pmQtyMinus?.addEventListener("click", () => {
      selectedQty = Math.max(1, selectedQty - 1);
      if (currentProduct) buildProductModal(currentProduct);
    });

    els.pmQtyPlus?.addEventListener("click", () => {
      selectedQty = Math.min(99, selectedQty + 1);
      if (currentProduct) buildProductModal(currentProduct);
    });

    els.productModalCloseBtn?.addEventListener("click", closeProductModal);
    els.checkoutQuoteShipBtn?.addEventListener("click", async () => await quoteShipping());
    els.checkoutApplyPromoBtn?.addEventListener("click", () => applyPromoCode(els.checkoutPromo?.value || ""));
    els.cartCheckoutBtn?.addEventListener("click", submitCheckout);

    els.cartClearBtn?.addEventListener("click", () => {
      cart = [];
      persistCart();
      renderCart();
    });

    els.scrollLeftBtn?.addEventListener("click", () => {
      els.productGrid?.scrollBy({ left: -360, behavior: "smooth" });
    });

    els.scrollRightBtn?.addEventListener("click", () => {
      els.productGrid?.scrollBy({ left: 360, behavior: "smooth" });
    });

    els.clearFilterBtn?.addEventListener("click", () => {
      activeCategory = "";
      syncSearch("");
      renderCategories();
      updateResults();
    });

    els.scrollToCategoriesBtn?.addEventListener("click", () => {
      els.categoryGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.closeMobileSearchBtn?.addEventListener("click", () => {
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = true;
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

    window.addEventListener("hashchange", openProductByHash);
    window.addEventListener("scroll", () => {
      if (!els.scrollTopBtn) return;
      els.scrollTopBtn.hidden = window.scrollY < 400;
    });
    els.scrollTopBtn?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function boot() {
    introStartedAt = performance.now();

    updateFooterVersion();
    restoreCart();
    restoreCustomer();

    try {
      const savedShip = readStorage(STORAGE_KEYS.ship, null);
      if (savedShip && typeof savedShip === "object") {
        shipMode = safeStr(savedShip.mode || shipMode).toLowerCase() === "delivery" ? "delivery" : "pickup";
        if (savedShip.quote) shippingQuote = savedShip.quote;
      }
    } catch {}

    if (els.checkoutEmail && siteSettings.contact?.email && !els.checkoutEmail.value) els.checkoutEmail.value = siteSettings.contact.email;
    if (els.checkoutPhone && siteSettings.contact?.phone && !els.checkoutPhone.value) els.checkoutPhone.value = siteSettings.contact.phone;

    if (els.footerEmailLink) {
      const email = safeStr(siteSettings.contact?.email || DEFAULTS.email);
      els.footerEmailLink.setAttribute("href", `mailto:${email}`);
      els.footerEmailLink.textContent = email;
    }
    if (els.footerWhatsappLink) {
      const waE164 = safeStr(siteSettings.contact?.whatsapp_e164 || DEFAULTS.whatsappE164);
      const waDisplay = safeStr(siteSettings.contact?.whatsapp_display || DEFAULTS.whatsappDisplay);
      els.footerWhatsappLink.setAttribute("href", `https://wa.me/${waE164}`);
      els.footerWhatsappLink.textContent = waDisplay;
    }

    legacyVisualBootstrap();
    bindEvents();
    initCookieBanner();
    renderCart();
    updateCheckoutState();
    updateBodyLocks();

    if (els.splash && !els.splash.hidden) {
      introFailSafeTimer = window.setTimeout(() => {
        hideSplash(true);
      }, INTRO_MIN_VISIBLE_MS);
    }

    try {
      await Promise.race([
        Promise.allSettled([loadPromos(), loadSiteSettings(), loadCatalog()]),
        delay(INTRO_MIN_VISIBLE_MS - 500),
      ]);
    } catch (err) {
      console.error("[boot]", err);
    } finally {
      if (introFailSafeTimer) clearTimeout(introFailSafeTimer);
      introFailSafeTimer = null;
      hideSplash(false);
    }

    renderCategories();
    renderProducts();
    updateResults();
    openProductByHash();
    initSalesNotification();
    refreshHeaderPromo();
    registerServiceWorker();

    ["input", "change"].forEach((evt) => {
      els.checkoutName?.addEventListener(evt, saveCustomer);
      els.checkoutEmail?.addEventListener(evt, saveCustomer);
      els.checkoutPhone?.addEventListener(evt, saveCustomer);
      els.checkoutAddress?.addEventListener(evt, saveCustomer);
      els.checkoutPostal?.addEventListener(evt, saveCustomer);
      els.checkoutNotes?.addEventListener(evt, saveCustomer);
    });

    if (els.searchInput && els.searchInput.value) {
      syncSearch(els.searchInput.value);
      updateResults();
    }
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
    renderCategories,
    renderProducts,
    updateResults,
    refreshTotals,
    applyPromoCode,
    quoteShipping,
    openProduct,
    addToCart,
    openCart,
    closeCart,
    openAssistant,
    closeAssistant,
  };

  document.addEventListener("DOMContentLoaded", boot);

  window.addEventListener("beforeunload", () => {
    saveCustomer();
    persistShip();
    persistCart();
  });
})();