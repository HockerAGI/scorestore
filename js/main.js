/* =========================================================
   SCORE STORE — main.js (merged from latest repo + old repo)
   - Respects old catalog sections + cover_image
   - Normalizes legacy /assets paths and whitespace aliases
   - Works with /api/* and falls back to /.netlify/functions/*
   - Keeps cart / checkout / promo / assistant UX intact
========================================================= */
(() => {
  "use strict";

  const APP_VERSION = "2026.04.10.SCORESTORE.MERGED";
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
  };

  const CATEGORY_CONFIG = [
    {
      uiId: "BAJA1000",
      name: "BAJA 1000",
      logo: "/assets/logo-baja1000.webp",
      cover_image: "/assets/edicion_2025/camiseta-negra-baja1000.webp",
      aliases: ["BAJA1000", "BAJA_1000", "EDICION_2025", "EDICION_2026", "OTRAS_EDICIONES"],
    },
    {
      uiId: "BAJA500",
      name: "BAJA 500",
      logo: "/assets/logo-baja500.webp",
      cover_image: "/assets/edicion_2025/camiseta-gris-baja500-detalle.webp",
      aliases: ["BAJA500", "BAJA_500"],
    },
    {
      uiId: "BAJA400",
      name: "BAJA 400",
      logo: "/assets/logo-baja400.webp",
      cover_image: "/assets/baja400/camiseta-cafe-oscuro-baja400.webp",
      aliases: ["BAJA400", "BAJA_400"],
    },
    {
      uiId: "SF250",
      name: "SAN FELIPE 250",
      logo: "/assets/logo-sf250.webp",
      cover_image: "/assets/sf250/camiseta-negra-sinmangas-SF250.webp",
      aliases: ["SF250", "SF_250"],
    },
  ];

  const ASSET_FALLBACK_IMAGE = "/assets/logo-score.webp";
  const HERO_FALLBACK_IMAGE = "/assets/hero.webp";

  const ROUTES = {
    catalog: ["/api/catalog", "/.netlify/functions/catalog", "/data/catalog.json"],
    promos: ["/api/promos", "/.netlify/functions/promos", "/data/promos.json"],
    siteSettings: ["/api/site_settings", "/.netlify/functions/site_settings"],
    quoteShipping: ["/api/quote_shipping", "/.netlify/functions/quote_shipping"],
    createCheckout: ["/api/create_checkout", "/.netlify/functions/create_checkout"],
    checkoutStatus: ["/api/checkout_status", "/.netlify/functions/checkout_status"],
    assistant: ["/api/catalog", "/.netlify/functions/chat"],
  };

  const els = {
    splash: $("#splash"),
    topbar: $(".topbar") || $(".site-header"),
    promoBar: $("#promoBar"),
    promoBarText: $("#promoBarText"),
    promoBarClose: $("#promoBarClose"),
    categoryGrid: $("#categoryGrid") || $("#catalogCategories"),
    categoryHint: $("#categoryHint"),
    activeFilterLabel: $("#activeFilterLabel"),
    activeFilterRow: $("#activeFilterRow"),
    carouselTitle: $("#carouselTitle"),
    catalogCarouselSection: $("#catalogCarouselSection"),
    productGrid: $("#productGrid") || $("#catalogGrid"),
    statusRow: $("#statusRow"),
    resultsCountLabel: $("#resultsCountLabel"),
    resultsMetaLabel: $("#resultsMetaLabel"),
    productCountLabel: $("#productCountLabel"),
    searchInput: $("#searchInput"),
    mobileSearchWrap: $("#mobileSearchWrap"),
    mobileSearchBtn: $("#mobileSearchBtn"),
    mobileSearchInput: $("#mobileSearchInput"),
    closeMobileSearchBtn: $("#closeMobileSearchBtn"),
    menuSearchInput: $("#menuSearchInput"),
    sortSelect: $("#sortSelect"),
    clearFilterBtn: $("#clearFilterBtn"),
    scrollLeftBtn: $("#scrollLeftBtn"),
    scrollRightBtn: $("#scrollRightBtn"),
    scrollToCategoriesBtn: $("#scrollToCategoriesBtn"),

    openMenuBtn: $("#openMenuBtn"),
    closeMenuBtn: $("#closeMenuBtn"),
    sideMenu: $("#sideMenu"),
    navOpenCart: $("#navOpenCart"),
    navOpenAssistant: $("#navOpenAssistant"),

    overlay: $("#overlay"),

    cartDrawer: $("#cartDrawer"),
    closeCartBtn: $("#closeCartBtn"),
    cartToggleBtn: $("#cartToggleBtn") || $("#openCartBtn"),
    cartCountBadge: $("#cartCountBadge") || $("#cartCount"),
    cartItems: $("#cartItems") || $("#cartList"),
    cartSubtotal: $("#cartSubtotal"),
    cartShipping: $("#cartShipping") || $("#shippingNote"),
    cartDiscount: $("#cartDiscount"),
    cartTotal: $("#cartTotal"),
    drawerSubtotal: $("#drawerSubtotal") || $("#cartSubtotal"),
    drawerShipping: $("#drawerShipping") || $("#shippingNote"),
    drawerTotal: $("#drawerTotal") || $("#cartTotal"),
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
    checkoutMsg: $("#checkoutMsg"),
    checkoutLoader: $("#checkoutLoader"),
    checkoutSubmitBtn: $("#checkoutSubmitBtn"),

    shipModePickup: $("#shipModePickup"),
    shipModeDelivery: $("#shipModeDelivery"),
    shipModePickupWrap: $("#shipModePickupWrap"),
    shipModeDeliveryWrap: $("#shipModeDeliveryWrap"),

    openAssistantBtn: $("#openAssistantBtn"),
    floatingAssistantBtn: $("#floatingAssistantBtn"),
    assistantDrawer: $("#assistantDrawer") || $("#assistantModal"),
    assistantCloseBtn: $("#assistantCloseBtn") || $("#assistantClose"),
    assistantLog: $("#assistantLog") || $("#assistantOutput"),
    assistantInput: $("#assistantInput"),
    assistantSendBtn: $("#assistantSendBtn"),

    productModal: $("#productModal"),
    productModalCloseBtn: $("#productModalCloseBtn") || $("#productCloseBtn"),
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

    heroTitle: $("#heroTitle") || $(".hero__title"),
    heroText: $("#heroText") || $(".hero__copy"),
    heroImage: $("#heroImage"),
    heroTagline: $("#heroTagline"),

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
    socials: { facebook: "", instagram: "", youtube: "" },
    theme: { accent: "#e10600", accent2: "#111827" },
    copy: { hero_title: null, hero_subtitle: "" },
  };

  let catalog = { products: [], categories: [], store: {} };
  let products = [];
  let categories = [];
  let promosData = { rules: [] };
  let activePromo = null;
  let activeCategory = "";
  let searchQuery = "";
  let sortMode = "featured";
  let cart = [];
  let shipping = { mode: "pickup", quote: null };
  let loadingCatalog = false;
  let shippingQuoteLoading = false;
  let selectedQty = 1;
  let selectedSize = "";
  let currentProduct = null;
  let salesTimer = null;
  let toastTimer = null;
  let assistantBusy = false;
  let hiddenPromoSeen = false;

  const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
  const safeNum = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const safeBool = (v, d = false) => {
    if (typeof v === "boolean") return v;
    if (v === "1" || v === 1 || v === "true") return true;
    if (v === "0" || v === 0 || v === "false") return false;
    return d;
  };
  const clampInt = (v, min, max, fallback = min) => {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  const clampText = (v, max = 1800) => safeStr(v).trim().slice(0, max);
  const normalizeLower = (v) => safeStr(v).trim().toLowerCase();

  const safeJsonParse = (raw, fallback = null) => {
    try {
      if (raw == null || raw === "") return fallback;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return fallback;
    }
  };

  const readStorage = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? safeJsonParse(raw, fallback) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeStorage = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };

  const removeStorage = (key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const normalizeAssetPath = (input) => {
    let s = String(input ?? "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    s = s.replaceAll("\\", "/").replace(/\s+/g, "%20");
    s = s.replaceAll("/assets/BAJA_1000/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/BAJA1000/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/EDICION_2025/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/BAJA_500/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/BAJA500/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/BAJA_400/", "/assets/baja400/");
    s = s.replaceAll("/assets/BAJA400/", "/assets/baja400/");
    s = s.replaceAll("/assets/SF_250/", "/assets/sf250/");
    s = s.replaceAll("/assets/SF250/", "/assets/sf250/");
    s = s.replaceAll("/assets/OTRAS_EDICIONES/", "/assets/otras_ediciones/");
    return s.startsWith("/") ? s : `/${s.replace(/^\/+/, "")}`;
  };

  const toAbsolutePath = (p) => {
    const s = String(p ?? "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    return s.startsWith("/") ? s : `/${s}`;
  };

  const money = (cents) => {
    const n = Number(cents);
    const v = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(v / 100);
  };

  function getCategoryConfig(uiId) {
    const id = safeStr(uiId).trim().toUpperCase();
    return CATEGORY_CONFIG.find((c) => c.uiId === id || (Array.isArray(c.aliases) && c.aliases.includes(id))) || null;
  }

  function getCategoryName(uiId) {
    return getCategoryConfig(uiId)?.name || safeStr(uiId).trim() || "Colección";
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
    const raw = safeStr(p?.uiSection || p?.sectionId || p?.section_id || p?.category || p?.collection || p?.sub_section || "").trim().toUpperCase();
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
      categories: rawCategories.length ? attachCounts(categories.map(normalizeCategory).filter(Boolean), products) : categories,
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
        theme: source?.store?.theme || source?.theme || {},
        copy: source?.store?.copy || source?.copy || {},
      },
    };
  }

  function fetchJsonFirstOk(urls, options = {}) {
    const list = Array.isArray(urls) ? urls : [urls];
    return (async () => {
      let lastErr = null;
      for (const u of list) {
        try {
          const res = await fetch(u, { cache: "no-store", ...options });
          if (!res.ok) {
            lastErr = new Error(`HTTP ${res.status}`);
            continue;
          }
          const j = await res.json().catch(() => null);
          if (j != null) return j;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("No se pudo cargar JSON");
    })();
  }

  async function fetchCatalogData() {
    const cv = encodeURIComponent(APP_VERSION);
    return fetchJsonFirstOk([
      `${ROUTES.catalog[0]}?cv=${cv}`,
      `${ROUTES.catalog[1]}?cv=${cv}`,
      `${ROUTES.catalog[2]}?cv=${cv}`,
    ]);
  }

  function getBaseUrl() {
    const { protocol, host } = window.location;
    return `${protocol}//${host}`;
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
          { role: "user", parts: [{ text: `${systemText}\n\nUSER: ${userText}` }] },
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
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
    const key = window.STRIPE_SECRET_KEY;
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
      body: JSON.stringify({ chat_id: chatId, text: safeStr(text).slice(0, 4000), parse_mode: "HTML" }),
    }).catch(() => {});
  }

  function getId(v) {
    return String(v || "").trim();
  }

  function getCartKey(item) {
    return `${getId(item.sku || item.id || item.title)}::${getId(item.size)}`.toLowerCase();
  }

  function getCartEntry(product, size = "", qty = 1) {
    return {
      sku: getProductSku(product),
      title: getProductName(product),
      priceCents: getProductPriceCents(product),
      size: safeStr(size || "").trim(),
      qty: clampInt(qty, 1, 99, 1),
      image: getProductImages(product)[0] || normalizeAssetPath(product?.cover_image || product?.image || product?.img || ASSET_FALLBACK_IMAGE),
      sectionId: getProductSectionUi(product),
    };
  }

  function clearCart() {
    cart = [];
    persistCart();
    renderCart();
    updateTotals();
  }

  function persistCart() {
    writeStorage(STORAGE_KEYS.cart, cart);
  }

  function persistShip() {
    writeStorage(STORAGE_KEYS.ship, shipping);
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
        priceCents: safeNum(it.priceCents ?? it.price_cents, 0),
        size: safeStr(it.size || ""),
        qty: clampInt(it.qty || 1, 1, 99, 1),
        image: safeStr(it.image || it.image_url || ""),
        sectionId: safeStr(it.sectionId || ""),
      }))
      .filter((it) => it.sku || it.title);
  }

  function syncSearch(value) {
    searchQuery = safeStr(value || "").trim();
    if (els.searchInput && els.searchInput.value !== searchQuery) els.searchInput.value = searchQuery;
    if (els.mobileSearchInput && els.mobileSearchInput.value !== searchQuery) els.mobileSearchInput.value = searchQuery;
    if (els.menuSearchInput && els.menuSearchInput.value !== searchQuery) els.menuSearchInput.value = searchQuery;
    writeStorage(STORAGE_KEYS.ui, { searchQuery, activeCategory });
  }

  function filteredList() {
    const q = normalizeLower(searchQuery);
    let list = products.slice();

    if (activeCategory) {
      list = list.filter((p) => getProductSectionUi(p) === activeCategory || safeStr(p.sectionId).toUpperCase() === activeCategory);
    }

    if (q) {
      list = list.filter((p) => {
        const hay = [
          p.sku, p.id, p.title, p.name, p.description, p.category, p.sectionId, p.collection, p.sub_section,
          ...(Array.isArray(p.sizes) ? p.sizes : []),
        ].map(normalizeLower).join(" ");
        return hay.includes(q);
      });
    }

    switch (sortMode) {
      case "price_asc":
        list.sort((a, b) => getProductPriceCents(a) - getProductPriceCents(b));
        break;
      case "price_desc":
        list.sort((a, b) => getProductPriceCents(b) - getProductPriceCents(a));
        break;
      case "name_asc":
        list.sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es"));
        break;
      default:
        list.sort((a, b) => {
          const ar = Number(a.rank ?? 999);
          const br = Number(b.rank ?? 999);
          if (ar !== br) return ar - br;
          return getProductName(a).localeCompare(getProductName(b), "es");
        });
    }

    return list;
  }

  function updateStatusRow(count) {
    if (els.statusRow) {
      if (!activeCategory && !searchQuery) els.statusRow.textContent = "Selecciona una colección para ver productos.";
      else els.statusRow.textContent = `${count} productos disponibles`;
    }
    if (els.resultsCountLabel) els.resultsCountLabel.textContent = String(count);
    if (els.resultsMetaLabel) els.resultsMetaLabel.textContent = `${products.length} productos`;
    if (els.productCountLabel) els.productCountLabel.textContent = `${products.length}`;
  }

  function renderCategories() {
    if (!els.categoryGrid) return;

    const list = categories.length ? categories : buildSectionsFromProducts(products);
    categories = attachCounts(list, products);
    els.categoryGrid.innerHTML = "";

    const frag = document.createDocumentFragment();

    const all = document.createElement("button");
    all.type = "button";
    all.className = "catcard hover-fx" + (!activeCategory ? " active" : "");
    all.dataset.cat = "";
    all.innerHTML = `
      <div class="catcard__bg" aria-hidden="true"></div>
      <div class="catcard__inner">
        <img class="catcard__logo" src="${escapeHtml(ASSET_FALLBACK_IMAGE)}" alt="Todas las colecciones" loading="lazy" decoding="async">
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

    for (const cat of categories) {
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
  }

  function productCardHTML(p) {
    const sku = escapeHtml(getProductSku(p));
    const title = escapeHtml(getProductName(p));
    const desc = escapeHtml(getProductDescription(p) || "Mercancía oficial SCORE.");
    const price = money(getProductPriceCents(p));
    const stock = escapeHtml(getStockLabel(p));
    const imgs = getProductImages(p);
    const cover = imgs[0] || normalizeAssetPath(p.cover_image || p.coverImage || p.image || p.img || ASSET_FALLBACK_IMAGE);

    const track = imgs.length
      ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`).join("")
      : `<img src="${escapeHtml(cover)}" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`;

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
            <button type="button" class="btn btn--secondary btn--small" data-open-product="${sku}">Ver</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    if (!els.productGrid) return;
    const list = filteredList();
    els.productGrid.innerHTML = list.length
      ? list.map(productCardHTML).join("")
      : `<div class="panel" style="grid-column:1 / -1; text-align:center; padding:28px;"><h3 style="margin:0 0 8px">No encontramos productos</h3><p style="margin:0; color:var(--u-muted)">Prueba otro término o cambia de colección.</p></div>`;

    $$("[data-open-product]", els.productGrid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openProduct(btn.getAttribute("data-open-product"));
      });
    });
    updateStatusRow(list.length);
    maybeShowSwipeHint();
  }

  function updateResults() {
    const list = filteredList();
    updateStatusRow(list.length);
    renderProducts();
    maybeShowSwipeHint();

    const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
    if (els.activeFilterLabel) els.activeFilterLabel.textContent = activeCategory ? (cat?.name || activeCategory) : "Todos los productos";
    if (els.activeFilterRow) els.activeFilterRow.hidden = !activeCategory && !searchQuery;
    if (els.carouselTitle) els.carouselTitle.textContent = activeCategory ? (cat?.name || "Productos") : "Productos destacados";
    if (els.catalogCarouselSection) els.catalogCarouselSection.hidden = products.length === 0 && !searchQuery && !activeCategory;
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

  function renderCart() {
    if (!els.cartItems) return;
    if (!cart.length) {
      if (els.cartEmptyState) els.cartEmptyState.hidden = false;
      els.cartItems.innerHTML = "";
      updateTotals();
      return;
    }

    if (els.cartEmptyState) els.cartEmptyState.hidden = true;
    els.cartItems.innerHTML = cart
      .map((item, idx) => {
        const img = normalizeAssetPath(item.image || item.image_url || ASSET_FALLBACK_IMAGE);
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
    if (shipping.mode === "pickup") return 0;
    if (shipping.quote && Number.isFinite(Number(shipping.quote.amount_cents))) return Math.max(0, Number(shipping.quote.amount_cents));
    return 25000;
  }

  function getTotalAmount() {
    return Math.max(0, getSubtotalCents() - getDiscountCents() + getShippingCents());
  }

  function refreshTotals() {
    if (els.cartSubtotal) els.cartSubtotal.textContent = money(getSubtotalCents());
    if (els.cartShipping) els.cartShipping.textContent = shipping.mode === "pickup" ? "Gratis" : money(getShippingCents());
    if (els.cartDiscount) els.cartDiscount.textContent = `- ${money(getDiscountCents())}`;
    if (els.cartTotal) els.cartTotal.textContent = money(getTotalAmount());
    if (els.drawerSubtotal) els.drawerSubtotal.textContent = money(getSubtotalCents());
    if (els.drawerShipping) els.drawerShipping.textContent = shipping.mode === "pickup" ? "Gratis" : money(getShippingCents());
    if (els.drawerTotal) els.drawerTotal.textContent = money(getTotalAmount());
    if (els.cartCountBadge) els.cartCountBadge.textContent = String(cart.reduce((sum, item) => sum + clampInt(item.qty, 1, 99, 1), 0));
    updateCheckoutState();
  }

  function updateTotals() {
    refreshTotals();
  }

  function updateCheckoutState() {
    const disabled = cart.length === 0;
    if (els.cartCheckoutBtn) els.cartCheckoutBtn.disabled = disabled;
    if (els.checkoutSubmitBtn) els.checkoutSubmitBtn.disabled = disabled;
    if (els.checkoutQuoteShipBtn) els.checkoutQuoteShipBtn.disabled = disabled;
    if (els.checkoutApplyPromoBtn) els.checkoutApplyPromoBtn.disabled = !safeStr(els.checkoutPromo?.value || "").trim();
    if (els.pmAddBtn && currentProduct) {
      const stock = Number(currentProduct.stock);
      els.pmAddBtn.disabled = Number.isFinite(stock) && stock <= 0;
    }
  }

  function setToastState(message, kind = "info") {
    if (!message) return;
    if (els.promoBarText && kind === "error" && els.promoBar) {
      els.promoBarText.textContent = message;
      els.promoBar.hidden = false;
      return;
    }
    if (window.console) console.log(message);
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
      els.footerNote.textContent = safeStr(home.footer_note || "Pago cifrado vía Stripe. Aceptamos OXXO Pay. Logística inteligente internacional con Envía.com.");
    }

    if (siteSettings.hero_title && els.heroTitle) els.heroTitle.textContent = siteSettings.hero_title;
    if (siteSettings.copy?.hero_title && els.heroTitle) els.heroTitle.textContent = siteSettings.copy.hero_title;
    if (home.hero_text && els.heroText) els.heroText.textContent = home.hero_text;

    if (els.heroImage) {
      const heroSrc = normalizeAssetPath(siteSettings.hero_image || HERO_FALLBACK_IMAGE);
      els.heroImage.src = heroSrc;
      els.heroImage.onerror = () => {
        els.heroImage.onerror = null;
        els.heroImage.src = HERO_FALLBACK_IMAGE;
      };
    }

    if (siteSettings.promo_active && siteSettings.promo_text && els.promoBarText && !hiddenPromoSeen) {
      els.promoBar.hidden = false;
      els.promoBarText.textContent = siteSettings.promo_text;
    }

    const accent = siteSettings.theme?.accent || "#e10600";
    const accent2 = siteSettings.theme?.accent2 || "#111827";
    document.documentElement.style.setProperty("--site-accent", accent);
    document.documentElement.style.setProperty("--site-accent-dark", accent2);
  }

  function parseBody(body) {
    if (!body) return {};
    if (typeof body === "object" && !Buffer.isBuffer(body)) return body;
    if (typeof body === "string") return safeJsonParse(body, {});
    return {};
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
      .map((p) => `- ${getProductName(p)} | SKU:${getProductSku(p)} | ${money(getProductPriceCents(p))} | ${getStockLabel(p)}`)
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

  function normalizePromoRule(rule) {
    const type = safeStr(rule?.type || rule?.kind || "").trim();
    const value = safeNum(rule?.value || rule?.amount || rule?.percent || 0);
    return {
      code: safeStr(rule?.code || "").trim().toUpperCase(),
      type,
      value,
      description: safeStr(rule?.description || ""),
      active: safeBool(rule?.active ?? rule?.enabled, true),
      min_amount_mxn: safeNum(rule?.min_amount_mxn || rule?.min_amount || 0),
      expires_at: rule?.expires_at || null,
    };
  }

  function buildPromoLookup(rules) {
    return (Array.isArray(rules) ? rules : []).map(normalizePromoRule).filter((r) => {
      if (!r.code || !r.active) return false;
      if (!r.expires_at) return true;
      const t = new Date(r.expires_at).getTime();
      return Number.isFinite(t) ? t > Date.now() : true;
    });
  }

  async function loadPromos() {
    try {
      const data = await fetchJsonFirstOk(ROUTES.promos);
      const rules = Array.isArray(data?.rules) ? data.rules : Array.isArray(data?.promos) ? data.promos : [];
      promosData = { rules: buildPromoLookup(rules) };
    } catch {
      promosData = { rules: [] };
    }
  }

  async function loadSiteSettings() {
    try {
      const data = await fetchJsonFirstOk(ROUTES.siteSettings);
      siteSettings = {
        ...siteSettings,
        ...(data?.site_settings || data?.data || data || {}),
      };
      if (data?.org_id) siteSettings.org_id = data.org_id;
      syncSiteSettings();
    } catch {
      syncSiteSettings();
    }
  }

  async function loadCatalog() {
    if (loadingCatalog) return;
    loadingCatalog = true;
    try {
      const data = await fetchCatalogData();
      const rawProducts = Array.isArray(data?.products) ? data.products : Array.isArray(data?.items) ? data.items : [];
      const rawCategories = Array.isArray(data?.categories) ? data.categories : Array.isArray(data?.sections) ? data.sections : [];

      catalog = data || { categories: [], products: [] };
      products = rawProducts.map(normalizeProduct).filter(Boolean);

      if (rawCategories.length) {
        categories = attachCounts(rawCategories.map(normalizeCategory).filter(Boolean), products);
      } else {
        categories = buildSectionsFromProducts(products);
      }

      renderCategories();
      renderProducts();
      updateResults();

      if (els.statusRow) els.statusRow.hidden = false;
      if (els.catalogCarouselSection && products.length) els.catalogCarouselSection.hidden = false;
    } catch (err) {
      categories = [];
      products = [];
      renderCategories();
      renderProducts();
      updateResults();
      setToastState(safeStr(err?.message || "No fue posible cargar el catálogo."), "error");
    } finally {
      loadingCatalog = false;
    }
  }

  function buildCardFromProductModal(p) {
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
      const cover = imgs[0] || normalizeAssetPath(p.cover_image || p.coverImage || p.image || p.img || ASSET_FALLBACK_IMAGE);
      els.pmCarousel.innerHTML = imgs.length
        ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(getProductName(p))}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`).join("")
        : `<img src="${escapeHtml(cover)}" alt="${escapeHtml(getProductName(p))}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${ASSET_FALLBACK_IMAGE}'">`;
    }

    if (els.pmSizePills) {
      const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : [];
      els.pmSizePills.innerHTML = sizes.length
        ? sizes.map((size) => `<button type="button" class="size-pill${selectedSize === size ? " active" : ""}" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("")
        : `<span class="pill">Talla libre</span>`;
      $$("[data-size]", els.pmSizePills).forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedSize = btn.getAttribute("data-size") || "";
          buildCardFromProductModal(p);
        });
      });
    }
  }

  function openProduct(sku) {
    const p = products.find((x) => getProductSku(x) === safeStr(sku).trim());
    if (!p || !els.productModal) return;
    buildCardFromProductModal(p);
    currentProduct = p;
    els.productModal.hidden = false;
    els.productModal.classList.add("modal--open");
    document.documentElement.classList.add("no-scroll");
    setTimeout(() => els.pmAddBtn?.focus(), 50);
  }

  function closeProductModal() {
    if (!els.productModal) return;
    els.productModal.classList.remove("modal--open");
    setTimeout(() => {
      els.productModal.hidden = true;
      if (!anyLayerOpen()) document.documentElement.classList.remove("no-scroll");
    }, 350);
  }

  function openLayer(el) {
    if (!el) return;
    el.hidden = false;
    if (els.overlay) els.overlay.hidden = false;
    document.documentElement.classList.add("no-scroll");
    if (isModal(el)) requestAnimationFrame(() => el.classList.add("modal--open"));
  }

  function closeLayer(el) {
    if (!el) return;
    if (isModal(el)) {
      el.classList.remove("modal--open");
      setTimeout(() => {
        el.hidden = true;
        if (!anyLayerOpen()) {
          if (els.overlay) els.overlay.hidden = true;
          document.documentElement.classList.remove("no-scroll");
        }
      }, 350);
      return;
    }
    el.hidden = true;
    if (!anyLayerOpen()) {
      if (els.overlay) els.overlay.hidden = true;
      document.documentElement.classList.remove("no-scroll");
    }
  }

  function isModal(el) {
    if (!el) return false;
    return el === els.productModal || el === els.assistantDrawer || String(el.className || "").includes("modal");
  }

  function anyLayerOpen() {
    return Boolean(
      (els.cartDrawer && !els.cartDrawer.hidden) ||
      (els.assistantDrawer && !els.assistantDrawer.hidden) ||
      (els.productModal && !els.productModal.hidden) ||
      (els.sideMenu && !els.sideMenu.hidden)
    );
  }

  function openCart() {
    openLayer(els.cartDrawer);
    renderCart();
    refreshTotals();
  }

  function closeCart() {
    closeLayer(els.cartDrawer);
  }

  function openAssistant() {
    openLayer(els.assistantDrawer);
    if (els.assistantLog && els.assistantLog.childElementCount === 0) {
      appendAssistant("bot", "Hola. Soy el asistente de SCORE STORE. ¿Qué buscas hoy? (tallas, envíos, modelos, etc.)");
    }
    if (els.assistantInput) setTimeout(() => els.assistantInput.focus(), 70);
  }

  function closeAssistant() {
    closeLayer(els.assistantDrawer);
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

    if (!siteSettings.org_id && !catalog?.store?.org_id) {
      setToastState("El chat todavía no está disponible.", "error");
      assistantBusy = false;
      return;
    }

    if (els.assistantInput) els.assistantInput.value = "";
    appendAssistant("me", msg);

    const context = {
      currentProduct: currentProduct?.title || "",
      currentSku: currentProduct?.sku || "",
      cartItems: cart.map((item) => `${item.qty}x ${item.title}`).join(", "),
      cartTotal: money(getTotalAmount()),
      shipMode: shipping.mode,
      orderId: "",
      actionHint: "Respuesta pública para Score Store",
      category: activeCategory || "",
    };

    const payload = {
      mode: "assistant",
      org_id: siteSettings.org_id || catalog?.store?.org_id || "",
      message: msg,
      context,
    };

    try {
      let data = null;
      try {
        const res = await fetch(ROUTES.assistant[0], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo responder.");
      } catch {
        const res = await fetch(ROUTES.assistant[1], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, context }),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo responder.");
      }

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

  function applyPromoCode(code) {
    const next = safeStr(code || els.checkoutPromo?.value || "").trim().toUpperCase();
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

    if (!validateZip(postal, country)) {
      setToastState("Ingresa un código postal válido para cotizar.", "error");
      return null;
    }

    shippingQuoteLoading = true;
    try {
      const payload = { zip: postal, country, items_qty: itemsQty };
      let data = null;
      try {
        const res = await fetch(ROUTES.quoteShipping[0], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar envío.");
      } catch {
        const res = await fetch(ROUTES.quoteShipping[1], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar envío.");
      }

      shipping = { mode: "delivery", quote: data.quote || data };
      persistShip();
      renderCart();
      refreshTotals();
      setToastState("Envío cotizado con éxito.", "success");
      return shipping.quote;
    } catch (err) {
      shipping = { mode: "delivery", quote: getFallbackShipping(country, itemsQty) };
      persistShip();
      renderCart();
      refreshTotals();
      setToastState(safeStr(err?.message || "Se usó una cotización fallback."), "error");
      return shipping.quote;
    } finally {
      shippingQuoteLoading = false;
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

    if (shipping.mode === "delivery" && !validateZip(customer.postal, customer.country)) {
      setToastState("Código postal inválido para envío.", "error");
      els.checkoutPostal?.focus();
      return;
    }

    if (shippingQuoteLoading) {
      setToastState("Espera a que termine la cotización de envío.", "error");
      return;
    }

    saveCustomer();

    const btn = els.checkoutSubmitBtn || els.cartCheckoutBtn;
    if (btn) {
      btn.disabled = true;
      btn.dataset.loading = "1";
    }

    if (els.checkoutLoader) els.checkoutLoader.hidden = false;
    if (els.checkoutMsg) els.checkoutMsg.textContent = "Creando checkout…";

    try {
      const payload = {
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        shipping_country: customer.country,
        shipping_zip: customer.postal,
        shipping_mode: shipping.mode,
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

      let data = null;
      try {
        const res = await fetch(ROUTES.createCheckout[0], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo crear el checkout.");
      } catch {
        const res = await fetch(ROUTES.createCheckout[1], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo crear el checkout.");
      }

      if (data.checkout_url || data.url || data.session_url) {
        if (els.checkoutMsg) els.checkoutMsg.textContent = "Redirigiendo a Stripe...";
        window.location.href = data.checkout_url || data.url || data.session_url;
        return;
      }

      if (els.checkoutMsg) els.checkoutMsg.textContent = "Checkout creado.";
      setToastState("Checkout creado correctamente.", "success");
    } catch (err) {
      const msg = safeStr(err?.message || "No se pudo crear el checkout.");
      if (els.checkoutMsg) els.checkoutMsg.textContent = msg;
      setToastState(msg, "error");
    } finally {
      if (btn) {
        btn.disabled = cart.length === 0;
        delete btn.dataset.loading;
      }
      if (els.checkoutLoader) els.checkoutLoader.hidden = true;
      updateTotals();
    }
  }

  function setShipMode(mode) {
    shipping.mode = mode === "delivery" ? "delivery" : "pickup";
    persistShip();
    refreshTotals();
    if (els.shipModePickup) els.shipModePickup.checked = shipping.mode === "pickup";
    if (els.shipModeDelivery) els.shipModeDelivery.checked = shipping.mode === "delivery";
    if (els.shipModePickupWrap) els.shipModePickupWrap.classList.toggle("active", shipping.mode === "pickup");
    if (els.shipModeDeliveryWrap) els.shipModeDeliveryWrap.classList.toggle("active", shipping.mode === "delivery");
  }

  function syncShipFromStored() {
    const saved = readStorage(STORAGE_KEYS.ship, null);
    if (saved && typeof saved === "object") {
      shipping.mode = safeStr(saved.mode || shipping.mode).toLowerCase() === "delivery" ? "delivery" : "pickup";
      shipping.quote = saved.quote || null;
    }
    setShipMode(shipping.mode);
  }

  function syncCheckoutFields() {
    if (els.checkoutCountry && !els.checkoutCountry.value) els.checkoutCountry.value = "MX";
    if (els.checkoutEmail && !els.checkoutEmail.value && siteSettings.contact?.email) els.checkoutEmail.value = siteSettings.contact.email;
    if (els.checkoutPhone && !els.checkoutPhone.value && siteSettings.contact?.phone) els.checkoutPhone.value = siteSettings.contact.phone;
  }

  function updateFooterVersion() {
    if (els.appVersionLabel) els.appVersionLabel.textContent = APP_VERSION;
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

    els.mobileSearchBtn?.addEventListener("click", () => {
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = false;
      els.mobileSearchInput?.focus();
    });
    els.closeMobileSearchBtn?.addEventListener("click", () => {
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = true;
    });

    els.scrollToCategoriesBtn?.addEventListener("click", () => {
      els.categoryGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.promoBarClose?.addEventListener("click", () => {
      writeStorage(STORAGE_KEYS.hiddenPromo, "1");
      hiddenPromoSeen = true;
      refreshHeaderPromo();
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
      updateResults();
      renderCategories();
    });

    els.sortSelect?.addEventListener("change", (e) => {
      sortMode = safeStr(e.target.value || "featured");
      updateResults();
    });

    els.openMenuBtn?.addEventListener("click", () => openLayer(els.sideMenu));
    els.closeMenuBtn?.addEventListener("click", () => closeLayer(els.sideMenu));

    els.cartToggleBtn?.addEventListener("click", openCart);
    els.closeCartBtn?.addEventListener("click", closeCart);
    els.navOpenCart?.addEventListener("click", () => { closeLayer(els.sideMenu); openCart(); });
    els.openAssistantBtn?.addEventListener("click", openAssistant);
    els.floatingAssistantBtn?.addEventListener("click", openAssistant);
    els.navOpenAssistant?.addEventListener("click", () => { closeLayer(els.sideMenu); openAssistant(); });

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

    els.cartCheckoutBtn?.addEventListener("click", submitCheckout);
    els.checkoutSubmitBtn?.addEventListener("click", submitCheckout);
    els.checkoutApplyPromoBtn?.addEventListener("click", () => applyPromoCode(els.checkoutPromo?.value || ""));
    els.checkoutQuoteShipBtn?.addEventListener("click", () => quoteShipping());
    els.checkoutPostal?.addEventListener("change", async () => {
      if (shipping.mode === "delivery") await quoteShipping();
    });
    els.checkoutCountry?.addEventListener("change", async () => {
      if (shipping.mode === "delivery") await quoteShipping();
    });
    els.shipModePickup?.addEventListener("change", () => setShipMode("pickup"));
    els.shipModeDelivery?.addEventListener("change", () => setShipMode("delivery"));

    els.pmAddBtn?.addEventListener("click", () => {
      if (!currentProduct) return;
      addToCart(currentProduct, selectedQty, selectedSize);
      closeProductModal();
      openCart();
    });
    els.pmQtyMinus?.addEventListener("click", () => {
      selectedQty = Math.max(1, selectedQty - 1);
      if (currentProduct) buildCardFromProductModal(currentProduct);
    });
    els.pmQtyPlus?.addEventListener("click", () => {
      selectedQty = Math.min(99, selectedQty + 1);
      if (currentProduct) buildCardFromProductModal(currentProduct);
    });
    els.productModalCloseBtn?.addEventListener("click", closeProductModal);

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

  function mount() {
    updateFooterVersion();
    restoreCart();
    restoreCustomer();
    syncShipFromStored();
    syncCheckoutFields();
    refreshHeaderPromo();
    updateTotals();
    renderCart();
    renderCategories();
    renderProducts();
    updateResults();
    mountVisualPolish();
    bindEvents();
    initCookieBanner();
    initSalesNotification();
    updateBodyClasses();
    applyHashSku();
  }

  function updateBodyClasses() {
    const open = anyLayerOpen();
    document.documentElement.classList.toggle("no-scroll", open);
  }

  async function boot() {
    updateFooterVersion();
    restoreCart();
    restoreCustomer();
    syncShipFromStored();
    syncCheckoutFields();
    bindEvents();
    initCookieBanner();
    renderCart();
    updateTotals();
    const splashFailSafe = setTimeout(() => hideSplash(true), 4500);

    try {
      await Promise.allSettled([loadPromos(), loadSiteSettings(), loadCatalog()]);
    } finally {
      clearTimeout(splashFailSafe);
    }

    refreshHeaderPromo();
    normalizeSectionsMaybe();
    renderCategories();
    renderProducts();
    updateResults();
    applyHashSku();
    hideSplash();
    initSalesNotification();
    updateBodyClasses();

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

  function normalizeSectionsMaybe() {
    if (!categories.length && products.length) categories = buildSectionsFromProducts(products);
    else if (categories.length) categories = attachCounts(categories, products);
  }

  function openProductBySkuFromHash() {
    applyHashSku();
  }

  function hideOverlayIfIdle() {
    if (!anyLayerOpen()) {
      if (els.overlay) els.overlay.hidden = true;
      document.documentElement.classList.remove("no-scroll");
    }
  }

  function updateFooterLinks() {
    // no-op: syncSiteSettings already handles this
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  function setHeroFromSettings() {
    if (siteSettings.copy?.hero_title && els.heroTitle) els.heroTitle.textContent = siteSettings.copy.hero_title;
    else if (siteSettings.hero_title && els.heroTitle) els.heroTitle.textContent = siteSettings.hero_title;
    if (siteSettings.copy?.hero_subtitle && els.heroText) els.heroText.textContent = siteSettings.copy.hero_subtitle;
    if (siteSettings.hero_image && els.heroImage) {
      els.heroImage.src = normalizeAssetPath(siteSettings.hero_image);
      els.heroImage.onerror = () => {
        els.heroImage.onerror = null;
        els.heroImage.src = HERO_FALLBACK_IMAGE;
      };
    }
  }

  window.SCORESTORE = {
    version: APP_VERSION,
    openProduct,
    openCart,
    openAssistant,
    addToCart,
    quoteShipping,
    applyPromoCode,
    refreshTotals,
    renderCategories,
    renderProducts,
    updateResults,
  };

  document.addEventListener("DOMContentLoaded", async () => {
    await boot();
    setHeroFromSettings();
    registerServiceWorker();
  });
})();