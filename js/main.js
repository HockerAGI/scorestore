/* =========================================================
   SCORE STORE — Frontend (ULTRA-VFX PRO) v2026.02.21
   - Lógica de UI / UX / Carrusel FB Style Restaurado.
   - Neuromarketing: Ventas falsas (Social Proof) y Escasez.
   - CÁLCULO DE CARRUSEL FIX: Paginación exacta 1 a 1.
   - AGENTE AUTÓNOMO IA: La IA ahora lee el DOM del usuario y 
     ejecuta funciones (Agrega al carrito remotamente).
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.02.21.ULTRA-VFX-PRO";

  // ---------- DOM Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- DOM Elements ----------
  const splash = $("#splash");
  const overlay = $("#overlay");
  const sideMenu = $("#sideMenu");
  const cartDrawer = $("#cartDrawer");

  const openMenuBtn = $("#openMenuBtn");
  const closeMenuBtn = $("#closeMenuBtn");
  const openCartBtn = $("#openCartBtn");
  const closeCartBtn = $("#closeCartBtn");
  const navOpenCart = $("#navOpenCart");
  const navOpenAi = $("#navOpenAi");

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
  const postalCodeInput = $("#postalCode");
  const quoteBtn = $("#quoteBtn");

  const promoCodeInput = $("#promoCode");
  const applyPromoBtn = $("#applyPromoBtn");       
  const checkoutBtn = $("#checkoutBtn");
  const checkoutMsg = $("#checkoutMsg");
  const checkoutLoader = $("#checkoutLoader");     

  const productModal = $("#productModal");
  const pmClose = $("#pmClose");
  const pmBackBtn = $("#pmBackBtn"); 
  const pmTitle = $("#pmTitle");
  const pmCarousel = $("#pmCarousel");
  const pmPrice = $("#pmPrice");
  const pmDesc = $("#pmDesc");
  const pmChips = $("#pmChips");
  const pmShareBtn = $("#pmShareBtn");
  const pmAdd = $("#pmAdd");

  // Controles UX Producto
  const pmSizePills = $("#pmSizePills");
  const pmQtyDec = $("#pmQtyDec");
  const pmQtyInc = $("#pmQtyInc");
  const pmQtyDisplay = $("#pmQtyDisplay");

  // Modal de Guía de Tallas
  const sizeGuideModal = $("#sizeGuideModal");
  const openSizeGuideBtn = $("#openSizeGuideBtn");
  const closeSizeGuideBtn = $("#closeSizeGuideBtn");
  const understandSizeBtn = $("#understandSizeBtn");

  const aiModal = $("#aiModal");
  const openAiBtn = $("#openAiBtn");
  const floatingAiBtn = $("#floatingAiBtn");
  const aiClose = $("#aiClose");
  const aiOutput = $("#aiOutput");
  const aiInput = $("#aiInput");
  const aiSendBtn = $("#aiSendBtn");

  const cookieBanner = $("#cookieBanner");
  const cookieAccept = $("#cookieAccept");
  const cookieReject = $("#cookieReject");

  const toast = $("#toast");
  const appVersionLabel = $("#appVersionLabel");

  // Elementos del Motor de Neuromarketing
  const salesNotification = $("#salesNotification");
  const salesName = $("#salesName");
  const salesAction = $("#salesAction");

  // ---------- CONFIGURACIÓN GLOBAL ----------
  const STORAGE_KEYS = { 
    cart: "scorestore_cart_v2_pro", 
    ship: "scorestore_ship_v2", 
    consent: "scorestore_consent_v2" 
  };

  const CATEGORY_CONFIG = [
    { uiId: "BAJA1000", name: "BAJA 1000", logo: "assets/logo-baja1000.webp", mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES"] },
    { uiId: "BAJA500", name: "BAJA 500", logo: "assets/logo-baja500.webp", mapFrom: ["BAJA500", "BAJA_500"] },
    { uiId: "BAJA400", name: "BAJA 400", logo: "assets/logo-baja400.webp", mapFrom: ["BAJA400", "BAJA_400"] },
    { uiId: "SF250", name: "SAN FELIPE 250", logo: "assets/logo-sf250.webp", mapFrom: ["SF250", "SF_250"] }
  ];

  const SHIPPING_LABELS = {
    pickup: "Recoger en fábrica (Tijuana)",
    envia_mx: "Envío México (Envía.com)",
    envia_us: "Envío USA (Envía.com)",
  };

  // ---------- ESTADO (STATE) ----------
  let catalog = null;
  let products = [];
  let promosData = null; 
  let activePromo = null; 
  let activeCategory = null; 
  let searchQuery = "";
  let sortMode = "featured";
  let cart = [];
  let shipping = { mode: "pickup", postal_code: "", quote: null };
  let currentProduct = null;
  
  let selectedSize = "";
  let selectedQty = 1;

  // ---------- UTILIDADES ----------
  const escapeHtml = (s) => String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const money = (cents) => {
    const n = Number(cents || 0) / 100;
    try { 
      return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" }); 
    } catch { 
      return `$${n.toFixed(2)}`; 
    }
  };

  const safeUrl = (p) => { 
    try { 
      const url = encodeURI(String(p || "").trim()); 
      if(url.toLowerCase().startsWith('javascript:')) return '';
      return url;
    } catch { 
      return String(p || ""); 
    } 
  };
  
  const clampInt = (v, min, max) => { 
    const n = Math.floor(Number(v || 0)); 
    if (!Number.isFinite(n)) return min; 
    return Math.max(min, Math.min(max, n)); 
  };

  const debounce = (fn, ms = 180) => {
    let t = null;
    return (...args) => { 
      clearTimeout(t); 
      t = setTimeout(() => fn(...args), ms); 
    };
  };

  const showToast = (text, type = 'info') => {
    if (!toast) return;
    toast.innerHTML = escapeHtml(text);
    toast.className = `toast toast--${type} glass-panel show`;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('show');
    }, 3500);
  };

  const setStatus = (text) => { 
    if (statusRow) statusRow.textContent = text || ""; 
  };

  // ---------- CONTROL DE CAPAS ----------
  const openSet = new Set(); 
  const lockScrollIfNeeded = () => { 
    document.body.style.overflow = openSet.size > 0 ? "hidden" : ""; 
  };
  
  const refreshOverlay = () => { 
    if (overlay) overlay.hidden = openSet.size === 0; 
    lockScrollIfNeeded(); 

    if (floatingAiBtn) {
      if (openSet.size > 0) {
        floatingAiBtn.style.transform = 'scale(0) translateY(20px)';
        floatingAiBtn.style.opacity = '0';
        floatingAiBtn.style.pointerEvents = 'none';
      } else {
        floatingAiBtn.style.transform = '';
        floatingAiBtn.style.opacity = '';
        floatingAiBtn.style.pointerEvents = 'auto';
      }
    }

    if (salesNotification && openSet.size > 0) {
        salesNotification.classList.remove("show");
    }
  };
  
  const openLayer = (el) => {
    if (!el) return;
    el.hidden = false;
    openSet.add(el);
    refreshOverlay();
    void el.offsetWidth; 
    if(el.classList.contains('drawer')) { el.style.transform = 'none'; }
    if(el.classList.contains('modal')) { el.classList.add('modal--open'); }
  };
  
  const closeLayer = (el) => {
    if (!el) return;
    openSet.delete(el);
    refreshOverlay();
    if(el.classList.contains('drawer')) {
      el.style.transform = el.classList.contains('drawer--right') ? 'translateX(100%)' : 'translateX(-100%)';
      setTimeout(() => el.hidden = true, 400); 
    } else if (el.classList.contains('modal')) {
      el.classList.remove('modal--open');
      setTimeout(() => el.hidden = true, 400);
    } else {
      el.hidden = true;
    }
  };
  
  const closeAll = () => { 
    [sideMenu, cartDrawer, productModal, sizeGuideModal, aiModal].forEach(el => closeLayer(el)); 
  };
  
  const scrollToEl = (sel) => { 
    const el = $(sel); 
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); 
  };

  // ---------- NEUROMARKETING (VENTAS FALSAS) ----------
  const fakeNames = ["Carlos R.", "Ernesto P.", "Miguel A.", "Jorge S.", "Luis F.", "Alejandro M.", "Roberto C.", "Daniel T.", "Ricardo P.", "Hugo L.", "Armando G.", "Eduardo V."];
  const fakeItems = ["una Hoodie SCORE Oficial", "una Gorra Baja 1000", "una Camiseta Oficial", "una Chamarra Premium", "un Jersey San Felipe 250", "Merch de Edición Especial"];

  const triggerSalesNotification = () => {
    if (!salesNotification || openSet.size > 0 || (checkoutLoader && !checkoutLoader.hidden)) return;
    const randomName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    const randomItem = fakeItems[Math.floor(Math.random() * fakeItems.length)];
    if (salesName) salesName.textContent = randomName;
    if (salesAction) salesAction.textContent = `acaba de comprar ${randomItem}`;
    salesNotification.hidden = false;
    void salesNotification.offsetWidth; 
    salesNotification.classList.add("show");
    setTimeout(() => {
      salesNotification.classList.remove("show");
      setTimeout(() => salesNotification.hidden = true, 500);
    }, 5000);
  };

  const initNeuromarketing = () => {
    setTimeout(() => {
      triggerSalesNotification();
      setInterval(() => {
        triggerSalesNotification();
      }, Math.floor(Math.random() * 15000) + 30000);
    }, 12000);
  };

  // ---------- CATÁLOGO ----------
  const normalizeSectionIdToUi = (sectionId) => {
    const sid = String(sectionId || "").trim();
    const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
    return found ? found.uiId : null;
  };

  const getLogoForSection = (uiId) => {
    const found = CATEGORY_CONFIG.find((c) => c.uiId === uiId);
    return found ? found.logo : 'assets/logo-score.webp';
  };

  const inferCollection = (p) => {
    const c = String(p?.collection || "").trim();
    if (c) return c;
    const sid = String(p?.sectionId || p?.categoryId || "").trim();
    if (sid === "EDICION_2025") return "Edición 2025";
    if (sid === "OTRAS_EDICIONES") return "Ediciones Clásicas";
    return "";
  };

  const normalizeProduct = (p) => {
    const sku = String(p?.sku || p?.id || "").trim();
    const title = String(p?.title || p?.name || "Producto Oficial").trim();
    const desc = String(p?.description || "").trim();
    const priceCents = Number.isFinite(Number(p?.price_cents)) ? Math.round(Number(p.price_cents)) : 0;
    const images = Array.isArray(p?.images) ? p.images : p?.img ? [p.img] : [];
    const img = images[0] ? safeUrl(images[0]) : "";
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL", "XXL"];
    const rawSection = String(p?.sectionId || p?.categoryId || p?.section || "").trim();
    const uiSection = normalizeSectionIdToUi(rawSection) || "BAJA1000";
    const collection = inferCollection(p);
    const rank = Number.isFinite(Number(p?.rank)) ? Number(p.rank) : 999;
    
    return { sku, id: sku, title, description: desc, priceCents, images: images.map(safeUrl), img, sizes: sizes.map((s) => String(s || "").trim()).filter(Boolean), rawSection, uiSection, collection, rank };
  };

  const fetchCatalog = async () => {
    const url = `data/catalog.json?cv=${encodeURIComponent(APP_VERSION)}`;
    const res = await fetch(url, { headers: { "cache-control": "no-store" } });
    if (!res.ok) throw new Error(`Catálogo HTTP ${res.status}`);
    return await res.json();
  };

  const fetchPromos = async () => {
    try {
      const url = `data/promos.json?cv=${encodeURIComponent(APP_VERSION)}`;
      const res = await fetch(url, { headers: { "cache-control": "no-store" } });
      if (res.ok) promosData = await res.json();
    } catch (e) { console.warn("Aviso: Promos locales no disponibles"); }
  };

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";

    for (const cat of CATEGORY_CONFIG) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catcard hover-fx";
      card.setAttribute("data-cat", cat.uiId);
      card.innerHTML = `<div class="catcard__bg"></div><div class="catcard__inner"><img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}" width="200" height="150" loading="lazy"><div class="catcard__btn">Descubrir Colección</div></div>`;

      card.addEventListener("click", () => {
        $$('.catcard').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeCategory = cat.uiId;
        if (categoryHint) categoryHint.hidden = true;
        if (carouselTitle) carouselTitle.innerHTML = `<img src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}" style="height:28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">`;
        updateFilterUI();
        renderProducts();
        if (catalogCarouselSection) {
          catalogCarouselSection.hidden = false;
          scrollToEl("#catalogCarouselSection");
          if (productGrid) productGrid.scrollLeft = 0;
        }
      });
      categoryGrid.appendChild(card);
    }
  };

  const updateFilterUI = () => {
    const pieces = [];
    if (activeCategory) {
      const c = CATEGORY_CONFIG.find((x) => x.uiId === activeCategory);
      if (c) pieces.push(`<img src="${safeUrl(c.logo)}" style="height: 18px;" alt="Logo Colección">`);
    }
    if (searchQuery) pieces.push(`“${escapeHtml(searchQuery)}”`);

    if (activeFilterRow && activeFilterLabel) {
      if (pieces.length) {
        activeFilterRow.hidden = false;
        activeFilterLabel.innerHTML = pieces.join(" · ");
      } else {
        activeFilterRow.hidden = true;
        activeFilterLabel.innerHTML = "";
      }
    }
  };

  const applyFilters = (list) => {
    let out = list.slice();
    if (activeCategory) out = out.filter((p) => p.uiSection === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      out = out.filter((p) => `${p.title} ${p.description} ${p.collection} ${p.uiSection}`.toLowerCase().includes(q));
    }
    if (sortMode === "price_asc") out.sort((a, b) => a.priceCents - b.priceCents);
    else if (sortMode === "price_desc") out.sort((a, b) => b.priceCents - a.priceCents);
    else if (sortMode === "name_asc") out.sort((a, b) => a.title.localeCompare(b.title, "es"));
    else out.sort((a, b) => (a.rank - b.rank) || a.title.localeCompare(b.title, "es"));
    return out;
  };

  const getScarcityText = (sku) => {
      const charCodeSum = sku.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      if (charCodeSum % 5 === 0) return "🔥 ¡Últimas 2 piezas en inventario!";
      if (charCodeSum % 7 === 0) return "⚡ Alta demanda el día de hoy";
      return "";
  };

  const renderProducts = () => {
    if (!productGrid || !catalogCarouselSection) return;
    if (!activeCategory && !searchQuery) { catalogCarouselSection.hidden = true; return; }

    const list = applyFilters(products);
    productGrid.innerHTML = "";

    if (!list.length) {
      productGrid.innerHTML = `<div class="hint" style="padding: 30px; text-align:center; width:100%;">No encontramos mercancía con esos filtros. Intenta buscar "Baja 1000" o "Gorras".</div>`;
      catalogCarouselSection.hidden = false;
      return;
    }

    setStatus(`Encontramos ${list.length} artículos exclusivos`);
    const frag = document.createDocumentFragment();

    for (const p of list) {
      const card = document.createElement("article");
      card.className = "card";
      card.setAttribute("data-sku", escapeHtml(p.sku));

      const logoUrl = getLogoForSection(p.uiSection);
      const logoPill = `<span class="pill pill--logo"><img src="${safeUrl(logoUrl)}" alt="Logo Score"></span>`;
      const collectionPill = p.collection ? `<span class="pill pill--red">${escapeHtml(p.collection)}</span>` : "";
      const scarcityText = getScarcityText(p.sku);
      const scarcityHtml = scarcityText ? `<div style="color:var(--red); font-size:11px; font-weight:bold; margin-top:5px;">${scarcityText}</div>` : '';

      const imgs = p.images && p.images.length ? p.images : (p.img ? [p.img] : []);
      let swipeHint = imgs.length > 1 ? `<div class="card__swipe-hint">Desliza ↔</div>` : '';
      let trackHtml = imgs.map((src) => `<img loading="lazy" decoding="async" src="${safeUrl(src)}" alt="${escapeHtml(p.title)}">`).join("");
      let dotsHtml = imgs.length > 1 ? `<div class="card__dots">${imgs.map((_,i)=>`<span class="card__dot ${i===0?'active':''}"></span>`).join('')}</div>` : '';
      let navHtml = imgs.length > 1 ? `<button class="card__nav card__nav--prev hover-fx" aria-label="Foto anterior" type="button">‹</button><button class="card__nav card__nav--next hover-fx" aria-label="Siguiente foto" type="button">›</button>` : '';

      card.innerHTML = `
        <div class="card__media">${swipeHint}<div class="card__track">${trackHtml}</div>${navHtml}${dotsHtml}</div>
        <div class="card__body">
          <h3 class="card__title">${escapeHtml(p.title)}</h3>
          <div class="card__row"><div class="price">${money(p.priceCents)}</div><div style="display:flex; gap:5px; align-items:center;">${logoPill} ${collectionPill}</div></div>
          ${scarcityHtml}
          <button class="btn btn--block btn--black card__action-btn hover-fx" type="button" style="margin-top: 14px; font-size: 13px; padding: 12px; font-weight: bold;">Ver Detalles y Comprar</button>
        </div>
      `;

      const track = card.querySelector('.card__track');
      const dots = card.querySelectorAll('.card__dot');
      const btnPrev = card.querySelector('.card__nav--prev');
      const btnNext = card.querySelector('.card__nav--next');
      const actionBtn = card.querySelector('.card__action-btn');
      const swipeHintEl = card.querySelector('.card__swipe-hint');

      if (track && dots.length > 0) {
        track.addEventListener('scroll', debounce(() => {
          let idx = Math.round(track.scrollLeft / track.clientWidth);
          dots.forEach((d, i) => d.classList.toggle('active', i === idx));
          if(idx > 0 && swipeHintEl) {
             swipeHintEl.style.opacity = '0';
             setTimeout(() => swipeHintEl.remove(), 300);
          }
        }, 50));
        
        if(btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' }); });
        if(btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); track.scrollBy({ left: track.clientWidth, behavior: 'smooth' }); });
      }

      if(actionBtn) actionBtn.addEventListener('click', (e) => { e.stopPropagation(); openProduct(p.sku); });
      card.addEventListener("click", () => openProduct(p.sku));
      frag.appendChild(card);
    }
    productGrid.appendChild(frag);
    catalogCarouselSection.hidden = false;
  };

  const openProduct = (sku) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return;
    currentProduct = p;

    selectedQty = 1;
    if (pmQtyDisplay) pmQtyDisplay.textContent = selectedQty;

    if (pmTitle) pmTitle.textContent = p.title;
    if (pmPrice) pmPrice.textContent = money(p.priceCents);
    if (pmDesc) {
        const scarcity = getScarcityText(p.sku);
        pmDesc.innerHTML = `<p>${escapeHtml(p.description || "Merch oficial Score Store. Calidad premium Único Uniformes.")}</p>
                            ${scarcity ? `<p style="color:var(--red); font-weight:bold; margin-top:10px;">${scarcity}</p>` : ''}`;
    }

    if (pmChips) {
      pmChips.innerHTML = "";
      const logoUrl = getLogoForSection(p.uiSection);
      pmChips.innerHTML += `<span class="pill pill--logo"><img src="${safeUrl(logoUrl)}" alt="Logo Score"></span>`;
      if (p.collection) pmChips.innerHTML += `<span class="pill pill--red">${escapeHtml(p.collection)}</span>`;
    }

    if (pmSizePills) {
      pmSizePills.innerHTML = "";
      selectedSize = p.sizes[0] || "Unitalla"; 
      
      p.sizes.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = `size-pill ${s === selectedSize ? 'active' : ''}`;
        btn.textContent = escapeHtml(s);
        btn.onclick = () => {
          $$('.size-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedSize = s;
        };
        pmSizePills.appendChild(btn);
      });
    }

    if (pmCarousel) {
      const imgs = p.images && p.images.length ? p.images : (p.img ? [p.img] : []);
      let trackHtml = imgs.map((src) => `<img src="${safeUrl(src)}" alt="${escapeHtml(p.title)}" loading="lazy">`).join("");
      let dotsHtml = imgs.length > 1 ? `<div class="pm__dots">${imgs.map((_,i)=>`<span class="pm__dot ${i===0?'active':''}" data-idx="${i}"></span>`).join('')}</div>` : '';
      
      pmCarousel.innerHTML = `<div class="pm__track" id="pmTrack">${trackHtml}</div>${dotsHtml}`;
      
      const track = pmCarousel.querySelector('#pmTrack');
      const dots = pmCarousel.querySelectorAll('.pm__dot');
      
      if(track && dots.length > 0) {
        track.addEventListener('scroll', debounce(() => {
          let idx = Math.round(track.scrollLeft / track.clientWidth);
          dots.forEach((d, i) => d.classList.toggle('active', i === idx));
        }, 50));
        
        dots.forEach((d, i) => { d.addEventListener('click', () => { track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' }); }); });
      }
    }
    openLayer(productModal);
  };

  // ---------- CARRITO ----------
  const saveCart = () => { try { localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); } catch {} };
  const loadCart = () => { try { const raw = localStorage.getItem(STORAGE_KEYS.cart); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) { cart = parsed.filter(it => it && typeof it.sku === 'string' && typeof it.qty === 'number' && it.qty > 0); } } } catch { cart = []; } };

  const addToCart = (p, size, qty) => {
    const q = clampInt(qty, 1, 99);
    const sRaw = String(size || "").trim();
    const s = sRaw.replace("Talla: ", "") || (p.sizes?.[0] || "Unitalla");
    const key = `${p.sku}__${s}`;
    const idx = cart.findIndex((x) => `${x.sku}__${x.size}` === key);

    if (idx >= 0) cart[idx].qty = clampInt(cart[idx].qty + q, 1, 99);
    else cart.push({ sku: p.sku, title: p.title, priceCents: p.priceCents, size: s, qty: q, img: p.img || "", uiSection: p.uiSection || "", collection: p.collection || "" });

    saveCart(); validatePromo(); renderCart(); 
    showToast("✅ ¡Agregado a tu carrito!", "success");
  };

  const removeCartItem = (sku, size) => { cart = cart.filter((x) => !(x.sku === sku && x.size === size)); saveCart(); validatePromo(); renderCart(); };
  const setCartQty = (sku, size, qty) => { const it = cart.find((x) => x.sku === sku && x.size === size); if (it) { it.qty = clampInt(qty, 1, 99); saveCart(); validatePromo(); renderCart(); } };
  const changeCartItemSize = (sku, oldSize, newSize) => {
    if(oldSize === newSize) return;
    const itemIndex = cart.findIndex((x) => x.sku === sku && x.size === oldSize);
    if(itemIndex === -1) return;
    const existingIndex = cart.findIndex((x) => x.sku === sku && x.size === newSize);
    if (existingIndex >= 0) { cart[existingIndex].qty = clampInt(cart[existingIndex].qty + cart[itemIndex].qty, 1, 99); cart.splice(itemIndex, 1); } 
    else { cart[itemIndex].size = newSize; }
    saveCart(); renderCart(); showToast("✅ Talla actualizada", "success");
  };

  const validatePromo = () => {
    const code = String(promoCodeInput?.value || "").trim().toUpperCase();
    if (!code || !promosData || !promosData.rules) { activePromo = null; return; }
    const sanitizedCode = escapeHtml(code);
    const p = promosData.rules.find(x => x.code === sanitizedCode && x.active);
    
    if (p) {
      const now = new Date();
      const exp = p.expires_at ? new Date(p.expires_at) : null;
      const subMxn = cartSubtotalCents(false) / 100;
      if ((!exp || now <= exp) && subMxn >= (p.min_amount_mxn || 0)) { activePromo = p; return; }
    }
    activePromo = null;
  };

  const cartSubtotalCents = (applyDiscount = false) => {
    const sub = cart.reduce((sum, it) => sum + (Math.max(0, Number(it.priceCents || 0)) * Math.max(1, Number(it.qty || 1))), 0);
    if(!applyDiscount || !activePromo) return sub;
    const subMxn = sub / 100;
    let discountMultiplier = 1;
    if (activePromo.type === 'percent') discountMultiplier = 1 - (Number(activePromo.value) || 0);
    else if (activePromo.type === 'fixed_mxn') { const discountRatio = (subMxn - Number(activePromo.value)) / subMxn; discountMultiplier = Math.max(0, discountRatio); }
    return Math.round(sub * discountMultiplier);
  };

  const shippingCents = () => {
    if (shipping.mode === "pickup") return 0;
    if (activePromo && activePromo.type === 'free_shipping') return 0; 
    const cents = Number(shipping.quote?.amount_cents || shipping.quote?.amount || 0);
    return Number.isFinite(cents) && cents > 0 ? cents : 0;
  };

  const renderCart = () => {
    if (!cartItemsEl) return;
    if (cartCount) cartCount.textContent = String(cart.reduce((s, it) => s + Number(it.qty || 0), 0));
    cartItemsEl.innerHTML = "";

    if (!cart.length) {
      cartItemsEl.innerHTML = `<div class="hint" style="text-align:center; padding: 40px 10px; display:flex; flex-direction:column; align-items:center;"><div style="font-size: 50px; margin-bottom: 15px; opacity:0.8;">🛒</div><h3 style="margin-bottom:10px;">Tu carrito está vacío</h3><p style="color:var(--muted); font-size:14px; margin-bottom: 20px;">Aún no tienes equipo oficial para la carrera.</p><button class="btn btn--primary hover-fx" type="button" onclick="document.querySelector('#closeCartBtn').click()">¡Explorar Colecciones!</button></div>`;
      if (cartSubtotalEl) cartSubtotalEl.textContent = money(0);
      if (shippingLineEl) shippingLineEl.textContent = money(0);
      if (discountLineWrap) discountLineWrap.hidden = true;
      if (cartTotalEl) cartTotalEl.textContent = money(0);
      if (checkoutBtn) { checkoutBtn.disabled = true; checkoutBtn.style.opacity = "0.5"; }
      if (quoteBtn) { quoteBtn.disabled = true; }
      return;
    } else {
      if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.style.opacity = "1"; }
      if (quoteBtn) { quoteBtn.disabled = false; }
    }

    const frag = document.createDocumentFragment();
    for (const it of cart) {
      const row = document.createElement("div"); 
      row.className = "cartitem";
      
      const realProd = products.find(x => x.sku === it.sku);
      const availableSizes = realProd && realProd.sizes ? realProd.sizes : [it.size];
      const sizeOptions = availableSizes.map(s => `<option value="${escapeHtml(s)}" ${s === it.size ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
      const safeId = `cartSize_${escapeHtml(it.sku)}_${escapeHtml(it.size).replace(/\s+/g, '')}`;

      row.innerHTML = `
        <div class="cartitem__img">${it.img ? `<img src="${safeUrl(it.img)}" alt="${escapeHtml(it.title)}">` : ""}</div>
        <div style="flex-grow:1; display:flex; flex-direction:column; justify-content:center;">
          <h4 class="cartitem__title">${escapeHtml(it.title)}</h4>
          <label class="cartitem__meta" style="display:flex; align-items:center; gap:8px; margin-top:5px; cursor:pointer;">
            <span style="color:var(--muted); font-size: 13px;">Talla:</span>
            <select id="${safeId}" name="${safeId}" class="select cart-size-selector" data-sku="${escapeHtml(it.sku)}" data-old-size="${escapeHtml(it.size)}" aria-label="Cambiar talla en el carrito" style="padding: 2px 5px; width:auto; font-size:13px; font-weight:bold; height:auto; border-width:1px;">${sizeOptions}</select> 
            <span style="font-weight:bold; color:var(--red); margin-left: auto;">${money(it.priceCents)}</span>
          </label>
          <div class="cartitem__controls" style="margin-top:10px;">
            <div class="qty" aria-label="Modificar Cantidad"><button type="button" data-act="dec" aria-label="Quitar uno">−</button><span>${it.qty}</span><button type="button" data-act="inc" aria-label="Agregar uno">+</button></div>
            <button class="trash hover-fx" type="button" title="Eliminar del carrito" aria-label="Eliminar producto">🗑️</button>
          </div>
        </div>
      `;
      row.querySelector('[data-act="dec"]').addEventListener("click", (ev) => { ev.stopPropagation(); setCartQty(it.sku, it.size, it.qty - 1); });
      row.querySelector('[data-act="inc"]').addEventListener("click", (ev) => { ev.stopPropagation(); setCartQty(it.sku, it.size, it.qty + 1); });
      row.querySelector(".trash").addEventListener("click", (ev) => { ev.stopPropagation(); removeCartItem(it.sku, it.size); });
      row.querySelector('.cart-size-selector').addEventListener("change", (ev) => { ev.stopPropagation(); changeCartItemSize(ev.target.dataset.sku, ev.target.dataset.oldSize, ev.target.value); });
      frag.appendChild(row);
    }
    
    const clearWrap = document.createElement("div");
    clearWrap.style.textAlign = "center";
    clearWrap.style.marginTop = "15px";
    clearWrap.style.paddingTop = "15px";
    clearWrap.style.borderTop = "1px solid rgba(0,0,0,0.1)";
    clearWrap.innerHTML = `<button type="button" class="btn btn--tiny btn--ghost hover-fx" style="color:var(--muted); font-size: 11px;">🧨 Vaciar Todo el Carrito</button>`;
    clearWrap.querySelector("button").addEventListener("click", () => {
      if(confirm("¿Estás seguro de que deseas eliminar todos los productos de tu carrito?")) { cart = []; saveCart(); validatePromo(); renderCart(); }
    });
    frag.appendChild(clearWrap);
    cartItemsEl.appendChild(frag);

    const subGross = cartSubtotalCents(false);
    const subNet = cartSubtotalCents(true);
    const ship = shippingCents();
    
    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subGross);
    if (discountLineWrap && discountLineEl) {
      if (subNet < subGross && activePromo && activePromo.type !== 'free_shipping') { discountLineWrap.hidden = false; discountLineEl.textContent = `-${money(subGross - subNet)}`; } 
      else { discountLineWrap.hidden = true; }
    }
    if (shippingLineEl) {
      if (activePromo && activePromo.type === 'free_shipping' && shipping.mode !== "pickup") { shippingLineEl.innerHTML = `<span style="text-decoration: line-through; color: var(--muted2); font-size:12px; margin-right:5px;">${money(shipping.quote?.amount_mxn * 100 || 0)}</span> <b style="color:#28a745;">¡CUBIERTO!</b>`; } 
      else { shippingLineEl.textContent = money(ship); }
    }
    if (cartTotalEl) cartTotalEl.textContent = money(subNet + ship);
  };

  const loadShipping = () => { try { const raw = localStorage.getItem(STORAGE_KEYS.ship); if (raw) shipping = { ...shipping, ...JSON.parse(raw) }; } catch {} };
  const saveShipping = () => { try { localStorage.setItem(STORAGE_KEYS.ship, JSON.stringify(shipping)); } catch {} };
  const getSelectedShipMode = () => { const el = document.querySelector('input[name="shipMode"]:checked'); return el ? escapeHtml(String(el.value || "pickup")) : "pickup"; };

  const refreshShippingUI = () => {
    shipping.mode = getSelectedShipMode();
    if (shipHint) {
      if(shipping.mode === "pickup") shipHint.textContent = "Fábrica";
      else if(shipping.quote) shipHint.textContent = escapeHtml(shipping.quote.label); 
      else shipHint.textContent = SHIPPING_LABELS[shipping.mode];
    }
    if (shippingNote) {
      if(shipping.mode === 'pickup') shippingNote.textContent = "Recolección sin costo en nuestras instalaciones (Tijuana).";
      else if(shipping.mode === 'envia_mx') shippingNote.textContent = "Envío Estándar Nacional (3 a 5 días hábiles).";
      else if(shipping.mode === 'envia_us') shippingNote.textContent = "Envío Internacional USA (5 a 10 días hábiles).";
    }

    const needsZip = shipping.mode === "envia_mx" || shipping.mode === "envia_us";
    if (postalWrap) postalWrap.hidden = !needsZip;

    if (!needsZip) { shipping.postal_code = ""; shipping.quote = null; if (postalCodeInput) postalCodeInput.value = ""; saveShipping(); renderCart(); return; }
    if (postalCodeInput) postalCodeInput.value = escapeHtml(shipping.postal_code || "");
    renderCart();
  };

  const quoteShipping = async () => {
    if (checkoutMsg) checkoutMsg.hidden = true;
    const mode = getSelectedShipMode();
    if (mode === "pickup") { shipping.mode = "pickup"; shipping.quote = null; saveShipping(); renderCart(); return; }

    const postal_code = escapeHtml(String(postalCodeInput?.value || "").trim());
    if (postal_code.length < 4 || postal_code.length > 10) { showToast("⚠️ Ingresa un Código Postal válido.", "error"); return; }
    if (!cart.length) { showToast("Tu carrito está vacío.", "error"); return; }
    
    if (quoteBtn) { quoteBtn.disabled = true; quoteBtn.innerHTML = "<span class='spinner-mini'></span>"; }

    try {
      const body = { postal_code, shipping_mode: mode, country: mode === "envia_us" ? "US" : "MX", items: cart.map((it) => ({ sku: it.sku, qty: it.qty })) };
      const res = await fetch("/.netlify/functions/quote_shipping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Error de conexión con paqueterías.");

      shipping.mode = mode; shipping.postal_code = postal_code;
      shipping.quote = { amount_cents: Number(data.amount_cents || 0), amount_mxn: Number(data.amount_mxn || 0), label: String(data.label || "Standard Envia"), country: String(data.country || body.country), provider: String(data.provider || "envia") };
      saveShipping(); refreshShippingUI(); showToast(`✅ Envío calculado con éxito`, "success");
    } catch (e) {
      shipping.quote = null; saveShipping(); refreshShippingUI(); showToast(`❌ Verifica tu Código Postal o intenta más tarde.`, "error");
    } finally {
      if (quoteBtn) { quoteBtn.disabled = false; quoteBtn.textContent = "Cotizar"; }
    }
  };

  const doCheckout = async () => {
    if (checkoutMsg) checkoutMsg.hidden = true;
    if (!cart.length) { showToast("Tu carrito está vacío", "error"); return; }

    const shipping_mode = getSelectedShipMode();
    const promo_code = escapeHtml(String(promoCodeInput?.value || "").trim().toUpperCase());
    const postal_code = escapeHtml(String(postalCodeInput?.value || "").trim());
    const needsZip = shipping_mode === "envia_mx" || shipping_mode === "envia_us";

    if (needsZip) {
      if (postal_code.length < 4) { showToast("Por favor ingresa un Código Postal válido para cotizar el envío.", "error"); return; }
      if (!shipping.quote || shipping.postal_code !== postal_code || shipping.mode !== shipping_mode) {
        await quoteShipping(); 
        if (!shipping.quote) return; 
      }
    }

    if (checkoutBtn) { checkoutBtn.disabled = true; }
    if (checkoutLoader) { openLayer(checkoutLoader); } 

    try {
      const payload = { items: cart.map((it) => ({ sku: it.sku, qty: it.qty, size: it.size })), shipping_mode, postal_code: needsZip ? postal_code : "", promo_code };
      const res = await fetch("/.netlify/functions/create_checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.url) throw new Error(data?.error || "Error al conectar con pasarela segura.");
      window.location.assign(data.url);
    } catch (e) {
      if (checkoutLoader) { closeLayer(checkoutLoader); }
      if (checkoutMsg) { checkoutMsg.hidden = false; checkoutMsg.textContent = `Aviso del sistema: ${String(e?.message || e)}`; }
      showToast("Hubo un error al procesar tu solicitud. Intenta de nuevo.", "error");
      if (checkoutBtn) { checkoutBtn.disabled = false; }
    }
  };

  // ---------- AI AGENT (IA CON CAPACIDAD DE EJECUCIÓN) ----------
  const addChatMsg = (who, text) => {
    if (!aiOutput) return;
    const div = document.createElement("div"); 
    div.className = `msg ${who === "me" ? "msg--me" : "msg--ai"}`;
    div.innerHTML = `<div>${escapeHtml(text)}</div><div class="msg__meta">${who === "me" ? "Tú" : "SCORE AI"}</div>`;
    aiOutput.appendChild(div); 
    aiOutput.scrollTop = aiOutput.scrollHeight;
  };

  const sendAi = async () => {
    const msg = String(aiInput?.value || "").trim();
    if (!msg) return;
    if (aiInput) aiInput.value = "";
    addChatMsg("me", msg);
    
    if (aiSendBtn) { aiSendBtn.disabled = true; aiSendBtn.innerHTML = "<span class='spinner-mini'></span>"; }

    // Enviar Telemetría en Tiempo Real al Agente IA
    const ctx = {
      currentProduct: currentProduct ? currentProduct.sku : null,
      cartItems: cart.length > 0 ? cart.map(i => `${i.qty}x ${i.title}`).join(', ') : "Vacío",
      activeCategory: activeCategory || "Ninguna"
    };

    try {
      const res = await fetch("/.netlify/functions/chat", { 
          method: "POST", 
          headers: { "content-type": "application/json" }, 
          body: JSON.stringify({ message: msg, context: ctx }) 
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "AI error de conexión");
      
      let replyStr = String(data.reply || "He procesado tu solicitud. ¿En qué más te ayudo?");
      
      // INTÉRPRETE DE COMANDOS: Permite a la IA interactuar con el DOM
      const actionMatch = replyStr.match(/\[ACTION:ADD_TO_CART:(.*?)\]/);
      if (actionMatch) {
          const sku = actionMatch[1].trim();
          replyStr = replyStr.replace(/\[ACTION:ADD_TO_CART:.*?\]/g, '').trim(); // Ocultar comando al usuario
          const p = products.find(x => x.sku === sku);
          if (p) {
              addToCart(p, p.sizes[0] || "Unitalla", 1);
              replyStr += "\n\n*(⚡ Acción de Sistema: Agregué el artículo a tu carrito por ti).*";
          }
      }

      addChatMsg("ai", replyStr);
    } catch (e) {
      addChatMsg("ai", "Sistemas tácticos ocupados. Intenta en unos segundos.");
    } finally {
      if (aiSendBtn) { aiSendBtn.disabled = false; aiSendBtn.textContent = "Enviar ➢"; }
      if (aiInput) { aiInput.focus(); }
    }
  };

  const openAiChat = () => {
    closeLayer(sideMenu); 
    openLayer(aiModal);
    setTimeout(() => aiInput?.focus(), 400); 
    if (!aiOutput?.children?.length) {
        addChatMsg("ai", "¡Hola! Soy SCORE AI, tu agente personal. ¿Buscas alguna talla específica o necesitas ayuda para asegurar tu mercancía oficial?");
    }
  };

  // ---------- EVENTOS GLOBALES ----------
  const initEvents = () => {
    if (overlay) overlay.addEventListener("click", () => { if(checkoutLoader && !checkoutLoader.hidden) return; closeAll(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if(checkoutLoader && !checkoutLoader.hidden) return; closeAll(); } });

    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));
    openCartBtn?.addEventListener("click", () => { openLayer(cartDrawer); refreshShippingUI(); renderCart(); });
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    navOpenCart?.addEventListener("click", () => { closeLayer(sideMenu); openLayer(cartDrawer); refreshShippingUI(); renderCart(); });

    const triggerSearch = debounce(() => {
      searchQuery = String(searchInput?.value || mobileSearchInput?.value || "").trim();
      if(searchQuery !== "") catalogCarouselSection.hidden = false;
      updateFilterUI(); renderProducts();
    }, 250);

    searchInput?.addEventListener("input", () => { if(mobileSearchInput) mobileSearchInput.value = searchInput.value; triggerSearch(); });
    mobileSearchInput?.addEventListener("input", () => { if(searchInput) searchInput.value = mobileSearchInput.value; triggerSearch(); });
    mobileSearchBtn?.addEventListener("click", () => { if(mobileSearchWrap) { mobileSearchWrap.hidden = !mobileSearchWrap.hidden; if(!mobileSearchWrap.hidden) setTimeout(() => mobileSearchInput?.focus(), 100); } });
    closeMobileSearchBtn?.addEventListener("click", () => { if(mobileSearchWrap) mobileSearchWrap.hidden = true; if(searchInput) searchInput.value = ""; if(mobileSearchInput) mobileSearchInput.value = ""; triggerSearch(); });

    // FIX CÁLCULO CARRUSEL: Paginación exacta 1 a 1 para evitar deslizar de corrido
    scrollLeftBtn?.addEventListener("click", () => { 
        const card = productGrid?.querySelector('.card');
        const step = card ? card.offsetWidth + 32 : window.innerWidth * 0.8;
        productGrid?.scrollBy({ left: -step, behavior: 'smooth' }); 
    });
    
    scrollRightBtn?.addEventListener("click", () => { 
        const card = productGrid?.querySelector('.card');
        const step = card ? card.offsetWidth + 32 : window.innerWidth * 0.8;
        productGrid?.scrollBy({ left: step, behavior: 'smooth' }); 
    });

    $$(".navitem[data-scroll]").forEach((btn) => { btn.addEventListener("click", () => { closeLayer(sideMenu); scrollToEl(btn.getAttribute("data-scroll")); }); });
    scrollToCategoriesBtn?.addEventListener("click", () => scrollToEl("#categories"));

    clearFilterBtn?.addEventListener("click", () => {
      activeCategory = null; searchQuery = "";
      $$('.catcard').forEach(c => c.classList.remove('active'));
      if (searchInput) searchInput.value = "";
      if (mobileSearchInput) mobileSearchInput.value = "";
      if (categoryHint) categoryHint.hidden = false;
      updateFilterUI(); renderProducts();
    });

    sortSelect?.addEventListener("change", () => { sortMode = String(sortSelect.value || "featured"); renderProducts(); });

    pmClose?.addEventListener("click", () => closeLayer(productModal));
    pmBackBtn?.addEventListener("click", () => closeLayer(productModal)); 

    pmQtyDec?.addEventListener("click", () => { selectedQty = clampInt(selectedQty - 1, 1, 99); if(pmQtyDisplay) pmQtyDisplay.textContent = selectedQty; });
    pmQtyInc?.addEventListener("click", () => { selectedQty = clampInt(selectedQty + 1, 1, 99); if(pmQtyDisplay) pmQtyDisplay.textContent = selectedQty; });

    pmShareBtn?.addEventListener("click", async () => {
      if(!currentProduct) return;
      const shareData = { title: `SCORE Store: ${currentProduct.title}`, text: 'Mira esta mercancía oficial que encontré en la SCORE Store.', url: window.location.href.split('?')[0] + `?sku=${currentProduct.sku}` };
      if (navigator.share) { try { await navigator.share(shareData); } catch (err) { console.log("Share cancelado"); } } 
      else { try { await navigator.clipboard.writeText(shareData.url); showToast("Enlace copiado al portapapeles ✅", "success"); } catch (err) { showToast("No se pudo copiar el enlace.", "error"); } }
    });

    openSizeGuideBtn?.addEventListener("click", () => openLayer(sizeGuideModal));
    closeSizeGuideBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));
    understandSizeBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));

    pmAdd?.addEventListener("click", () => {
      if (!currentProduct) return;
      if (!selectedSize) { showToast("⚠️ Por favor selecciona una talla.", "error"); return; }
      
      const originalText = pmAdd.innerHTML;
      pmAdd.innerHTML = "✅ ¡Guardado en tu equipo!";
      pmAdd.style.backgroundColor = "#28a745"; 
      pmAdd.style.borderColor = "#28a745";
      pmAdd.disabled = true; 
      
      setTimeout(() => {
        pmAdd.innerHTML = originalText;
        pmAdd.style.backgroundColor = "";
        pmAdd.style.borderColor = "";
        pmAdd.disabled = false;
        
        addToCart(currentProduct, selectedSize, selectedQty);
        closeLayer(productModal); 
        openLayer(cartDrawer); 
        refreshShippingUI();
      }, 800);
    });

    openAiBtn?.addEventListener("click", openAiChat);
    navOpenAi?.addEventListener("click", openAiChat);
    floatingAiBtn?.addEventListener("click", openAiChat);
    aiClose?.addEventListener("click", () => closeLayer(aiModal));
    aiSendBtn?.addEventListener("click", sendAi);
    aiInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") sendAi(); });

    $$('input[name="shipMode"]').forEach((r) => { r.addEventListener("change", refreshShippingUI); });
    quoteBtn?.addEventListener("click", quoteShipping);
    postalCodeInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") quoteShipping(); });
    promoCodeInput?.addEventListener("blur", () => { validatePromo(); renderCart(); });
    promoCodeInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { validatePromo(); renderCart(); }});
    if(applyPromoBtn) { applyPromoBtn.addEventListener("click", () => { validatePromo(); renderCart(); showToast("Verificando cupón de promoción..."); }); }

    checkoutBtn?.addEventListener("click", doCheckout);

    const consentDecision = localStorage.getItem(STORAGE_KEYS.consent);
    if (!consentDecision && cookieBanner) { cookieBanner.hidden = false; }
    cookieAccept?.addEventListener("click", () => { try { localStorage.setItem(STORAGE_KEYS.consent, "accept"); } catch {} if(cookieBanner) cookieBanner.hidden = true; });
    cookieReject?.addEventListener("click", () => { try { localStorage.setItem(STORAGE_KEYS.consent, "reject"); } catch {} if(cookieBanner) cookieBanner.hidden = true; });
  };

  const init = async () => {
    if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;
    loadCart(); loadShipping(); initEvents();
    await fetchPromos(); validatePromo(); refreshShippingUI(); renderCart();

    try {
      catalog = await fetchCatalog();
      products = catalog.products.map(normalizeProduct).filter((p) => p.sku);
      products = products.map((p) => { if (!CATEGORY_CONFIG.some((c) => c.uiId === p.uiSection)) p.uiSection = "BAJA1000"; return p; });

      renderCategories();
      updateFilterUI();
      renderProducts(); 

      const qs = new URLSearchParams(window.location.search);
      const deepSku = qs.get("sku");
      if(deepSku && products.some(p => p.sku === deepSku)) { openProduct(deepSku); }

    } catch (e) {
      showToast("Problemas al cargar el catálogo principal. Verifica tu conexión.", "error");
      console.error(e); 
    } finally {
      setTimeout(() => {
        if (splash) { splash.classList.add('fade-out'); setTimeout(() => (splash.hidden = true), 800); }
        initNeuromarketing();
      }, 2500); 
    }
  };

  init().catch((e) => { console.error("Error crítico de inicialización:", e); if (splash) splash.hidden = true; });
})();
