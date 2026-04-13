(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.04.PREMIUM.VERCEL";

  const API = {
    catalog: "/api/catalog",
    promos: "/api/promos",
    siteSettings: "/api/site_settings",
    quoteShipping: "/api/quote_shipping",
    createCheckout: "/api/create_checkout",
    chat: "/api/chat",
  };

  const STORAGE_KEYS = {
    cart: "scorestore_cart_v2_pro",
    ship: "scorestore_ship_v2",
    consent: "scorestore_consent_v2",
    promoDismiss: "scorestore_promo_dismissed",
    seenSwipe: "scorestore_seen_product_swipe",
  };

  const CATEGORY_CONFIG = [
    { uiId: "BAJA1000", name: "BAJA 1000", logo: "assets/logo-baja1000.webp", mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES"] },
    { uiId: "BAJA500", name: "BAJA 500", logo: "assets/logo-baja500.webp", mapFrom: ["BAJA500", "BAJA_500"] },
    { uiId: "BAJA400", name: "BAJA 400", logo: "assets/logo-baja400.webp", mapFrom: ["BAJA400", "BAJA_400"] },
    { uiId: "SF250", name: "SAN FELIPE 250", logo: "assets/logo-sf250.webp", mapFrom: ["SF250", "SF_250"] },
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const debounce = (fn, wait = 150) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
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

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const normalizeCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
  const normalizeText = (s) => String(s || "").trim();

  const safeUrl = (u) => {
    const s0 = normalizeText(u);
    if (!s0) return "";
    if (/^(https?:|data:|blob:)/i.test(s0)) return s0;

    const s1 = s0
      .replaceAll("assets/BAJA_500/", "assets/BAJA500/")
      .replaceAll("assets/BAJA_400/", "assets/BAJA400/")
      .replaceAll("assets/SF_250/", "assets/SF250/")
      .replaceAll("assets/BAJA_1000/", "assets/EDICION_2025/")
      .replaceAll("\\", "/");

    if (s1.startsWith("/")) return s1;
    if (/^(assets|css|js|data)\//.test(s1)) return `/${s1}`;
    return s1;
  };

  const splash = $("#splash");
  const overlay = $("#overlay");

  const sideMenu = $("#sideMenu");
  const openMenuBtn = $("#openMenuBtn");
  const closeMenuBtn = $("#closeMenuBtn");

  const cartDrawer = $("#cartDrawer");
  const openCartBtn = $("#openCartBtn");
  const closeCartBtn = $("#closeCartBtn");
  const navOpenCart = $("#navOpenCart");

  const assistantModal = $("#assistantModal");
  const openAssistantBtn = $("#openAssistantBtn");
  const floatingAssistantBtn = $("#floatingAssistantBtn");
  const navOpenAssistant = $("#navOpenAssistant");
  const assistantClose = $("#assistantClose");
  const assistantOutput = $("#assistantOutput");
  const assistantInput = $("#assistantInput");
  const assistantSendBtn = $("#assistantSendBtn");

  const scrollToCategoriesBtn = $("#scrollToCategoriesBtn");

  const categoryGrid = $("#categoryGrid");
  const categoryHint = $("#categoryHint");

  const catalogCarouselSection = $("#catalogCarouselSection");
  const carouselTitle = $("#carouselTitle");
  const scrollLeftBtn = $("#scrollLeftBtn");
  const scrollRightBtn = $("#scrollRightBtn");

  const productGrid = $("#productGrid");
  const statusRow = $("#statusRow");

  const searchInput = $("#searchInput");
  const mobileSearchBtn = $("#mobileSearchBtn");
  const mobileSearchWrap = $("#mobileSearchWrap");
  const mobileSearchInput = $("#mobileSearchInput");
  const closeMobileSearchBtn = $("#closeMobileSearchBtn");
  const sortSelect = $("#sortSelect");
  const menuSearchInput = $("#menuSearchInput");

  const promoBar = $("#promoBar");
  const promoBarText = $("#promoBarText");
  const promoBarClose = $("#promoBarClose");

  const footerNote = $("#footerNote");
  const footerEmailLink = $("#footerEmailLink");
  const footerEmailText = $("#footerEmailText");
  const footerWhatsappLink = $("#footerWhatsappLink");
  const footerWhatsappText = $("#footerWhatsappText");
  const footerFacebookLink = $("#footerFacebookLink");
  const footerInstagramLink = $("#footerInstagramLink");
  const footerYoutubeLink = $("#footerYoutubeLink");

  const activeFilterRow = $("#activeFilterRow");
  const activeFilterLabel = $("#activeFilterLabel");
  const clearFilterBtn = $("#clearFilterBtn");

  const cartCount = $("#cartCount");
  const cartItemsEl = $("#cartItems");
  const cartSubtotalEl = $("#cartSubtotal");
  const shippingLineEl = $("#shippingLine");
  const discountLineWrap = $("#discountLineWrap");
  const discountLineEl = $("#discountLine");
  const cartTotalEl = $("#cartTotal");

  const shipHint = $("#shipHint");
  const shippingNote = $("#shippingNote");
  const postalWrap = $("#postalWrap");
  const postalCode = $("#postalCode");
  const quoteBtn = $("#quoteBtn");

  const promoCode = $("#promoCode");
  const applyPromoBtn = $("#applyPromoBtn");

  const checkoutBtn = $("#checkoutBtn");
  const continueShoppingBtn = $("#continueShoppingBtn");
  const checkoutMsg = $("#checkoutMsg");
  const checkoutLoader = $("#checkoutLoader");

  const productModal = $("#productModal");
  const pmBackBtn = $("#pmBackBtn");
  const pmClose = $("#pmClose");
  const pmTitle = $("#pmTitle");
  const pmCarousel = $("#pmCarousel");
  const pmChips = $("#pmChips");
  const pmPrice = $("#pmPrice");
  const pmDesc = $("#pmDesc");
  const pmShareBtn = $("#pmShareBtn");
  const pmAdd = $("#pmAdd");
  const pmSizePills = $("#pmSizePills");
  const pmQtyDec = $("#pmQtyDec");
  const pmQtyInc = $("#pmQtyInc");
  const pmQtyDisplay = $("#pmQtyDisplay");
  const pmStockBadge = $("#pmStockBadge");

  const sizeGuideModal = $("#sizeGuideModal");
  const openSizeGuideBtn = $("#openSizeGuideBtn");
  const closeSizeGuideBtn = $("#closeSizeGuideBtn");
  const understandSizeBtn = $("#understandSizeBtn");

  const cookieBanner = $("#cookieBanner");
  const cookieAccept = $("#cookieAccept");
  const cookieReject = $("#cookieReject");

  const scrollTopBtn = $("#scrollTopBtn");
  const toast = $("#toast");
  const appVersionLabel = $("#appVersionLabel");

  const salesNotification = $("#salesNotification");
  const salesName = $("#salesName");
  const salesAction = $("#salesAction");

  const siteSettings = {
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
      email: "grupo.unico11@gmail.com",
      phone: "",
      whatsapp_e164: "5216642368701",
      whatsapp_display: "664 236 8701",
    },
  };

  let catalog = null;
  let products = [];
  let filteredProducts = [];
  let promosData = { rules: [] };
  let activePromo = null;
  let activeCategory = null;
  let searchQuery = "";
  let sortMode = "featured";
  let cart = [];
  let shipping = { mode: "pickup", postal_code: "", quote: null };
  let currentProduct = null;
  let selectedSize = "";
  let selectedQty = 1;

  const showToast = (msg, type = "ok", timeout = 2600) => {
    if (!toast) return;
    toast.hidden = false;
    toast.setAttribute("data-type", type);
    toast.textContent = String(msg || "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, timeout);
  };

  const isModal = (el) => !!el?.classList?.contains("modal");
  const anyLayerOpen = () =>
    !sideMenu?.hidden ||
    !cartDrawer?.hidden ||
    !assistantModal?.hidden ||
    !productModal?.hidden ||
    !sizeGuideModal?.hidden;

  const openOverlay = () => {
    if (!overlay) return;
    overlay.hidden = false;
    document.documentElement.classList.add("no-scroll");
  };

  const closeOverlay = () => {
    if (!overlay) return;
    overlay.hidden = true;
    document.documentElement.classList.remove("no-scroll");
  };

  const openLayer = (el) => {
    if (!el) return;
    el.hidden = false;
    openOverlay();
    if (isModal(el)) requestAnimationFrame(() => el.classList.add("modal--open"));
    else requestAnimationFrame(() => el.classList.add("is-open"));
  };

  const closeLayer = (el) => {
    if (!el) return;
    const MODAL_T = 520;

    if (isModal(el)) {
      el.classList.remove("modal--open");
      setTimeout(() => {
        el.hidden = true;
        if (!anyLayerOpen()) closeOverlay();
      }, MODAL_T);
      return;
    }

    el.classList.remove("is-open");
    setTimeout(() => {
      if (el.hidden) return;
      el.hidden = true;
      if (!anyLayerOpen()) closeOverlay();
    }, 180);
  };

  const setCheckoutLoading = (on) => {
    if (!checkoutLoader) return;
    checkoutLoader.hidden = !on;
  };

  const setStatus = (msg) => {
    if (!statusRow) return;
    statusRow.textContent = String(msg || "");
  };

  const smoothScrollTo = (target) => {
    const el = typeof target === "string" ? $(target) : target;
    el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const persistCart = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
    } catch {}
  };

  const restoreCart = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cart);
      const parsed = raw ? JSON.parse(raw) : [];
      cart = Array.isArray(parsed) ? parsed : [];
    } catch {
      cart = [];
    }
  };

  const saveShipping = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.ship, JSON.stringify(shipping));
    } catch {}
  };

  const loadShipping = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ship);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        shipping = { ...shipping, ...parsed, quote: parsed.quote || null };
      }
    } catch {}
  };

  const setCookieConsent = (value) => {
    try {
      localStorage.setItem(STORAGE_KEYS.consent, value);
    } catch {}
  };

  const loadMetaPixel = (pixelId) => {
    const id = normalizeText(pixelId);
    if (!id || document.getElementById("metaPixelScript")) return;

    const s = document.createElement("script");
    s.id = "metaPixelScript";
    s.text = `
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${id.replaceAll("'", "")}');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(s);

    const ns = document.createElement("noscript");
    ns.innerHTML = `<img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1"/>`;
    document.body.appendChild(ns);
  };

  const applyTheme = (theme = {}) => {
    const root = document.documentElement;
    if (theme.accent) root.style.setProperty("--accent", theme.accent);
    if (theme.accent2) root.style.setProperty("--accent-2", theme.accent2);
    root.classList.toggle("theme-particles", !!theme.particles);
  };

  const applySiteSettings = (s) => {
    if (!s || typeof s !== "object") return;
    Object.assign(siteSettings, s);
    applyTheme(siteSettings.theme || {});

    const dismissed = localStorage.getItem(STORAGE_KEYS.promoDismiss) === "1";
    const enabled = !!siteSettings.promo_active && normalizeText(siteSettings.promo_text) && !dismissed;

    if (promoBar && promoBarText) {
      promoBar.hidden = !enabled;
      promoBarText.textContent = enabled ? siteSettings.promo_text : "";
    }

    if (footerNote) footerNote.textContent = siteSettings.home?.footer_note || "Merch oficial de SCORE International.";
    if (shippingNote && !shipping.quote) shippingNote.textContent = siteSettings.home?.shipping_note || "Ingresa tu CP/ZIP y cotiza en vivo.";

    if (footerEmailLink && footerEmailText) {
      const email = normalizeText(siteSettings.contact?.email);
      if (email) {
        footerEmailLink.href = `mailto:${email}`;
        footerEmailText.textContent = email;
      }
    }

    if (footerWhatsappLink && footerWhatsappText) {
      const wa = normalizeText(siteSettings.contact?.whatsapp_e164);
      const display = normalizeText(siteSettings.contact?.whatsapp_display);
      if (wa) footerWhatsappLink.href = `https://wa.me/${encodeURIComponent(wa)}`;
      if (display) footerWhatsappText.textContent = display;
    }

    if (footerFacebookLink && siteSettings.socials?.facebook) footerFacebookLink.href = siteSettings.socials.facebook;
    if (footerInstagramLink && siteSettings.socials?.instagram) footerInstagramLink.href = siteSettings.socials.instagram;
    if (footerYoutubeLink && siteSettings.socials?.youtube) footerYoutubeLink.href = siteSettings.socials.youtube;

    if (siteSettings.pixel_id) {
      const consent = localStorage.getItem(STORAGE_KEYS.consent);
      if (consent === "accept") loadMetaPixel(siteSettings.pixel_id);
    }

    if (checkoutBtn) checkoutBtn.disabled = !!siteSettings.maintenance_mode || !cart.length;
  };

  const fetchJsonFirstOk = async (urls) => {
    const list = Array.isArray(urls) ? urls : [];
    let lastErr = null;
    for (const u of list) {
      try {
        const res = await fetch(u, { headers: { "cache-control": "no-store" } });
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        const j = await res.json().catch(() => null);
        if (j) return j;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("No se pudo cargar JSON");
  };

  const fetchCatalog = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    return fetchJsonFirstOk([`${API.catalog}?cv=${cv}`, `data/catalog.json?cv=${cv}`]);
  };

  const fetchPromos = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    try {
      const j = await fetchJsonFirstOk([`${API.promos}?cv=${cv}`, `data/promos.json?cv=${cv}`]);
      promosData = Array.isArray(j?.rules) ? j : { rules: [] };
    } catch {
      promosData = { rules: [] };
    }
  };

  const fetchSiteSettings = async () => {
    try {
      const j = await fetchJsonFirstOk([`${API.siteSettings}?cv=${encodeURIComponent(APP_VERSION)}`]);
      applySiteSettings(j?.data || j);
    } catch {}
  };

  const normalizeSectionIdToUi = (sectionId) => {
    const sid = normalizeText(sectionId);
    const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
    return found ? found.uiId : "BAJA1000";
  };

  const getLogoForSection = (uiId) => CATEGORY_CONFIG.find((c) => c.uiId === uiId)?.logo || "assets/logo-baja1000.webp";

  const inferCollection = (p) => {
    const sid = normalizeText(p?.sectionId || p?.section_id || p?.section || "");
    if (sid === "EDICION_2025") return "Edición 2025";
    if (sid === "OTRAS_EDICIONES") return "Ediciones Clásicas";
    return "";
  };

  const normalizeProduct = (p) => {
    const sku = normalizeText(p?.sku || p?.id || "");
    const title = normalizeText(p?.title || p?.name || "Producto Oficial");
    const priceCents = Number.isFinite(Number(p?.price_cents)) ? Math.round(Number(p.price_cents)) : 0;
    const images = Array.isArray(p?.images) ? p.images : (p?.img ? [p.img] : []);
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["Única"];
    const rawSection = normalizeText(p?.sectionId || p?.categoryId || p?.section || "");
    const uiSection = normalizeSectionIdToUi(rawSection);

    return {
      sku,
      title,
      description: normalizeText(p?.description),
      priceCents,
      images: images.map(safeUrl).filter(Boolean),
      img: images?.[0] ? safeUrl(images[0]) : "",
      sizes: sizes.map((s) => normalizeText(s)).filter(Boolean),
      rawSection,
      uiSection,
      collection: inferCollection(p),
      rank: Number.isFinite(Number(p?.rank)) ? Math.round(Number(p.rank)) : 999,
      stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
    };
  };

  const getProductName = (p) => String(p?.title || p?.name || "Producto SCORE");
  const getProductImage = (p) => safeUrl(p?.image_url || p?.img || p?.image || (Array.isArray(p?.images) ? p.images[0] : ""));
  const getProductImages = (p) => {
    const arr = Array.isArray(p?.images) ? p.images.filter(Boolean) : [];
    const fallback = getProductImage(p);
    return arr.length ? arr.map(safeUrl) : fallback ? [fallback] : [];
  };
  const getProductSizes = (p) => {
    const arr = Array.isArray(p?.sizes) ? p.sizes.filter(Boolean) : [];
    return arr.length ? arr.map((x) => String(x)) : ["Única"];
  };
  const getProductPriceCents = (p) => {
    const price = Number(p?.price_cents);
    if (Number.isFinite(price) && price > 0) return Math.round(price);
    const mxn = Number(p?.price_mxn);
    if (Number.isFinite(mxn) && mxn > 0) return Math.round(mxn * 100);
    const base = Number(p?.base_mxn);
    if (Number.isFinite(base) && base > 0) return Math.round(base * 100);
    return 0;
  };

  const getVisibleProducts = () => {
    let list = [...products];

    if (activeCategory?.section_id) {
      list = list.filter((p) => String(p.section_id || "") === String(activeCategory.section_id));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        [p.title, p.name, p.sku, p.section_id, p.sub_section, p.collection].some((x) =>
          String(x || "").toLowerCase().includes(q)
        )
      );
    }

    const mode = String(sortSelect?.value || sortMode || "featured");
    if (mode === "price_asc") list.sort((a, b) => getProductPriceCents(a) - getProductPriceCents(b));
    else if (mode === "price_desc") list.sort((a, b) => getProductPriceCents(b) - getProductPriceCents(a));
    else if (mode === "name_asc") list.sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es"));
    else list.sort((a, b) => (a.rank - b.rank) || getProductName(a).localeCompare(getProductName(b), "es"));

    return list;
  };

  const updateFilterUI = () => {
    const catLabel = activeCategory ? (CATEGORY_CONFIG.find((c) => c.uiId === activeCategory)?.name || activeCategory) : "";
    const hasSearch = !!normalizeText(searchQuery);

    if (activeFilterRow && activeFilterLabel) {
      if (activeCategory || hasSearch) {
        activeFilterRow.hidden = false;
        activeFilterLabel.textContent =
          `${activeCategory ? `Colección: ${catLabel}` : ""}` +
          `${activeCategory && hasSearch ? " · " : ""}` +
          `${hasSearch ? `Búsqueda: ${searchQuery}` : ""}`;
      } else {
        activeFilterRow.hidden = true;
      }
    }

    if (carouselTitle) carouselTitle.textContent = activeCategory ? `Catálogo — ${catLabel}` : "Catálogo";
  };

  const ensureCarouselUX = () => {
    if (productGrid) productGrid.scrollTo({ left: 0, behavior: "auto" });
  };

  const getTrackStep = () => {
    const card = productGrid?.querySelector?.(".card");
    const cardW = card ? Math.round(card.getBoundingClientRect().width) : 320;
    const gap = Math.round(parseFloat(getComputedStyle(productGrid).gap || "32px") || 32);
    return Math.max(240, cardW + gap);
  };

  const ensureProductSwipeHint = () => {
    const wrap = productGrid?.parentElement;
    if (!wrap) return;

    try {
      if (localStorage.getItem(STORAGE_KEYS.seenSwipe) === "1") {
        document.getElementById("productSwipeHint")?.remove();
        return;
      }
    } catch {}

    if (document.getElementById("productSwipeHint")) return;

    const el = document.createElement("div");
    el.id = "productSwipeHint";
    el.className = "product-swipe-hint";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<span class="product-swipe-hint__txt">Desliza para ver más</span><span class="product-swipe-hint__arr">→</span>`;
    wrap.appendChild(el);

    const dismiss = () => {
      try {
        localStorage.setItem(STORAGE_KEYS.seenSwipe, "1");
      } catch {}
      el.classList.add("is-hide");
      setTimeout(() => el.remove(), 350);
      productGrid?.removeEventListener?.("scroll", dismiss);
    };

    productGrid?.addEventListener?.("scroll", dismiss, { passive: true });
    setTimeout(() => {
      if (document.body.contains(el)) el.classList.add("is-pulse");
    }, 900);
  };

  const getScarcityText = (p) => {
    const stock = Number(p?.stock);
    if (!Number.isFinite(stock)) return "";
    if (stock <= 0) return "⏳ Sin stock por ahora. Confirma por WhatsApp si quieres apartar.";
    if (stock <= 3) return "🔥 Últimas piezas disponibles.";
    return "";
  };

  const mountCardCarousel = (cardEl, imgs, title) => {
    if (!cardEl || !imgs || imgs.length <= 1) return;
    const track = cardEl.querySelector(".card__track");
    const dots = Array.from(cardEl.querySelectorAll(".card__dot"));
    const prevBtn = cardEl.querySelector(".card__nav--prev");
    const nextBtn = cardEl.querySelector(".card__nav--next");
    if (!track) return;

    const setActiveDot = (idx) => dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    const scrollToIndex = (idx) => {
      const w = track.clientWidth || 1;
      track.scrollTo({ left: idx * w, behavior: "smooth" });
      setActiveDot(idx);
    };

    prevBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
      scrollToIndex(clamp(idx - 1, 0, imgs.length - 1));
    });
    nextBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
      scrollToIndex(clamp(idx + 1, 0, imgs.length - 1));
    });
    dots.forEach((d, i) => d.addEventListener("click", (e) => {
      e.stopPropagation();
      scrollToIndex(i);
    }));

    track.addEventListener(
      "scroll",
      debounce(() => {
        const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
        setActiveDot(clamp(idx, 0, imgs.length - 1));
      }, 70),
      { passive: true }
    );

    const settle = debounce(() => {
      const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
      scrollToIndex(clamp(idx, 0, Math.max(0, imgs.length - 1)));
    }, 90);

    track.addEventListener("touchend", settle, { passive: true });
    track.addEventListener("pointerup", settle, { passive: true });
    track.addEventListener("mouseleave", settle);

    track.querySelectorAll("img").forEach((img) => {
      img.draggable = false;
      img.alt = escapeHtml(title);
    });
  };

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";

    const counts = new Map();
    products.forEach((p) => counts.set(p.uiSection, (counts.get(p.uiSection) || 0) + 1));

    const frag = document.createDocumentFragment();
    CATEGORY_CONFIG.forEach((cat) => {
      const count = counts.get(cat.uiId) || 0;
      const card = document.createElement("button");
      card.className = "catcard hover-fx";
      card.type = "button";
      card.setAttribute("data-cat", cat.uiId);

      card.innerHTML = `
        <div class="catcard__bg" aria-hidden="true"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}" loading="lazy" decoding="async">
          <div class="catcard__meta">
            <div class="catcard__title tech-text">${escapeHtml(cat.name)}</div>
            <div class="catcard__sub">${count} productos</div>
          </div>
          <div class="catcard__btn">Explorar</div>
        </div>
      `;

      card.addEventListener("click", () => {
        $$(".catcard").forEach((x) => x.classList.remove("active"));
        card.classList.add("active");
        activeCategory = cat.uiId;
        searchQuery = "";
        sortMode = "featured";
        if (searchInput) searchInput.value = "";
        if (mobileSearchInput) mobileSearchInput.value = "";
        if (menuSearchInput) menuSearchInput.value = "";
        updateFilterUI();
        renderProducts();
        ensureProductSwipeHint();
        if (categoryHint) categoryHint.hidden = true;
        if (catalogCarouselSection) catalogCarouselSection.hidden = false;
        catalogCarouselSection?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      });

      frag.appendChild(card);
    });

    categoryGrid.appendChild(frag);
  };

  const renderProducts = () => {
    if (!productGrid) return;
    filteredProducts = getVisibleProducts();

    updateFilterUI();
    if (categoryHint) categoryHint.hidden = !!activeCategory;

    if (statusRow) {
      if (!activeCategory && !searchQuery) statusRow.textContent = "Selecciona una colección para ver productos.";
      else statusRow.textContent = `${filteredProducts.length} producto(s) encontrados.`;
    }

    productGrid.innerHTML = "";

    if (!filteredProducts.length) {
      productGrid.innerHTML = `
        <article class="glass-panel empty-state">
          <h3>Sin resultados</h3>
          <p class="hint">No encontré productos para ese filtro.</p>
        </article>
      `;
      ensureCarouselUX();
      return;
    }

    const frag = document.createDocumentFragment();

    for (const p of filteredProducts) {
      const card = document.createElement("article");
      card.className = "card glass-panel hover-fx";
      card.dataset.sku = String(p.sku || "");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.style.scrollSnapAlign = "start";

      const imgs = p.images?.length ? p.images : (p.img ? [p.img] : []);
      const trackImgs = imgs.map((src) => `<img src="${escapeHtml(safeUrl(src))}" width="400" height="500" loading="lazy" decoding="async" alt="${escapeHtml(p.title)}">`).join("");
      const dots = imgs.length > 1
        ? `<div class="card__dots">${imgs.map((_, i) => `<span class="card__dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div>`
        : `<div class="card__dots" hidden></div>`;

      const stockOk = Number(p.stock || 0) > 0 || p.stock == null;
      const badge = stockOk ? "Disponible" : "Agotado";

      card.innerHTML = `
        <div class="card__media">
          <div class="card__track custom-scrollbar" aria-label="Galería del producto">${trackImgs}</div>
          <button class="card__nav card__nav--prev" type="button" aria-label="Imagen anterior">←</button>
          <button class="card__nav card__nav--next" type="button" aria-label="Siguiente imagen">→</button>
          ${dots}
          ${imgs.length > 1 ? `<div class="card__swipe-hint">DESLIZA</div>` : `<div class="card__swipe-hint" style="opacity:0;"> </div>`}
        </div>

        <div class="card__body">
          <div class="card__title tech-text">${escapeHtml(p.title)}</div>
          <div class="card__row">
            <div class="card__meta">
              <span class="pill">${escapeHtml(badge)}</span>
              <span class="pill pill--logo">
                <img src="${escapeHtml(safeUrl(getLogoForSection(p.uiSection)))}" alt="Logo" width="30" height="16" loading="lazy" decoding="async">
              </span>
              ${p.collection ? `<span class="pill pill--red">${escapeHtml(p.collection)}</span>` : ""}
            </div>
            <div class="price">${money(p.priceCents)}</div>
          </div>
          <button class="btn btn--black card__action-btn hover-fx" type="button">Ver Detalle y Comprar</button>
        </div>
      `;

      card.querySelector(".card__action-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openProduct(p.sku);
      });
      card.addEventListener("click", () => openProduct(p.sku));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openProduct(p.sku);
      });
      mountCardCarousel(card, imgs, p.title);
      frag.appendChild(card);
    }

    productGrid.appendChild(frag);
    if (catalogCarouselSection) catalogCarouselSection.hidden = false;
  };

  const openProduct = (sku) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return;

    currentProduct = p;
    selectedQty = 1;
    selectedSize = "";

    if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
    if (pmTitle) pmTitle.textContent = p.title;
    if (pmPrice) pmPrice.textContent = money(p.priceCents);

    const stock = Number(p.stock);
    const outOfStock = Number.isFinite(stock) && stock <= 0;

    if (pmStockBadge) {
      if (Number.isFinite(stock)) {
        pmStockBadge.hidden = false;
        pmStockBadge.textContent = stock > 0 ? `Stock: ${stock}` : "AGOTADO";
        pmStockBadge.style.borderColor = stock > 0 ? "rgba(0,0,0,0.1)" : "var(--red)";
      } else {
        pmStockBadge.hidden = true;
      }
    }

    if (pmDesc) {
      const scarcity = getScarcityText(p);
      pmDesc.innerHTML = `
        <p>${escapeHtml(p.description || "Merch oficial Score Store.")}</p>
        ${scarcity ? `<p class="scarcity">${escapeHtml(scarcity)}</p>` : ""}
      `;
    }

    if (pmChips) {
      pmChips.innerHTML = `<span class="pill pill--logo"><img src="${escapeHtml(safeUrl(getLogoForSection(p.uiSection)))}" width="30" height="16" alt="Logo"></span>`;
      if (p.collection) pmChips.innerHTML += `<span class="pill pill--red">${escapeHtml(p.collection)}</span>`;
    }

    if (pmSizePills) {
      pmSizePills.innerHTML = "";
      const sizes = getProductSizes(p);

      sizes.forEach((s, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "size-pill";
        btn.textContent = s;

        if (outOfStock) {
          btn.classList.add("out-of-stock");
          btn.disabled = true;
        } else if (i === 0) {
          btn.classList.add("active");
          selectedSize = s;
        }

        btn.addEventListener("click", () => {
          $$(".size-pill", pmSizePills).forEach((x) => x.classList.remove("active"));
          btn.classList.add("active");
          selectedSize = s;
        });

        pmSizePills.appendChild(btn);
      });
    }

    if (pmCarousel) {
      const imgs = getProductImages(p);
      pmCarousel.innerHTML = `
        <div class="pm__frame">
          <div class="pm__track" id="pmTrack">
            ${imgs.map((src) => `<img src="${escapeHtml(safeUrl(src))}" width="900" height="1125" loading="lazy" alt="${escapeHtml(p.title)}">`).join("")}
          </div>
          ${imgs.length > 1 ? `
            <button class="pm__nav pm__nav--prev" type="button" aria-label="Imagen anterior">←</button>
            <button class="pm__nav pm__nav--next" type="button" aria-label="Siguiente imagen">→</button>
            <div class="pm__dots">${imgs.map((_, i) => `<button type="button" class="pm__dot ${i === 0 ? "active" : ""}" aria-label="Ir a imagen ${i + 1}"></button>`).join("")}</div>
          ` : ""}
        </div>
      `;

      const track = pmCarousel.querySelector("#pmTrack");
      const dots = Array.from(pmCarousel.querySelectorAll(".pm__dot"));
      const prev = pmCarousel.querySelector(".pm__nav--prev");
      const next = pmCarousel.querySelector(".pm__nav--next");

      const setDot = (idx) => dots.forEach((d, i) => d.classList.toggle("active", i === idx));
      const scrollToIndex = (idx) => {
        const w = track?.clientWidth || 1;
        track?.scrollTo({ left: idx * w, behavior: "smooth" });
        setDot(idx);
      };

      prev?.addEventListener("click", () => {
        const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
        scrollToIndex(clamp(idx - 1, 0, imgs.length - 1));
      });
      next?.addEventListener("click", () => {
        const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
        scrollToIndex(clamp(idx + 1, 0, imgs.length - 1));
      });
      dots.forEach((d, i) => d.addEventListener("click", () => scrollToIndex(i)));
      track?.addEventListener(
        "scroll",
        debounce(() => {
          const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
          setDot(clamp(idx, 0, Math.max(0, imgs.length - 1)));
        }, 70),
        { passive: true }
      );

      const snap = debounce(() => {
        const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
        scrollToIndex(clamp(idx, 0, Math.max(0, imgs.length - 1)));
      }, 90);

      track?.addEventListener("touchend", snap, { passive: true });
      track?.addEventListener("pointerup", snap, { passive: true });
      track?.addEventListener("mouseleave", snap);
    }

    if (pmAdd) pmAdd.disabled = outOfStock;
    openLayer(productModal);
  };

  const loadCartBadge = () => {
    if (cartCount) cartCount.textContent = String(cart.reduce((a, i) => a + Number(i.qty || 0), 0));
  };

  const getCartItemPrice = (item) => Number(item.priceCents ?? item.price_cents ?? item.price ?? 0) || 0;
  const getCartItemName = (item) => String(item.title ?? item.name ?? item.sku ?? "Producto");
  const getCartItemImage = (item) => safeUrl(item.image ?? item.img ?? item.image_url ?? "");
  const getCartItemSize = (item) => String(item.size ?? "Única");

  const computeSubtotal = () =>
    cart.reduce((sum, it) => sum + getCartItemPrice(it) * Number(it.qty || 0), 0);

  const computeDiscount = (subtotalCents) => {
    if (!activePromo) return 0;
    const type = normalizeCode(activePromo.type).toLowerCase();

    if (type === "percent" || type === "percentage") {
      const raw = Number(activePromo.value || 0);
      const frac = clamp(raw > 1 ? raw / 100 : raw, 0, 1);
      return Math.round(subtotalCents * frac);
    }

    if (type === "fixed" || type === "fixed_mxn") {
      return Math.min(subtotalCents, Math.round(Number(activePromo.value || 0) * 100));
    }

    return 0;
  };

  const getShippingAmountCents = () => {
    if (shipping.mode === "pickup") return 0;
    if (activePromo && normalizeCode(activePromo.type).toLowerCase() === "free_shipping") return 0;

    const q = shipping.quote || {};
    const cents = Number(
      q.amount_cents ??
      q.amountCents ??
      q.quote?.amount_cents ??
      q.quote?.amountCents ??
      0
    );
    return Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  };

  const refreshTotals = () => {
    const subtotal = computeSubtotal();
    const discount = computeDiscount(subtotal);
    const shippingCents = getShippingAmountCents();
    const total = Math.max(0, subtotal - discount + shippingCents);

    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subtotal);
    if (shippingLineEl) shippingLineEl.textContent = money(shippingCents);
    if (cartTotalEl) cartTotalEl.textContent = money(total);

    if (discountLineWrap && discountLineEl) {
      discountLineWrap.hidden = !(discount > 0);
      discountLineEl.textContent = `-${money(discount)}`;
    }

    if (checkoutBtn) checkoutBtn.disabled = !cart.length || !!siteSettings.maintenance_mode;
  };

  const renderCart = () => {
    loadCartBadge();

    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = "";

    if (!cart.length) {
      cartItemsEl.innerHTML = `<div class="hint" style="padding: 10px 0;">Tu carrito está vacío.</div>`;
      refreshTotals();
      return;
    }

    const frag = document.createDocumentFragment();

    cart.forEach((item, idx) => {
      const row = document.createElement("article");
      row.className = "cartitem";

      const title = getCartItemName(item);
      const priceCents = getCartItemPrice(item);

      row.innerHTML = `
        <div class="cartitem__media">
          ${getCartItemImage(item) ? `<img src="${escapeHtml(getCartItemImage(item))}" alt="${escapeHtml(title)}" />` : `<div class="product-card__placeholder">🏁</div>`}
        </div>
        <div class="cartitem__body">
          <div class="cartitem__title">${escapeHtml(title)}</div>
          <div class="cartitem__meta">${item.size ? `Talla: ${escapeHtml(getCartItemSize(item))} · ` : ""}${money(priceCents)}</div>
          <div class="cartitem__actions">
            <button type="button" class="qtybtn js-dec" aria-label="Quitar una unidad">−</button>
            <span class="qtytxt">${Number(item.qty || 0)}</span>
            <button type="button" class="qtybtn js-inc" aria-label="Agregar una unidad">+</button>
            <button type="button" class="linkbtn js-remove" aria-label="Eliminar del carrito">Eliminar</button>
          </div>
        </div>
      `;

      row.querySelector(".js-dec")?.addEventListener("click", () => {
        item.qty = Math.max(1, Number(item.qty || 1) - 1);
        persistCart();
        renderCart();
      });
      row.querySelector(".js-inc")?.addEventListener("click", () => {
        item.qty = Math.min(99, Number(item.qty || 1) + 1);
        persistCart();
        renderCart();
      });
      row.querySelector(".js-remove")?.addEventListener("click", () => {
        cart = cart.filter((x) => x !== item);
        persistCart();
        renderCart();
        showToast("Producto eliminado.", "ok");
      });

      frag.appendChild(row);
    });

    cartItemsEl.appendChild(frag);
    refreshTotals();
  };

  const validatePromo = () => {
    const code = normalizeCode(promoCode?.value || "");
    if (!code) {
      activePromo = null;
      refreshTotals();
      showToast("Escribe un código válido.", "error");
      return;
    }

    const rules = Array.isArray(promosData?.rules) ? promosData.rules : [];
    const rule = rules.find((x) => normalizeCode(x?.code) === code && !!x?.active);
    if (!rule) {
      activePromo = null;
      refreshTotals();
      showToast("Código inválido o expirado.", "error");
      return;
    }

    if (rule.expires_at && Date.now() > new Date(rule.expires_at).getTime()) {
      activePromo = null;
      refreshTotals();
      showToast("Código expirado.", "error");
      return;
    }

    const candidate = {
      code: normalizeText(rule.code),
      type: normalizeText(rule.type),
      value: Number(rule.value || 0),
      description: normalizeText(rule.description),
      min_amount_mxn: Number(rule.min_amount_mxn || 0),
    };

    if ((computeSubtotal() / 100) < candidate.min_amount_mxn) {
      activePromo = null;
      refreshTotals();
      showToast("Tu compra no alcanza el mínimo para ese código.", "error");
      return;
    }

    activePromo = candidate;
    refreshTotals();
    showToast(candidate.description || "Promoción aplicada.", "ok");
  };

  const syncShipModeInputs = () => {
    $$("[data-ship-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", normalizeText(btn.dataset.shipMode) === shipping.mode);
    });

    $$('input[name="shipMode"]').forEach((radio) => {
      radio.checked = normalizeText(radio.value) === shipping.mode;
    });
  };

  const refreshShippingUI = () => {
    syncShipModeInputs();

    if (shipping.mode === "pickup") {
      if (postalWrap) postalWrap.hidden = true;
      if (shipHint) shipHint.textContent = "Recoger en fábrica (Tijuana).";
      if (shippingNote) shippingNote.textContent = "Recolección sin costo en nuestras instalaciones.";
      shipping.quote = null;
      shipping.postal_code = "";
      if (postalCode) postalCode.value = "";
      saveShipping();
      refreshTotals();
      return;
    }

    if (postalWrap) postalWrap.hidden = false;
    if (shipHint) shipHint.textContent = shipping.mode === "envia_us" ? "Envío USA (Envía.com)" : "Envío México (Envía.com)";

    if (shipping.quote) {
      const q = shipping.quote;
      const label = normalizeText(q.label || q.service_name || "Envío");
      const cents = getShippingAmountCents();
      if (shippingNote) shippingNote.textContent = `${label}: ${money(cents)}`;
    } else {
      if (shippingNote) shippingNote.textContent = "Ingresa tu CP/ZIP y cotiza en vivo (Envía.com).";
    }

    refreshTotals();
  };

  const doQuote = async () => {
    const zip = normalizeText(postalCode?.value || "");
    if (!zip) return showToast("Escribe tu CP / ZIP.", "error");
    if (!cart.length) return showToast("Primero agrega productos al carrito.", "error");

    try {
      if (quoteBtn) {
        quoteBtn.disabled = true;
        quoteBtn.textContent = "Cotizando...";
      }

      const res = await fetch(API.quoteShipping, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postal_code: zip,
          country: shipping.mode === "envia_us" ? "US" : "MX",
          shipping_mode: shipping.mode,
          items: cart,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(j?.error || "No se pudo cotizar.");

      shipping.postal_code = zip;
      shipping.quote = j.quote || j;
      saveShipping();
      refreshShippingUI();
      showToast("Envío cotizado.", "ok");
    } catch (e) {
      shipping.quote = null;
      saveShipping();
      refreshShippingUI();
      showToast(String(e?.message || "No se pudo cotizar envío."), "error");
    } finally {
      if (quoteBtn) {
        quoteBtn.disabled = false;
        quoteBtn.textContent = "Cotizar";
      }
    }
  };

  const doCheckout = async () => {
    if (!cart.length) {
      showToast("Tu carrito está vacío.", "error");
      return;
    }

    if (siteSettings.maintenance_mode) {
      showToast("La tienda está en mantenimiento.", "error");
      return;
    }

    if (shipping.mode !== "pickup" && !shipping.quote) {
      showToast("Cotiza el envío antes de pagar.", "error");
      return;
    }

    try {
      setCheckoutLoading(true);
      if (checkoutMsg) {
        checkoutMsg.hidden = true;
        checkoutMsg.textContent = "";
      }

      const req_id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const payload = {
        req_id,
        items: cart.map((it) => ({
          sku: String(it.sku || "").trim(),
          title: String(it.title || it.name || "").trim(),
          qty: Number(it.qty || 1),
          size: String(it.size || "Unitalla").trim(),
          priceCents: Number(getCartItemPrice(it)),
          price_cents: Number(getCartItemPrice(it)),
        })),
        shipping_mode: shipping.mode,
        postal_code: String(postalCode?.value || shipping.postal_code || "").trim(),
        promo_code: String(promoCode?.value || activePromo?.code || "").trim(),
        quote: shipping.quote,
      };

      const res = await fetch(API.createCheckout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok || !j?.url) throw new Error(j?.error || "No se pudo iniciar el checkout.");

      location.href = j.url;
    } catch (e) {
      if (checkoutMsg) {
        checkoutMsg.hidden = false;
        checkoutMsg.textContent = String(e?.message || "No se pudo iniciar el checkout.");
      }
      showToast(String(e?.message || "No se pudo iniciar el checkout."), "error");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const appendAssistantBubble = (role, text) => {
    if (!assistantOutput) return;
    const item = document.createElement("div");
    item.className = `chat__bubble chat__bubble--${role}`;
    item.textContent = String(text || "");
    assistantOutput.appendChild(item);
    assistantOutput.scrollTop = assistantOutput.scrollHeight;
  };

  const sendAssistant = async () => {
    const message = normalizeText(assistantInput?.value || "");
    if (!message) return;

    appendAssistantBubble("user", message);
    if (assistantInput) assistantInput.value = "";

    try {
      const res = await fetch(API.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const j = await res.json().catch(() => null);
      appendAssistantBubble("assistant", j?.reply || "No tuve una respuesta disponible.");
    } catch {
      appendAssistantBubble("assistant", "No pude conectarme con el asistente en este momento.");
    }
  };

  const initCookieBanner = () => {
    if (!cookieBanner) return;
    const stored = localStorage.getItem(STORAGE_KEYS.consent);
    if (stored) {
      cookieBanner.hidden = true;
      return;
    }

    cookieBanner.hidden = false;
    cookieAccept?.addEventListener("click", () => {
      setCookieConsent("accept");
      cookieBanner.hidden = true;
      if (siteSettings.pixel_id) loadMetaPixel(siteSettings.pixel_id);
    });
    cookieReject?.addEventListener("click", () => {
      setCookieConsent("reject");
      cookieBanner.hidden = true;
    });
  };

  const initNeuromarketing = () => {
    if (!salesNotification || !salesName || !salesAction) return;
    const names = ["Alex", "María", "Chris", "Fernanda", "Luis", "Sofía", "Diego", "Ana", "Jorge", "Daniela"];
    const actions = ["compró un hoodie", "compró una gorra", "compró una camiseta", "compró una chamarra", "compró mercancía oficial"];
    const tick = () => {
      if (document.hidden) return;
      salesName.textContent = names[Math.floor(Math.random() * names.length)];
      salesAction.textContent = actions[Math.floor(Math.random() * actions.length)];
      salesNotification.hidden = false;
      salesNotification.classList.add("is-visible");
      setTimeout(() => {
        salesNotification.classList.remove("is-visible");
        setTimeout(() => {
          salesNotification.hidden = true;
        }, 180);
      }, 3200);
    };
    setTimeout(() => {
      tick();
      setInterval(tick, 18000);
    }, 7000);
  };

  const registerServiceWorker = async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    let refreshing = false;

    const activateWaitingWorker = (registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

      if (registration.waiting) {
        activateWaitingWorker(registration);
      }

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker(registration);
          }
        });
      });

      try {
        await navigator.serviceWorker.ready;
      } catch {}

      try {
        await registration.update();
      } catch {}
    } catch (err) {
      console.error("SW register error:", err);
    }
  };

  const runSalesAmbient = () => {
    if (!salesNotification || !salesName || !salesAction) return;

    const salesPool = [
      ["Tijuana", "acaba de comprar una hoodie oficial"],
      ["Ensenada", "agregó merch SCORE a su carrito"],
      ["Mexicali", "confirmó una compra con Stripe"],
      ["San Diego", "cotizó envío internacional"],
    ];

    setInterval(() => {
      const [name, action] = salesPool[Math.floor(Math.random() * salesPool.length)];
      salesName.textContent = name;
      salesAction.textContent = action;
      salesNotification.hidden = false;
      salesNotification.classList.add("is-visible");
      setTimeout(() => {
        salesNotification.classList.remove("is-visible");
        setTimeout(() => {
          salesNotification.hidden = true;
        }, 180);
      }, 3200);
    }, 18000);
  };

  const bindEvents = () => {
    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));
    navOpenAssistant?.addEventListener("click", () => {
      closeLayer(sideMenu);
      openLayer(assistantModal);
    });
    navOpenCart?.addEventListener("click", () => {
      closeLayer(sideMenu);
      openLayer(cartDrawer);
      refreshShippingUI();
      renderCart();
    });

    openCartBtn?.addEventListener("click", () => {
      openLayer(cartDrawer);
      refreshShippingUI();
      renderCart();
    });
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));

    openAssistantBtn?.addEventListener("click", () => {
      openLayer(assistantModal);
      if (assistantOutput && assistantOutput.childElementCount === 0) {
        appendAssistantBubble("assistant", "Hola. Soy el asistente de SCORE STORE. ¿Qué buscas hoy?");
      }
    });
    floatingAssistantBtn?.addEventListener("click", () => {
      openLayer(assistantModal);
      if (assistantOutput && assistantOutput.childElementCount === 0) {
        appendAssistantBubble("assistant", "Hola. Soy el asistente de SCORE STORE. ¿Qué buscas hoy?");
      }
    });
    assistantClose?.addEventListener("click", () => closeLayer(assistantModal));
    assistantSendBtn?.addEventListener("click", sendAssistant);
    assistantInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAssistant();
    });

    overlay?.addEventListener("click", () => {
      closeLayer(sideMenu);
      closeLayer(cartDrawer);
      closeLayer(assistantModal);
      closeLayer(productModal);
      closeLayer(sizeGuideModal);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closeLayer(sideMenu);
      closeLayer(cartDrawer);
      closeLayer(assistantModal);
      closeLayer(productModal);
      closeLayer(sizeGuideModal);
    });

    scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    window.addEventListener("scroll", () => {
      if (!scrollTopBtn) return;
      scrollTopBtn.classList.toggle("is-visible", window.scrollY > 500);
    });

    scrollToCategoriesBtn?.addEventListener("click", () => smoothScrollTo("#categories"));
    scrollLeftBtn?.addEventListener("click", () => productGrid?.scrollBy({ left: -getTrackStep(), behavior: "smooth" }));
    scrollRightBtn?.addEventListener("click", () => productGrid?.scrollBy({ left: getTrackStep(), behavior: "smooth" }));

    productGrid?.addEventListener(
      "touchend",
      debounce(() => {
        const step = getTrackStep();
        const idx = Math.round((productGrid.scrollLeft || 0) / step);
        productGrid.scrollTo({ left: idx * step, behavior: "smooth" });
        try {
          localStorage.setItem(STORAGE_KEYS.seenSwipe, "1");
        } catch {}
      }, 120),
      { passive: true }
    );

    productGrid?.addEventListener(
      "pointerup",
      debounce(() => {
        const step = getTrackStep();
        const idx = Math.round((productGrid.scrollLeft || 0) / step);
        productGrid.scrollTo({ left: idx * step, behavior: "smooth" });
        try {
          localStorage.setItem(STORAGE_KEYS.seenSwipe, "1");
        } catch {}
      }, 120),
      { passive: true }
    );

    sortSelect?.addEventListener("change", () => {
      sortMode = String(sortSelect.value || "featured");
      renderProducts();
    });

    clearFilterBtn?.addEventListener("click", () => {
      activeCategory = null;
      searchQuery = "";
      $$(".catcard").forEach((x) => x.classList.remove("active"));
      if (searchInput) searchInput.value = "";
      if (mobileSearchInput) mobileSearchInput.value = "";
      if (menuSearchInput) menuSearchInput.value = "";
      updateFilterUI();
      renderProducts();
      ensureProductSwipeHint();
    });

    const triggerSearch = debounce(() => {
      searchQuery = String(searchInput?.value || mobileSearchInput?.value || menuSearchInput?.value || "").trim();
      if (searchQuery && catalogCarouselSection) catalogCarouselSection.hidden = false;
      updateFilterUI();
      renderProducts();
      ensureProductSwipeHint();
    }, 220);

    searchInput?.addEventListener("input", () => {
      if (mobileSearchInput) mobileSearchInput.value = searchInput.value;
      if (menuSearchInput) menuSearchInput.value = searchInput.value;
      triggerSearch();
    });

    mobileSearchInput?.addEventListener("input", () => {
      if (searchInput) searchInput.value = mobileSearchInput.value;
      if (menuSearchInput) menuSearchInput.value = mobileSearchInput.value;
      triggerSearch();
    });

    menuSearchInput?.addEventListener("input", () => {
      if (searchInput) searchInput.value = menuSearchInput.value;
      if (mobileSearchInput) mobileSearchInput.value = menuSearchInput.value;
      triggerSearch();
      closeLayer(sideMenu);
    });

    mobileSearchBtn?.addEventListener("click", () => {
      if (!mobileSearchWrap) return;
      mobileSearchWrap.hidden = false;
      mobileSearchInput?.focus();
    });

    closeMobileSearchBtn?.addEventListener("click", () => {
      if (mobileSearchWrap) mobileSearchWrap.hidden = true;
    });

    pmClose?.addEventListener("click", () => closeLayer(productModal));
    pmBackBtn?.addEventListener("click", () => closeLayer(productModal));

    pmQtyDec?.addEventListener("click", () => {
      selectedQty = clamp(selectedQty - 1, 1, 99);
      if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
    });

    pmQtyInc?.addEventListener("click", () => {
      selectedQty = clamp(selectedQty + 1, 1, 99);
      if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
    });

    openSizeGuideBtn?.addEventListener("click", () => openLayer(sizeGuideModal));
    closeSizeGuideBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));
    understandSizeBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));

    pmAdd?.addEventListener("click", () => {
      if (!currentProduct) return;
      if (currentProduct.sizes?.length && !selectedSize) {
        showToast("Selecciona una talla.", "error");
        return;
      }

      const sizeKey = selectedSize || "Única";
      const existing = cart.find((x) => x.sku === currentProduct.sku && String(x.size || "") === String(sizeKey));
      const payload = {
        sku: currentProduct.sku,
        title: currentProduct.title,
        name: currentProduct.title,
        priceCents: currentProduct.priceCents,
        price_cents: currentProduct.priceCents,
        image: currentProduct.img || currentProduct.images?.[0] || "",
        size: sizeKey,
        qty: selectedQty,
      };

      if (existing) existing.qty = Math.min(99, Number(existing.qty || 1) + selectedQty);
      else cart.push(payload);

      persistCart();
      renderCart();
      refreshShippingUI();
      showToast("Agregado al carrito.", "ok");
      closeLayer(productModal);
      openLayer(cartDrawer);
    });

    pmShareBtn?.addEventListener("click", async () => {
      if (!currentProduct) return;
      const url = `${location.origin}${location.pathname}#sku=${encodeURIComponent(currentProduct.sku)}`;
      try {
        if (navigator.share) await navigator.share({ title: currentProduct.title, url });
        else {
          await navigator.clipboard.writeText(url);
          showToast("Link copiado.", "ok");
        }
      } catch {}
    });

    $$("[data-ship-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        shipping.mode = normalizeText(btn.dataset.shipMode || "pickup");
        shipping.quote = null;
        shipping.postal_code = "";
        saveShipping();
        refreshShippingUI();
      });
    });

    $$('input[name="shipMode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        shipping.mode = String(radio.value || "pickup");
        shipping.quote = null;
        shipping.postal_code = "";
        saveShipping();
        refreshShippingUI();
      });
    });

    postalCode?.addEventListener("input", () => {
      shipping.postal_code = normalizeText(postalCode.value || "");
      saveShipping();
    });

    quoteBtn?.addEventListener("click", doQuote);
    applyPromoBtn?.addEventListener("click", validatePromo);
    promoCode?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") validatePromo();
    });

    continueShoppingBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    checkoutBtn?.addEventListener("click", doCheckout);

    promoBarClose?.addEventListener("click", () => {
      if (promoBar) promoBar.hidden = true;
      try {
        localStorage.setItem(STORAGE_KEYS.promoDismiss, "1");
      } catch {}
    });
  };

  const applyShipModeUi = () => {
    syncShipModeInputs();

    if (postalWrap) {
      postalWrap.hidden = shipping.mode === "pickup";
    }

    if (shipHint) {
      if (shipping.mode === "pickup") shipHint.textContent = "Recoger en fábrica (Tijuana).";
      if (shipping.mode === "envia_mx") shipHint.textContent = "Cotización nacional MX por código postal.";
      if (shipping.mode === "envia_us") shipHint.textContent = "Cotización USA por ZIP Code.";
    }

    refreshTotals();
  };

  const boot = async () => {
    try {
      if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;

      initCookieBanner();
      restoreCart();
      loadShipping();
      renderCart();
      applyShipModeUi();

      await fetchSiteSettings();
      await fetchPromos();
      await fetchCatalog();

      catalog = { products, categories: CATEGORY_CONFIG };

      products = (catalog?.products?.length ? catalog.products : products).map(normalizeProduct);
      filteredProducts = [...products];

      renderCategories();
      renderProducts();
      updateFilterUI();
      initNeuromarketing();
      bindEvents();
      await registerServiceWorker();

      if (location.hash.startsWith("#sku=")) {
        const sku = decodeURIComponent(location.hash.replace("#sku=", ""));
        const maybeOpen = () => {
          const p = products.find((x) => String(x.sku || "") === sku);
          if (p) openProduct(sku);
        };
        setTimeout(maybeOpen, 200);
      }
    } catch (e) {
      console.error(e);
      showToast("No pude cargar la tienda completa.", "error", 3200);
    } finally {
      setTimeout(() => {
        if (splash) {
          splash.classList.add("is-out");
          setTimeout(() => {
            splash.hidden = true;
          }, 700);
        }
      }, 350);
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();