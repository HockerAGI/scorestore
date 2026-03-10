/* =========================================================
   SCORE STORE — main.js
   Base UX/UI: deploy antiguo bueno
   Base funcional: repo actual
   Build: 2026-03-09-fusion-v2
========================================================= */
(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.03.09.SCORESTORE.FUSION";
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
      .replaceAll("\\", "/")
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

    if (s1.startsWith("/")) return s1;
    if (s1.startsWith("assets/") || s1.startsWith("css/") || s1.startsWith("js/") || s1.startsWith("data/")) return `/${s1}`;
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

  const footerNote = $("#footerNote");
  const footerEmailLink = $("#footerEmailLink");
  const footerEmailText = $("#footerEmailText");
  const footerWhatsappLink = $("#footerWhatsappLink");
  const footerWhatsappText = $("#footerWhatsappText");
  const footerFacebookLink = $("#footerFacebookLink");
  const footerInstagramLink = $("#footerInstagramLink");
  const footerYoutubeLink = $("#footerYoutubeLink");

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
    { uiId: "SF250",  name: "SAN FELIPE 250", logo: "assets/logo-sf250.webp", mapFrom: ["SF250", "SF_250"] },
  ];

  const normalizeSectionIdToUi = (sectionId) => {
    const sid = String(sectionId || "").trim().toUpperCase();
    const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
    return found ? found.uiId : "BAJA1000";
  };

  const getLogoForSection = (uiId) => (CATEGORY_CONFIG.find((c) => c.uiId === uiId)?.logo || "assets/logo-baja1000.webp");

  const inferCollection = (p) => {
    const sid = String(p?.sectionId || p?.section_id || p?.section || "").trim();
    if (sid === "EDICION_2025") return "Edición 2025";
    if (sid === "OTRAS_EDICIONES") return "Ediciones Clásicas";
    return String(p?.collection || p?.sub_section || "").trim();
  };

  const normalizeProduct = (p) => {
    const sku = String(p?.sku || p?.id || "").trim();
    const title = String(p?.title || p?.name || "Producto Oficial").trim();
    const priceCents = Number.isFinite(Number(p?.price_cents))
      ? Math.round(Number(p.price_cents))
      : Number.isFinite(Number(p?.price_mxn))
        ? Math.round(Number(p.price_mxn) * 100)
        : Number.isFinite(Number(p?.base_mxn))
          ? Math.round(Number(p.base_mxn) * 100)
          : 0;

    const images = Array.isArray(p?.images) ? p.images : (p?.img ? [p.img] : []);
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL", "XXL"];
    const rawSection = String(p?.sectionId || p?.section_id || p?.categoryId || p?.section || "").trim();
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

  const siteSettings = {
    promo_active: false,
    promo_text: "",
    pixel_id: "",
    maintenance_mode: false,
    home: { footer_note: "", shipping_note: "" },
    socials: { facebook: "", instagram: "", youtube: "" },
    contact: {
      email: "ventas.unicotextil@gmail.com",
      whatsapp_e164: "5216642368701",
      whatsapp_display: "664 236 8701",
    },
  };

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
        const j = await res.json().catch(() => null);
        if (j) return j;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("No se pudo cargar JSON");
  };

  const fetchCatalog = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    return await fetchJsonFirstOk([
      `/.netlify/functions/catalog?cv=${cv}`,
      `/data/catalog.json?cv=${cv}`,
    ]);
  };

  const fetchPromos = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    try {
      promosData = await fetchJsonFirstOk([
        `/.netlify/functions/promos?cv=${cv}`,
        `/data/promos.json?cv=${cv}`,
      ]);
      if (!promosData || !Array.isArray(promosData.rules)) promosData = { rules: [] };
    } catch {
      promosData = { rules: [] };
    }
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
    siteSettings.maintenance_mode = !!s.maintenance_mode;
    siteSettings.home = { ...(siteSettings.home || {}), ...(s.home || {}) };
    siteSettings.socials = { ...(siteSettings.socials || {}), ...(s.socials || {}) };
    siteSettings.contact = { ...(siteSettings.contact || {}), ...(s.contact || {}) };

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

    if (footerNote) {
      footerNote.textContent = siteSettings.home?.footer_note || "Pago cifrado vía Stripe. Aceptamos OXXO Pay. Logística inteligente internacional con Envía.com.";
    }
    if (shippingNote) {
      shippingNote.textContent = siteSettings.home?.shipping_note || "";
    }

    if (footerEmailLink && footerEmailText && siteSettings.contact?.email) {
      footerEmailLink.href = `mailto:${siteSettings.contact.email}`;
      footerEmailText.textContent = siteSettings.contact.email;
    }

    if (footerWhatsappLink && footerWhatsappText && siteSettings.contact?.whatsapp_e164) {
      footerWhatsappLink.href = `https://wa.me/${encodeURIComponent(siteSettings.contact.whatsapp_e164)}`;
      footerWhatsappText.textContent = siteSettings.contact.whatsapp_display || siteSettings.contact.whatsapp_e164;
    }

    if (footerFacebookLink && siteSettings.socials?.facebook) footerFacebookLink.href = siteSettings.socials.facebook;
    if (footerInstagramLink && siteSettings.socials?.instagram) footerInstagramLink.href = siteSettings.socials.instagram;
    if (footerYoutubeLink && siteSettings.socials?.youtube) footerYoutubeLink.href = siteSettings.socials.youtube;
  };

  const fetchSiteSettings = async () => {
    const cv = encodeURIComponent(APP_VERSION);
    try {
      const j = await fetchJsonFirstOk([`/.netlify/functions/site_settings?cv=${cv}`]);
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
    let list = [...products];
    const q = String(searchQuery || "").trim().toLowerCase();

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
            $$(".size-pill", pmSizePills).forEach((b) => b.classList.remove("active"));
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
    if (postalCode && shipping.postal_code) postalCode.value = shipping.postal_code;
  };

  const saveShipping = () => {
    try { localStorage.setItem(STORAGE_KEYS.ship, JSON.stringify(shipping)); } catch {}
  };

  const getCartSubtotal = () => cart.reduce((acc, it) => acc + (Number(it.priceCents || 0) * Number(it.qty || 0)), 0);

  const getDiscountAmount = () => {
    if (!activePromo) return 0;
    const subtotal = getCartSubtotal();

    if (String(activePromo.type) === "percent" || String(activePromo.type) === "percentage") {
      return Math.round(subtotal * (Number(activePromo.value || 0) / 100));
    }
    if (String(activePromo.type) === "fixed") {
      return Math.min(subtotal, Math.round(Number(activePromo.value || 0) * 100));
    }
    return 0;
  };

  const getShippingAmount = () => {
    if (shipping.mode === "pickup") return 0;
    const cents = Number(shipping?.quote?.amount_cents);
    return Number.isFinite(cents) ? cents : 0;
  };

  const refreshTotals = () => {
    const subtotal = getCartSubtotal();
    const shippingAmount = getShippingAmount();
    const discount = getDiscountAmount();
    const total = Math.max(0, subtotal + shippingAmount - discount);

    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subtotal);
    if (shippingLineEl) shippingLineEl.textContent = money(shippingAmount);
    if (discountLineWrap && discountLineEl) {
      discountLineWrap.hidden = !(discount > 0);
      discountLineEl.textContent = `-${money(discount)}`;
    }
    if (cartTotalEl) cartTotalEl.textContent = money(total);
  };

  const renderCart = () => {
    if (!cartItemsEl) return;

    if (!cart.length) {
      cartItemsEl.innerHTML = `<div class="hint" style="padding:10px 0;">Tu carrito está vacío.</div>`;
      refreshTotals();
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    cartItemsEl.innerHTML = cart.map((it, idx) => `
      <div class="cartitem">
        <img class="cartitem__img" src="${safeUrl(it.img)}" alt="${escapeHtml(it.title)}" width="72" height="72" loading="lazy">
        <div class="cartitem__body">
          <div class="cartitem__title">${escapeHtml(it.title)}</div>
          <div class="cartitem__meta">${escapeHtml(it.size || "")}</div>
          <div class="cartitem__price">${money(it.priceCents)}</div>
          <div class="cartitem__actions">
            <button class="qtybtn" data-cart-dec="${idx}" type="button">−</button>
            <span>${Number(it.qty || 0)}</span>
            <button class="qtybtn" data-cart-inc="${idx}" type="button">+</button>
            <button class="linkbtn" data-cart-remove="${idx}" type="button">Eliminar</button>
          </div>
        </div>
      </div>
    `).join("");

    $$("[data-cart-dec]").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-cart-dec"));
      if (!Number.isFinite(idx) || !cart[idx]) return;
      cart[idx].qty = Math.max(1, Number(cart[idx].qty || 1) - 1);
      saveCart();
      renderCart();
    }));

    $$("[data-cart-inc]").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-cart-inc"));
      if (!Number.isFinite(idx) || !cart[idx]) return;
      cart[idx].qty = Math.min(99, Number(cart[idx].qty || 1) + 1);
      saveCart();
      renderCart();
    }));

    $$("[data-cart-remove]").forEach((btn) => btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-cart-remove"));
      if (!Number.isFinite(idx)) return;
      cart.splice(idx, 1);
      saveCart();
      renderCart();
    }));

    if (cartCount) cartCount.textContent = String(cart.reduce((a, it) => a + Number(it.qty || 0), 0));
    refreshTotals();
    if (checkoutBtn) checkoutBtn.disabled = !cart.length || !!siteSettings.maintenance_mode;
  };

  const applyShipMode = (mode) => {
    shipping.mode = mode || "pickup";
    if (!["pickup", "envia_mx", "envia_us"].includes(shipping.mode)) shipping.mode = "pickup";

    $$("[data-ship-mode]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-ship-mode") === shipping.mode));
    postalWrap.hidden = shipping.mode === "pickup";

    if (shipping.mode === "pickup") {
      shipHint.textContent = "Recoge tu pedido en fábrica o punto acordado.";
    } else if (shipping.mode === "envia_mx") {
      shipHint.textContent = "Cotización nacional MX por código postal.";
    } else {
      shipHint.textContent = "Cotización USA por ZIP Code.";
    }

    saveShipping();
    refreshTotals();
  };

  const validatePromo = async () => {
    const code = String(promoCode?.value || "").trim();
    if (!code) {
      activePromo = null;
      refreshTotals();
      showToast("Escribe un código promo.", "error");
      return;
    }

    try {
      const res = await fetch(`/.netlify/functions/promos?code=${encodeURIComponent(code)}`, {
        headers: { "cache-control": "no-store" },
      });
      const j = await res.json().catch(() => null);

      if (!res.ok || !j?.ok || !j?.promo) {
        activePromo = null;
        refreshTotals();
        showToast(j?.error || "Código no válido.", "error");
        return;
      }

      activePromo = j.promo;
      refreshTotals();
      showToast("Promo aplicada.", "ok");
    } catch {
      activePromo = null;
      refreshTotals();
      showToast("No pude validar el código promo.", "error");
    }
  };

  const quoteShipping = async () => {
    const postal = String(postalCode?.value || "").trim();
    if (shipping.mode !== "pickup" && !postal) {
      showToast("Escribe tu CP / ZIP.", "error");
      return;
    }

    shipping.postal_code = postal;

    if (shipping.mode === "pickup") {
      shipping.quote = { amount_cents: 0 };
      saveShipping();
      refreshTotals();
      showToast("Entrega pickup activada.", "ok");
      return;
    }

    try {
      const res = await fetch("/.netlify/functions/quote_shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({
          items: cart.map((it) => ({
            sku: it.sku,
            qty: it.qty,
            size: it.size,
          })),
          shipping_mode: shipping.mode,
          postal_code: postal,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "No se pudo cotizar.");

      shipping.quote = j;
      saveShipping();
      refreshTotals();
      showToast("Envío cotizado.", "ok");
    } catch (e) {
      shipping.quote = null;
      saveShipping();
      refreshTotals();
      showToast(String(e?.message || "No se pudo cotizar."), "error");
    }
  };

  const addCurrentProductToCart = () => {
    if (!currentProduct) return;
    if (!selectedSize) {
      showToast("Selecciona una talla.", "error");
      return;
    }

    const idx = cart.findIndex((it) => it.sku === currentProduct.sku && it.size === selectedSize);
    if (idx >= 0) {
      cart[idx].qty += selectedQty;
    } else {
      cart.push({
        sku: currentProduct.sku,
        title: currentProduct.title,
        img: currentProduct.images?.[0] || currentProduct.img || "",
        priceCents: currentProduct.priceCents,
        size: selectedSize,
        qty: selectedQty,
      });
    }

    saveCart();
    renderCart();
    closeLayer(productModal);
    showToast("Producto agregado al carrito.", "ok");
  };

  const createCheckout = async () => {
    if (!cart.length) {
      showToast("Tu carrito está vacío.", "error");
      return;
    }

    if (siteSettings.maintenance_mode) {
      showToast("La tienda está temporalmente en mantenimiento.", "error");
      return;
    }

    if (shipping.mode !== "pickup" && !shipping.quote) {
      showToast("Primero cotiza tu envío.", "error");
      return;
    }

    checkoutMsg.hidden = true;
    setCheckoutLoader(true);

    try {
      const res = await fetch("/.netlify/functions/create_checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({
          items: cart.map((it) => ({ sku: it.sku, qty: it.qty, size: it.size })),
          shipping_mode: shipping.mode,
          postal_code: shipping.postal_code || "",
          promo_code: String(promoCode?.value || "").trim(),
          quote: shipping.quote,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok || !j?.url) throw new Error(j?.error || "No se pudo iniciar el checkout.");

      location.href = j.url;
    } catch (e) {
      checkoutMsg.hidden = false;
      checkoutMsg.textContent = String(e?.message || "No se pudo iniciar el checkout.");
      showToast(checkoutMsg.textContent, "error");
    } finally {
      setCheckoutLoader(false);
    }
  };

  const setCheckoutLoader = (on) => {
    if (checkoutLoader) checkoutLoader.hidden = !on;
  };

  const bindGeneralUi = () => {
    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));

    openCartBtn?.addEventListener("click", () => openLayer(cartDrawer));
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    navOpenCart?.addEventListener("click", () => { closeLayer(sideMenu); openLayer(cartDrawer); });

    openAssistantBtn?.addEventListener("click", () => openLayer(assistantModal));
    floatingAssistantBtn?.addEventListener("click", () => openLayer(assistantModal));
    navOpenAssistant?.addEventListener("click", () => { closeLayer(sideMenu); openLayer(assistantModal); });
    assistantClose?.addEventListener("click", () => closeLayer(assistantModal));

    pmBackBtn?.addEventListener("click", () => closeLayer(productModal));
    pmClose?.addEventListener("click", () => closeLayer(productModal));
    closeSizeGuideBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));
    understandSizeBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));
    openSizeGuideBtn?.addEventListener("click", () => openLayer(sizeGuideModal));

    overlay?.addEventListener("click", () => {
      closeLayer(sideMenu);
      closeLayer(cartDrawer);
      closeLayer(assistantModal);
      closeLayer(productModal);
      closeLayer(sizeGuideModal);
    });

    scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => {
      if (scrollTopBtn) scrollTopBtn.classList.toggle("is-visible", window.scrollY > 500);
    }, { passive: true });

    mobileSearchBtn?.addEventListener("click", () => {
      if (mobileSearchWrap) {
        mobileSearchWrap.hidden = false;
        mobileSearchInput?.focus();
      }
    });
    closeMobileSearchBtn?.addEventListener("click", () => {
      if (mobileSearchWrap) mobileSearchWrap.hidden = true;
    });

    searchInput?.addEventListener("input", debounce(() => {
      searchQuery = String(searchInput.value || "").trim();
      if (mobileSearchInput) mobileSearchInput.value = searchQuery;
      if (menuSearchInput) menuSearchInput.value = searchQuery;
      updateFilterUI();
      renderProducts();
    }, 130));

    mobileSearchInput?.addEventListener("input", debounce(() => {
      searchQuery = String(mobileSearchInput.value || "").trim();
      if (searchInput) searchInput.value = searchQuery;
      if (menuSearchInput) menuSearchInput.value = searchQuery;
      updateFilterUI();
      renderProducts();
    }, 130));

    menuSearchInput?.addEventListener("input", debounce(() => {
      searchQuery = String(menuSearchInput.value || "").trim();
      if (searchInput) searchInput.value = searchQuery;
      if (mobileSearchInput) mobileSearchInput.value = searchQuery;
      updateFilterUI();
      renderProducts();
    }, 130));

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
      updateFilterUI();
      renderProducts();
    });

    scrollToCategoriesBtn?.addEventListener("click", () => {
      document.querySelector("#categories")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    scrollLeftBtn?.addEventListener("click", () => {
      productGrid?.scrollBy({ left: -Math.max(300, productGrid.clientWidth * 0.8), behavior: "smooth" });
    });

    scrollRightBtn?.addEventListener("click", () => {
      productGrid?.scrollBy({ left: Math.max(300, productGrid.clientWidth * 0.8), behavior: "smooth" });
    });

    promoBarClose?.addEventListener("click", () => {
      if (promoBar) promoBar.hidden = true;
      try { localStorage.setItem(STORAGE_KEYS.promoDismiss, "1"); } catch {}
    });

    $$("[data-ship-mode]").forEach((btn) => {
      btn.addEventListener("click", () => applyShipMode(btn.getAttribute("data-ship-mode")));
    });

    quoteBtn?.addEventListener("click", quoteShipping);
    applyPromoBtn?.addEventListener("click", validatePromo);
    continueShoppingBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    checkoutBtn?.addEventListener("click", createCheckout);

    pmQtyDec?.addEventListener("click", () => {
      selectedQty = clamp(selectedQty - 1, 1, 99);
      if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
    });

    pmQtyInc?.addEventListener("click", () => {
      selectedQty = clamp(selectedQty + 1, 1, 99);
      if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
    });

    pmAdd?.addEventListener("click", addCurrentProductToCart);

    pmShareBtn?.addEventListener("click", async () => {
      if (!currentProduct) return;
      const url = `${location.origin}${location.pathname}#sku=${encodeURIComponent(currentProduct.sku)}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: currentProduct.title, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          showToast("Link copiado.", "ok");
        }
      } catch {}
    });

    assistantSendBtn?.addEventListener("click", sendAssistantMessage);
    assistantInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAssistantMessage();
    });

    cookieAccept?.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEYS.consent, "accept");
      cookieBanner.hidden = true;
      if (siteSettings.pixel_id) loadMetaPixel(siteSettings.pixel_id);
    });

    cookieReject?.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEYS.consent, "reject");
      cookieBanner.hidden = true;
    });

    $$("[data-scroll]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-scroll");
        if (!target) return;
        closeLayer(sideMenu);
        document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const appendAssistantBubble = (role, text) => {
    if (!assistantOutput) return;
    const el = document.createElement("div");
    el.className = `chat__bubble chat__bubble--${role}`;
    el.textContent = String(text || "");
    assistantOutput.appendChild(el);
    assistantOutput.scrollTop = assistantOutput.scrollHeight;
  };

  const sendAssistantMessage = async () => {
    const message = String(assistantInput?.value || "").trim();
    if (!message) return;

    appendAssistantBubble("user", message);
    if (assistantInput) assistantInput.value = "";

    try {
      const res = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cache-control": "no-store" },
        body: JSON.stringify({ message }),
      });

      const j = await res.json().catch(() => null);
      appendAssistantBubble("assistant", j?.reply || "No tuve una respuesta disponible.");
    } catch {
      appendAssistantBubble("assistant", "No pude conectarme con el asistente en este momento.");
    }
  };

  const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    let refreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const activateWaiting = (registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

      if (registration.waiting) activateWaiting(registration);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            activateWaiting(registration);
          }
        });
      });

      try { await navigator.serviceWorker.ready; } catch {}
      try { await registration.update(); } catch {}
    } catch (err) {
      console.error("SW register error:", err);
    }
  };

  const runAmbientSales = () => {
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
        setTimeout(() => { salesNotification.hidden = true; }, 180);
      }, 3200);
    }, 18000);
  };

  const initConsent = () => {
    const consent = localStorage.getItem(STORAGE_KEYS.consent);
    cookieBanner.hidden = !!consent;
  };

  const boot = async () => {
    try {
      if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;

      bindGeneralUi();
      initConsent();
      loadCart();
      loadShipping();
      renderCart();
      applyShipMode(shipping.mode || "pickup");

      await registerServiceWorker();
      await Promise.all([fetchPromos(), fetchSiteSettings()]);

      catalog = await fetchCatalog();
      products = Array.isArray(catalog?.products) ? catalog.products.map(normalizeProduct) : [];

      renderCategories();
      updateFilterUI();
      renderProducts();
      ensureProductSwipeHint();
      runAmbientSales();

      if (location.hash.startsWith("#sku=")) {
        const sku = decodeURIComponent(location.hash.replace("#sku=", ""));
        const p = products.find((x) => x.sku === sku);
        if (p) setTimeout(() => openProduct(sku), 250);
      }
    } catch (e) {
      console.error(e);
      showToast("No pude cargar la tienda completa.", "error");
    } finally {
      setTimeout(() => {
        if (splash) splash.classList.add("is-out");
        setTimeout(() => { if (splash) splash.hidden = true; }, 700);
      }, 350);
    }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();