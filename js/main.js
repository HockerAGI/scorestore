(() => {
  "use strict";

  const APP_VERSION = "2026.04.10-intro-fix";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    splash: $("#splash"),
    heroTitle: $("#heroTitle"),
    heroText: $("#heroText"),
    heroTagline: $("#heroTagline"),
    heroImage: $("#heroImage"),
    promoBar: $("#promoBar"),
    promoBarText: $("#promoBarText"),
    promoBarClose: $("#promoBarClose"),
    categoryGrid: $("#categoryGrid"),
    categoryHint: $("#categoryHint"),
    activeFilterRow: $("#activeFilterRow"),
    activeFilterLabel: $("#activeFilterLabel"),
    carouselTitle: $("#carouselTitle"),
    catalogCarouselSection: $("#catalogCarouselSection"),
    productGrid: $("#productGrid"),
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
    cartCheckoutBtn: $("#cartCheckoutBtn"),
    cartClearBtn: $("#cartClearBtn"),
    checkoutName: $("#checkoutName"),
    checkoutEmail: $("#checkoutEmail"),
    checkoutPhone: $("#checkoutPhone"),
    checkoutAddress: $("#checkoutAddress"),
    checkoutPostal: $("#checkoutPostal"),
    checkoutNotes: $("#checkoutNotes"),
    checkoutCountry: $("#checkoutCountry"),
    checkoutQuoteShipBtn: $("#checkoutQuoteShipBtn"),
    checkoutApplyPromoBtn: $("#checkoutApplyPromoBtn"),
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
    footerNote: $("#footerNote"),
    appVersionLabel: $("#appVersionLabel"),
    cookieBanner: $("#cookieBanner"),
    cookieAccept: $("#cookieAccept"),
    cookieReject: $("#cookieReject"),
    salesNotification: $("#salesNotification"),
    salesName: $("#salesName"),
    salesAction: $("#salesAction"),
    scrollLeftBtn: $("#scrollLeftBtn"),
    scrollRightBtn: $("#scrollRightBtn"),
    clearFilterBtn: $("#clearFilterBtn"),
    scrollToCategoriesBtn: $("#scrollToCategoriesBtn"),
    searchInput: $("#searchInput"),
    mobileSearchInput: $("#mobileSearchInput"),
    menuSearchInput: $("#menuSearchInput"),
    shipModePickup: $("#shipModePickup"),
    shipModeDelivery: $("#shipModeDelivery"),
    shipModePickupWrap: $("#shipModePickupWrap"),
    shipModeDeliveryWrap: $("#shipModeDeliveryWrap"),
    topbar: $(".topbar"),
    body: document.body,
  };

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
      logo: "/assets/baja400/camiseta-cafe- oscuro-baja400.webp",
      cover_image: "/assets/baja400/camiseta-cafe- oscuro-baja400.webp",
      aliases: ["BAJA400", "BAJA_400"],
    },
    {
      uiId: "SF250",
      name: "SAN FELIPE 250",
      logo: "/assets/sf250/camiseta-negra-sinmangas-sf250.webp",
      cover_image: "/assets/sf250/camiseta-negra-sinmangas-sf250.webp",
      aliases: ["SF250", "SF_250"],
    },
  ];

  let siteSettings = {
    hero_title: "SCORE STORE",
    hero_image: HERO_FALLBACK_IMAGE,
    promo_active: false,
    promo_text: "",
    contact: {
      email: "ventas.unicotextil@gmail.com",
      phone: "6642368701",
      whatsapp_e164: "5216642368701",
      whatsapp_display: "664 236 8701",
    },
    home: {
      support_hours: "",
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
  let filteredProducts = [];
  let cart = [];
  let activeCategory = "";
  let searchQuery = "";
  let shipping = { mode: "pickup", quote: null };
  let shippingQuoteLoading = false;
  let activePromo = null;
  let selectedQty = 1;
  let selectedSize = "";
  let currentProduct = null;
  let assistantBusy = false;
  let salesTimer = null;
  let loadingCatalog = false;

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

  function normalizeAssetPath(input) {
    let s = String(input ?? "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    s = s.replaceAll("\\", "/").replace(/^\.\//, "");
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
    s = s.replaceAll("/assets/OTRAS_EDICIONES".toLowerCase(), "/assets/otras_ediciones/");
    return s.startsWith("/") ? s : `/${s.replace(/^\/+/, "")}`;
  }

  const money = (cents) => {
    const n = Number(cents);
    const v = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v / 100);
  };

  function getCategoryConfig(uiId) {
    const id = safeStr(uiId).trim().toUpperCase();
    return CATEGORY_CONFIG.find((c) => c.uiId === id || c.aliases.includes(id)) || null;
  }

  function getCategoryName(uiId) {
    return getCategoryConfig(uiId)?.name || safeStr(uiId).trim() || "Colección";
  }

  function getCategoryLogo(uiId) {
    const cfg = getCategoryConfig(uiId);
    return normalizeAssetPath(cfg?.cover_image || cfg?.logo || ASSET_FALLBACK_IMAGE);
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
      },
    };
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

  async function fetchJsonFirstOk(urls, options = {}) {
    const list = Array.isArray(urls) ? urls : [urls];
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
  }

  function getBaseUrl() {
    const { protocol, host } = window.location;
    return `${protocol}//${host}`;
  }

  function setBodyNoScroll(locked) {
    document.body.classList.toggle("no-scroll", !!locked);
    document.documentElement.classList.toggle("no-scroll", !!locked);
  }

  function updateFooterVersion() {
    if (els.appVersionLabel) els.appVersionLabel.textContent = APP_VERSION;
  }

  function syncSiteSettings() {
    const contact = siteSettings.contact || {};
    const home = siteSettings.home || {};
    const socials = siteSettings.socials || {};

    const email = safeStr(contact.email || "ventas.unicotextil@gmail.com").trim();
    const waE164 = safeStr(contact.whatsapp_e164 || "5216642368701").trim();
    const waDisplay = safeStr(contact.whatsapp_display || "664 236 8701").trim();

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

    if (siteSettings.promo_active && siteSettings.promo_text && els.promoBarText && !readStorage(STORAGE_KEYS.hiddenPromo, "0")) {
      els.promoBar.hidden = false;
      els.promoBarText.textContent = siteSettings.promo_text;
    }

    const accent = siteSettings.theme?.accent || "#e10600";
    const accent2 = siteSettings.theme?.accent2 || "#111827";
    document.documentElement.style.setProperty("--site-accent", accent);
    document.documentElement.style.setProperty("--site-accent-dark", accent2);

    if (socials.facebook && $("#footerFacebookLink")) $("#footerFacebookLink").setAttribute("href", socials.facebook);
    if (socials.instagram && $("#footerInstagramLink")) $("#footerInstagramLink").setAttribute("href", socials.instagram);
    if (socials.youtube && $("#footerYoutubeLink")) $("#footerYoutubeLink").setAttribute("href", socials.youtube);
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

  function normalizeSectionsFromProducts() {
    if (!categories.length && products.length) categories = buildSectionsFromProducts(products);
    else if (categories.length) categories = attachCounts(categories, products);
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

  function persistCart() {
    writeStorage(STORAGE_KEYS.cart, cart);
  }

  function persistShip() {
    writeStorage(STORAGE_KEYS.ship, shipping);
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

  function syncShipFromStored() {
    const saved = readStorage(STORAGE_KEYS.ship, null);
    if (saved && typeof saved === "object") {
      shipping.mode = safeStr(saved.mode || shipping.mode).toLowerCase() === "delivery" ? "delivery" : "pickup";
      shipping.quote = saved.quote || null;
    }
    setShipMode(shipping.mode);
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

  function syncCheckoutFields() {
    if (els.checkoutCountry && !els.checkoutCountry.value) els.checkoutCountry.value = "MX";
    if (els.checkoutEmail && !els.checkoutEmail.value && siteSettings.contact?.email) els.checkoutEmail.value = siteSettings.contact.email;
    if (els.checkoutPhone && !els.checkoutPhone.value && siteSettings.contact?.phone) els.checkoutPhone.value = siteSettings.contact.phone;
  }

  function updateStatusRow(count) {
    if (els.statusRow) {
      if (!activeCategory && !searchQuery) els.statusRow.textContent = "Selecciona una colección para ver productos.";
      else els.statusRow.textContent = `${count} productos disponibles`;
    }
    if (els.activeFilterLabel) els.activeFilterLabel.textContent = activeCategory ? (CATEGORY_CONFIG.find((c) => c.uiId === activeCategory)?.name || activeCategory) : "Todos los productos";
    if (els.activeFilterRow) els.activeFilterRow.hidden = !activeCategory && !searchQuery;
    if (els.resultsCountLabel) els.resultsCountLabel.textContent = String(count);
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

    list.sort((a, b) => {
      const ar = Number(a.rank ?? 999);
      const br = Number(b.rank ?? 999);
      if (ar !== br) return ar - br;
      return getProductName(a).localeCompare(getProductName(b), "es");
    });

    return list;
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
      : `<div class="panel" style="grid-column:1 / -1; text-align:center; padding:28px;"><h3 style="margin:0 0 8px">No encontramos productos</h3><p style="margin:0; color:var(--u-text-soft)">Prueba otro término o cambia de colección.</p></div>`;

    $$("[data-open-product]", els.productGrid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openProduct(btn.getAttribute("data-open-product"));
      });
    });
    animateCards(".product-card");
    bindCardHover();
    updateStatusRow(list.length);
    maybeShowSwipeHint();
  }

  function updateResults() {
    const list = filteredList();
    updateStatusRow(list.length);
    renderProducts();
    maybeShowSwipeHint();

    const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
    if (els.carouselTitle) els.carouselTitle.textContent = activeCategory ? (cat?.name || "Productos") : "Productos destacados";
    if (els.catalogCarouselSection) els.catalogCarouselSection.hidden = products.length === 0 && !searchQuery && !activeCategory;
    if (els.resultsCountLabel) els.resultsCountLabel.textContent = `${list.length}`;
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
      image: getProductImages(product)[0] || normalizeAssetPath(product?.cover_image || product?.image || product?.img || ASSET_FALLBACK_IMAGE),
      sectionId: getProductSectionUi(product),
    };
  }

  function persistShip() {
    writeStorage(STORAGE_KEYS.ship, { mode: shipping.mode, quote: shipping.quote || null });
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
    cart[index].qty = clampInt(qty, 1, 99, 1);
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
    if (shipping.mode === "pickup") return 0;
    if (shipping.quote && Number.isFinite(Number(shipping.quote.amount_cents))) return Math.max(0, Number(shipping.quote.amount_cents));
    return 25000;
  }

  function getTotalAmount() {
    return Math.max(0, getSubtotalCents() - getDiscountCents() + getShippingCents());
  }

  function updateCheckoutState() {
    const disabled = cart.length === 0;
    if (els.cartCheckoutBtn) els.cartCheckoutBtn.disabled = disabled;
    if (els.checkoutQuoteShipBtn) els.checkoutQuoteShipBtn.disabled = disabled;
    if (els.checkoutApplyPromoBtn) els.checkoutApplyPromoBtn.disabled = !safeStr($("#checkoutPromo")?.value || "").trim();
    if (els.pmAddBtn && currentProduct) {
      const stock = Number(currentProduct.stock);
      els.pmAddBtn.disabled = Number.isFinite(stock) && stock <= 0;
    }
  }

  function refreshTotals() {
    if (els.cartSubtotal) els.cartSubtotal.textContent = money(getSubtotalCents());
    if (els.cartShipping) els.cartShipping.textContent = shipping.mode === "pickup" ? "Gratis" : money(getShippingCents());
    if (els.cartDiscount) els.cartDiscount.textContent = `- ${money(getDiscountCents())}`;
    if (els.cartTotal) els.cartTotal.textContent = money(getTotalAmount());
    if (els.cartCountBadge) els.cartCountBadge.textContent = String(cart.reduce((sum, item) => sum + clampInt(item.qty, 1, 99, 1), 0));
    updateCheckoutState();
  }

  function updateTotals() {
    refreshTotals();
  }

  function renderCart() {
    if (!els.cartItems) return;
    if (!cart.length) {
      if (els.cartEmptyState) els.cartEmptyState.hidden = false;
      els.cartItems.innerHTML = "";
      refreshTotals();
      return;
    }

    if (els.cartEmptyState) els.cartEmptyState.hidden = true;

    els.cartItems.innerHTML = cart
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
    setTimeout(() => els.pmAddBtn?.focus(), 50);
  }

  function closeProductModal() {
    if (!els.productModal) return;
    els.productModal.classList.remove("modal--open");
    setTimeout(() => {
      els.productModal.hidden = true;
      if (!isAnyLayerOpen()) setBodyNoScroll(false);
    }, 350);
  }

  function openCart() {
    if (!els.cartDrawer) return;
    els.cartDrawer.hidden = false;
    els.cartDrawer.setAttribute("aria-hidden", "false");
    setBodyNoScroll(true);
  }

  function closeCart() {
    if (!els.cartDrawer) return;
    els.cartDrawer.hidden = true;
    els.cartDrawer.setAttribute("aria-hidden", "true");
    if (!isAnyLayerOpen()) setBodyNoScroll(false);
  }

  function openAssistant() {
    if (!els.assistantDrawer) return;
    els.assistantDrawer.hidden = false;
    els.assistantDrawer.setAttribute("aria-hidden", "false");
    setBodyNoScroll(true);
    if (els.assistantInput) setTimeout(() => els.assistantInput.focus(), 80);
    if (els.assistantLog && els.assistantLog.childElementCount === 0) {
      appendAssistant("bot", "Hola. Soy el asistente de SCORE STORE. ¿Qué buscas hoy?");
    }
  }

  function closeAssistant() {
    if (!els.assistantDrawer) return;
    els.assistantDrawer.hidden = true;
    els.assistantDrawer.setAttribute("aria-hidden", "true");
    if (!isAnyLayerOpen()) setBodyNoScroll(false);
  }

  function isAnyLayerOpen() {
    return Boolean(
      (els.cartDrawer && !els.cartDrawer.hidden) ||
      (els.assistantDrawer && !els.assistantDrawer.hidden) ||
      (els.productModal && !els.productModal.hidden)
    );
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
      shipMode: shipping.mode,
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

  function buildPublicPrompt({ store, stats, products, categories, context }) {
    const contact = store?.contact || {};
    const home = store?.home || {};
    const socials = store?.socials || {};
    const publicEmail = safeStr(contact.email || "ventas.unicotextil@gmail.com");
    const publicPhone = safeStr(contact.phone || "6642368701");
    const publicWhatsApp = safeStr(contact.whatsapp_display || "664 236 8701");
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

  async function loadSiteSettings() {
    try {
      const data = await fetchJsonFirstOk(["/api/site_settings", "/.netlify/functions/site_settings"]);
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

  async function loadPromos() {
    try {
      const data = await fetchJsonFirstOk(["/api/promos", "/.netlify/functions/promos", "/data/promos.json"]);
      const rules = Array.isArray(data?.rules) ? data.rules : Array.isArray(data?.promos) ? data.promos : [];
      const active = rules.find((r) => safeStr(r?.code || "").trim() && (r?.active !== false && r?.enabled !== false));
      activePromo = active || null;
      if (data?.store?.promo_active !== undefined) siteSettings.promo_active = !!data.store.promo_active;
      if (data?.store?.promo_text !== undefined) siteSettings.promo_text = safeStr(data.store.promo_text || "");
      refreshHeaderPromo();
    } catch {}
  }

  async function loadCatalog() {
    if (loadingCatalog) return;
    loadingCatalog = true;
    try {
      let data = null;
      try {
        data = await fetchJsonFirstOk(["/api/catalog", "/.netlify/functions/catalog"]);
      } catch {
        data = await fetchJsonMaybe("/data/catalog.json");
      }

      const rawProducts = Array.isArray(data?.products) ? data.products : Array.isArray(data?.items) ? data.items : [];
      const rawCategories = Array.isArray(data?.categories)
        ? data.categories
        : Array.isArray(data?.sections)
          ? data.sections
          : [];

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

      if (els.catalogCarouselSection && products.length) els.catalogCarouselSection.hidden = false;
      if (els.categoryHint) els.categoryHint.hidden = false;
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
    updateStatusBar();
    maybeShowSwipeHint();
  }

  function setToastState(message, kind = "info") {
    if (!message) return;
    if (kind === "error" && els.promoBar && els.promoBarText) {
      els.promoBar.hidden = false;
      els.promoBarText.textContent = message;
      return;
    }
    console.log(message);
  }

  function updateFooterLinks() {
    // syncSiteSettings already handles the links
  }

  function syncShipUI() {
    const isDelivery = shipping.mode === "delivery";
    if (els.shipModePickup) els.shipModePickup.checked = !isDelivery;
    if (els.shipModeDelivery) els.shipModeDelivery.checked = isDelivery;
    if (els.shipModePickupWrap) els.shipModePickupWrap.classList.toggle("active", !isDelivery);
    if (els.shipModeDeliveryWrap) els.shipModeDeliveryWrap.classList.toggle("active", isDelivery);
    persistShip();
    refreshTotals();
  }

  function hideSplash(force = false) {
    if (!els.splash) return;

    if (force) {
      els.splash.hidden = true;
      setBodyNoScroll(false);
      return;
    }

    els.splash.classList.add("fade-out");
    setTimeout(() => {
      if (els.splash) els.splash.hidden = true;
      setBodyNoScroll(false);
    }, 800);
  }

  function maybeShowIntro() {
    setBodyNoScroll(true);
    const safety = setTimeout(() => hideSplash(true), 9000);
    return safety;
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

    els.checkoutQuoteShipBtn?.addEventListener("click", async () => {
      await quoteShipping();
    });

    els.checkoutApplyPromoBtn?.addEventListener("click", () => {
      applyPromoCode(els.checkoutPromo?.value || "");
    });

    els.shipModePickup?.addEventListener("change", () => setShipMode("pickup"));
    els.shipModeDelivery?.addEventListener("change", () => setShipMode("delivery"));

    els.checkoutPostal?.addEventListener("change", async () => {
      if (shipping.mode === "delivery") await quoteShipping();
    });

    els.checkoutCountry?.addEventListener("change", async () => {
      if (shipping.mode === "delivery") await quoteShipping();
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

    shippingQuoteLoading = true;
    try {
      const res = await fetch("/api/quote_shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: postal, country, items_qty: itemsQty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar envío.");
      shipping = { mode: "delivery", quote: data.quote || data };
      persistShip();
      renderCart();
      refreshTotals();
      setToastState("Envío cotizado con éxito.", "success");
      return shipping.quote;
    } catch (err) {
      shipping = {
        mode: "delivery",
        quote: { ok: true, provider: "fallback", label: "Envío Estándar", amount_cents: 25000, amount_mxn: 250 },
      };
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

    if (shipping.mode === "delivery" && !customer.postal) {
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
        shipping_mode: shipping.mode,
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

  async function loadStatus() {
    // Intentionally left blank for index home
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

  function applyHashSku() {
    const hash = String(location.hash || "");
    const m = hash.match(/sku=([^&]+)/i) || hash.match(/^#([a-z0-9\-_]+)$/i);
    if (!m) return;
    const sku = decodeURIComponent(m[1] || "").trim();
    if (!sku) return;
    setTimeout(() => openProduct(sku), 250);
  }

  function openProductByHash() {
    applyHashSku();
  }

  function mountVisualPolish() {
    if (els.productGrid) els.productGrid.classList.add("carousel-track");
    if (els.categoryGrid) els.categoryGrid.classList.add("category-grid");
    if (els.topbar) els.topbar.classList.add("glass-header");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  function hideSplash(force = false) {
    if (!els.splash) return;
    if (force) {
      els.splash.hidden = true;
      setBodyNoScroll(false);
      return;
    }
    els.splash.classList.add("fade-out");
    setTimeout(() => {
      if (els.splash) els.splash.hidden = true;
      setBodyNoScroll(false);
    }, 800);
  }

  function boot() {
    updateFooterVersion();
    restoreCart();
    restoreCustomer();
    syncShipFromStored();
    syncCheckoutFields();

    bindEvents();
    initCookieBanner();
    renderCart();
    updateTotals();

    const splashSafety = maybeShowIntro();

    Promise.allSettled([loadPromos(), loadSiteSettings(), loadCatalog()])
      .then(() => {
        normalizeSectionsFromProducts();
        renderCategories();
        renderProducts();
        updateResults();
        openProductByHash();
        initSalesNotification();
        refreshHeaderPromo();
        mountVisualPolish();
      })
      .catch((err) => console.error("[boot]", err))
      .finally(() => {
        clearTimeout(splashSafety);
        setTimeout(() => hideSplash(false), 2200);
      });

    setBodyNoScroll(true);
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

  document.addEventListener("DOMContentLoaded", boot);

  window.addEventListener("beforeunload", () => {
    saveCustomer();
    persistShip();
    persistCart();
  });
})();