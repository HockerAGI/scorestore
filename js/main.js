/* =========================================================
   SCORE STORE — FUSION MAIN
   Base visual: deploy bueno
   Base funcional: repo actual
   Build: 2026-03-09
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.03.09.FUSION";
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
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const safeUrl = (u) => {
    let s = String(u || "").trim();
    if (!s) return "";

    if (/^https?:\/\//i.test(s) || s.startsWith("data:")) return s;

    s = s.replace(/\\/g, "/");
    s = s.replace(/^\.?\//, "");

    s = s
      .replaceAll("assets/BAJA_500/", "assets/BAJA500/")
      .replaceAll("assets/BAJA_400/", "assets/BAJA400/")
      .replaceAll("assets/SF_250/", "assets/SF250/")
      .replaceAll("assets/BAJA_1000/", "assets/EDICION_2025/")
      .replaceAll("assets/baja500/", "assets/BAJA500/")
      .replaceAll("assets/baja400/", "assets/BAJA400/")
      .replaceAll("assets/sf250/", "assets/SF250/")
      .replaceAll("assets/edicion_2025/", "assets/EDICION_2025/")
      .replaceAll("assets/otras_ediciones/", "assets/OTRAS_EDICIONES/")
      .replaceAll("camiseta-cafe-oscuro-baja400", "camiseta-cafe- oscuro-baja400")
      .replaceAll("camiseta-negra-sinmangas-sf250", "camiseta-negra-sinmangas-SF250")
      .replaceAll("camiseta-negra-sinmangas-s250-atras", "camiseta-negra-sinmangas-S250-atras")
      .replaceAll("camiseta-negra-sinmangas-s250-detalles", "camiseta-negra-sinmangas-S250-detalles");

    return `/${s.replace(/^\/+/, "")}`;
  };

  const uniqStrings = (items) => {
    const out = [];
    const seen = new Set();

    for (const item of Array.isArray(items) ? items : []) {
      const s = String(item || "").trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }

    return out;
  };

  const CATEGORY_CONFIG = [
    { id: "BAJA1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp", mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES"] },
    { id: "BAJA500", title: "BAJA 500", logo: "/assets/logo-baja500.webp", mapFrom: ["BAJA500", "BAJA_500"] },
    { id: "BAJA400", title: "BAJA 400", logo: "/assets/logo-baja400.webp", mapFrom: ["BAJA400", "BAJA_400"] },
    { id: "SF250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp", mapFrom: ["SF250", "SF_250"] },
  ];

  const normalizeUiSection = (value) => {
    const sid = String(value || "").trim().toUpperCase();
    const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
    return found ? found.id : "BAJA1000";
  };

  const getCategoryMeta = (id) =>
    CATEGORY_CONFIG.find((x) => x.id === id) || CATEGORY_CONFIG[0];

  const STORAGE_KEYS = {
    cart: "scorestore_cart_v3_fusion",
    consent: "scorestore_consent_v3",
    seenSwipe: "scorestore_seen_product_swipe_v3",
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

  const cookieBanner = $("#cookieBanner");
  const cookieAccept = $("#cookieAccept");
  const cookieReject = $("#cookieReject");

  const scrollTopBtn = $("#scrollTopBtn");
  const salesNotification = $("#salesNotification");
  const salesName = $("#salesName");
  const salesAction = $("#salesAction");

  const appVersionLabel = $("#appVersionLabel");

  const productModal = $("#productModal");
  const pmBackBtn = $("#pmBackBtn");
  const pmClose = $("#pmClose");
  const pmTitle = $("#pmTitle");
  const pmCarousel = $("#pmCarousel");
  const pmChips = $("#pmChips");
  const pmPrice = $("#pmPrice");
  const pmDesc = $("#pmDesc");
  const pmStockBadge = $("#pmStockBadge");
  const pmSizePills = $("#pmSizePills");
  const pmQtyDec = $("#pmQtyDec");
  const pmQtyInc = $("#pmQtyInc");
  const pmQtyDisplay = $("#pmQtyDisplay");
  const pmAdd = $("#pmAdd");
  const pmShareBtn = $("#pmShareBtn");

  const sizeGuideModal = $("#sizeGuideModal");
  const openSizeGuideBtn = $("#openSizeGuideBtn");
  const closeSizeGuideBtn = $("#closeSizeGuideBtn");
  const understandSizeBtn = $("#understandSizeBtn");

  const toast = $("#toast");

  let categories = [];
  let products = [];
  let activeCategory = null;
  let searchQuery = "";
  let sortMode = "featured";

  let currentProduct = null;
  let currentQty = 1;
  let currentSize = null;

  let activePromo = null;
  let shipMode = "pickup";
  let shippingQuoted = 0;
  let shippingMeta = null;
  let cart = [];

  const siteSettings = {
    promo_active: false,
    promo_text: "",
    maintenance_mode: false,
    home: { footer_note: "", shipping_note: "" },
    socials: { facebook: "", instagram: "", youtube: "" },
    contact: {
      email: "ventas.unicotextil@gmail.com",
      whatsapp_e164: "5216642368701",
      whatsapp_display: "664 236 8701",
    },
  };

  const showToast = (msg, type = "ok", timeout = 2600) => {
    if (!toast) return;
    toast.textContent = String(msg || "");
    toast.hidden = false;
    toast.setAttribute("data-type", type);
    toast.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => (toast.hidden = true), 180);
    }, timeout);
  };

  const openOverlay = () => {
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add("no-scroll");
  };

  const closeOverlay = () => {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove("no-scroll");
  };

  const openDrawer = (el) => {
    if (!el) return;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-open"));
    openOverlay();
  };

  const closeDrawer = (el) => {
    if (!el) return;
    el.classList.remove("is-open");
    setTimeout(() => {
      el.hidden = true;
      if (
        !assistantModal?.classList.contains("is-open") &&
        !productModal?.classList.contains("is-open") &&
        !sizeGuideModal?.classList.contains("is-open")
      ) {
        closeOverlay();
      }
    }, 180);
  };

  const openModal = (el) => {
    if (!el) return;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-open"));
    openOverlay();
  };

  const closeModal = (el) => {
    if (!el) return;
    el.classList.remove("is-open");
    setTimeout(() => {
      el.hidden = true;
      if (
        !sideMenu?.classList.contains("is-open") &&
        !cartDrawer?.classList.contains("is-open") &&
        !assistantModal?.classList.contains("is-open") &&
        !productModal?.classList.contains("is-open") &&
        !sizeGuideModal?.classList.contains("is-open")
      ) {
        closeOverlay();
      }
    }, 180);
  };

  const persistCart = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
    } catch {}
  };

  const restoreCart = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cart);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cart = parsed;
    } catch {}
  };

  const setCookieConsent = (value) => {
    try {
      localStorage.setItem(STORAGE_KEYS.consent, value);
    } catch {}
  };

  const initCookieBanner = () => {
    if (!cookieBanner || localStorage.getItem(STORAGE_KEYS.consent)) {
      if (cookieBanner) cookieBanner.hidden = true;
      return;
    }

    cookieBanner.hidden = false;

    cookieAccept?.addEventListener("click", () => {
      setCookieConsent("accepted");
      cookieBanner.hidden = true;
    });

    cookieReject?.addEventListener("click", () => {
      setCookieConsent("rejected");
      cookieBanner.hidden = true;
    });
  };

  const setCheckoutLoading = (on) => {
    if (!checkoutLoader) return;
    checkoutLoader.hidden = !on;
  };

  const setStatus = (msg) => {
    if (!statusRow) return;
    statusRow.textContent = String(msg || "");
  };

  const getProductName = (p) => String(p?.name || p?.title || "Producto SCORE");

  const getProductImages = (p) => {
    const list = Array.isArray(p?.images) ? p.images.filter(Boolean).map(safeUrl) : [];
    const primary = safeUrl(p?.image_url || p?.img || p?.image || list[0] || "");
    return uniqStrings(list.length ? list : primary ? [primary] : []);
  };

  const getProductImage = (p) => getProductImages(p)[0] || "";

  const getProductSizes = (p) => {
    const list = Array.isArray(p?.sizes) ? p.sizes.filter(Boolean).map(String) : [];
    return list.length ? list : ["Única"];
  };

  const getProductPriceCents = (p) => {
    const a = Number(p?.price_cents);
    if (Number.isFinite(a) && a > 0) return Math.round(a);

    const b = Number(p?.price_mxn);
    if (Number.isFinite(b) && b > 0) return Math.round(b * 100);

    const c = Number(p?.base_mxn);
    if (Number.isFinite(c) && c > 0) return Math.round(c * 100);

    return 0;
  };

  const applyFooterAndPromo = () => {
    if (footerNote) {
      footerNote.textContent = siteSettings.home?.footer_note || "Merch oficial de SCORE International.";
    }

    if (footerEmailLink && footerEmailText) {
      const email = String(siteSettings.contact?.email || "").trim();
      if (email) {
        footerEmailLink.href = `mailto:${email}`;
        footerEmailText.textContent = email;
      }
    }

    if (footerWhatsappLink && footerWhatsappText) {
      const waE164 = String(siteSettings.contact?.whatsapp_e164 || "").trim();
      const waDisplay = String(siteSettings.contact?.whatsapp_display || "").trim();
      if (waE164) footerWhatsappLink.href = `https://wa.me/${encodeURIComponent(waE164)}`;
      if (waDisplay) footerWhatsappText.textContent = waDisplay;
    }

    if (footerFacebookLink && siteSettings.socials?.facebook) footerFacebookLink.href = siteSettings.socials.facebook;
    if (footerInstagramLink && siteSettings.socials?.instagram) footerInstagramLink.href = siteSettings.socials.instagram;
    if (footerYoutubeLink && siteSettings.socials?.youtube) footerYoutubeLink.href = siteSettings.socials.youtube;

    if (promoBar && promoBarText) {
      const enabled = !!siteSettings.promo_active && String(siteSettings.promo_text || "").trim();
      promoBar.hidden = !enabled;
      promoBarText.textContent = enabled ? String(siteSettings.promo_text || "") : "";
    }

    if (shippingNote) {
      shippingNote.textContent = String(siteSettings.home?.shipping_note || "");
    }

    if (checkoutBtn) checkoutBtn.disabled = !!siteSettings.maintenance_mode || !cart.length;
  };

  const fetchSiteSettings = async () => {
    try {
      const res = await fetch("/.netlify/functions/site_settings", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!data || !data.ok) return;
      Object.assign(siteSettings, data);
      applyFooterAndPromo();
    } catch {}
  };

  const normalizeCategory = (row) => {
    const raw = String(row?.section_id || row?.sectionId || row?.id || "BAJA1000");
    const uiId = normalizeUiSection(raw);
    const meta = getCategoryMeta(uiId);

    return {
      id: uiId,
      section_id: uiId,
      sectionId: raw,
      name: String(row?.name || row?.title || meta.title),
      title: String(row?.title || row?.name || meta.title),
      logo: safeUrl(row?.logo || meta.logo),
      image: safeUrl(row?.image || row?.cover_image || row?.coverImage || meta.logo),
      count: Number.isFinite(Number(row?.count)) ? Number(row.count) : 0,
    };
  };

  const normalizeProduct = (row) => {
    const rawSection = String(row?.section_id || row?.sectionId || "BAJA1000");
    const uiSection = normalizeUiSection(rawSection);

    return {
      ...row,
      sku: String(row?.sku || ""),
      name: String(row?.name || row?.title || "Producto SCORE"),
      title: String(row?.title || row?.name || "Producto SCORE"),
      section_id: uiSection,
      sectionId: rawSection,
      uiSection,
      sub_section: String(row?.sub_section || row?.collection || ""),
      collection: String(row?.collection || row?.sub_section || ""),
      image_url: safeUrl(row?.image_url || row?.img || row?.image || ""),
      img: safeUrl(row?.img || row?.image_url || row?.image || ""),
      image: safeUrl(row?.image || row?.image_url || row?.img || ""),
      images: Array.isArray(row?.images) ? row.images.map(safeUrl).filter(Boolean) : [],
      sizes: Array.isArray(row?.sizes) ? row.sizes : [],
      rank: Number.isFinite(Number(row?.rank)) ? Number(row.rank) : 999,
      stock: row?.stock == null ? null : Number(row.stock),
    };
  };

  const normalizePayload = (payload) => {
    const data = payload && typeof payload === "object" ? payload : {};
    return {
      categories: Array.isArray(data.categories)
        ? data.categories
        : Array.isArray(data.sections)
          ? data.sections
          : [],
      products: Array.isArray(data.products) ? data.products : [],
    };
  };

  const buildCategoryCards = (inputCategories, inputProducts) => {
    const map = new Map();

    CATEGORY_CONFIG.forEach((cfg) => {
      map.set(cfg.id, {
        id: cfg.id,
        section_id: cfg.id,
        sectionId: cfg.id,
        name: cfg.title,
        title: cfg.title,
        logo: safeUrl(cfg.logo),
        image: safeUrl(cfg.logo),
        count: 0,
      });
    });

    for (const cat of inputCategories.map(normalizeCategory)) {
      const existing = map.get(cat.id) || {};
      map.set(cat.id, {
        ...existing,
        ...cat,
        logo: cat.logo || existing.logo || "",
        image: cat.image || existing.image || "",
      });
    }

    for (const p of inputProducts.map(normalizeProduct)) {
      const key = p.section_id || "BAJA1000";
      if (!map.has(key)) {
        const meta = getCategoryMeta(key);
        map.set(key, {
          id: key,
          section_id: key,
          sectionId: key,
          name: meta.title,
          title: meta.title,
          logo: safeUrl(meta.logo),
          image: safeUrl(meta.logo),
          count: 0,
        });
      }
      map.get(key).count += 1;
    }

    return CATEGORY_CONFIG.map((cfg) => map.get(cfg.id)).filter(Boolean);
  };

  const loadCatalog = async () => {
    const [catalogRes, fallbackRes] = await Promise.all([
      fetch("/.netlify/functions/catalog", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/data/catalog.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);

    const apiData = catalogRes?.ok ? normalizePayload(catalogRes) : null;
    const fallbackData = normalizePayload(fallbackRes);
    const source = apiData && apiData.products.length ? apiData : fallbackData;

    products = source.products.map(normalizeProduct);
    categories = buildCategoryCards(source.categories, source.products);
  };

  const applySort = (list) => {
    const arr = Array.isArray(list) ? [...list] : [];
    if (sortMode === "price_asc") return arr.sort((a, b) => getProductPriceCents(a) - getProductPriceCents(b));
    if (sortMode === "price_desc") return arr.sort((a, b) => getProductPriceCents(b) - getProductPriceCents(a));
    if (sortMode === "name_asc") return arr.sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es"));
    return arr.sort((a, b) => (Number(a.rank || 999) - Number(b.rank || 999)) || getProductName(a).localeCompare(getProductName(b), "es"));
  };

  const updateFilterUI = () => {
    const catLabel = activeCategory ? (getCategoryMeta(activeCategory)?.title || activeCategory) : "";
    const hasSearch = !!String(searchQuery || "").trim();

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

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";

    const frag = document.createDocumentFragment();
    for (const cat of categories) {
      const count = Number(cat.count || 0);
      const card = document.createElement("button");
      card.className = "catcard hover-fx";
      card.type = "button";
      card.setAttribute("data-cat", cat.id);

      card.innerHTML = `
        <div class="catcard__bg" aria-hidden="true"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.title || cat.name)}" loading="lazy" decoding="async">
          <div class="catcard__meta">
            <div class="catcard__title tech-text">${escapeHtml(cat.title || cat.name)}</div>
            <div class="catcard__sub">${count} productos</div>
          </div>
          <div class="catcard__btn">Explorar</div>
        </div>
      `;

      card.addEventListener("click", () => {
        $$(".catcard").forEach((x) => x.classList.remove("active"));
        card.classList.add("active");

        activeCategory = cat.id;
        searchQuery = "";
        sortMode = "featured";
        if (searchInput) searchInput.value = "";
        if (mobileSearchInput) mobileSearchInput.value = "";
        if (menuSearchInput) menuSearchInput.value = "";
        if (sortSelect) sortSelect.value = "featured";

        updateFilterUI();
        renderProducts();
        ensureProductSwipeHint();

        if (categoryHint) categoryHint.hidden = true;
        if (catalogCarouselSection) catalogCarouselSection.hidden = false;
        catalogCarouselSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      frag.appendChild(card);
    }

    categoryGrid.appendChild(frag);
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

    dots.forEach((d, i) =>
      d.addEventListener("click", (e) => {
        e.stopPropagation();
        scrollToIndex(i);
      })
    );

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
      scrollToIndex(clamp(idx, 0, imgs.length - 1));
    }, 90);

    track.addEventListener("touchend", settle, { passive: true });
    track.addEventListener("pointerup", settle, { passive: true });
    track.addEventListener("mouseleave", settle);

    track.querySelectorAll("img").forEach((img) => {
      img.setAttribute("draggable", "false");
      img.setAttribute("alt", escapeHtml(title));
    });
  };

  const renderProducts = () => {
    if (!productGrid) return;

    const q = String(searchQuery || "").trim().toLowerCase();
    let list = products;

    if (activeCategory) list = list.filter((p) => p.section_id === activeCategory);
    if (q) list = list.filter((p) => `${p.title} ${p.sku} ${p.collection} ${p.sub_section}`.toLowerCase().includes(q));
    list = applySort(list);

    updateFilterUI();

    if (statusRow) {
      if (!activeCategory && !q) statusRow.textContent = "Selecciona una colección para ver productos.";
      else statusRow.textContent = `${list.length} productos disponibles`;
    }

    productGrid.innerHTML = "";

    if (list.length === 0) {
      productGrid.innerHTML = `<div class="hint" style="padding:18px; text-align:center;">Sin resultados para tu búsqueda.</div>`;
      if (catalogCarouselSection) catalogCarouselSection.hidden = false;
      return;
    }

    const frag = document.createDocumentFragment();

    for (const p of list) {
      const imgs = getProductImages(p);
      const available = Number(p.stock || 0) > 0 || p.stock == null;
      const logo = safeUrl(getCategoryMeta(p.section_id).logo);

      const card = document.createElement("article");
      card.className = "card product-card glass-panel hover-fx";
      card.tabIndex = 0;
      card.setAttribute("data-sku", p.sku);

      card.innerHTML = `
        <div class="card__media">
          <div class="card__track custom-scrollbar">
            ${imgs.map((src, i) => `
              <div class="card__slide" data-idx="${i}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">
              </div>
            `).join("")}
          </div>
          ${
            imgs.length > 1
              ? `
              <button class="card__nav card__nav--prev" type="button" aria-label="Imagen anterior">‹</button>
              <button class="card__nav card__nav--next" type="button" aria-label="Imagen siguiente">›</button>
              <div class="card__dots">
                ${imgs.map((_, i) => `<button class="card__dot ${i === 0 ? "active" : ""}" type="button" aria-label="Ir a imagen ${i + 1}"></button>`).join("")}
              </div>
            `
              : ""
          }
          <div class="card__badge ${available ? "" : "is-off"}">${available ? "Disponible" : "Agotado"}</div>
        </div>

        <div class="card__body">
          <div class="card__title tech-text">${escapeHtml(p.title)}</div>
          <div class="card__row">
            <div class="card__meta" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="pill pill--logo">
                <img src="${escapeHtml(logo)}" alt="Logo" width="30" height="16" loading="lazy" decoding="async">
              </span>
              ${p.collection ? `<span class="pill pill--red">${escapeHtml(p.collection)}</span>` : ""}
            </div>
            <div class="price">${money(getProductPriceCents(p))}</div>
          </div>
          <button class="btn btn--black card__action-btn hover-fx" type="button" aria-label="Ver detalles y comprar">Ver Detalles y Comprar</button>
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

  const ensureProductSwipeHint = () => {
    const wrap = productGrid?.parentElement;
    if (!wrap) return;

    try {
      const seen = localStorage.getItem(STORAGE_KEYS.seenSwipe) === "1";
      if (seen) {
        document.getElementById("productSwipeHint")?.remove();
        return;
      }
    } catch {}

    let hint = document.getElementById("productSwipeHint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "productSwipeHint";
      hint.className = "product-swipe-hint is-pulse";
      hint.innerHTML = `<span>Desliza para ver más</span><span class="product-swipe-hint__arr">→</span>`;
      wrap.appendChild(hint);
    }

    const hideHint = () => {
      hint?.classList.add("is-hide");
      setTimeout(() => hint?.remove(), 300);
      try { localStorage.setItem(STORAGE_KEYS.seenSwipe, "1"); } catch {}
      productGrid?.removeEventListener("scroll", hideHintScroll, { passive: true });
    };

    const hideHintScroll = debounce(hideHint, 40);
    productGrid?.addEventListener("scroll", hideHintScroll, { passive: true });
  };

  const scrollProductTrack = (dir) => {
    if (!productGrid) return;
    const amount = Math.max(280, Math.round(productGrid.clientWidth * 0.75));
    productGrid.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  searchInput?.addEventListener("input", debounce((e) => {
    searchQuery = String(e.target.value || "").trim();
    if (mobileSearchInput) mobileSearchInput.value = searchQuery;
    if (menuSearchInput) menuSearchInput.value = searchQuery;
    renderProducts();
  }, 120));

  mobileSearchInput?.addEventListener("input", debounce((e) => {
    searchQuery = String(e.target.value || "").trim();
    if (searchInput) searchInput.value = searchQuery;
    if (menuSearchInput) menuSearchInput.value = searchQuery;
    renderProducts();
  }, 120));

  menuSearchInput?.addEventListener("input", debounce((e) => {
    searchQuery = String(e.target.value || "").trim();
    if (searchInput) searchInput.value = searchQuery;
    if (mobileSearchInput) mobileSearchInput.value = searchQuery;
    renderProducts();
  }, 120));

  sortSelect?.addEventListener("change", () => {
    sortMode = String(sortSelect.value || "featured");
    renderProducts();
  });

  clearFilterBtn?.addEventListener("click", () => {
    activeCategory = null;
    searchQuery = "";
    sortMode = "featured";
    if (sortSelect) sortSelect.value = "featured";
    if (searchInput) searchInput.value = "";
    if (mobileSearchInput) mobileSearchInput.value = "";
    if (menuSearchInput) menuSearchInput.value = "";
    $$(".catcard").forEach((x) => x.classList.remove("active"));
    if (categoryHint) categoryHint.hidden = false;
    renderProducts();
  });

  scrollToCategoriesBtn?.addEventListener("click", () => {
    $("#categories")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  mobileSearchBtn?.addEventListener("click", () => {
    if (!mobileSearchWrap) return;
    mobileSearchWrap.hidden = false;
    mobileSearchInput?.focus();
  });

  closeMobileSearchBtn?.addEventListener("click", () => {
    if (mobileSearchWrap) mobileSearchWrap.hidden = true;
  });

  scrollLeftBtn?.addEventListener("click", () => scrollProductTrack(-1));
  scrollRightBtn?.addEventListener("click", () => scrollProductTrack(1));

  promoBarClose?.addEventListener("click", () => {
    if (promoBar) promoBar.hidden = true;
  });

  const renderPmSizes = (sizes) => {
    if (!pmSizePills) return;
    pmSizePills.innerHTML = "";

    const list = sizes.length ? sizes : ["Única"];

    list.forEach((size, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "size-pill";
      btn.textContent = String(size);
      if (i === 0) {
        btn.classList.add("is-active");
        currentSize = String(size);
      }

      btn.addEventListener("click", () => {
        $$(".size-pill", pmSizePills).forEach((x) => x.classList.remove("is-active"));
        btn.classList.add("is-active");
        currentSize = String(size);
      });

      pmSizePills.appendChild(btn);
    });
  };

  const renderPmCarousel = (images, alt) => {
    if (!pmCarousel) return;
    pmCarousel.innerHTML = "";

    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length) {
      pmCarousel.innerHTML = `<div class="product-card__placeholder" style="height:320px;">🏁</div>`;
      return;
    }

    const track = document.createElement("div");
    track.className = "pm-carousel__track";

    list.forEach((src) => {
      const slide = document.createElement("div");
      slide.className = "pm-carousel__slide";
      slide.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`;
      track.appendChild(slide);
    });

    pmCarousel.appendChild(track);
  };

  const openProduct = (sku) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return;

    currentProduct = p;
    currentQty = 1;
    currentSize = null;

    if (pmTitle) pmTitle.textContent = getProductName(p);
    if (pmPrice) pmPrice.textContent = money(getProductPriceCents(p));
    if (pmDesc) pmDesc.textContent = String(p.description || "Merch oficial SCORE.");
    if (pmQtyDisplay) pmQtyDisplay.textContent = String(currentQty);

    if (pmChips) {
      pmChips.innerHTML = `
        <span class="pill">${escapeHtml(String(p.section_id || "SCORE"))}</span>
        ${p.sub_section ? `<span class="pill">${escapeHtml(String(p.sub_section))}</span>` : ""}
      `;
    }

    if (pmStockBadge) {
      const available = Number(p.stock || 0) > 0 || p.stock == null;
      pmStockBadge.hidden = false;
      pmStockBadge.textContent = available ? "Disponible" : "Agotado";
      pmStockBadge.className = `pill pill--logo ${available ? "" : "is-off"}`;
    }

    renderPmSizes(getProductSizes(p));
    renderPmCarousel(getProductImages(p), getProductName(p));
    openModal(productModal);
  };

  const closeProduct = () => closeModal(productModal);

  pmClose?.addEventListener("click", closeProduct);
  pmBackBtn?.addEventListener("click", closeProduct);

  pmQtyDec?.addEventListener("click", () => {
    currentQty = clamp(currentQty - 1, 1, 99);
    if (pmQtyDisplay) pmQtyDisplay.textContent = String(currentQty);
  });

  pmQtyInc?.addEventListener("click", () => {
    currentQty = clamp(currentQty + 1, 1, 99);
    if (pmQtyDisplay) pmQtyDisplay.textContent = String(currentQty);
  });

  pmAdd?.addEventListener("click", () => {
    if (!currentProduct) return;

    const sku = String(currentProduct.sku || "");
    const existing = cart.find((x) => x.sku === sku && x.size === currentSize);

    if (existing) existing.qty += currentQty;
    else {
      cart.push({
        sku,
        name: getProductName(currentProduct),
        price_cents: getProductPriceCents(currentProduct),
        image: getProductImage(currentProduct),
        size: currentSize,
        qty: currentQty,
      });
    }

    persistCart();
    renderCart();
    closeProduct();
    showToast("Agregado al carrito.", "ok");
  });

  pmShareBtn?.addEventListener("click", async () => {
    if (!currentProduct) return;
    const url = `${location.origin}${location.pathname}#sku=${encodeURIComponent(String(currentProduct.sku || ""))}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: getProductName(currentProduct), url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast("Link copiado.", "ok");
      }
    } catch {}
  });

  openSizeGuideBtn?.addEventListener("click", () => openModal(sizeGuideModal));
  closeSizeGuideBtn?.addEventListener("click", () => closeModal(sizeGuideModal));
  understandSizeBtn?.addEventListener("click", () => closeModal(sizeGuideModal));

  const getCartSubtotal = () =>
    cart.reduce((acc, item) => acc + Number(item.price_cents || 0) * Number(item.qty || 0), 0);

  const getDiscountAmount = () => {
    if (!activePromo) return 0;
    const subtotal = getCartSubtotal();

    if (activePromo.type === "percentage" || activePromo.type === "percent") {
      return Math.round(subtotal * (Number(activePromo.value || 0) / 100));
    }

    if (activePromo.type === "fixed") {
      return Math.min(subtotal, Math.round(Number(activePromo.value || 0) * 100));
    }

    return 0;
  };

  const getCartTotal = () => {
    const subtotal = getCartSubtotal();
    const discount = getDiscountAmount();
    return Math.max(0, subtotal - discount + shippingQuoted);
  };

  const removeCartItem = (idx) => {
    cart.splice(idx, 1);
    persistCart();
    renderCart();
  };

  const changeCartQty = (idx, delta) => {
    const item = cart[idx];
    if (!item) return;
    item.qty = clamp(Number(item.qty || 1) + delta, 1, 99);
    persistCart();
    renderCart();
  };

  const refreshTotals = () => {
    const subtotal = getCartSubtotal();
    const discount = getDiscountAmount();
    const total = getCartTotal();

    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subtotal);
    if (shippingLineEl) shippingLineEl.textContent = money(shippingQuoted);
    if (cartTotalEl) cartTotalEl.textContent = money(total);

    if (discountLineWrap && discountLineEl) {
      discountLineWrap.hidden = !(discount > 0);
      discountLineEl.textContent = `-${money(discount)}`;
    }
  };

  const renderCart = () => {
    if (cartCount) cartCount.textContent = String(cart.reduce((a, i) => a + Number(i.qty || 0), 0));

    if (cartItemsEl) {
      if (!cart.length) {
        cartItemsEl.innerHTML = `<div class="hint" style="padding:10px 0;">Tu carrito está vacío.</div>`;
      } else {
        cartItemsEl.innerHTML = "";
        cart.forEach((item, idx) => {
          const row = document.createElement("article");
          row.className = "cartitem";
          row.innerHTML = `
            <div class="cartitem__media">
              ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" />` : `<div class="product-card__placeholder">🏁</div>`}
            </div>
            <div class="cartitem__body">
              <div class="cartitem__title">${escapeHtml(item.name)}</div>
              <div class="cartitem__meta">
                ${item.size ? `Talla: ${escapeHtml(item.size)} · ` : ""}${money(item.price_cents)}
              </div>
              <div class="cartitem__actions">
                <button type="button" class="qtybtn js-dec" aria-label="Quitar una unidad">−</button>
                <span class="qtytxt">${Number(item.qty || 0)}</span>
                <button type="button" class="qtybtn js-inc" aria-label="Agregar una unidad">+</button>
                <button type="button" class="linkbtn js-remove" aria-label="Eliminar del carrito">Eliminar</button>
              </div>
            </div>
          `;

          row.querySelector(".js-dec")?.addEventListener("click", () => changeCartQty(idx, -1));
          row.querySelector(".js-inc")?.addEventListener("click", () => changeCartQty(idx, 1));
          row.querySelector(".js-remove")?.addEventListener("click", () => removeCartItem(idx));
          cartItemsEl.appendChild(row);
        });
      }
    }

    refreshTotals();
    if (checkoutBtn) checkoutBtn.disabled = !cart.length || !!siteSettings.maintenance_mode;
  };

  const applyPromo = async () => {
    const code = String(promoCode?.value || "").trim();
    if (!code) {
      activePromo = null;
      refreshTotals();
      showToast("Código promo vacío.", "error");
      return;
    }

    try {
      const res = await fetch(`/.netlify/functions/promos?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.promo) {
        activePromo = null;
        refreshTotals();
        showToast(data?.error || "Código no válido.", "error");
        return;
      }

      activePromo = data.promo;
      refreshTotals();
      showToast("Promo aplicada.", "ok");
    } catch {
      activePromo = null;
      refreshTotals();
      showToast("No pude validar el código promo.", "error");
    }
  };

  applyPromoBtn?.addEventListener("click", applyPromo);

  const applyShipModeUi = () => {
    $$("[data-ship-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.shipMode === shipMode);
    });

    if (postalWrap) postalWrap.hidden = shipMode === "pickup";

    if (shipHint) {
      if (shipMode === "pickup") shipHint.textContent = "Recoge tu pedido en fábrica o punto acordado.";
      if (shipMode === "envia_mx") shipHint.textContent = "Cotización nacional MX por código postal.";
      if (shipMode === "envia_us") shipHint.textContent = "Cotización USA por ZIP Code.";
    }

    refreshTotals();
  };

  $$("[data-ship-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      shipMode = String(btn.dataset.shipMode || "pickup");
      shippingQuoted = 0;
      shippingMeta = null;
      applyShipModeUi();
      renderCart();
    });
  });

  quoteBtn?.addEventListener("click", async () => {
    const postal = String(postalCode?.value || "").trim();
    if (!postal) {
      showToast("Escribe tu CP / ZIP.", "error");
      return;
    }

    try {
      const res = await fetch("/.netlify/functions/quote_shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart,
          shipping_mode: shipMode,
          postal_code: postal,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo cotizar.");
      }

      shippingQuoted = Number(data.amount_cents || 0);
      shippingMeta = data;
      refreshTotals();
      showToast("Envío cotizado.", "ok");
    } catch (e) {
      shippingQuoted = 0;
      shippingMeta = null;
      refreshTotals();
      showToast(String(e?.message || "No se pudo cotizar envío."), "error");
    }
  });

  checkoutBtn?.addEventListener("click", async () => {
    if (!cart.length) {
      showToast("Tu carrito está vacío.", "error");
      return;
    }

    if (siteSettings.maintenance_mode) {
      showToast("La tienda está en mantenimiento.", "error");
      return;
    }

    try {
      setCheckoutLoading(true);
      if (checkoutMsg) {
        checkoutMsg.hidden = true;
        checkoutMsg.textContent = "";
      }

      const payload = {
        items: cart,
        shipping_mode: shipMode,
        postal_code: String(postalCode?.value || "").trim(),
        promo_code: String(promoCode?.value || "").trim(),
        quote: shippingMeta,
      };

      const res = await fetch("/.netlify/functions/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || "No se pudo iniciar el checkout.");
      }

      location.href = data.url;
    } catch (e) {
      if (checkoutMsg) {
        checkoutMsg.hidden = false;
        checkoutMsg.textContent = String(e?.message || "No se pudo iniciar el checkout.");
      }
      showToast(String(e?.message || "No se pudo iniciar el checkout."), "error");
    } finally {
      setCheckoutLoading(false);
    }
  });

  continueShoppingBtn?.addEventListener("click", () => closeDrawer(cartDrawer));

  const appendAssistantBubble = (role, text) => {
    if (!assistantOutput) return;
    const item = document.createElement("div");
    item.className = `chat__bubble chat__bubble--${role}`;
    item.textContent = String(text || "");
    assistantOutput.appendChild(item);
    assistantOutput.scrollTop = assistantOutput.scrollHeight;
  };

  const sendAssistant = async () => {
    const message = String(assistantInput?.value || "").trim();
    if (!message) return;

    appendAssistantBubble("user", message);
    if (assistantInput) assistantInput.value = "";

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json().catch(() => null);
      appendAssistantBubble("assistant", data?.reply || "No tuve una respuesta disponible.");
    } catch {
      appendAssistantBubble("assistant", "No pude conectarme con el asistente en este momento.");
    }
  };

  openAssistantBtn?.addEventListener("click", () => openModal(assistantModal));
  floatingAssistantBtn?.addEventListener("click", () => openModal(assistantModal));
  navOpenAssistant?.addEventListener("click", () => {
    closeDrawer(sideMenu);
    openModal(assistantModal);
  });
  assistantClose?.addEventListener("click", () => closeModal(assistantModal));
  assistantSendBtn?.addEventListener("click", sendAssistant);
  assistantInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendAssistant();
  });

  openMenuBtn?.addEventListener("click", () => openDrawer(sideMenu));
  closeMenuBtn?.addEventListener("click", () => closeDrawer(sideMenu));

  openCartBtn?.addEventListener("click", () => openDrawer(cartDrawer));
  closeCartBtn?.addEventListener("click", () => closeDrawer(cartDrawer));
  navOpenCart?.addEventListener("click", () => {
    closeDrawer(sideMenu);
    openDrawer(cartDrawer);
  });

  $$("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-scroll");
      if (!target) return;
      closeDrawer(sideMenu);
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  overlay?.addEventListener("click", () => {
    closeDrawer(sideMenu);
    closeDrawer(cartDrawer);
    closeModal(assistantModal);
    closeModal(productModal);
    closeModal(sizeGuideModal);
  });

  scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  window.addEventListener("scroll", () => {
    if (!scrollTopBtn) return;
    scrollTopBtn.classList.toggle("is-visible", window.scrollY > 500);
  }, { passive: true });

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

      if (registration.waiting) activateWaitingWorker(registration);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker(registration);
          }
        });
      });

      try { await navigator.serviceWorker.ready; } catch {}
      try { await registration.update(); } catch {}
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

  const boot = async () => {
    try {
      if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;

      initCookieBanner();
      restoreCart();
      renderCart();
      applyShipModeUi();

      await registerServiceWorker();
      await fetchSiteSettings();
      await loadCatalog();

      renderCategories();
      renderProducts();
      runSalesAmbient();

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
          setTimeout(() => { splash.hidden = true; }, 700);
        }
      }, 350);
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();