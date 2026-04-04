/* =========================================================
   SCORE STORE — main.js (final consolidated)
   - Visual polish + robust product/cart/chat UX
   - Compatible with both the simplified HTML and the
     richer hooks already visible in the TXT
   - Does not alter payment/security backend flow
========================================================= */
(() => {
  "use strict";

  const APP_VERSION = "2026.04.04.SCORESTORE";
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
  };

  const CATEGORY_CONFIG = [
    { uiId: "BAJA1000", name: "BAJA 1000", logo: "/assets/logo-baja1000.webp", aliases: ["BAJA1000", "BAJA_1000", "EDICION_2025", "EDICION_2026"] },
    { uiId: "BAJA500", name: "BAJA 500", logo: "/assets/logo-baja500.webp", aliases: ["BAJA500", "BAJA_500"] },
    { uiId: "BAJA400", name: "BAJA 400", logo: "/assets/logo-baja400.webp", aliases: ["BAJA400", "BAJA_400"] },
    { uiId: "SF250", name: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp", aliases: ["SF250", "SF_250"] },
  ];

  const DEFAULTS = {
    currency: "MXN",
    email: "ventas.unicotextil@gmail.com",
    phone: "6642368701",
    whatsappE164: "5216642368701",
    whatsappDisplay: "664 236 8701",
    supportHours: "Horario por confirmar en configuración del sitio.",
    promoBar: "",
  };

  const els = {
    splash: $("#splash"),
    topbar: $(".topbar"),
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

    sideMenu: $("#sideMenu"),
    closeMenuBtn: $("#closeMenuBtn"),
    navOpenCart: $("#navOpenCart"),
    navOpenAssistant: $("#navOpenAssistant"),

    overlay: $("#overlay"),

    cartDrawer: $("#cartDrawer"),
    closeCartBtn: $("#closeCartBtn"),
    cartToggleBtn: $("#cartToggleBtn"),
    cartCountBadge: $("#cartCountBadge"),
    cartItems: $("#cartItems"),
    cartSubtotal: $("#cartSubtotal"),
    cartTotal: $("#cartTotal"),
    drawerSubtotal: $("#drawerSubtotal") || $("#cartSubtotal"),
    drawerShipping: $("#drawerShipping") || $("#shippingNote"),
    drawerTotal: $("#drawerTotal") || $("#cartTotal"),

    checkoutForm: $("#checkoutForm"),
    checkoutName: $("#checkoutName") || $("#customerName"),
    checkoutEmail: $("#checkoutEmail") || $("#customerEmail"),
    checkoutPhone: $("#checkoutPhone") || $("#customerPhone"),
    checkoutAddress: $("#checkoutAddress") || $("#shippingAddress"),
    checkoutPostal: $("#checkoutPostal") || $("#shipPostal") || $("#shipZip"),
    checkoutNotes: $("#checkoutNotes") || $("#orderNotes"),
    checkoutPaySelect: $("#checkoutPaySelect"),
    checkoutMsg: $("#checkoutMsg") || $("#checkoutStatus"),
    checkoutLoader: $("#checkoutLoader"),
    checkoutSubmitBtn: $("#checkoutSubmitBtn") || $("#checkoutBtn"),
    continueShoppingBtn: $("#continueShoppingBtn"),

    shipModePickup: $("#shipModePickup"),
    shipModeDelivery: $("#shipModeDelivery"),
    shipPostal: $("#shipPostal") || $("#shipZip"),
    shipQuoteBtn: $("#shipQuoteBtn") || $("#quoteShipBtn"),
    shipQuoteStatus: $("#shipQuoteStatus") || $("#shipQuoteResult"),
    shipQuoteEl: $("#shipQuoteEl"),

    productModal: $("#productModal"),
    pmBackBtn: $("#pmBackBtn"),
    pmClose: $("#pmClose"),
    pmCarousel: $("#pmCarousel"),
    pmTitle: $("#pmTitle"),
    pmChips: $("#pmChips"),
    pmPrice: $("#pmPrice"),
    pmDesc: $("#pmDesc"),
    pmStockBadge: $("#pmStockBadge"),
    openSizeGuideBtn: $("#openSizeGuideBtn"),
    pmSizePills: $("#pmSizePills"),
    pmQtyDec: $("#pmQtyDec"),
    pmQtyInc: $("#pmQtyInc"),
    pmQtyDisplay: $("#pmQtyDisplay"),
    pmShareBtn: $("#pmShareBtn"),
    pmAdd: $("#pmAdd"),

    sizeGuideModal: $("#sizeGuideModal"),
    closeSizeGuideBtn: $("#closeSizeGuideBtn"),
    understandSizeBtn: $("#understandSizeBtn"),

    assistantModal: $("#assistantModal"),
    assistantCloseBtn: $("#assistantCloseBtn"),
    assistantToggleBtn: $("#assistantToggleBtn") || $("#navOpenAssistant"),
    assistantInput: $("#assistantInput"),
    assistantSendBtn: $("#assistantSendBtn"),

    cookieBanner: $("#cookieBanner"),
    cookieAccept: $("#cookieAccept"),
    cookieReject: $("#cookieReject"),

    scrollTopBtn: $("#scrollTopBtn"),
    toast: $("#toast"),
    appVersionLabel: $("#appVersionLabel"),

    salesNotification: $("#salesNotification"),
    salesName: $("#salesName"),
    salesAction: $("#salesAction"),

    footerNote: $("#footerNote"),
    footerEmailLink: $("#footerEmailLink"),
    footerEmailText: $("#footerEmailText"),
    footerWhatsappLink: $("#footerWhatsappLink"),
    footerWhatsappText: $("#footerWhatsappText"),
    footerFacebookLink: $("#footerFacebookLink"),
    footerInstagramLink: $("#footerInstagramLink"),
    footerYoutubeLink: $("#footerYoutubeLink"),

    heroTitle: $("#heroTitle"),
    heroText: $("#heroText"),
    heroImage: $("#heroImage"),
  };

  let catalog = { categories: [], products: [] };
  let categories = [];
  let products = [];
  let filteredProducts = [];

  let activeCategory = null;
  let searchQuery = "";
  let cart = [];
  let shipMode = "pickup";
  let shippingQuoted = 0;
  let shippingMeta = null;
  let activePromo = null;
  let promosData = { rules: [] };
  let siteSettings = {
    hero_title: null,
    hero_image: null,
    promo_active: false,
    promo_text: "",
    pixel_id: "",
    maintenance_mode: false,
    season_key: "default",
    theme: { accent: "#e10600", accent2: "#111111", particles: true },
    home: { footer_note: "", shipping_note: "", returns_note: "", support_hours: "" },
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
  let loadingCheckout = false;
  let toastTimer = null;
  let salesTimer = null;

  /* =========================
     HELPERS
  ========================= */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const money = (cents) => {
    const n = Number(cents);
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: DEFAULTS.currency,
      maximumFractionDigits: 2,
    }).format(value / 100);
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

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

  const safeJsonParse = (raw, fallback = null) => {
    try {
      if (!raw) return fallback;
      return JSON.parse(raw);
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

  const setToastState = (message, kind = "info") => {
    if (!els.toast) return;
    els.toast.textContent = message || "";
    els.toast.dataset.kind = kind;
    els.toast.hidden = !message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast?.classList.remove("is-visible");
      if (els.toast) els.toast.hidden = true;
    }, 3600);
  };

  const normalizeAssetPath = (input) => {
    let s = String(input ?? "").trim();
    if (!s) return "";
    if (/^(https?:|data:|blob:)/i.test(s)) return s;
    s = s.replaceAll("\\", "/");
    s = s.replaceAll("/assets/BAJA_1000/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/BAJA1000/", "/assets/edicion_2025/");
    s = s.replaceAll("/assets/BAJA_500/", "/assets/baja500/");
    s = s.replaceAll("/assets/BAJA500/", "/assets/baja500/");
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

  const getProductSku = (p) => safeStr(p?.sku || p?.id || p?.slug || p?.title || p?.name || "").trim();
  const getProductName = (p) => safeStr(p?.name || p?.title || "Producto SCORE").trim();
  const getProductDescription = (p) => safeStr(p?.description || "").trim();
  const getProductPriceCents = (p) => {
    if (Number.isFinite(Number(p?.price_cents))) return Math.max(0, Math.round(Number(p.price_cents)));
    if (Number.isFinite(Number(p?.price_mxn))) return Math.max(0, Math.round(Number(p.price_mxn) * 100));
    if (Number.isFinite(Number(p?.base_mxn))) return Math.max(0, Math.round(Number(p.base_mxn) * 100));
    return 0;
  };

  const getProductImages = (p) => {
    const raw = Array.isArray(p?.images)
      ? p.images
      : typeof p?.images === "string"
        ? safeJsonParse(p.images, [])
        : [];
    const list = [];
    if (p?.image_url || p?.img || p?.image) list.push(p.image_url || p.img || p.image);
    for (const img of raw) list.push(img);
    return [...new Set(list.map(normalizeAssetPath).filter(Boolean))];
  };

  const getProductSectionUi = (p) => {
    const raw = safeStr(p?.uiSection || p?.sectionId || p?.section_id || p?.category || p?.collection || p?.sub_section || "").trim().toUpperCase();
    if (!raw) return "";
    if (raw.includes("1000")) return "BAJA1000";
    if (raw.includes("500")) return "BAJA500";
    if (raw.includes("400")) return "BAJA400";
    if (raw.includes("250") || raw.includes("SF")) return "SF250";
    return raw.replace(/[^A-Z0-9]/g, "");
  };

  const getCategoryName = (uiId) => {
    const cfg = CATEGORY_CONFIG.find((c) => c.uiId === uiId || c.aliases.includes(uiId));
    return cfg?.name || uiId || "Colección";
  };

  const getCategoryLogo = (uiId) => {
    const cfg = CATEGORY_CONFIG.find((c) => c.uiId === uiId || c.aliases.includes(uiId));
    return normalizeAssetPath(cfg?.logo || "/assets/logo-score.webp");
  };

  const getStockLabel = (p) => {
    const stock = safeNum(p?.stock, null);
    if (!Number.isFinite(stock)) return "";
    if (stock <= 0) return "Sin stock por ahora";
    if (stock <= 3) return "Últimas piezas";
    return "Disponible";
  };

  const getPromoCode = () => {
    const v = safeStr($("#promoCodeInput")?.value || "").trim();
    return v.toUpperCase().replace(/\s+/g, "");
  };

  const getCartSubtotal = () => cart.reduce((sum, item) => sum + safeNum(item.price_cents, 0) * safeNum(item.qty, 0), 0);

  const getDiscountAmount = () => {
    if (!activePromo) return 0;
    const subtotal = getCartSubtotal();
    const type = safeStr(activePromo.type || activePromo.kind || "").toLowerCase();
    const value = safeNum(activePromo.value ?? 0, 0);

    if (type === "free_shipping") return 0;
    if (type === "percent" || type === "percentage" || type === "percent_off") {
      const rate = value > 1 ? value / 100 : value;
      return Math.max(0, Math.min(subtotal, Math.round(subtotal * rate)));
    }
    if (type === "fixed" || type === "fixed_mxn" || type === "amount") {
      return Math.max(0, Math.min(subtotal, Math.round(value * 100)));
    }
    return 0;
  };

  const getTotalAmount = () => Math.max(0, getCartSubtotal() - getDiscountAmount() + safeNum(shippingQuoted, 0));

  const syncSearch = (value) => {
    searchQuery = safeStr(value || "").trim();
    if (els.searchInput && els.searchInput.value !== searchQuery) els.searchInput.value = searchQuery;
    if (els.mobileSearchInput && els.mobileSearchInput.value !== searchQuery) els.mobileSearchInput.value = searchQuery;
    if (els.menuSearchInput && els.menuSearchInput.value !== searchQuery) els.menuSearchInput.value = searchQuery;
  };

  const setActiveCategory = (value) => {
    activeCategory = value || null;
    $$(".catcard").forEach((x) => x.classList.toggle("active", x.dataset.cat === activeCategory));
  };

  const isLayerOpen = () => [els.sideMenu, els.cartDrawer, els.assistantModal, els.productModal, els.sizeGuideModal].some((el) => el && !el.hidden);

  const updateBodyScroll = () => {
    document.documentElement.classList.toggle("no-scroll", isLayerOpen());
  };

  const openLayer = (el) => {
    if (!el) return;
    el.hidden = false;
    updateBodyScroll();
    if (el.classList.contains("modal")) {
      requestAnimationFrame(() => el.classList.add("modal--open"));
    }
  };

  const closeLayer = (el) => {
    if (!el) return;
    if (el.classList.contains("modal")) {
      el.classList.remove("modal--open");
      setTimeout(() => {
        el.hidden = true;
        updateBodyScroll();
      }, 220);
      return;
    }
    el.hidden = true;
    updateBodyScroll();
  };

  const openCart = () => openLayer(els.cartDrawer);
  const closeCart = () => closeLayer(els.cartDrawer);
  const openMenu = () => openLayer(els.sideMenu);
  const closeMenu = () => closeLayer(els.sideMenu);
  const openAssistant = () => openLayer(els.assistantModal);
  const closeAssistant = () => closeLayer(els.assistantModal);
  const closeProduct = () => {
    currentProduct = null;
    closeLayer(els.productModal);
  };
  const closeSizeGuide = () => closeLayer(els.sizeGuideModal);

  const openOverlayIfNeeded = () => {
    if (!els.overlay) return;
    els.overlay.hidden = false;
  };

  const closeOverlayIfNeeded = () => {
    if (!els.overlay) return;
    if (!isLayerOpen()) els.overlay.hidden = true;
  };

  const maybeShowSwipeHint = () => {
    if (readStorage(STORAGE_KEYS.seenSwipe, "0") === "1") return;
    if (document.getElementById("productSwipeHint")) return;

    const grid = els.productGrid;
    if (!grid) return;

    const el = document.createElement("div");
    el.id = "productSwipeHint";
    el.className = "product-swipe-hint";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<span class="product-swipe-hint__txt">Desliza para ver más</span><span class="product-swipe-hint__arr">→</span>`;
    document.body.appendChild(el);

    const dismiss = () => {
      writeStorage(STORAGE_KEYS.seenSwipe, "1");
      el.classList.add("is-hide");
      setTimeout(() => el.remove(), 300);
    };

    grid.addEventListener("scroll", dismiss, { passive: true, once: true });
    grid.addEventListener("touchstart", dismiss, { passive: true, once: true });
    setTimeout(() => el.classList.add("is-pulse"), 800);
  };

  const setFlash = (el, cls = "is-flash", ms = 280) => {
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };

  /* =========================
     NORMALIZATION
  ========================= */
  function normalizeCategory(row) {
    const id = safeStr(row?.id || row?.uiId || row?.section_id || row?.sectionId || "").trim().toUpperCase();
    if (!id) return null;
    const cfg = CATEGORY_CONFIG.find((c) => c.uiId === id || c.aliases.includes(id));
    return {
      id,
      uiId: cfg?.uiId || id,
      name: safeStr(row?.name || row?.title || cfg?.name || id.replace(/_/g, " ")),
      logo: normalizeAssetPath(row?.logo || row?.image || cfg?.logo || "/assets/logo-score.webp"),
      section_id: safeStr(row?.section_id || row?.sectionId || id).trim(),
      count: safeNum(row?.count, 0),
      active: row?.active == null ? true : !!row.active,
    };
  }

  function normalizeProduct(row) {
    if (!row || typeof row !== "object") return null;

    const images = getProductImages(row);
    const sectionUi = getProductSectionUi(row);

    return {
      ...row,
      id: safeStr(row.id || row.sku || row.slug || makeId()).trim(),
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
      img: normalizeAssetPath(row.img || row.image || row.image_url || images[0] || ""),
      image_url: normalizeAssetPath(row.image_url || row.img || row.image || images[0] || ""),
      image: normalizeAssetPath(row.image || row.image_url || row.img || images[0] || ""),
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
        const cfg = CATEGORY_CONFIG.find((c) => c.uiId === key || c.aliases.includes(key));
        map.set(key, {
          id: key,
          uiId: cfg?.uiId || key,
          name: cfg?.name || key.replace(/_/g, " "),
          logo: cfg?.logo || "/assets/logo-score.webp",
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

  function filteredList() {
    const q = safeStr(searchQuery).trim().toLowerCase();
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

  /* =========================
     RENDERERS
  ========================= */
  function renderCategories() {
    if (!els.categoryGrid) return;

    const list = buildSectionsFromProducts(products);
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
        <img class="catcard__logo" src="${escapeHtml(normalizeAssetPath("/assets/logo-score.webp"))}" alt="Todas las colecciones" loading="lazy" decoding="async">
        <div class="catcard__meta">
          <div class="catcard__title tech-text">Todos los productos</div>
          <div class="catcard__sub">${products.length} productos</div>
        </div>
        <div class="catcard__btn">Ver todo</div>
      </div>
    `;
    all.addEventListener("click", () => {
      activeCategory = null;
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
      card.innerHTML = `
        <div class="catcard__bg" aria-hidden="true"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${escapeHtml(getCategoryLogo(cat.uiId))}" alt="${escapeHtml(cat.name)}" loading="lazy" decoding="async">
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
    bindCategoryHover();
  }

  function productCardHTML(p) {
    const sku = escapeHtml(getProductSku(p));
    const title = escapeHtml(getProductName(p));
    const desc = escapeHtml(getProductDescription(p) || "Mercancía oficial SCORE.");
    const price = money(getProductPriceCents(p));
    const stock = getStockLabel(p);
    const imgs = getProductImages(p);
    const cover = imgs[0] || normalizeAssetPath("/icon-512.png");

    const track = imgs.length
      ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${title}" loading="lazy" decoding="async">`).join("")
      : `<img src="${escapeHtml(cover)}" alt="${title}" loading="lazy" decoding="async">`;

    return `
      <article class="card product-card" data-sku="${sku}">
        <div class="card__media product-card__media">
          <div class="card__track product-card__track">
            ${track}
          </div>
          ${imgs.length > 1 ? `<div class="carousel-fade carousel-fade--left"></div><div class="carousel-fade carousel-fade--right"></div>` : ""}
          <button type="button" class="product-open" data-open-product="${sku}" aria-label="Abrir ${title}"></button>
        </div>
        <div class="card__body product-card__body">
          <div class="card__meta product-card__meta">
            <span class="pill pill--red">${escapeHtml(getProductSectionUi(p) ? getCategoryName(getProductSectionUi(p)) : "SCORE")}</span>
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
    filteredProducts = list;
    els.productGrid.innerHTML = list.map(productCardHTML).join("");
    updateStatus(list.length);

    $$(".card", els.productGrid).forEach((cardEl) => {
      const sku = cardEl.getAttribute("data-sku") || "";
      const p = products.find((x) => getProductSku(x) === sku);
      if (!p) return;

      cardEl.addEventListener("click", () => openProduct(sku));
      cardEl.querySelectorAll("button[data-open-product]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openProduct(sku);
        });
      });

      if (cardEl.dataset.rendered !== "1") {
        cardEl.dataset.rendered = "1";
        cardEl.classList.add("is-entered");
      }
    });

    animateCards(".card");
    bindCardHover();
    maybeShowSwipeHint();
  }

  function renderCart() {
    if (!els.cartItems) return;

    if (!cart.length) {
      els.cartItems.innerHTML = `
        <div class="empty-state">
          <h3>Carrito vacío</h3>
          <p>Agrega productos para continuar con el checkout.</p>
        </div>
      `;
      updateTotals();
      return;
    }

    els.cartItems.innerHTML = cart
      .map((item, idx) => {
        const line = safeNum(item.price_cents, 0) * safeNum(item.qty, 1);
        return `
          <article class="cart-item cartitem" data-index="${idx}">
            <img class="cart-item__img cartitem__img" src="${escapeHtml(normalizeAssetPath(item.image_url || item.img || "/icon-192.png"))}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
            <div class="cart-item__info cartitem__info">
              <h4>${escapeHtml(item.title)}</h4>
              <p>${item.size ? `Talla: ${escapeHtml(item.size)}` : "Talla libre"}</p>
              <strong>${money(line)}</strong>
              <div class="cart-item__controls cartitem__controls">
                <button type="button" data-cart-dec="${idx}">−</button>
                <input type="number" min="1" max="99" value="${escapeHtml(item.qty)}" data-cart-qty="${idx}" aria-label="Cantidad">
                <button type="button" data-cart-inc="${idx}">+</button>
                <button type="button" class="cart-item__remove" data-cart-remove="${idx}">Eliminar</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    $$("[data-cart-remove]", els.cartItems).forEach((btn) => {
      btn.addEventListener("click", () => removeCartItem(Number(btn.getAttribute("data-cart-remove"))));
    });

    $$("[data-cart-dec]", els.cartItems).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-cart-dec"));
        updateCartQty(idx, safeNum(cart[idx]?.qty, 1) - 1);
      });
    });

    $$("[data-cart-inc]", els.cartItems).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-cart-inc"));
        updateCartQty(idx, safeNum(cart[idx]?.qty, 1) + 1);
      });
    });

    $$("[data-cart-qty]", els.cartItems).forEach((input) => {
      input.addEventListener("change", () => {
        const idx = Number(input.getAttribute("data-cart-qty"));
        updateCartQty(idx, input.value);
      });
    });

    updateTotals();
  }

  function updateTotals() {
    const subtotal = getCartSubtotal();
    const discount = getDiscountAmount();
    const shipping = safeNum(shippingQuoted, 0);
    const total = Math.max(0, subtotal - discount + shipping);

    const totalText = money(total);
    const subtotalText = money(subtotal);
    const discountText = money(discount);
    const shippingText = shipping > 0 ? money(shipping) : "Pendiente";

    if (els.cartCountBadge) {
      els.cartCountBadge.textContent = String(cart.reduce((sum, item) => sum + safeNum(item.qty, 0), 0));
      setFlash(els.cartCountBadge, "pulse", 220);
    }

    if (els.cartSubtotal) els.cartSubtotal.textContent = subtotalText;
    if (els.cartTotal) els.cartTotal.textContent = totalText;
    if (els.drawerSubtotal) els.drawerSubtotal.textContent = subtotalText;
    if (els.drawerShipping) els.drawerShipping.textContent = shippingText;
    if (els.drawerTotal) els.drawerTotal.textContent = totalText;

    const discountLine = $("#discountLine");
    if (discountLine) discountLine.textContent = discount > 0 ? `Descuento aplicado: ${discountText}` : "";

    const cartTotalEl = $("#cartTotal");
    if (cartTotalEl) cartTotalEl.textContent = totalText;

    const shipHint = $("#shipHint");
    if (shipHint) shipHint.textContent = shipping > 0 ? `Envío: ${shippingText}` : "Envío pendiente de cotización";

    const shippingNote = $("#shippingNote");
    if (shippingNote && shippingMeta?.label) {
      shippingNote.textContent = `${shippingMeta.label} · ${shippingText}`;
    }

    if (els.checkoutMsg) {
      if (!cart.length) {
        els.checkoutMsg.textContent = "Agrega productos para continuar con el checkout.";
      } else if (!els.checkoutEmail?.value?.trim()) {
        els.checkoutMsg.textContent = "Escribe un correo válido para continuar.";
      } else {
        els.checkoutMsg.textContent = "Listo para crear una sesión de pago.";
      }
    }
  }

  function updatePromoFeedback(text) {
    const promoFeedback = $("#promoFeedback");
    if (promoFeedback) promoFeedback.textContent = text || "";
    if (els.promoBarText && siteSettings.promo_active && siteSettings.promo_text) {
      els.promoBarText.textContent = siteSettings.promo_text;
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
        <span class="pill">${escapeHtml(p.sku || p.id || "")}</span>
      `;
    }

    if (els.pmCarousel) {
      els.pmCarousel.innerHTML = imgs.length
        ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">`).join("")
        : `<img src="${escapeHtml(normalizeAssetPath("/icon-512.png"))}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">`;
    }

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
  }

  function openProduct(sku) {
    const p = products.find((x) => getProductSku(x) === sku);
    if (!p) return;

    currentProduct = p;
    selectedQty = 1;
    selectedSize = Array.isArray(p.sizes) && p.sizes.length ? p.sizes[0] : "";

    if (els.productModal) {
      renderProductModal(p);
      openLayer(els.productModal);
      openOverlayIfNeeded();
      return;
    }

    addToCart(sku, 1, selectedSize);
    setToastState(`Agregado: ${getProductName(p)}`, "success");
  }

  function addToCart(productOrSku, qty = 1, size = "") {
    const sku = typeof productOrSku === "object" ? getProductSku(productOrSku) : safeStr(productOrSku).trim();
    const p = typeof productOrSku === "object" ? productOrSku : products.find((x) => getProductSku(x) === sku);

    if (!p) return false;

    const normalizedQty = clamp(Math.floor(Number(qty) || 1), 1, 99);
    const normalizedSize = safeStr(size || selectedSize || "").trim();

    const existing = cart.find((item) => item.sku === getProductSku(p) && safeStr(item.size) === normalizedSize);
    if (existing) {
      existing.qty = clamp(safeNum(existing.qty, 1) + normalizedQty, 1, 99);
    } else {
      cart.push({
        sku: getProductSku(p),
        title: getProductName(p),
        price_cents: getProductPriceCents(p),
        qty: normalizedQty,
        size: normalizedSize,
        image_url: p.image_url || p.img || p.image || "",
      });
    }

    persistCart();
    renderCart();
    updateTotals();
    setToastState(`${getProductName(p)} agregado al carrito`, "success");
    return true;
  }

  function removeCartItem(index) {
    if (index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    persistCart();
    renderCart();
    updateTotals();
  }

  function updateCartQty(index, qty) {
    const item = cart[index];
    if (!item) return;
    item.qty = clamp(Math.floor(Number(qty) || 1), 1, 99);
    persistCart();
    renderCart();
    updateTotals();
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

  function restoreCart() {
    const saved = readStorage(STORAGE_KEYS.cart, []);
    cart = Array.isArray(saved)
      ? saved
          .map((item) => ({
            sku: safeStr(item.sku || item.id || "").trim(),
            title: safeStr(item.title || item.name || "Producto SCORE").trim(),
            price_cents: clamp(Math.round(Number(item.price_cents) || 0), 0, 100000000),
            qty: clamp(Math.floor(Number(item.qty) || 1), 1, 99),
            size: safeStr(item.size || "").trim(),
            image_url: normalizeAssetPath(item.image_url || item.img || item.image || ""),
          }))
          .filter((item) => item.sku)
      : [];
  }

  function syncShipUI() {
    const saved = readStorage(STORAGE_KEYS.ship, null);
    if (saved && typeof saved === "object") {
      shipMode = safeStr(saved.mode || saved.shipMode || shipMode).toLowerCase() === "delivery" ? "delivery" : "pickup";
      shippingQuoted = safeNum(saved.amount_cents ?? saved.amount ?? shippingQuoted, shippingQuoted);
      shippingMeta = saved.meta || saved.shippingMeta || shippingMeta || null;
      if (els.shipPostal && saved.postal) els.shipPostal.value = saved.postal;
    }

    if (els.shipModePickup) els.shipModePickup.checked = shipMode === "pickup";
    if (els.shipModeDelivery) els.shipModeDelivery.checked = shipMode === "delivery";
    if (els.shipQuoteEl && shippingMeta?.label) {
      els.shipQuoteEl.textContent = `${shippingMeta.label} · ${money(shippingQuoted)}`;
    }
    updateTotals();
  }

  function persistShip() {
    writeStorage(STORAGE_KEYS.ship, {
      mode: shipMode,
      postal: safeStr(els.shipPostal?.value || "").trim(),
      amount_cents: shippingQuoted,
      meta: shippingMeta,
    });
  }

  function quoteShipping() {
    const country = safeStr(siteSettings.shipping_country || "MX").toUpperCase() || "MX";
    const postal = safeStr(els.shipPostal?.value || els.checkoutPostal?.value || "").trim();

    if (!postal) {
      setToastState("Ingresa un código postal.", "error");
      return null;
    }

    const itemsQty = cart.reduce((sum, item) => sum + safeNum(item.qty, 0), 0) || 1;
    if (els.shipQuoteStatus) els.shipQuoteStatus.textContent = "Cotizando...";

    const doFallback = (label, amountCents, provider = "fallback") => {
      shippingQuoted = amountCents;
      shippingMeta = { provider, label, country, zip: postal, amount_cents: amountCents };
      persistShip();
      syncShipUI();
      if (els.shipQuoteStatus) {
        els.shipQuoteStatus.textContent = `${label} · ${money(amountCents)}`;
      }
      setToastState(`Envío cotizado: ${money(amountCents)}`, "success");
      return shippingMeta;
    };

    return fetch("/api/quote_shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        country,
        zip: postal,
        items_qty: itemsQty,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok || !data?.quote) throw new Error(data?.error || "No fue posible cotizar envío.");
        const q = data.quote;
        shippingQuoted = safeNum(q.amount_cents, 0);
        shippingMeta = {
          provider: safeStr(q.provider || "envia"),
          label: safeStr(q.label || "Envío"),
          country: safeStr(q.country || country),
          zip: safeStr(q.zip || postal),
          amount_cents: shippingQuoted,
          eta: safeStr(q.eta || ""),
          raw: q.raw || null,
        };
        persistShip();
        syncShipUI();
        if (els.shipQuoteStatus) {
          els.shipQuoteStatus.textContent = `${shippingMeta.label} · ${money(shippingQuoted)}${shippingMeta.eta ? ` · ${shippingMeta.eta}` : ""}`;
        }
        setToastState(`Envío cotizado: ${money(shippingQuoted)}`, "success");
        return shippingMeta;
      })
      .catch(() => {
        const fallback = country === "US" ? 85000 : 25000;
        return doFallback(country === "US" ? "Envío USA (estimado)" : "Envío MX (estimado)", fallback);
      });
  }

  function normalizePromoRule(rule) {
    if (!rule || typeof rule !== "object") return null;
    const code = safeStr(rule.code || rule.slug || "").trim().toUpperCase();
    if (!code) return null;
    return {
      code,
      type: safeStr(rule.type || rule.kind || "fixed").trim().toLowerCase(),
      value: safeNum(rule.value ?? rule.amount ?? 0, 0),
      description: safeStr(rule.description || rule.label || ""),
      active: rule.active == null ? true : !!rule.active,
      min_amount_mxn: safeNum(rule.min_amount_mxn ?? rule.minAmountMxn ?? 0, 0),
      expires_at: rule.expires_at || null,
    };
  }

  function isExpired(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return Number.isFinite(d.getTime()) ? d.getTime() < Date.now() : false;
  }

  function applyPromoCode(code) {
    const normalized = safeStr(code || "").trim().toUpperCase();
    if (!normalized) {
      activePromo = null;
      removeStorage(STORAGE_KEYS.promo);
      refreshTotals();
      updatePromoFeedback("Escribe un código para aplicarlo.");
      return null;
    }

    const subtotalMxn = getCartSubtotal() / 100;
    const rule = promosData.rules.find((r) => safeStr(r.code).trim().toUpperCase() === normalized);

    if (!rule || !rule.active || isExpired(rule.expires_at) || subtotalMxn < safeNum(rule.min_amount_mxn, 0)) {
      activePromo = null;
      removeStorage(STORAGE_KEYS.promo);
      refreshTotals();
      updatePromoFeedback(`El código "${normalized}" no es válido o no alcanza el mínimo requerido.`);
      setToastState("Promoción no válida.", "error");
      return null;
    }

    activePromo = {
      code: rule.code,
      type: rule.type,
      value: rule.value,
      description: rule.description,
      min_amount_mxn: rule.min_amount_mxn,
      expires_at: rule.expires_at,
    };

    writeStorage(STORAGE_KEYS.promo, activePromo);
    refreshTotals();
    updatePromoFeedback(
      activePromo.type === "free_shipping"
        ? `Promo aplicada: ${activePromo.code} · Envío gratis`
        : `Promo aplicada: ${activePromo.code} · Descuento activo`
    );
    setToastState(`Promo aplicada: ${activePromo.code}`, "success");
    return activePromo;
  }

  function refreshTotals() {
    updateTotals();
  }

  function openSizeGuide() {
    if (!els.sizeGuideModal) return;
    openLayer(els.sizeGuideModal);
  }

  function shareProduct() {
    if (!currentProduct) return;
    const url = new URL(window.location.href);
    url.hash = `sku=${encodeURIComponent(getProductSku(currentProduct))}`;
    navigator.clipboard?.writeText(url.toString()).then(
      () => setToastState("Enlace copiado.", "success"),
      () => setToastState(url.toString(), "info")
    );
  }

  async function createCheckout() {
    if (loadingCheckout) return;
    if (!cart.length) {
      setToastState("Tu carrito está vacío.", "error");
      return;
    }

    const email = safeStr(els.checkoutEmail?.value || "").trim();
    if (!email || !/@/.test(email)) {
      setToastState("Escribe un correo válido.", "error");
      els.checkoutEmail?.focus();
      return;
    }

    loadingCheckout = true;
    if (els.checkoutLoader) els.checkoutLoader.hidden = false;
    if (els.checkoutSubmitBtn) els.checkoutSubmitBtn.disabled = true;
    if (els.checkoutMsg) els.checkoutMsg.textContent = "Creando checkout seguro...";

    try {
      const payload = {
        customer_name: safeStr(els.checkoutName?.value || "").trim(),
        customer_email: email,
        customer_phone: safeStr(els.checkoutPhone?.value || "").trim(),
        shipping_country: "MX",
        shipping_zip: safeStr(els.checkoutPostal?.value || els.shipPostal?.value || "").trim(),
        shipping_amount_cents: safeNum(shippingQuoted, 0),
        promo_code: activePromo?.code || getPromoCode(),
        items: cart.map((item) => ({
          sku: item.sku,
          id: item.sku,
          title: item.title,
          qty: safeNum(item.qty, 1),
          size: safeStr(item.size || ""),
          priceCents: safeNum(item.price_cents, 0),
        })),
        notes: safeStr(els.checkoutNotes?.value || "").trim(),
        payment_method: safeStr(els.checkoutPaySelect?.value || "stripe"),
      };

      const res = await fetch("/api/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo crear el checkout.");

      if (data.url || data.checkout_url || data.session_url) {
        if (els.checkoutMsg) els.checkoutMsg.textContent = "Redirigiendo a Stripe...";
        window.location.href = data.url || data.checkout_url || data.session_url;
        return;
      }

      if (els.checkoutMsg) els.checkoutMsg.textContent = "Checkout creado.";
      setToastState("Checkout creado correctamente.", "success");
    } catch (err) {
      const msg = safeStr(err?.message || "No se pudo crear el checkout.");
      if (els.checkoutMsg) els.checkoutMsg.textContent = msg;
      setToastState(msg, "error");
    } finally {
      loadingCheckout = false;
      if (els.checkoutLoader) els.checkoutLoader.hidden = true;
      if (els.checkoutSubmitBtn) els.checkoutSubmitBtn.disabled = false;
      updateTotals();
    }
  }

  async function sendAssistantMessage(message) {
    const msg = safeStr(message || els.assistantInput?.value || "").trim();
    if (!msg) return;

    if (!siteSettings.org_id && !catalog?.store?.org_id) {
      setToastState("El chat todavía no está disponible.", "error");
      return;
    }

    if (els.assistantInput) els.assistantInput.value = "";

    if (els.assistantLog) {
      const userLine = document.createElement("div");
      userLine.className = "chat-message chat-message--user";
      userLine.textContent = msg;
      els.assistantLog.appendChild(userLine);
      els.assistantLog.scrollTop = els.assistantLog.scrollHeight;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: siteSettings.org_id || catalog?.store?.org_id || "",
          message: msg,
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

    if (els.heroTitle && siteSettings.hero_title) els.heroTitle.textContent = siteSettings.hero_title;
    if (els.heroText && home.hero_text) els.heroText.textContent = home.hero_text;
    if (els.heroImage && siteSettings.hero_image) els.heroImage.src = normalizeAssetPath(siteSettings.hero_image);

    if (siteSettings.promo_active && siteSettings.promo_text && els.promoBarText && !readStorage(STORAGE_KEYS.hiddenPromo, "0")) {
      els.promoBar.hidden = false;
      els.promoBarText.textContent = siteSettings.promo_text;
    }
  }

  function applyTheme() {
    const theme = siteSettings.theme || {};
    const root = document.documentElement;
    if (theme.accent) root.style.setProperty("--u-red", safeStr(theme.accent));
    if (theme.accent2) root.style.setProperty("--u-blue", safeStr(theme.accent2));
  }

  function buildPromoLookup(list) {
    return (Array.isArray(list) ? list : [])
      .map(normalizePromoRule)
      .filter(Boolean);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadPromos() {
    try {
      const data = await fetchJson("/api/promos");
      const rules = Array.isArray(data?.rules) ? data.rules : Array.isArray(data?.promos) ? data.promos : [];
      promosData = { rules: buildPromoLookup(rules) };
    } catch {
      try {
        const data = await fetchJson("/data/promos.json");
        const rules = Array.isArray(data?.rules) ? data.rules : Array.isArray(data?.promos) ? data.promos : [];
        promosData = { rules: buildPromoLookup(rules) };
      } catch {
        promosData = { rules: [] };
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
      setToastState(safeStr(err?.message || "No fue posible cargar el catálogo."), "error");
    } finally {
      loadingCatalog = false;
    }
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

  function bindCategoryHover() {
    $$(".catcard").forEach((el) => {
      if (el.dataset.bound === "1") return;
      el.dataset.bound = "1";
      el.addEventListener("pointerenter", () => el.classList.add("is-hovered"), { passive: true });
      el.addEventListener("pointerleave", () => el.classList.remove("is-hovered"), { passive: true });
    });
  }

  function bindCardHover() {
    $$(".card").forEach((el) => {
      if (el.dataset.bound === "1") return;
      el.dataset.bound = "1";
      el.addEventListener("pointerenter", () => el.classList.add("is-hovered"), { passive: true });
      el.addEventListener("pointerleave", () => el.classList.remove("is-hovered"), { passive: true });
    });
  }

  function mountVisualPolish() {
    if (els.productGrid) {
      els.productGrid.classList.add("carousel-track");
    }
    if (els.categoryGrid) {
      els.categoryGrid.classList.add("catgrid");
    }
    if (els.topbar) {
      els.topbar.classList.add("glass-header");
    }

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
    const actions = [
      "compró una gorra",
      "agregó una playera",
      "finalizó un pedido",
      "aplicó un cupón",
      "cotizó envío",
      "abrió el carrito",
    ];
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
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = !els.mobileSearchWrap.hidden;
      els.mobileSearchInput?.focus();
    });

    els.closeMobileSearchBtn?.addEventListener("click", () => {
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = true;
    });

    els.sortSelect?.addEventListener("change", updateResults);

    els.clearFilterBtn?.addEventListener("click", () => {
      activeCategory = null;
      syncSearch("");
      renderCategories();
      updateResults();
    });

    els.categoryGrid?.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".catcard");
      if (!btn) return;
      const cat = btn.dataset.cat || "";
      activeCategory = cat || null;
      syncSearch("");
      renderCategories();
      updateResults();
      els.catalogCarouselSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.productGrid?.addEventListener("click", (e) => {
      const openBtn = e.target.closest?.("[data-open-product]");
      if (!openBtn) return;
      const sku = openBtn.getAttribute("data-open-product") || openBtn.closest(".card")?.getAttribute("data-sku");
      if (sku) openProduct(sku);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMenu();
        closeCart();
        closeAssistant();
        closeProduct();
        closeSizeGuide();
        if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = true;
      }
    });

    els.overlay?.addEventListener("click", () => {
      closeMenu();
      closeCart();
      closeAssistant();
      closeProduct();
      closeSizeGuide();
      if (els.mobileSearchWrap) els.mobileSearchWrap.hidden = true;
    });

    window.addEventListener("scroll", () => {
      if (els.scrollTopBtn) els.scrollTopBtn.hidden = window.scrollY < 500;
    }, { passive: true });

    els.scrollTopBtn?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    els.scrollLeftBtn?.addEventListener("click", () => {
      els.productGrid?.scrollBy({ left: -320, behavior: "smooth" });
    });

    els.scrollRightBtn?.addEventListener("click", () => {
      els.productGrid?.scrollBy({ left: 320, behavior: "smooth" });
    });

    els.scrollToCategoriesBtn?.addEventListener("click", () => {
      els.categoryGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.promoBarClose?.addEventListener("click", () => {
      if (els.promoBar) els.promoBar.hidden = true;
      writeStorage(STORAGE_KEYS.hiddenPromo, "1");
    });

    els.cartToggleBtn?.addEventListener("click", () => openCart());
    els.closeCartBtn?.addEventListener("click", () => closeCart());
    els.closeMenuBtn?.addEventListener("click", () => closeMenu());
    els.navOpenCart?.addEventListener("click", () => openCart());
    els.navOpenAssistant?.addEventListener("click", () => openAssistant());

    els.shipModePickup?.addEventListener("change", () => {
      if (els.shipModePickup.checked) shipMode = "pickup";
      persistShip();
      updateTotals();
    });

    els.shipModeDelivery?.addEventListener("change", () => {
      if (els.shipModeDelivery.checked) shipMode = "delivery";
      persistShip();
      updateTotals();
    });

    els.shipPostal?.addEventListener("input", persistShip);
    els.checkoutPostal?.addEventListener("input", persistShip);

    els.shipQuoteBtn?.addEventListener("click", quoteShipping);

    els.checkoutForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      createCheckout();
    });

    els.checkoutSubmitBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      createCheckout();
    });

    els.continueShoppingBtn?.addEventListener("click", () => closeCart());

    els.pmClose?.addEventListener("click", closeProduct);
    els.pmBackBtn?.addEventListener("click", closeProduct);
    els.pmQtyDec?.addEventListener("click", () => {
      selectedQty = clamp(selectedQty - 1, 1, 99);
      if (els.pmQtyDisplay) els.pmQtyDisplay.textContent = String(selectedQty);
    });
    els.pmQtyInc?.addEventListener("click", () => {
      selectedQty = clamp(selectedQty + 1, 1, 99);
      if (els.pmQtyDisplay) els.pmQtyDisplay.textContent = String(selectedQty);
    });
    els.pmAdd?.addEventListener("click", () => {
      if (!currentProduct) return;
      addToCart(currentProduct, selectedQty, selectedSize);
      closeProduct();
      openCart();
    });
    els.pmShareBtn?.addEventListener("click", shareProduct);
    els.openSizeGuideBtn?.addEventListener("click", openSizeGuide);
    els.closeSizeGuideBtn?.addEventListener("click", closeSizeGuide);
    els.understandSizeBtn?.addEventListener("click", closeSizeGuide);

    els.assistantCloseBtn?.addEventListener("click", closeAssistant);
    els.assistantToggleBtn?.addEventListener("click", openAssistant);
    els.assistantSendBtn?.addEventListener("click", () => sendAssistantMessage(els.assistantInput?.value || ""));
    els.assistantInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAssistantMessage(els.assistantInput.value);
      }
    });

    els.cartItems?.addEventListener("click", (e) => {
      const remove = e.target.closest?.("[data-cart-remove]");
      const dec = e.target.closest?.("[data-cart-dec]");
      const inc = e.target.closest?.("[data-cart-inc]");
      if (remove) return removeCartItem(Number(remove.getAttribute("data-cart-remove")));
      if (dec) return updateCartQty(Number(dec.getAttribute("data-cart-dec")), safeNum(cart[Number(dec.getAttribute("data-cart-dec"))]?.qty, 1) - 1);
      if (inc) return updateCartQty(Number(inc.getAttribute("data-cart-inc")), safeNum(cart[Number(inc.getAttribute("data-cart-inc"))]?.qty, 1) + 1);
    });

    els.cartItems?.addEventListener("change", (e) => {
      const input = e.target.closest?.("[data-cart-qty]");
      if (!input) return;
      updateCartQty(Number(input.getAttribute("data-cart-qty")), input.value);
    });
  }

  function updateCheckoutState() {
    const ready = cart.length > 0 && !!safeStr(els.checkoutEmail?.value || "").trim();
    if (els.checkoutSubmitBtn) els.checkoutSubmitBtn.disabled = !ready || loadingCheckout;
    if (els.checkoutMsg) {
      els.checkoutMsg.textContent = ready
        ? "Listo para crear una sesión de pago."
        : "Agrega productos y un email válido para continuar.";
    }
  }

  function saveCustomer() {
    writeStorage(STORAGE_KEYS.customer, {
      name: safeStr(els.checkoutName?.value || "").trim(),
      email: safeStr(els.checkoutEmail?.value || "").trim(),
      phone: safeStr(els.checkoutPhone?.value || "").trim(),
      address: safeStr(els.checkoutAddress?.value || "").trim(),
      postal: safeStr(els.checkoutPostal?.value || "").trim(),
      notes: safeStr(els.checkoutNotes?.value || "").trim(),
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

  function updateFooterVersion() {
    if (els.appVersionLabel) els.appVersionLabel.textContent = APP_VERSION;
  }

  function updateStatusBar() {
    if (els.activeFilterLabel) {
      const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
      els.activeFilterLabel.textContent = activeCategory ? (cat?.name || activeCategory) : "Todos los productos";
    }
    if (els.activeFilterRow) els.activeFilterRow.hidden = !activeCategory && !searchQuery;
    if (els.carouselTitle) els.carouselTitle.textContent = activeCategory ? (CATEGORY_CONFIG.find((c) => c.uiId === activeCategory)?.name || "Productos") : "Productos destacados";
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

  function openProductByHash() {
    const raw = String(location.hash || "");
    const m = raw.match(/sku=([^&]+)/i) || raw.match(/^#([a-z0-9\-_]+)$/i);
    if (!m) return;
    const sku = decodeURIComponent(m[1] || "").trim();
    if (sku) setTimeout(() => openProduct(sku), 180);
  }

  function updateBodyClasses() {
    document.documentElement.classList.toggle("no-scroll", isLayerOpen());
  }

  function mount() {
    updateFooterVersion();
    restoreCart();
    restoreCustomer();
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

    try {
      const savedShip = readStorage(STORAGE_KEYS.ship, null);
      if (savedShip && typeof savedShip === "object") {
        shipMode = safeStr(savedShip.mode || shipMode).toLowerCase() === "delivery" ? "delivery" : "pickup";
      }
    } catch {}

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
        delay(3500),
      ]);
    } finally {
      clearTimeout(splashFailSafe);
    }

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
  }

  /* =========================
     WINDOW API
  ========================= */
  function updateResultsPublic() {
    updateResults();
  }

  function applyPromoCodePublic(code) {
    return applyPromoCode(code);
  }

  function quoteShippingPublic() {
    return quoteShipping();
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
    updateResults: updateResultsPublic,
    refreshTotals,
    applyPromoCode: applyPromoCodePublic,
    quoteShipping: quoteShippingPublic,
    openProduct,
    addToCart,
    clearCart,
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