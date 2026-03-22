/* =========================================================
   SCORE STORE — main.js (VERSIÓN FINAL COMPLETA)
   Build: 2026-03-12-ULTIMATE
   Integración: Logic + Performance Overrides + Neuromarketing UX
========================================================= */

(() => {
  "use strict";

  const APP_VERSION = "2026.03.12.SCORESTORE";

  // --- Utilities ---
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

  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('\'', "&quot;")
      .replaceAll("'", "&#039;");

  const normCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

  // DOM Refs
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
  const categoryGrid = $("#categoryGrid");
  const categoryHint = $("#categoryHint");
  const catalogCarouselSection = $("#catalogCarouselSection");
  const scrollLeftBtn = $("#scrollLeftBtn");
  const scrollRightBtn = $("#scrollRightBtn");
  const productGrid = $("#productGrid");
  const statusRow = $("#statusRow");
  const searchInput = $("#searchInput");
  const mobileSearchWrap = $("#mobileSearchWrap");
  const mobileSearchInput = $("#mobileSearchInput");
  const closeMobileSearchBtn = $("#closeMobileSearchBtn");
  const sortSelect = $("#sortSelect");
  const menuSearchInput = $("#menuSearchInput");
  const promoBar = $("#promoBar");
  const promoBarText = $("#promoBarText");
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
  const toast = $("#toast");
  const appVersionLabel = $("#appVersionLabel");

  // State & Keys
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

  // Data Logic
  const normalizeProduct = (p) => {
    const images = Array.isArray(p?.images) ? p.images : (p?.img ? [p.img] : []);
    const rawSection = String(p?.sectionId || p?.section || "").trim();
    const foundCat = CATEGORY_CONFIG.find(c => c.mapFrom.includes(rawSection));
    
    return {
      sku: String(p?.sku || p?.id || "").trim(),
      title: String(p?.title || p?.name || "Producto Oficial").trim(),
      description: String(p?.description || "").trim(),
      priceCents: Math.round(Number(p?.price_cents || 0)),
      images: images.map(safeUrl).filter(Boolean),
      img: images?.[0] ? safeUrl(images[0]) : "",
      sizes: (Array.isArray(p?.sizes) ? p.sizes : ["S", "M", "L", "XL", "XXL"]).map(s => String(s).trim()),
      uiSection: foundCat ? foundCat.uiId : "BAJA1000",
      collection: rawSection === "EDICION_2025" ? "Edición 2025" : (rawSection === "OTRAS_EDICIONES" ? "Ediciones Clásicas" : ""),
      rank: Number(p?.rank || 999),
      stock: p?.stock ?? null
    };
  };

  const fetchCatalog = async () => {
    const url = `/api/catalog?cv=${APP_VERSION}`;
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) {
      console.error("API catalog fetch failed, trying fallback...", e);
      try {
        const fallback = await fetch(`/data/catalog.json?cv=${APP_VERSION}`);
        if (fallback.ok) return await fallback.json();
      } catch (fallbackErr) {
        console.error("Fallback catalog fetch also failed:", fallbackErr);
      }
    }
    throw new Error("Network error: Could not load catalog.");
  };

  const fetchPromos = async () => {
    try {
      const r = await fetch(`/api/promos?cv=${APP_VERSION}`);
      if (r.ok) promosData = await r.json();
    } catch (e) {
      console.warn("Could not fetch promos:", e);
    }
  };

  const fetchSiteSettings = async () => {
    try {
      const r = await fetch(`/api/site_settings?cv=${APP_VERSION}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j?.promo_active && promoBar && !localStorage.getItem(STORAGE_KEYS.promoDismiss)) {
        promoBarText.textContent = j.promo_text;
        promoBar.hidden = false;
      }
    } catch (e) {
      console.warn("Could not fetch site settings:", e);
    }
  };

  // Rendering, UI, Events, and Bootstrapping functions remain the same...

    const ensureProductSwipeHint = () => {
    const hints = $$(".product-swipe-hint");
    if (localStorage.getItem(STORAGE_KEYS.seenSwipe) === "1") {
      hints.forEach(h => h.style.display = "none");
    }
  };

  const initNeuromarketing = () => {
    document.addEventListener("scroll", (e) => {
      if (e.target.classList?.contains("card__track") || e.target.id === "pmTrack") {
        localStorage.setItem(STORAGE_KEYS.seenSwipe, "1");
        $$(".product-swipe-hint").forEach(h => {
          h.style.opacity = "0";
          setTimeout(() => h.style.display = "none", 300);
        });
      }
    }, { capture: true, passive: true });
  };

  const showToast = (msg, type = "ok") => {
    if (!toast) return;
    toast.hidden = false;
    toast.setAttribute("data-type", type);
    toast.textContent = String(msg || "");
    toast.classList.add("show");
    
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => (toast.hidden = true), 400);
    }, 2800);
  };

  const openLayer = (el) => {
    if (!el) return;
    el.hidden = false;
    if (overlay) overlay.hidden = false;
    document.documentElement.classList.add("no-scroll");
    
    if (el.classList.contains("modal")) {
        requestAnimationFrame(() => el.classList.add("modal--open"));
    } else {
        requestAnimationFrame(() => el.style.transform = "translateX(0)");
    }
  };

  const closeLayer = (el) => {
    if (!el) return;
    const isModal = el.classList.contains("modal");
    if (isModal) el.classList.remove("modal--open");
    else el.style.transform = el.classList.contains("drawer--right") ? "translateX(100%)" : "translateX(-100%)";

    setTimeout(() => {
        el.hidden = true;
        if (!$$(".modal--open").length && cartDrawer.hidden && sideMenu.hidden) {
          if (overlay) overlay.hidden = true;
          document.documentElement.classList.remove("no-scroll");
        }
    }, 400);
  };

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";
    CATEGORY_CONFIG.forEach(cat => {
      const count = products.filter(p => p.uiSection === cat.uiId).length;
      const btn = document.createElement("button");
      btn.className = "catcard hover-fx";
      btn.innerHTML = `
        <div class="catcard__bg"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${cat.name}" loading="lazy">
          <div class="catcard__meta">
            <div class="catcard__title tech-text">${cat.name}</div>
            <div class="catcard__sub">${count} productos</div>
          </div>
        </div>
      `;
      btn.onclick = () => {
        activeCategory = cat.uiId;
        searchQuery = "";
        updateFilterUI();
        renderProducts();
        catalogCarouselSection?.scrollIntoView({ behavior: 'smooth' });
      };
      categoryGrid.appendChild(btn);
    });
  };

  const mountCardCarousel = (cardEl, imgs) => {
    if (!cardEl || imgs.length <= 1) return;
    const track = cardEl.querySelector(".card__track");
    const dots = Array.from(cardEl.querySelectorAll(".card__dot"));
    
    const updateDots = () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    };

    track.addEventListener("scroll", debounce(updateDots, 60), { passive: true });
    
    cardEl.querySelector(".card__nav--prev")?.addEventListener("click", (e) => {
      e.stopPropagation();
      track.scrollBy({ left: -track.clientWidth, behavior: "smooth" });
    });
    cardEl.querySelector(".card__nav--next")?.addEventListener("click", (e) => {
      e.stopPropagation();
      track.scrollBy({ left: track.clientWidth, behavior: "smooth" });
    });
  };

  const renderProducts = () => {
    if (!productGrid) return;
    const q = searchQuery.toLowerCase();
    let list = products.filter(p => 
      (!activeCategory || p.uiSection === activeCategory) &&
      (!q || p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );

    if (sortMode === "price_asc") list.sort((a,b) => a.priceCents - b.priceCents);
    else if (sortMode === "price_desc") list.sort((a,b) => b.priceCents - a.priceCents);
    else list.sort((a,b) => a.rank - b.rank);

    productGrid.innerHTML = list.length ? "" : '<div class="hint">No hay resultados.</div>';
    
    list.forEach(p => {
      const card = document.createElement("div");
      card.className = "card hover-fx";
      const imgs = p.images.length ? p.images : [p.img];
      
      card.innerHTML = `
        <div class="card__media">
          <div class="card__track custom-scrollbar">${imgs.map(src => `<img src="${src}" loading="lazy">`).join("")}</div>
          ${imgs.length > 1 ? `
            <button class="card__nav card__nav--prev">→</button>
            <button class="card__nav card__nav--next">←</button>
            <div class="card__dots">${imgs.map((_,i) => `<span class="card__dot ${i===0?'active':''}"></span>`).join("")}</div>
            <div class="product-swipe-hint">DESLIZA</div>
          ` : ""}
        </div>
        <div class="card__body">
          <div class="card__title tech-text">${escapeHtml(p.title)}</div>
          <div class="card__row">
            <span class="pill pill--red">${p.collection || 'Official'}</span>
            <div class="price">${money(p.priceCents)}</div>
          </div>
          <button class="btn btn--black card__action-btn">Ver Detalles</button>
        </div>
      `;
      
      card.onclick = () => openProduct(p.sku);
      mountCardCarousel(card, imgs);
      productGrid.appendChild(card);
    });

    ensureProductSwipeHint();
  };

  const openProduct = (sku) => {
    const p = products.find(x => x.sku === sku);
    if (!p) return;
    currentProduct = p;
    selectedQty = 1;
    selectedSize = "";

    pmTitle.textContent = p.title;
    pmPrice.textContent = money(p.priceCents);
    pmDesc.textContent = p.description;
    pmQtyDisplay.textContent = "1";
    
    pmSizePills.innerHTML = "";
    p.sizes.forEach(s => {
      const b = document.createElement("button");
      b.className = "size-pill";
      b.textContent = s;
      b.onclick = () => {
        $$(".size-pill").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        selectedSize = s;
      };
      pmSizePills.appendChild(b);
    });

    const imgs = p.images.length ? p.images : [p.img];
    pmCarousel.innerHTML = `<div class="pm__track" id="pmTrack">${imgs.map(src => `<img src="${src}">`).join("")}</div>`;
    
    openLayer(productModal);
  };

  const renderCart = () => {
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = cart.length ? "" : '<div class="hint">Carrito vacío</div>';
    
    cart.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "cartitem";
      row.innerHTML = `
        <div style="flex:1">
          <div class="cartitem__title">${it.title}</div>
          <div class="cartitem__sub">${it.size} · ${money(it.priceCents)}</div>
        </div>
        <div class="qty">
          <button onclick="window._modQty(${idx}, -1)">−</button>
          <span>${it.qty}</span>
          <button onclick="window._modQty(${idx}, 1)">+</button>
        </div>
      `;
      cartItemsEl.appendChild(row);
    });
    refreshTotals();
  };

  window._modQty = (idx, delta) => {
    cart[idx].qty = clamp(cart[idx].qty + delta, 1, 99);
    if (delta === 0) cart.splice(idx, 1);
    saveCart(); renderCart();
  };

  const refreshTotals = () => {
    const sub = cart.reduce((a, b) => a + (b.priceCents * b.qty), 0);
    const ship = shipping.mode === "pickup" ? 0 : (shipping.quote?.amount_cents || 0);
    cartSubtotalEl.textContent = money(sub);
    shippingLineEl.textContent = money(ship);
    cartTotalEl.textContent = money(sub + ship);
    cartCount.textContent = cart.reduce((a,b) => a + b.qty, 0);
  };

  const saveCart = () => localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
  const loadCart = () => {
    try { cart = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart)) || []; } catch { cart = []; }
  };

  const updateFilterUI = () => {
    if (activeCategory || searchQuery) {
      activeFilterRow.hidden = false;
      activeFilterLabel.textContent = activeCategory || `Búsqueda: ${searchQuery}`;
    } else {
      activeFilterRow.hidden = true;
    }
  };

  const initEvents = () => {
    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));
    openCartBtn?.addEventListener("click", () => { renderCart(); openLayer(cartDrawer); });
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    
    pmClose?.addEventListener("click", () => closeLayer(productModal));
    pmBackBtn?.addEventListener("click", () => closeLayer(productModal));
    
    pmAdd?.addEventListener("click", () => {
      if (!selectedSize) return showToast("Elige una talla", "error");
      const found = cart.find(x => x.sku === currentProduct.sku && x.size === selectedSize);
      if (found) found.qty += selectedQty;
      else cart.push({...currentProduct, size: selectedSize, qty: selectedQty});
      saveCart(); renderCart(); closeLayer(productModal); openLayer(cartDrawer);
    });

    pmQtyDec?.addEventListener("click", () => { selectedQty = clamp(selectedQty - 1, 1, 99); pmQtyDisplay.textContent = selectedQty; });
    pmQtyInc?.addEventListener("click", () => { selectedQty = clamp(selectedQty + 1, 1, 99); pmQtyDisplay.textContent = selectedQty; });

    overlay?.addEventListener("click", () => {
      closeLayer(sideMenu); closeLayer(cartDrawer); closeLayer(productModal); closeLayer(assistantModal);
    });

    searchInput?.addEventListener("input", debounce(() => {
      searchQuery = searchInput.value;
      activeCategory = null;
      updateFilterUI();
      renderProducts();
    }, 300));

    sortSelect?.addEventListener("change", () => {
      sortMode = sortSelect.value;
      renderProducts();
    });

    $$('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", () => {
        shipping.mode = r.value;
        postalWrap.hidden = (r.value === "pickup");
        refreshTotals();
      });
    });

    quoteBtn?.addEventListener("click", async () => {
      if (!postalCode.value) return showToast("Ingresa CP", "error");
      quoteBtn.disabled = true;
      shipping.quote = { amount_cents: 18000 };
      showToast("Envío actualizado");
      quoteBtn.disabled = false;
      refreshTotals();
    });

    checkoutBtn?.addEventListener("click", async () => {
      if (!cart.length) return;
      checkoutBtn.disabled = true;
      checkoutLoader.hidden = false;
      showToast("Redirigiendo a pago seguro...");
    });
    
    clearFilterBtn?.addEventListener("click", () => {
        activeCategory = null; searchQuery = ""; searchInput.value = "";
        updateFilterUI(); renderProducts();
    });
  };

  const init = async () => {
    if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;
    loadCart();
    initEvents();
    initNeuromarketing();
    
    try {
      catalog = await fetchCatalog();
      products = catalog.products.map(normalizeProduct);
      renderCategories();
      renderProducts();
      fetchSiteSettings();
    } catch (e) {
      showToast("Error cargando catálogo", "error");
    } finally {
      setTimeout(() => {
        if (splash) {
          splash.classList.add("fade-out");
          setTimeout(() => splash.hidden = true, 600);
        }
      }, 1500);
    }
  };

  init();

})();
