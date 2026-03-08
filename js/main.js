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

  const persistCart = () => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {}
  };

  const restoreCart = () => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) cart = arr;
    } catch {}
  };

  const setCookieConsent = (value) => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {}
  };

  const initCookieBanner = () => {
    if (!cookieBanner || localStorage.getItem(CONSENT_KEY)) {
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
      email: "ventas.unicotextil@gmail.com",
      phone: "",
      whatsapp_e164: "5216642368701",
      whatsapp_display: "664 236 8701",
    },
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

  promoBarClose?.addEventListener("click", () => {
    if (promoBar) promoBar.hidden = true;
  });

  const getProductName = (p) => String(p?.name || "Producto SCORE");
  const getProductImage = (p) => safeUrl(p?.image_url || p?.img || (Array.isArray(p?.images) ? p.images[0] : ""));
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

  const normalizeCategory = (row) => ({
    id: String(row?.id || row?.slug || row?.section_id || ""),
    name: String(row?.name || row?.title || row?.section_id || "Colección"),
    logo: safeUrl(row?.logo || row?.image || ""),
    section_id: String(row?.section_id || row?.id || ""),
  });

  const normalizeProduct = (row) => ({
    ...row,
    sku: String(row?.sku || ""),
    name: String(row?.name || "Producto SCORE"),
    section_id: String(row?.section_id || ""),
    sub_section: String(row?.sub_section || ""),
    image_url: safeUrl(row?.image_url || row?.img || ""),
    images: Array.isArray(row?.images) ? row.images.map(safeUrl).filter(Boolean) : [],
    sizes: Array.isArray(row?.sizes) ? row.sizes : [],
  });

  const loadCatalog = async () => {
    const [catalogRes, categoriesRes] = await Promise.all([
      fetch("/.netlify/functions/catalog", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/data/catalog.json", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);

    const fallbackData = categoriesRes && typeof categoriesRes === "object" ? categoriesRes : {};

    if (catalogRes?.ok) {
      categories = Array.isArray(catalogRes.categories) ? catalogRes.categories.map(normalizeCategory) : [];
      products = Array.isArray(catalogRes.products) ? catalogRes.products.map(normalizeProduct) : [];
    } else {
      categories = Array.isArray(fallbackData.categories) ? fallbackData.categories.map(normalizeCategory) : [];
      products = Array.isArray(fallbackData.products) ? fallbackData.products.map(normalizeProduct) : [];
    }

    filteredProducts = [...products];
  };

  const applySort = (items) => {
    const mode = String(sortSelect?.value || "featured");

    const arr = [...items];
    if (mode === "price_asc") arr.sort((a, b) => getProductPriceCents(a) - getProductPriceCents(b));
    else if (mode === "price_desc") arr.sort((a, b) => getProductPriceCents(b) - getProductPriceCents(a));
    else if (mode === "name_asc") arr.sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es"));
    return arr;
  };

  const getVisibleProducts = () => {
    let list = [...products];

    if (activeCategory?.section_id) {
      list = list.filter((p) => String(p.section_id || "") === String(activeCategory.section_id));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        [p.name, p.sku, p.section_id, p.sub_section].some((x) =>
          String(x || "").toLowerCase().includes(q)
        )
      );
    }

    return applySort(list);
  };

  const ensureCarouselUX = () => {
    if (!productGrid) return;
    productGrid.scrollTo({ left: 0, behavior: "instant" });
  };

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";

    for (const cat of categories) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catcard glass-panel hover-fx";
      card.innerHTML = `
        <div class="catcard__media">
          ${cat.logo ? `<img src="${escapeHtml(cat.logo)}" alt="${escapeHtml(cat.name)}" loading="lazy" />` : `<div class="product-card__placeholder">🏁</div>`}
        </div>
        <div class="catcard__body">
          <h3 class="catcard__title">${escapeHtml(cat.name)}</h3>
          <p class="catcard__copy">Explorar colección oficial</p>
        </div>
      `;

      card.addEventListener("click", () => {
        activeCategory = cat;
        renderProducts();
        if (catalogCarouselSection) catalogCarouselSection.hidden = false;
        smoothScrollTo(catalogCarouselSection || "#catalogCarouselSection");
      });

      categoryGrid.appendChild(card);
    }
  };

  const renderProducts = () => {
    if (!productGrid) return;

    filteredProducts = getVisibleProducts();

    if (carouselTitle) {
      carouselTitle.textContent = activeCategory?.name || "Catálogo";
    }

    if (categoryHint) categoryHint.hidden = !!activeCategory;

    if (activeFilterRow && activeFilterLabel) {
      const parts = [];
      if (activeCategory?.name) parts.push(`Colección: ${activeCategory.name}`);
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

  searchInput?.addEventListener(
    "input",
    debounce((e) => {
      searchQuery = String(e.target.value || "").trim();
      renderProducts();
    }, 120)
  );

  mobileSearchInput?.addEventListener(
    "input",
    debounce((e) => {
      searchQuery = String(e.target.value || "").trim();
      if (searchInput) searchInput.value = searchQuery;
      renderProducts();
    }, 120)
  );

  menuSearchInput?.addEventListener(
    "input",
    debounce((e) => {
      searchQuery = String(e.target.value || "").trim();
      if (searchInput) searchInput.value = searchQuery;
      if (mobileSearchInput) mobileSearchInput.value = searchQuery;
      renderProducts();
    }, 120)
  );

  sortSelect?.addEventListener("change", renderProducts);

  clearFilterBtn?.addEventListener("click", () => {
    activeCategory = null;
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    if (mobileSearchInput) mobileSearchInput.value = "";
    if (menuSearchInput) menuSearchInput.value = "";
    renderProducts();
  });

  scrollToCategoriesBtn?.addEventListener("click", () => smoothScrollTo("#categories"));

  mobileSearchBtn?.addEventListener("click", () => {
    if (!mobileSearchWrap) return;
    mobileSearchWrap.hidden = false;
    mobileSearchInput?.focus();
  });

  closeMobileSearchBtn?.addEventListener("click", () => {
    if (mobileSearchWrap) mobileSearchWrap.hidden = true;
  });

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

    if (postalWrap) {
      postalWrap.hidden = shipMode === "pickup";
    }

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
  });

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

  const registerServiceWorker = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!window.__scoreSwRefreshing) {
          window.__scoreSwRefreshing = true;
          window.location.reload();
        }
      });
    } catch (e) {
      console.warn("[scorestore] sw register failed", e);
    }
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
          setTimeout(() => {
            splash.hidden = true;
          }, 700);
        }
      }, 350);
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();