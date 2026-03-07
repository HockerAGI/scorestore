/* =========================================================
   SCORE STORE — Frontend (Repo-alineado + Anti-404 assets + Carousel Snap)
   Build: 2026-03-04
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.03.04.SCORESTORE";

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

  const safeUrl = (u) => {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return s;
    return s;
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // =========================================================
  // DOM
  // =========================================================
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

  // Product modal
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

  // Size guide
  const sizeGuideModal = $("#sizeGuideModal");
  const openSizeGuideBtn = $("#openSizeGuideBtn");
  const closeSizeGuideBtn = $("#closeSizeGuideBtn");
  const understandSizeBtn = $("#understandSizeBtn");

  const toast = $("#toast");

  // =========================================================
  // State
  // =========================================================
  let categories = [];
  let products = [];
  let filteredProducts = [];
  let activeCategory = null;
  let searchQuery = "";
  let currentProduct = null;
  let currentQty = 1;
  let currentSize = null;
  let activePromo = null;

  let shipMode = "pickup";
  let shippingQuoted = 0;
  let shippingMeta = null;

  let cart = [];
  const CART_KEY = "scorestore_cart_v1";
  const CONSENT_KEY = "scorestore_cookie_consent_v1";

  // =========================================================
  // Utils UI
  // =========================================================
  const showToast = (msg, type = "ok", timeout = 2400) => {
    if (!toast) return;
    toast.textContent = String(msg || "");
    toast.hidden = false;
    toast.setAttribute("data-type", type);
    toast.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => {
        toast.hidden = true;
      }, 180);
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
      if (!assistantModal?.classList.contains("is-open") && !productModal?.classList.contains("is-open")) {
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
      if (!sideMenu?.classList.contains("is-open") && !cartDrawer?.classList.contains("is-open")) {
        closeOverlay();
      }
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
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
   /* =========================================================
   SCORE STORE — Frontend (Repo-alineado + Anti-404 assets + Carousel Snap)
   Build: 2026-03-04
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.03.04.SCORESTORE";

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

  const safeUrl = (u) => {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    if (s.startsWith("/")) return s;
    return s;
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // =========================================================
  // DOM
  // =========================================================
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

  // Product modal
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

  // Size guide
  const sizeGuideModal = $("#sizeGuideModal");
  const openSizeGuideBtn = $("#openSizeGuideBtn");
  const closeSizeGuideBtn = $("#closeSizeGuideBtn");
  const understandSizeBtn = $("#understandSizeBtn");

  const toast = $("#toast");

  // =========================================================
  // State
  // =========================================================
  let categories = [];
  let products = [];
  let filteredProducts = [];
  let activeCategory = null;
  let searchQuery = "";
  let currentProduct = null;
  let currentQty = 1;
  let currentSize = null;
  let activePromo = null;

  let shipMode = "pickup";
  let shippingQuoted = 0;
  let shippingMeta = null;

  let cart = [];
  const CART_KEY = "scorestore_cart_v1";
  const CONSENT_KEY = "scorestore_cookie_consent_v1";

  // =========================================================
  // Utils UI
  // =========================================================
  const showToast = (msg, type = "ok", timeout = 2400) => {
    if (!toast) return;
    toast.textContent = String(msg || "");
    toast.hidden = false;
    toast.setAttribute("data-type", type);
    toast.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => {
        toast.hidden = true;
      }, 180);
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
      if (!assistantModal?.classList.contains("is-open") && !productModal?.classList.contains("is-open")) {
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
      if (!sideMenu?.classList.contains("is-open") && !cartDrawer?.classList.contains("is-open")) {
        closeOverlay();
      }
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
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const canUseCookies = () => localStorage.getItem(CONSENT_KEY) === "accepted";
     const getProductSizes = (p) => {
    if (Array.isArray(p.sizes) && p.sizes.length) return p.sizes.map(String);
    if (Array.isArray(p.available_sizes) && p.available_sizes.length) return p.available_sizes.map(String);
    return ["CH", "M", "G", "XG"];
  };

  // =========================================================
  // Carousel UX
  // =========================================================
  const ensureCarouselUX = () => {
    if (!productGrid) return;

    productGrid.classList.add("carousel-track");
    productGrid.style.scrollSnapType = "x mandatory";
    productGrid.style.scrollBehavior = "smooth";
    productGrid.style.overscrollBehaviorX = "contain";
    productGrid.style.webkitOverflowScrolling = "touch";

    productGrid.setAttribute("role", "region");
    productGrid.setAttribute("aria-label", "Carrusel de productos");
    productGrid.setAttribute("tabindex", "0");

    let hint = $("#carouselHint");
    if (!hint && catalogCarouselSection) {
      hint = document.createElement("div");
      hint.id = "carouselHint";
      hint.className = "hint";
      hint.style.margin = "8px 0 0 0";
      hint.textContent = "Desliza horizontalmente para ver más productos.";
      catalogCarouselSection.appendChild(hint);
    }

    let progress = $("#carouselProgress");
    if (!progress && catalogCarouselSection) {
      progress = document.createElement("div");
      progress.id = "carouselProgress";
      progress.className = "carousel-progress";
      progress.hidden = true;
      progress.innerHTML = `
        <div class="carousel-progress__bar"><span class="carousel-progress__fill" style="width:0%"></span></div>
        <div class="carousel-progress__text" id="carouselProgressText">1 / 1</div>
      `;
      catalogCarouselSection.appendChild(progress);
    }

    const fill = progress ? $(".carousel-progress__fill", progress) : null;
    const text = $("#carouselProgressText");

    const update = () => {
      const cards = $$(".product-card", productGrid);
      if (!cards.length) {
        if (progress) progress.hidden = true;
        return;
      }

      if (progress) progress.hidden = cards.length <= 1;

      const left = productGrid.scrollLeft;
      let current = 0;
      let minDelta = Infinity;

      cards.forEach((card, i) => {
        const delta = Math.abs(card.offsetLeft - left);
        if (delta < minDelta) {
          minDelta = delta;
          current = i;
        }
      });

      const ratio = cards.length > 1 ? current / (cards.length - 1) : 1;
      if (fill) fill.style.width = `${Math.round(ratio * 100)}%`;
      if (text) text.textContent = `${current + 1} / ${cards.length}`;
    };

    const snapToNearest = debounce(() => {
      const cards = $$(".product-card", productGrid);
      if (!cards.length) return;

      const left = productGrid.scrollLeft;
      let nearest = cards[0];
      let minDelta = Infinity;

      for (const card of cards) {
        const d = Math.abs(card.offsetLeft - left);
        if (d < minDelta) {
          minDelta = d;
          nearest = card;
        }
      }

      productGrid.scrollTo({ left: nearest.offsetLeft, behavior: "smooth" });
    }, 120);

    productGrid.addEventListener("scroll", () => {
      update();
      snapToNearest();
    });

    productGrid.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollRightBtn?.click();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollLeftBtn?.click();
      }
    });

    scrollLeftBtn?.addEventListener("click", () => {
      const w = productGrid.clientWidth || 320;
      productGrid.scrollBy({ left: -Math.max(280, w * 0.9), behavior: "smooth" });
    });

    scrollRightBtn?.addEventListener("click", () => {
      const w = productGrid.clientWidth || 320;
      productGrid.scrollBy({ left: Math.max(280, w * 0.9), behavior: "smooth" });
    });

    update();
  };

  // =========================================================
  // Render products
  // =========================================================
  const renderProducts = () => {
    if (!productGrid) return;
    filteredProducts = getVisibleProducts();

    const activeCat = categories.find(
      (c) => normalizeSectionIdToUi(c.section_id || c.id || c.slug || c.name) === activeCategory
    );

    if (carouselTitle) {
      carouselTitle.textContent = activeCat?.name || "Catálogo";
    }

    if (activeFilterRow && activeFilterLabel) {
      const parts = [];
      if (activeCat?.name) parts.push(`Colección: ${activeCat.name}`);
      if (searchQuery) parts.push(`Búsqueda: ${searchQuery}`);
      activeFilterLabel.textContent = parts.join(" · ");
      activeFilterRow.hidden = !parts.length;
    }

    productGrid.innerHTML = "";

    if (!filteredProducts.length) {
      productGrid.innerHTML = `
        <article class="glass-panel" style="padding:24px; min-width:100%;">
          <h3 style="margin:0 0 8px 0;">Sin resultados</h3>
          <p class="hint" style="margin:0;">No encontré productos para ese filtro.</p>
        </article>
      `;
      ensureCarouselUX();
      return;
    }

    for (const p of filteredProducts) {
      const card = document.createElement("article");
      card.className = "product-card glass-panel hover-fx";
      card.dataset.sku = String(p.sku || "");
      card.style.scrollSnapAlign = "start";

      const image = getProductImage(p);
      const cents = getProductPriceCents(p);
      const available = Number(p.stock || 0) > 0 || p.stock == null;
      const badge = available ? "Disponible" : "Agotado";

      card.innerHTML = `
        <button type="button" class="product-card__btn" aria-label="Abrir ${escapeHtml(getProductName(p))}">
          <div class="product-card__media">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(getProductName(p))}" loading="lazy" />` : `<div class="product-card__placeholder">🏁</div>`}
          </div>
          <div class="product-card__body">
            <div class="product-card__top">
              <span class="pill">${escapeHtml(badge)}</span>
              <span class="pill pill--logo">${escapeHtml(String(p.section_id || "SCORE"))}</span>
            </div>
            <h4 class="product-card__title">${escapeHtml(getProductName(p))}</h4>
            <p class="product-card__sku">${escapeHtml(String(p.sku || ""))}</p>
            <div class="product-card__bottom">
              <div class="price">${money(cents)}</div>
              <span class="product-card__cta">Ver detalle →</span>
            </div>
          </div>
        </button>
      `;

      card.querySelector(".product-card__btn")?.addEventListener("click", () => openProduct(String(p.sku || "")));
      productGrid.appendChild(card);
    }

    setStatus(`${filteredProducts.length} producto(s) encontrados.`);
    ensureCarouselUX();
  };
     // =========================================================
  // Product modal
  // =========================================================
  const renderPmSizes = (sizes) => {
    if (!pmSizePills) return;
    pmSizePills.innerHTML = "";
    sizes.forEach((size, i) => {
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
      slide.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
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
    if (pmDesc) pmDesc.textContent = String(p.description || p.short_description || "Merch oficial SCORE.");
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

    if (existing) {
      existing.qty += currentQty;
    } else {
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
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Link copiado.", "ok");
      }
    } catch {}
  });

  openSizeGuideBtn?.addEventListener("click", () => openModal(sizeGuideModal));
  closeSizeGuideBtn?.addEventListener("click", () => closeModal(sizeGuideModal));
  understandSizeBtn?.addEventListener("click", () => closeModal(sizeGuideModal));

  // =========================================================
  // Cart
  // =========================================================
  const getCartSubtotal = () =>
    cart.reduce((acc, item) => acc + Number(item.price_cents || 0) * Number(item.qty || 0), 0);

  const getDiscountAmount = () => {
    if (!activePromo) return 0;
    const subtotal = getCartSubtotal();

    if (activePromo.type === "percentage") {
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

  const renderCart = () => {
    if (cartCount) cartCount.textContent = String(cart.reduce((a, i) => a + Number(i.qty || 0), 0));

    if (cartItemsEl) {
      if (!cart.length) {
        cartItemsEl.innerHTML = `<div class="hint" style="padding: 10px 0;">Tu carrito está vacío.</div>`;
      } else {
        cartItemsEl.innerHTML = "";
        cart.forEach((item, idx) => {
          const row = document.createElement("article");
          row.className = "cartitem";
          row.innerHTML = `
            <div class="cartitem__media">
              ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />` : `<div class="product-card__placeholder">🏁</div>`}
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
     // =========================================================
  // Product modal
  // =========================================================
  const renderPmSizes = (sizes) => {
    if (!pmSizePills) return;
    pmSizePills.innerHTML = "";
    sizes.forEach((size, i) => {
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
      slide.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
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
    if (pmDesc) pmDesc.textContent = String(p.description || p.short_description || "Merch oficial SCORE.");
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

    if (existing) {
      existing.qty += currentQty;
    } else {
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
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Link copiado.", "ok");
      }
    } catch {}
  });

  openSizeGuideBtn?.addEventListener("click", () => openModal(sizeGuideModal));
  closeSizeGuideBtn?.addEventListener("click", () => closeModal(sizeGuideModal));
  understandSizeBtn?.addEventListener("click", () => closeModal(sizeGuideModal));

  // =========================================================
  // Cart
  // =========================================================
  const getCartSubtotal = () =>
    cart.reduce((acc, item) => acc + Number(item.price_cents || 0) * Number(item.qty || 0), 0);

  const getDiscountAmount = () => {
    if (!activePromo) return 0;
    const subtotal = getCartSubtotal();

    if (activePromo.type === "percentage") {
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

  const renderCart = () => {
    if (cartCount) cartCount.textContent = String(cart.reduce((a, i) => a + Number(i.qty || 0), 0));

    if (cartItemsEl) {
      if (!cart.length) {
        cartItemsEl.innerHTML = `<div class="hint" style="padding: 10px 0;">Tu carrito está vacío.</div>`;
      } else {
        cartItemsEl.innerHTML = "";
        cart.forEach((item, idx) => {
          const row = document.createElement("article");
          row.className = "cartitem";
          row.innerHTML = `
            <div class="cartitem__media">
              ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />` : `<div class="product-card__placeholder">🏁</div>`}
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
     const refreshTotals = () => {
    const subtotal = getCartSubtotal();
    const discount = getDiscountAmount();
    const total = getCartTotal();

    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subtotal);
    if (shippingLineEl) shippingLineEl.textContent = money(shippingQuoted);
    if (cartTotalEl) cartTotalEl.textContent = money(total);

    if (discountLineWrap && discountLineEl) {
      const show = discount > 0;
      discountLineWrap.hidden = !show;
      discountLineEl.textContent = `-${money(discount)}`;
    }
  };

  const applyShipModeUi = () => {
    if (shipHint) {
      if (shipMode === "pickup") shipHint.textContent = "Sin costo";
      if (shipMode === "envia_mx") shipHint.textContent = "Cotiza con tu C.P.";
      if (shipMode === "envia_us") shipHint.textContent = "Cotiza con tu ZIP";
    }

    if (shippingNote) {
      if (shipMode === "pickup") shippingNote.textContent = "Recolección sin costo en nuestras instalaciones (Tijuana).";
      if (shipMode === "envia_mx") shippingNote.textContent = "Calculamos tarifa nacional en tiempo real con Envía.com.";
      if (shipMode === "envia_us") shippingNote.textContent = "Calculamos tarifa USA en tiempo real con Envía.com.";
    }

    if (postalWrap) postalWrap.hidden = shipMode === "pickup";

    resetShippingQuote();
    refreshTotals();
  };

  $$('input[name="shipMode"]').forEach((r) => {
    r.addEventListener("change", () => {
      shipMode = r.value;
      applyShipModeUi();
    });
  });

  quoteBtn?.addEventListener("click", async () => {
    const cp = String(postalCode?.value || "").trim();
    if (!cp) {
      showToast("Escribe tu CP / ZIP.", "error");
      return;
    }

    try {
      quoteBtn.disabled = true;
      quoteBtn.textContent = "Cotizando...";

      const body = {
        mode: shipMode,
        postal_code: cp,
        cart: cart.map((x) => ({
          sku: x.sku,
          qty: x.qty,
        })),
      };

      const j = await fetchJsonFirstOk(
        ["/.netlify/functions/quote_shipping"],
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      shippingQuoted = Math.max(0, Math.round(Number(j?.amount_cents || 0)));
      shippingMeta = j || null;
      refreshTotals();
      showToast("Envío cotizado.", "ok");
    } catch (e) {
      resetShippingQuote();
      refreshTotals();
      showToast("No pude cotizar el envío.", "error");
    } finally {
      quoteBtn.disabled = false;
      quoteBtn.textContent = "Cotizar";
    }
  });

  // =========================================================
  // Promo
  // =========================================================
  const applyPromo = async () => {
    const code = String(promoCode?.value || "").trim().toUpperCase();
    if (!code) {
      activePromo = null;
      refreshTotals();
      showToast("Escribe un código.", "error");
      return;
    }

    try {
      const cv = encodeURIComponent(APP_VERSION);
      const data = await fetchJsonFirstOk([`/.netlify/functions/promos?code=${encodeURIComponent(code)}&cv=${cv}`]);
      const r = data?.promo || null;

      if (!r) {
        activePromo = null;
        showToast("Código inválido o expirado.", "error");
        refreshTotals();
        return;
      }

      activePromo = r;
      refreshTotals();
      showToast("Promoción aplicada.", "ok");
    } catch {
      activePromo = null;
      refreshTotals();
      showToast("No pude validar el código.", "error");
    }
  };

  applyPromoBtn?.addEventListener("click", applyPromo);
  promoCode?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyPromo();
  });

  // =========================================================
  // Assistant
  // =========================================================
  const appendAssistantMsg = (from, text) => {
    if (!assistantOutput) return;
    const div = document.createElement("div");
    div.className = `chat__msg chat__msg--${from}`;
    div.innerHTML = `<div class="chat__bubble">${escapeHtml(text)}</div>`;
    assistantOutput.appendChild(div);
    assistantOutput.scrollTop = assistantOutput.scrollHeight;
  };

  const sendAssistant = async () => {
    const q = String(assistantInput?.value || "").trim();
    if (!q) return;

    appendAssistantMsg("user", q);
    if (assistantInput) assistantInput.value = "";
    appendAssistantMsg("bot", "Analizando...");

    try {
      const r = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const j = await r.json().catch(() => ({}));

      const msgs = $$(".chat__msg--bot", assistantOutput);
      const last = msgs[msgs.length - 1];
      const bubble = $(".chat__bubble", last);
      if (bubble) bubble.textContent = String(j?.reply || "No encontré respuesta.");
    } catch {
      const msgs = $$(".chat__msg--bot", assistantOutput);
      const last = msgs[msgs.length - 1];
      const bubble = $(".chat__bubble", last);
      if (bubble) bubble.textContent = "No pude responder en este momento.";
    }
  };

  assistantSendBtn?.addEventListener("click", sendAssistant);
  assistantInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendAssistant();
  });

  // =========================================================
  // Checkout
  // =========================================================
  const proceedCheckout = async () => {
    if (!cart.length) {
      showToast("Tu carrito está vacío.", "error");
      return;
    }

    if (siteSettings.maintenance_mode) {
      showToast("Tienda en mantenimiento.", "error");
      return;
    }

    if ((shipMode === "envia_mx" || shipMode === "envia_us") && !shippingQuoted) {
      showToast("Primero cotiza el envío.", "error");
      return;
    }

    try {
      setCheckoutLoading(true);
      if (checkoutMsg) {
        checkoutMsg.hidden = true;
        checkoutMsg.textContent = "";
      }

      const body = {
        items: cart,
        ship_mode: shipMode,
        shipping_amount_cents: shippingQuoted,
        shipping_meta: shippingMeta,
        promo: activePromo,
      };

      const r = await fetch("/.netlify/functions/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.url) {
        throw new Error(j?.error || "No pude iniciar el checkout.");
      }

      location.href = String(j.url);
    } catch (e) {
      if (checkoutMsg) {
        checkoutMsg.hidden = false;
        checkoutMsg.textContent = String(e?.message || e);
      }
      showToast("No pude iniciar el pago.", "error");
    } finally {
      setCheckoutLoading(false);
    }
  };

  checkoutBtn?.addEventListener("click", proceedCheckout);
  continueShoppingBtn?.addEventListener("click", () => {
    closeDrawer(cartDrawer);
    smoothScrollTo("#categories");
  });
     // =========================================================
  // site_settings + Promo Bar + Pixel + Footer dinámico
  // =========================================================
  const siteSettings = {
    promo_active: false,
    promo_text: "",
    pixel_id: "",
    maintenance_mode: false,
    season_key: "default",
    theme: null,
    home: null,
    socials: null,
    contact: null,
    updated_at: null,
  };

  const loadMetaPixel = (pixelId) => {
    const id = String(pixelId || "").trim();
    if (!id) return;
    if (document.getElementById("metaPixelScript")) return;

    const script = document.createElement("script");
    script.id = "metaPixelScript";
    script.type = "text/javascript";
    script.text = `
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
      (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${id}');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(script);
  };

  const applySiteSettings = (s) => {
    if (!s || typeof s !== "object") return;

    siteSettings.promo_active = !!s.promo_active;
    siteSettings.promo_text = String(s.promo_text || "").trim();
    siteSettings.pixel_id = String(s.pixel_id || "").trim();
    siteSettings.maintenance_mode = !!s.maintenance_mode;
    siteSettings.season_key = String(s.season_key || "default").trim() || "default";
    siteSettings.theme = s.theme && typeof s.theme === "object" ? s.theme : null;
    siteSettings.home = s.home && typeof s.home === "object" ? s.home : null;
    siteSettings.socials = s.socials && typeof s.socials === "object" ? s.socials : null;
    siteSettings.contact = s.contact && typeof s.contact === "object" ? s.contact : null;
    siteSettings.updated_at = s.updated_at || null;

    if (siteSettings.maintenance_mode) {
      if (checkoutBtn) checkoutBtn.disabled = true;
      showToast("Tienda en mantenimiento. Intenta más tarde.", "error");
    } else {
      if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
    }

    const dismissed = localStorage.getItem("scorestore_promo_dismissed") === "1";
    if (promoBar && promoBarText && siteSettings.promo_active && siteSettings.promo_text && !dismissed) {
      promoBarText.textContent = siteSettings.promo_text;
      promoBar.hidden = false;
    } else if (promoBar) {
      promoBar.hidden = true;
    }

    if (siteSettings.pixel_id) loadMetaPixel(siteSettings.pixel_id);

    try {
      document.documentElement.setAttribute("data-season", siteSettings.season_key);
      if (siteSettings.theme?.accent) document.documentElement.style.setProperty("--red", String(siteSettings.theme.accent));
      if (siteSettings.theme?.accent2) document.documentElement.style.setProperty("--text", String(siteSettings.theme.accent2));
      const particles = siteSettings.theme?.particles;
      const heroParticles = document.querySelector(".hero__particles");
      if (heroParticles && typeof particles === "boolean") heroParticles.style.display = particles ? "" : "none";
    } catch {}

    try {
      if (footerNote) {
        footerNote.textContent = String(siteSettings.home?.footer_note || "").trim();
        footerNote.hidden = !footerNote.textContent;
      }

      const contact = siteSettings.contact || {};
      const email = String(contact.email || "").trim();
      const waE164 = String(contact.whatsapp_e164 || "").trim();
      const waDisplay = String(contact.whatsapp_display || "").trim();

      if (footerEmailLink && footerEmailText && email) {
        footerEmailLink.href = `mailto:${email}`;
        footerEmailText.textContent = email;
      }

      if (footerWhatsappLink && footerWhatsappText) {
        if (waE164) footerWhatsappLink.href = `https://wa.me/${encodeURIComponent(waE164)}`;
        if (waDisplay) footerWhatsappText.textContent = waDisplay;
      }

      if (footerFacebookLink && siteSettings.socials?.facebook) {
        footerFacebookLink.href = String(siteSettings.socials.facebook).trim();
      }
      if (footerInstagramLink && siteSettings.socials?.instagram) {
        footerInstagramLink.href = String(siteSettings.socials.instagram).trim();
      }
      if (footerYoutubeLink && siteSettings.socials?.youtube) {
        footerYoutubeLink.href = String(siteSettings.socials.youtube).trim();
      }
    } catch {}
  };

  const fetchSiteSettings = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    try {
      const j = await fetchJsonFirstOk([`/.netlify/functions/site_settings?cv=${cv}`]);
      applySiteSettings(j);
    } catch {
      // ignore
    }
  };

  promoBarClose?.addEventListener("click", () => {
    localStorage.setItem("scorestore_promo_dismissed", "1");
    if (promoBar) promoBar.hidden = true;
  });

  // =========================================================
  // Navigation / shell
  // =========================================================
  openMenuBtn?.addEventListener("click", () => openDrawer(sideMenu));
  closeMenuBtn?.addEventListener("click", () => closeDrawer(sideMenu));
  openCartBtn?.addEventListener("click", () => openDrawer(cartDrawer));
  closeCartBtn?.addEventListener("click", () => closeDrawer(cartDrawer));
  navOpenCart?.addEventListener("click", () => {
    closeDrawer(sideMenu);
    openDrawer(cartDrawer);
  });

  const openAssistant = () => openModal(assistantModal);
  const closeAssistant = () => closeModal(assistantModal);

  openAssistantBtn?.addEventListener("click", openAssistant);
  floatingAssistantBtn?.addEventListener("click", openAssistant);
  navOpenAssistant?.addEventListener("click", () => {
    closeDrawer(sideMenu);
    openAssistant();
  });
  assistantClose?.addEventListener("click", closeAssistant);

  overlay?.addEventListener("click", () => {
    closeDrawer(sideMenu);
    closeDrawer(cartDrawer);
    closeModal(assistantModal);
    closeModal(productModal);
    closeModal(sizeGuideModal);
  });

  scrollToCategoriesBtn?.addEventListener("click", () => smoothScrollTo("#categories"));

  mobileSearchBtn?.addEventListener("click", () => {
    if (!mobileSearchWrap) return;
    mobileSearchWrap.hidden = false;
    mobileSearchInput?.focus();
  });

  closeMobileSearchBtn?.addEventListener("click", () => {
    if (!mobileSearchWrap) return;
    mobileSearchWrap.hidden = true;
  });

  const onSearch = debounce((value) => {
    searchQuery = String(value || "").trim();
    renderProducts();
    if (catalogCarouselSection?.hidden) catalogCarouselSection.hidden = false;
  }, 120);

  searchInput?.addEventListener("input", (e) => onSearch(e.target.value));
  mobileSearchInput?.addEventListener("input", (e) => onSearch(e.target.value));
  menuSearchInput?.addEventListener("input", (e) => onSearch(e.target.value));

  sortSelect?.addEventListener("change", renderProducts);

  clearFilterBtn?.addEventListener("click", () => {
    activeCategory = null;
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    if (mobileSearchInput) mobileSearchInput.value = "";
    if (menuSearchInput) menuSearchInput.value = "";
    renderProducts();
  });

  $$("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-scroll");
      closeDrawer(sideMenu);
      smoothScrollTo(target);
    });
  });

  window.addEventListener("scroll", () => {
    if (!scrollTopBtn) return;
    scrollTopBtn.hidden = window.scrollY < 500;
  });

  scrollTopBtn?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // =========================================================
  // Cookie banner
  // =========================================================
  const initCookieBanner = () => {
    const value = localStorage.getItem(CONSENT_KEY);
    if (!value && cookieBanner) cookieBanner.hidden = false;
  };

  cookieAccept?.addEventListener("click", () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    cookieBanner.hidden = true;
    persistCart();
  });

  cookieReject?.addEventListener("click", () => {
    localStorage.setItem(CONSENT_KEY, "rejected");
    cookieBanner.hidden = true;
  });

  // =========================================================
  // Fake sales toast (ambient)
  // =========================================================
  const salesPool = [
    ["Carlos", "compró una hoodie"],
    ["Ana", "agregó una gorra al carrito"],
    ["Mike", "confirmó su pedido"],
    ["Luis", "compró merch oficial"],
  ];

  const runSalesAmbient = () => {
    if (!salesNotification || !salesName || !salesAction) return;
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

  // =========================================================
  // Boot
  // =========================================================
  const boot = async () => {
    try {
      if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;

      initCookieBanner();
      restoreCart();
      renderCart();
      applyShipModeUi();

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
          setTimeout(() => {
            splash.hidden = true;
          }, 700);
        }
      }, 350);
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();

  const canUseCookies = () => localStorage.getItem(CONSENT_KEY) === "accepted";
