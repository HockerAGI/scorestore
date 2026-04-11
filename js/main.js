/* =========================================================
   SCORE STORE — main.js (Repo-aligned) — v2026-03-04
   Objetivo:
   - Nada roto: modales, carrito, checkout, cotización real
   - Assets blindados (BAJA_500 vs BAJA500, etc.)
   - Carruseles controlados (snap settle + hint)
========================================================= */
(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.03.04.SCORESTORE";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const debounce = (fn, wait = 160) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

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
    const s0 = String(u || "").trim();
    if (!s0) return "";
    if (s0.startsWith("http://") || s0.startsWith("https://") || s0.startsWith("data:")) return s0;

    const s1 = s0
      .replaceAll("assets/BAJA_500/", "assets/BAJA500/")
      .replaceAll("assets/BAJA_400/", "assets/BAJA400/")
      .replaceAll("assets/SF_250/", "assets/SF250/")
      .replaceAll("assets/BAJA_1000/", "assets/EDICION_2025/");

    if (s1.startsWith("/")) return s1;
    if (s1.startsWith("assets/") || s1.startsWith("css/") || s1.startsWith("js/") || s1.startsWith("data/")) return `/${s1}`;
    return s1;
  };

  const normCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

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

  const normalizeSectionIdToUi = (sectionId) => {
    const sid = String(sectionId || "").trim();
    const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
    return found ? found.uiId : "BAJA1000";
  };
  const getLogoForSection = (uiId) => (CATEGORY_CONFIG.find((c) => c.uiId === uiId)?.logo || "assets/logo-baja1000.webp");

  const inferCollection = (p) => {
    const sid = String(p?.sectionId || p?.section_id || p?.section || "").trim();
    if (sid === "EDICION_2025") return "Edición 2025";
    if (sid === "OTRAS_EDICIONES") return "Ediciones Clásicas";
    return "";
  };

  const normalizeProduct = (p) => {
    const sku = String(p?.sku || p?.id || "").trim();
    const title = String(p?.title || p?.name || "Producto Oficial").trim();
    const priceCents = Number.isFinite(Number(p?.price_cents)) ? Math.round(Number(p.price_cents)) : 0;

    const images = Array.isArray(p?.images) ? p.images : (p?.img ? [p.img] : []);
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL", "XXL"];
    const rawSection = String(p?.sectionId || p?.categoryId || p?.section || "").trim();
    const uiSection = normalizeSectionIdToUi(rawSection);

    return {
      sku,
      title,
      description: String(p?.description || "").trim(),
      priceCents,
      images: images.map(safeUrl).filter(Boolean),
      img: images?.[0] ? safeUrl(images[0]) : "",
      sizes: sizes.map((s) => String(s || "").trim()).filter(Boolean),
      rawSection,
      uiSection,
      collection: inferCollection(p),
      rank: Number.isFinite(Number(p?.rank)) ? Number(p.rank) : 999,
      stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
    };
  };

  let catalog = null;
  let products = [];
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

  const showToast = (msg, type = "ok") => {
    if (!toast) return;
    toast.hidden = false;
    toast.setAttribute("data-type", type);
    toast.textContent = String(msg || "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), 2800);
  };

  const isModal = (el) => !!el?.classList?.contains("modal");
  const anyLayerOpen = () =>
    (!sideMenu?.hidden) ||
    (!cartDrawer?.hidden) ||
    (!assistantModal?.hidden) ||
    (!productModal?.hidden) ||
    (!sizeGuideModal?.hidden);

  const openLayer = (el) => {
    if (!el) return;
    el.hidden = false;
    if (overlay) overlay.hidden = false;
    document.documentElement.classList.add("no-scroll");
    if (isModal(el)) requestAnimationFrame(() => el.classList.add("modal--open"));
  };

  const closeLayer = (el) => {
    if (!el) return;
    const MODAL_T = 520;

    if (isModal(el)) {
      el.classList.remove("modal--open");
      setTimeout(() => {
        el.hidden = true;
        if (!anyLayerOpen()) {
          if (overlay) overlay.hidden = true;
          document.documentElement.classList.remove("no-scroll");
        }
      }, MODAL_T);
      return;
    }

    el.hidden = true;
    if (!anyLayerOpen()) {
      if (overlay) overlay.hidden = true;
      document.documentElement.classList.remove("no-scroll");
    }
  };

  const fetchJsonFirstOk = async (urls) => {
    const list = Array.isArray(urls) ? urls : [];
    let lastErr = null;
    for (const u of list) {
      try {
        const res = await fetch(u, { headers: { "cache-control": "no-store" } });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        const j = await resjson().catch((e) => {
  console.error("JSON parse error:", e);
  throw e;
});
        if (j) return j;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("No se pudo cargar JSON");
  };

  const fetchCatalog = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    return await fetchJsonFirstOk([
      `/api/catalog?cv=${cv}`,
      `data/catalog.json?cv=${cv}`,
    ]);
  };

  const fetchPromos = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    try {
      promosData = await fetchJsonFirstOk([
        `/api/promos?cv=${cv}`,
        `data/promos.json?cv=${cv}`,
      ]);
      if (!promosData || !Array.isArray(promosData.rules)) promosData = { rules: [] };
    } catch {
      promosData = { rules: [] };
    }
  };

  const siteSettings = { promo_active: false, promo_text: "", pixel_id: "", hero_title: null, contact: null };

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
      fbq('init', '${id.replace("'", "")}');
      fbq('track', 'PageView');
    `;
    document.head.appendChild(script);

    const ns = document.createElement("noscript");
    ns.innerHTML = `<img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1"/>`;
    document.body.appendChild(ns);
  };

  const applySiteSettings = (s) => {
    if (!s) return;
    siteSettings.promo_active = !!s.promo_active;
    siteSettings.promo_text = String(s.promo_text || "").trim();
    siteSettings.pixel_id = String(s.pixel_id || "").trim();

    const dismissed = localStorage.getItem(STORAGE_KEYS.promoDismiss) === "1";
    if (promoBar && promoBarText && siteSettings.promo_active && siteSettings.promo_text && !dismissed) {
      promoBarText.textContent = siteSettings.promo_text;
      promoBar.hidden = false;
    } else if (promoBar) {
      promoBar.hidden = true;
    }

    if (siteSettings.pixel_id) {
      const consent = localStorage.getItem(STORAGE_KEYS.consent);
      if (consent === "accept") loadMetaPixel(siteSettings.pixel_id);
    }
  };

  const fetchSiteSettings = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    try {
      const j = await fetchJsonFirstOk([`/api/site_settings?cv=${cv}`]);
      applySiteSettings(j);
    } catch {}
  };

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";

    const counts = new Map();
    products.forEach((p) => counts.set(p.uiSection, (counts.get(p.uiSection) || 0) + 1));

    const frag = document.createDocumentFragment();
    for (const cat of CATEGORY_CONFIG) {
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
        catalogCarouselSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      frag.appendChild(card);
    }

    categoryGrid.appendChild(frag);
  };

  const applySort = (list) => {
    const arr = Array.isArray(list) ? [...list] : [];
    if (sortMode === "price_asc") return arr.sort((a, b) => a.priceCents - b.priceCents);
    if (sortMode === "price_desc") return arr.sort((a, b) => b.priceCents - a.priceCents);
    if (sortMode === "name_asc") return arr.sort((a, b) => a.title.localeCompare(b.title));
    return arr.sort((a, b) => (a.rank - b.rank) || a.title.localeCompare(b.title));
  };

  const updateFilterUI = () => {
    const catLabel = activeCategory ? (CATEGORY_CONFIG.find((c) => c.uiId === activeCategory)?.name || activeCategory) : "";
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

    dots.forEach((d, i) => d.addEventListener("click", (e) => { e.stopPropagation(); scrollToIndex(i); }));

    track.addEventListener("scroll", debounce(() => {
      const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
      setActiveDot(clamp(idx, 0, imgs.length - 1));
    }, 70), { passive: true });

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

    if (activeCategory) list = list.filter((p) => p.uiSection === activeCategory);
    if (q) list = list.filter((p) => `${p.title} ${p.sku} ${p.collection}`.toLowerCase().includes(q));
    list = applySort(list);

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
      const card = document.createElement("div");
      card.className = "card hover-fx";
      card.setAttribute("data-sku", p.sku);
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const imgs = p.images?.length ? p.images : (p.img ? [p.img] : []);
      const trackImgs = imgs.map((src) => `<img src="${safeUrl(src)}" width="400" height="500" loading="lazy" decoding="async" alt="${escapeHtml(p.title)}">`).join("");
      const dots = imgs.length > 1
        ? `<div class="card__dots">${imgs.map((_, i) => `<span class="card__dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div>`
        : `<div class="card__dots" hidden></div>`;

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
            <div class="card__meta" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="pill pill--logo">
                <img src="${safeUrl(getLogoForSection(p.uiSection))}" alt="Logo" width="30" height="16" loading="lazy" decoding="async">
              </span>
              ${p.collection ? `<span class="pill pill--red">${escapeHtml(p.collection)}</span>` : ""}
            </div>
            <div class="price">${money(p.priceCents)}</div>
          </div>
          <button class="btn btn--black card__action-btn hover-fx" type="button" aria-label="Ver detalles y comprar">Ver Detalles y Comprar</button>
        </div>
      `;

      card.querySelector(".card__action-btn")?.addEventListener("click", (e) => { e.stopPropagation(); openProduct(p.sku); });
      card.addEventListener("click", () => openProduct(p.sku));
      card.addEventListener("keydown", (e) => { if (e.key === "Enter") openProduct(p.sku); });

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

    if (document.getElementById("productSwipeHint")) return;

    const el = document.createElement("div");
    el.id = "productSwipeHint";
    el.className = "product-swipe-hint";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<span class="product-swipe-hint__txt">Desliza para ver más</span><span class="product-swipe-hint__arr">→</span>`;
    wrap.appendChild(el);

    const dismiss = () => {
      try { localStorage.setItem(STORAGE_KEYS.seenSwipe, "1"); } catch {}
      el.classList.add("is-hide");
      setTimeout(() => el.remove(), 350);
      productGrid?.removeEventListener?.("scroll", dismiss);
    };

    productGrid?.addEventListener?.("scroll", dismiss, { passive: true });
    setTimeout(() => { if (document.body.contains(el)) el.classList.add("is-pulse"); }, 900);
  };

  const getScarcityText = (p) => {
    const stock = Number(p?.stock);
    if (!Number.isFinite(stock)) return "";
    if (stock <= 0) return "⏳ Sin stock por ahora. Confirma por WhatsApp si quieres apartar.";
    if (stock <= 3) return "🔥 Últimas piezas disponibles.";
    return "";
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

    if (pmStockBadge) {
      const stock = Number(p.stock);
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
      pmDesc.innerHTML =
        `<p>${escapeHtml(p.description || "Merch oficial Score Store.")}</p>` +
        (scarcity ? `<p style="color:var(--red); font-weight:bold; margin-top:10px;">${scarcity}</p>` : "");
    }

    if (pmChips) {
      pmChips.innerHTML = `<span class="pill pill--logo"><img src="${safeUrl(getLogoForSection(p.uiSection))}" width="30" height="16" alt="Logo"></span>`;
      if (p.collection) pmChips.innerHTML += `<span class="pill pill--red">${escapeHtml(p.collection)}</span>`;
    }

    if (pmSizePills) {
      pmSizePills.innerHTML = "";
      p.sizes.forEach((s) => {
        const size = String(s || "").trim();
        if (!size) return;

        const btn = document.createElement("button");
        btn.className = "size-pill";
        btn.textContent = size;

        const stock = Number(p.stock);
        const isOut = Number.isFinite(stock) && stock <= 0;

        if (isOut) {
          btn.classList.add("out-of-stock");
          btn.setAttribute("aria-disabled", "true");
          btn.title = "Sin stock";
          btn.onclick = () => showToast("Por ahora no hay stock registrado. Si necesitas apartar, contáctanos por WhatsApp.", "error");
        } else {
          btn.onclick = () => {
            $$(".size-pill").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            selectedSize = size;
          };
        }

        pmSizePills.appendChild(btn);
      });
    }

    if (pmCarousel) {
      const imgs = p.images?.length ? p.images : (p.img ? [p.img] : []);
      pmCarousel.innerHTML = `
        <div class="pm__track" id="pmTrack">
          ${imgs.map((src) => `<img src="${safeUrl(src)}" width="400" height="500" loading="lazy" alt="${escapeHtml(p.title)}">`).join("")}
        </div>
        ${imgs.length > 1 ? `<div class="pm__dots">${imgs.map((_, i) => `<span class="pm__dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div>` : ""}
      `;

      const track = pmCarousel.querySelector("#pmTrack");
      const dots = Array.from(pmCarousel.querySelectorAll(".pm__dot"));

      const setDot = (idx) => dots.forEach((d, i) => d.classList.toggle("active", i === idx));
      const snap = debounce(() => {
        const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
        const k = clamp(idx, 0, Math.max(0, dots.length - 1));
        track.scrollTo({ left: k * (track.clientWidth || 1), behavior: "smooth" });
        setDot(k);
      }, 90);

      dots.forEach((d, i) => d.addEventListener("click", () => {
        track.scrollTo({ left: i * (track.clientWidth || 1), behavior: "smooth" });
        setDot(i);
      }));

      track?.addEventListener("scroll", debounce(() => {
        const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
        setDot(clamp(idx, 0, Math.max(0, dots.length - 1)));
      }, 70), { passive: true });

      track?.addEventListener("touchend", snap, { passive: true });
      track?.addEventListener("pointerup", snap, { passive: true });
      track?.addEventListener("mouseleave", snap);
    }

    openLayer(productModal);
  };

  const loadCart = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cart);
      const parsed = raw ? JSON.parse(raw) : null;
      cart = Array.isArray(parsed) ? parsed : [];
    } catch { cart = []; }
    if (cartCount) cartCount.textContent = String(cart.reduce((a, it) => a + Number(it.qty || 0), 0));
  };

  const saveCart = () => {
    try { localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); } catch {}
    if (cartCount) cartCount.textContent = String(cart.reduce((a, it) => a + Number(it.qty || 0), 0));
  };

  const loadShipping = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ship);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") shipping = { ...shipping, ...parsed };
    } catch {}
  };

  const saveShipping = () => {
    try { localStorage.setItem(STORAGE_KEYS.ship, JSON.stringify(shipping)); } catch {}
  };

  const computeSubtotal = () => cart.reduce((sum, it) => sum + Number(it.priceCents || 0) * Number(it.qty || 0), 0);

  const computeDiscount = (subtotalCents) => {
    if (!activePromo) return 0;
    const type = String(activePromo.type || "").toLowerCase();
    if (type === "percent") {
      const raw = Number(activePromo.value || 0);
      const frac = clamp(raw > 1 ? raw / 100 : raw, 0, 1);
      return Math.round(subtotalCents * frac);
    }
    if (type === "fixed_mxn") return Math.round(Number(activePromo.value || 0) * 100);
    return 0;
  };

  const computeShippingCents = () => {
    if (activePromo && String(activePromo.type || "").toLowerCase() === "free_shipping") return 0;
    if (shipping.mode === "pickup") return 0;
    const cents = Number(shipping?.quote?.amount_cents);
    return Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  };

  const refreshTotals = () => {
    const subtotal = computeSubtotal();
    const discount = computeDiscount(subtotal);
    const ship = computeShippingCents();
    const total = Math.max(0, subtotal - discount + ship);

    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subtotal);
    if (discountLineWrap && discountLineEl) {
      if (discount > 0) { discountLineWrap.hidden = false; discountLineEl.textContent = `-${money(discount)}`; }
      else discountLineWrap.hidden = true;
    }
    if (shippingLineEl) shippingLineEl.textContent = money(ship);
    if (cartTotalEl) cartTotalEl.textContent = money(total);

    if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
  };

  const renderCart = () => {
    if (!cartItemsEl) return;

    cartItemsEl.innerHTML = "";
    if (cart.length === 0) {
      cartItemsEl.innerHTML = `<div class="hint" style="padding:14px;">Tu carrito está vacío.</div>`;
      refreshTotals();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const it of cart) {
      const row = document.createElement("div");
      row.className = "cartitem";
      row.innerHTML = `
        <div class="cartitem__meta">
          <div class="cartitem__title">${escapeHtml(it.title || it.sku)}</div>
          <div class="cartitem__sub">${escapeHtml(it.sku)} ${it.size ? `· Talla: ${escapeHtml(it.size)}` : ""}</div>
        </div>
        <div class="cartitem__right">
          <div class="cartitem__price">${money(it.priceCents)}</div>
          <div class="cartitem__qty">
            <button class="iconbtn iconbtn--dark" data-act="dec" aria-label="Disminuir">−</button>
            <span class="cartitem__qtynum">${Number(it.qty || 1)}</span>
            <button class="iconbtn iconbtn--dark" data-act="inc" aria-label="Aumentar">+</button>
          </div>
          <button class="iconbtn" data-act="del" aria-label="Eliminar" title="Eliminar">✕</button>
        </div>
      `;

      row.querySelector('[data-act="dec"]')?.addEventListener("click", () => { it.qty = Math.max(1, Number(it.qty || 1) - 1); saveCart(); renderCart(); });
      row.querySelector('[data-act="inc"]')?.addEventListener("click", () => { it.qty = Math.min(99, Number(it.qty || 1) + 1); saveCart(); renderCart(); });
      row.querySelector('[data-act="del"]')?.addEventListener("click", () => { cart = cart.filter((x) => x !== it); saveCart(); renderCart(); });

      frag.appendChild(row);
    }
    cartItemsEl.appendChild(frag);
    refreshTotals();
  };

  const validatePromo = () => {
    const code = normCode(promoCode?.value || "");
    if (!code) { activePromo = null; refreshTotals(); return; }

    const rules = Array.isArray(promosData?.rules) ? promosData.rules : [];
    const r = rules.find((x) => normCode(x?.code) === code && !!x?.active);
    if (!r) { activePromo = null; showToast("Código inválido o expirado.", "error"); refreshTotals(); return; }

    const expOk = !r.expires_at || Date.now() <= new Date(r.expires_at).getTime();
    if (!expOk) { activePromo = null; showToast("Código expirado.", "error"); refreshTotals(); return; }

    activePromo = {
      code: String(r.code || "").trim(),
      type: String(r.type || "").trim(),
      value: Number(r.value || 0),
      description: String(r.description || "").trim(),
      min_amount_mxn: Number(r.min_amount_mxn || 0),
    };

    const subtotalMXN = computeSubtotal() / 100;
    if (subtotalMXN < Number(activePromo.min_amount_mxn || 0)) {
      activePromo = null;
      showToast("Tu compra no alcanza el mínimo para ese código.", "error");
      refreshTotals();
      return;
    }

    showToast(activePromo.description || "Promoción aplicada.", "ok");
    refreshTotals();
  };

  const refreshShippingUI = () => {
    if (shipHint) {
      shipHint.textContent =
        shipping.mode === "pickup" ? "Recoger en fábrica (Tijuana)" :
        shipping.mode === "envia_us" ? "Envío USA (Envía.com)" :
        "Envío México (Envía.com)";
    }

    if (shipping.mode === "pickup") {
      if (postalWrap) postalWrap.hidden = true;
      if (shippingNote) shippingNote.textContent = "Recolección sin costo en nuestras instalaciones (Tijuana).";
      shipping.quote = null;
      shipping.postal_code = "";
      if (postalCode) postalCode.value = "";
      saveShipping();
      refreshTotals();
      return;
    }

    if (postalWrap) postalWrap.hidden = false;
    if (shippingNote) shippingNote.textContent = "Ingresa tu CP/ZIP y cotiza en vivo (Envía.com).";
    refreshTotals();
  };

  const doQuote = async () => {
    const zip = String(postalCode?.value || "").trim();
    if (!zip) return showToast("Escribe tu CP/ZIP.", "error");
    if (cart.length === 0) return showToast("Primero agrega productos al carrito.", "error");

    try {
      if (quoteBtn) { quoteBtn.disabled = true; quoteBtn.textContent = "Cotizando..."; }

      const res = await fetch("/api/quote_shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postal_code: zip,
          country: shipping.mode === "envia_us" ? "US" : "MX",
          items: cart.map((it) => ({ qty: Number(it.qty || 1) })),
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j) throw new Error(j?.error || "No se pudo cotizar.");
      if (j?.ok === false) throw new Error(j?.error || "No se pudo cotizar.");

      shipping.postal_code = zip;
      shipping.quote = j;
      saveShipping();

      if (shippingNote) {
        const label = String(j?.label || (shipping.mode === "envia_us" ? "Envío USA" : "Envío MX")).trim();
        const tag = j?.provider === "fallback" ? "estimado" : "en vivo";
        shippingNote.textContent = `${label}: ${money(Number(j?.amount_cents || 0))} (${tag})`;
      }

      showToast(j.provider === "fallback" ? "Envío estimado calculado." : "Envío cotizado.", "ok");
      refreshTotals();
    } catch (e) {
      showToast(String(e?.message || e), "error");
    } finally {
      if (quoteBtn) { quoteBtn.disabled = false; quoteBtn.textContent = "Cotizar"; }
    }
  };

  const doCheckout = async () => {
    if (cart.length === 0) return showToast("Tu carrito está vacío.", "error");
    const needsZip = shipping.mode !== "pickup";
    if (needsZip && !String(shipping.postal_code || "").trim()) return showToast("Cotiza tu envío (CP/ZIP) antes de pagar.", "error");

    const req_id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    try {
      if (checkoutMsg) checkoutMsg.hidden = true;
      if (checkoutLoader) checkoutLoader.hidden = false;

      const payload = {
        req_id,
        shipping_mode: shipping.mode,
        postal_code: needsZip ? String(shipping.postal_code || "").trim() : "",
        promo_code: activePromo?.code || "",
        items: cart.map((it) => ({
          sku: String(it.sku || "").trim(),
          qty: Number(it.qty || 1),
          size: it.size || "Unitalla",
        })),
      };

      const res = await fetch("/api/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || !j?.url) throw new Error(j?.error || "No se pudo iniciar el pago.");

      window.location.href = j.url;
    } catch (e) {
      if (checkoutLoader) checkoutLoader.hidden = true;
      if (checkoutMsg) { checkoutMsg.hidden = false; checkoutMsg.textContent = String(e?.message || e); }
      showToast(String(e?.message || e), "error");
    }
  };

  const appendAssistant = (who, text) => {
    if (!assistantOutput) return;
    const item = document.createElement("div");
    item.className = `chat__msg chat__msg--${who}`;
    item.innerHTML = `<div class="chat__bubble">${escapeHtml(text)}</div>`;
    assistantOutput.appendChild(item);
    assistantOutput.scrollTop = assistantOutput.scrollHeight;
  };

  const askAssistant = async () => {
    const q = String(assistantInput?.value || "").trim();
    if (!q) return;
    assistantInput.value = "";
    appendAssistant("me", q);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "No hay respuesta.");
      appendAssistant("bot", String(j.reply || "Listo."));
    } catch {
      appendAssistant("bot", "Hubo un problema. Intenta de nuevo.");
    }
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
      setTimeout(() => (salesNotification.hidden = true), 3500);
    };
    setTimeout(() => { tick(); setInterval(tick, 18000); }, 7000);
  };

  const registerServiceWorker = () => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").catch(() => {});
  };

  const initEvents = () => {
    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));

    openCartBtn?.addEventListener("click", () => { openLayer(cartDrawer); refreshShippingUI(); renderCart(); });
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    navOpenCart?.addEventListener("click", () => { closeLayer(sideMenu); openLayer(cartDrawer); refreshShippingUI(); renderCart(); });

    const openAssistant = () => {
      openLayer(assistantModal);
      if (assistantOutput && assistantOutput.childElementCount === 0) appendAssistant("bot", "Hola. Soy el asistente de SCORE STORE. ¿Qué buscas hoy? (tallas, envíos, modelos, etc.)");
    };
    openAssistantBtn?.addEventListener("click", openAssistant);
    floatingAssistantBtn?.addEventListener("click", openAssistant);
    navOpenAssistant?.addEventListener("click", () => { closeLayer(sideMenu); openAssistant(); });

    assistantClose?.addEventListener("click", () => closeLayer(assistantModal));
    assistantSendBtn?.addEventListener("click", askAssistant);
    assistantInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") askAssistant(); });

    overlay?.addEventListener("click", () => {
      if (!productModal?.hidden) return closeLayer(productModal);
      if (!sizeGuideModal?.hidden) return closeLayer(sizeGuideModal);
      if (!assistantModal?.hidden) return closeLayer(assistantModal);
      if (!cartDrawer?.hidden) return closeLayer(cartDrawer);
      if (!sideMenu?.hidden) return closeLayer(sideMenu);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!productModal?.hidden) return closeLayer(productModal);
      if (!sizeGuideModal?.hidden) return closeLayer(sizeGuideModal);
      if (!assistantModal?.hidden) return closeLayer(assistantModal);
      if (!cartDrawer?.hidden) return closeLayer(cartDrawer);
      if (!sideMenu?.hidden) return closeLayer(sideMenu);
    });

    scrollToCategoriesBtn?.addEventListener("click", () => document.querySelector("#categories")?.scrollIntoView({ behavior: "smooth", block: "start" }));

    const getTrackStep = () => {
      const card = productGrid?.querySelector?.(".card");
      const cardW = card ? Math.round(card.getBoundingClientRect().width) : 320;
      const gapRaw = productGrid ? getComputedStyle(productGrid).gap : "32px";
      const gap = Math.round(parseFloat(gapRaw) || 32);
      return Math.max(240, cardW + gap);
    };

    const settleProductTrack = debounce(() => {
      if (!productGrid) return;
      const step = getTrackStep();
      const idx = Math.round((productGrid.scrollLeft || 0) / step);
      productGrid.scrollTo({ left: idx * step, behavior: "smooth" });
    }, 120);

    const scrollProductTrack = (dir) => {
      if (!productGrid) return;
      const step = getTrackStep();
      productGrid.scrollBy({ left: dir * step, behavior: "smooth" });
      try { localStorage.setItem(STORAGE_KEYS.seenSwipe, "1"); } catch {}
    };

    scrollLeftBtn?.addEventListener("click", () => scrollProductTrack(-1));
    scrollRightBtn?.addEventListener("click", () => scrollProductTrack(1));
    productGrid?.addEventListener?.("touchend", settleProductTrack, { passive: true });
    productGrid?.addEventListener?.("pointerup", settleProductTrack, { passive: true });
    productGrid?.addEventListener?.("scroll", () => { try { localStorage.setItem(STORAGE_KEYS.seenSwipe, "1"); } catch {} }, { passive: true });

    sortSelect?.addEventListener("change", () => { sortMode = String(sortSelect.value || "featured"); renderProducts(); });

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
      if (searchQuery !== "" && catalogCarouselSection) catalogCarouselSection.hidden = false;
      updateFilterUI();
      renderProducts();
      ensureProductSwipeHint();
    }, 220);

    searchInput?.addEventListener("input", () => { if (mobileSearchInput) mobileSearchInput.value = searchInput.value; if (menuSearchInput) menuSearchInput.value = searchInput.value; triggerSearch(); });
    mobileSearchInput?.addEventListener("input", () => { if (searchInput) searchInput.value = mobileSearchInput.value; if (menuSearchInput) menuSearchInput.value = mobileSearchInput.value; triggerSearch(); });
    menuSearchInput?.addEventListener("input", () => { if (searchInput) searchInput.value = menuSearchInput.value; if (mobileSearchInput) mobileSearchInput.value = menuSearchInput.value; triggerSearch(); try { closeLayer(sideMenu); } catch {} });

    mobileSearchBtn?.addEventListener("click", () => { if (!mobileSearchWrap) return; mobileSearchWrap.hidden = false; mobileSearchInput?.focus(); });
    closeMobileSearchBtn?.addEventListener("click", () => { if (!mobileSearchWrap) return; mobileSearchWrap.hidden = true; });

    pmClose?.addEventListener("click", () => closeLayer(productModal));
    pmBackBtn?.addEventListener("click", () => closeLayer(productModal));
    pmQtyDec?.addEventListener("click", () => { selectedQty = Math.max(1, selectedQty - 1); if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty); });
    pmQtyInc?.addEventListener("click", () => { selectedQty = Math.min(99, selectedQty + 1); if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty); });

    openSizeGuideBtn?.addEventListener("click", () => openLayer(sizeGuideModal));
    closeSizeGuideBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));
    understandSizeBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));

    pmShareBtn?.addEventListener("click", () => {
      if (!currentProduct) return;
      const url = new URL(window.location.href);
      url.searchParams.set("sku", currentProduct.sku);
      navigator.clipboard?.writeText(url.toString()).then(
        () => showToast("Link copiado para compartir.", "ok"),
        () => showToast("No se pudo copiar el link.", "error")
      );
    });

    pmAdd?.addEventListener("click", () => {
      if (!currentProduct) return;
      if (!selectedSize) return showToast("Selecciona una talla.", "error");

      const found = cart.find((x) => x.sku === currentProduct.sku && x.size === selectedSize);
      if (found) found.qty = Math.min(99, Number(found.qty || 1) + selectedQty);
      else cart.push({ sku: currentProduct.sku, title: currentProduct.title, priceCents: currentProduct.priceCents, size: selectedSize, qty: selectedQty });

      saveCart();
      showToast("Agregado al carrito.", "ok");
      closeLayer(productModal);

      openLayer(cartDrawer);
      refreshShippingUI();
      renderCart();
    });

    $$('input[name="shipMode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        shipping.mode = String(radio.value || "pickup");
        shipping.quote = null;
        shipping.postal_code = "";
        saveShipping();
        refreshShippingUI();
      });
    });

    quoteBtn?.addEventListener("click", doQuote);

    applyPromoBtn?.addEventListener("click", validatePromo);
    promoCode?.addEventListener("keydown", (e) => { if (e.key === "Enter") validatePromo(); });

    continueShoppingBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    checkoutBtn?.addEventListener("click", doCheckout);

    const consentDecision = localStorage.getItem(STORAGE_KEYS.consent);
    if (!consentDecision && cookieBanner) cookieBanner.hidden = false;

    cookieAccept?.addEventListener("click", () => {
      try { localStorage.setItem(STORAGE_KEYS.consent, "accept"); } catch {}
      if (cookieBanner) cookieBanner.hidden = true;
      if (siteSettings.pixel_id) loadMetaPixel(siteSettings.pixel_id);
    });

    cookieReject?.addEventListener("click", () => {
      try { localStorage.setItem(STORAGE_KEYS.consent, "reject"); } catch {}
      if (cookieBanner) cookieBanner.hidden = true;
    });

    promoBarClose?.addEventListener("click", () => {
      try { localStorage.setItem(STORAGE_KEYS.promoDismiss, "1"); } catch {}
      if (promoBar) promoBar.hidden = true;
    });

    const onScroll = debounce(() => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (!scrollTopBtn) return;
      scrollTopBtn.hidden = y < 800;
    }, 80);

    window.addEventListener("scroll", onScroll, { passive: true });
    scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const init = async () => {
    if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;

    registerServiceWorker();

    loadCart();
    loadShipping();
    initEvents();
    fetchSiteSettings();
    await fetchPromos();
    refreshShippingUI();
    renderCart();
    refreshTotals();

    try {
      catalog = await fetchCatalog();
      products = (catalog?.products || []).map(normalizeProduct).filter((p) => p.sku);

      renderCategories();
      updateFilterUI();
      renderProducts();
      ensureProductSwipeHint();

      const qs = new URLSearchParams(window.location.search);
      const deepSku = qs.get("sku");
      if (deepSku && products.some((x) => x.sku === deepSku)) openProduct(deepSku);
    } catch {
      showToast("Problemas al cargar el catálogo principal. Verifica tu conexión.", "error");
    } finally {
      setTimeout(() => {
        if (splash) { splash.classList.add("fade-out"); setTimeout(() => (splash.hidden = true), 800); }
        initNeuromarketing();
      }, 2200);
    }
  };

  init().catch(() => { if (splash) splash.hidden = true; });
})();
