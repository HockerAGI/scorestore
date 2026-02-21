/* =========================================================
   SCORE STORE — Frontend (PRO) v2026.02.21 (UX ISLANDS + LOGICA AVANZADA)
   - Lógica de UI / UX / Carrusel FB Style Restaurado
   - Cierre inteligente de modales (Anti-Empalmes)
   - Efecto Isla Visual y Etiquetas Flotantes (.mediaframe)
   - MEJORA UX: Botones de "Ver Detalles y Tallas" siempre visibles.
   - MEJORAS: Cupones UI, Cambio de tallas in-cart, Vaciar Carrito.
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "2026.02.21.UX.ISLAND.V3";

  // ---------- DOM ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
  const menuSearchInput = $("#menuSearchInput");
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
  const pmSize = $("#pmSize");
  const pmQty = $("#pmQty");
  const pmAdd = $("#pmAdd");
  const pmChips = $("#pmChips");

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

  // ---------- CONFIG ----------
  const STORAGE_KEYS = { cart: "scorestore_cart_v1", ship: "scorestore_ship_v1", consent: "scorestore_consent_v1", checkoutLock: "scorestore_checkout_lock_v1" };

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

  // ---------- STATE ----------
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

  // ---------- UTILS ----------
  const escapeHtml = (s) => String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  const money = (cents) => {
    const n = Number(cents || 0) / 100;
    try { return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" }); }
    catch { return `$${n.toFixed(2)}`; }
  };

  const safeUrl = (p) => { try { return encodeURI(String(p || "").trim()); } catch { return String(p || ""); } };
  const clampInt = (v, min, max) => { const n = Math.floor(Number(v || 0)); if (!Number.isFinite(n)) return min; return Math.max(min, Math.min(max, n)); };

  const debounce = (fn, ms = 180) => {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), 2600);
  };

  const setStatus = (text) => { if (statusRow) statusRow.textContent = text || ""; };

  // ---------- GESTIÓN ANTI-EMPALMES (CAPAS) ----------
  const openSet = new Set();
  const lockScrollIfNeeded = () => { 
    document.body.style.overflow = openSet.size > 0 ? "hidden" : ""; 
  };
  
  const refreshOverlay = () => { 
    if (overlay) overlay.hidden = openSet.size === 0; 
    lockScrollIfNeeded(); 
  };

  const openLayer = (el) => {
    if (!el) return;
    if (el === cartDrawer && openSet.has(sideMenu)) closeLayer(sideMenu);
    if (el === sideMenu && openSet.has(cartDrawer)) closeLayer(cartDrawer);
    
    el.hidden = false;
    openSet.add(el);
    refreshOverlay();
    if(el.classList.contains('drawer')) { el.style.transform = 'none'; }
  };

  const closeLayer = (el) => {
    if (!el || !openSet.has(el)) return;
    openSet.delete(el);
    refreshOverlay();
    if(el.classList.contains('drawer')) {
      el.style.transform = el.classList.contains('drawer--right') ? 'translateX(100%)' : 'translateX(-100%)';
      setTimeout(() => { if(!openSet.has(el)) el.hidden = true; }, 400);
    } else {
      el.hidden = true;
    }
  };

  const closeAll = () => { [sideMenu, cartDrawer, productModal, aiModal].forEach(el => closeLayer(el)); };
  const scrollToEl = (sel) => { const el = $(sel); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

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
    if (sid === "OTRAS_EDICIONES") return "Otras ediciones";
    return "";
  };

  const normalizeProduct = (p) => {
    const sku = String(p?.sku || p?.id || "").trim();
    const title = String(p?.title || p?.name || "Producto").trim();
    const desc = String(p?.description || "").trim();
    const priceCents = Number.isFinite(Number(p?.price_cents)) ? Math.round(Number(p.price_cents)) : 0;
    const images = Array.isArray(p?.images) ? p.images : p?.img ? [p.img] : [];
    const img = images[0] ? safeUrl(images[0]) : "";
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL"];
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
    } catch (e) { console.warn("No se pudieron cargar promos locales"); }
  };

  const renderCategories = () => {
    if (!categoryGrid) return;
    categoryGrid.innerHTML = "";

    for (const cat of CATEGORY_CONFIG) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catcard";
      card.setAttribute("data-cat", cat.uiId);

      card.innerHTML = `
        <div class="catcard__bg"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}" width="200" height="150" loading="lazy">
          <div class="catcard__btn">Ver Colección</div>
        </div>
      `;

      card.addEventListener("click", () => {
        $$('.catcard').forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        activeCategory = cat.uiId;
        if (categoryHint) categoryHint.hidden = true;
        if (carouselTitle) carouselTitle.innerHTML = `<img src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}" style="height:25px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">`;

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
      if (c) pieces.push(`<img src="${safeUrl(c.logo)}" style="height: 18px;" alt="Logo">`);
    }
    if (searchQuery) pieces.push(`“${searchQuery}”`);

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

  const renderProducts = () => {
    if (!productGrid || !catalogCarouselSection) return;

    if (!activeCategory && !searchQuery) {
        catalogCarouselSection.hidden = true;
        return;
    }

    const list = applyFilters(products);
    productGrid.innerHTML = "";

    if (!list.length) {
      productGrid.innerHTML = `<div class="hint" style="padding: 20px;">Sin resultados en esta búsqueda.</div>`;
      catalogCarouselSection.hidden = false;
      return;
    }

    setStatus(`Resultados: ${list.length} prendas exclusivas`);
    const frag = document.createDocumentFragment();

    for (const p of list) {
      const card = document.createElement("article");
      card.className = "card";
      card.setAttribute("data-sku", p.sku);

      const logoUrl = getLogoForSection(p.uiSection);
      const logoPill = `<span class="pill pill--logo"><img src="${safeUrl(logoUrl)}" alt="Logo"></span>`;
      const collectionPill = p.collection ? `<span class="pill pill--red">${escapeHtml(p.collection)}</span>` : "";

      const imgs = p.images && p.images.length ? p.images : (p.img ? [p.img] : []);

      let swipeHint = imgs.length > 1 ? `<div class="card__swipe-hint">Desliza ↔</div>` : '';
      let trackHtml = imgs.map((src) => `<div class="mediaframe" style="--mf:url('${safeUrl(src)}')"><img loading="lazy" decoding="async" src="${safeUrl(src)}" alt="${escapeHtml(p.title)}"></div>`).join("");
      let dotsHtml = imgs.length > 1 ? `<div class="card__dots">${imgs.map((_,i)=>`<span class="card__dot ${i===0?'active':''}"></span>`).join('')}</div>` : '';
      let navHtml = imgs.length > 1 ? `<button class="card__nav card__nav--prev" aria-label="Anterior" type="button">‹</button><button class="card__nav card__nav--next" aria-label="Siguiente" type="button">›</button>` : '';

      // NOTA UX: Agregamos el botón explícito "Ver Detalles y Tallas" dentro del body de la tarjeta.
      card.innerHTML = `
        <div class="card__media">
          ${swipeHint}
          <div class="card__track">${trackHtml}</div>
          ${navHtml}
          ${dotsHtml}
        </div>
        <div class="card__body">
          <h3 class="card__title">${escapeHtml(p.title)}</h3>
          <div class="card__row">
            <div class="price">${money(p.priceCents)}</div>
            <div style="display:flex; gap:5px; align-items:center;">
              ${logoPill} ${collectionPill}
            </div>
          </div>
          <button class="btn btn--block btn--black card__action-btn" type="button" style="margin-top: 14px; font-size: 13px; padding: 10px;">Ver Detalles y Tallas</button>
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

        if(btnPrev) {
          btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
          });
        }
        if(btnNext) {
          btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
          });
        }
      }

      // Ambos (clic en la foto y clic en el botón nuevo) abren el modal para que elijan talla
      if(actionBtn) {
        actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openProduct(p.sku);
        });
      }
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

    if (pmTitle) pmTitle.textContent = p.title;
    if (pmPrice) pmPrice.textContent = money(p.priceCents);
    if (pmDesc) pmDesc.textContent = p.description || "Merch oficial Score Store. Calidad premium Único Uniformes.";

    if (pmChips) {
      pmChips.innerHTML = "";
      const logoUrl = getLogoForSection(p.uiSection);
      pmChips.innerHTML += `<span class="pill pill--logo"><img src="${safeUrl(logoUrl)}" alt="Logo"></span>`;
      if (p.collection) pmChips.innerHTML += `<span class="pill pill--red">${escapeHtml(p.collection)}</span>`;
    }

    if (pmSize) {
      pmSize.innerHTML = "";
      for (const s of p.sizes) {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = `Talla: ${s}`;
        pmSize.appendChild(opt);
      }
    }
    if (pmQty) pmQty.value = "1";

    if (pmCarousel) {
      const imgs = p.images && p.images.length ? p.images : (p.img ? [p.img] : []);
      let trackHtml = imgs.map((src) => `<div class="mediaframe mediaframe--pm" style="--mf:url('${safeUrl(src)}')"><img src="${safeUrl(src)}" alt="${escapeHtml(p.title)}" loading="lazy"></div>`).join("");
      let dotsHtml = imgs.length > 1 ? `<div class="pm__dots">${imgs.map((_,i)=>`<span class="pm__dot ${i===0?'active':''}" data-idx="${i}"></span>`).join('')}</div>` : '';

      pmCarousel.innerHTML = `<div class="pm__track" id="pmTrack">${trackHtml}</div>${dotsHtml}`;

      const track = pmCarousel.querySelector('#pmTrack');
      const dots = pmCarousel.querySelectorAll('.pm__dot');

      if(track && dots.length > 0) {
        track.addEventListener('scroll', debounce(() => {
          let idx = Math.round(track.scrollLeft / track.clientWidth);
          dots.forEach((d, i) => d.classList.toggle('active', i === idx));
        }, 50));

        dots.forEach((d, i) => {
          d.addEventListener('click', () => {
            track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
          });
        });
      }
    }
    openLayer(productModal);
  };

  // --- LOGICA DE CARRITO MEJORADA ---

  const saveCart = () => { try { localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); } catch {} };
  const loadCart = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cart);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cart = parsed.filter(it => it && it.sku && typeof it.qty === 'number');
      }
    } catch {}
  };

  const addToCart = (p, size, qty) => {
    const q = clampInt(qty, 1, 99);
    const sRaw = String(size || "").trim();
    const s = sRaw.replace("Talla: ", "") || (p.sizes?.[0] || "M");
    const key = `${p.sku}__${s}`;
    const idx = cart.findIndex((x) => `${x.sku}__${x.size}` === key);

    if (idx >= 0) cart[idx].qty = clampInt(cart[idx].qty + q, 1, 99);
    else cart.push({ sku: p.sku, title: p.title, priceCents: p.priceCents, size: s, qty: q, img: p.img || "", uiSection: p.uiSection || "", collection: p.collection || "" });

    saveCart(); validatePromo(); renderCart(); showToast("✅ Agregado al carrito");
  };

  const removeCartItem = (sku, size) => { cart = cart.filter((x) => !(x.sku === sku && x.size === size)); saveCart(); validatePromo(); renderCart(); };
  const setCartQty = (sku, size, qty) => {
    const it = cart.find((x) => x.sku === sku && x.size === size);
    if (it) { it.qty = clampInt(qty, 1, 99); saveCart(); validatePromo(); renderCart(); }
  };

  const changeCartItemSize = (sku, oldSize, newSize) => {
    if(oldSize === newSize) return;
    const itemIndex = cart.findIndex((x) => x.sku === sku && x.size === oldSize);
    if(itemIndex === -1) return;

    const existingIndex = cart.findIndex((x) => x.sku === sku && x.size === newSize);
    if (existingIndex >= 0) {
      cart[existingIndex].qty = clampInt(cart[existingIndex].qty + cart[itemIndex].qty, 1, 99);
      cart.splice(itemIndex, 1);
    } else {
      cart[itemIndex].size = newSize;
    }
    saveCart(); renderCart(); showToast("✅ Talla actualizada");
  };

  const validatePromo = () => {
    const code = String(promoCodeInput?.value || "").trim().toUpperCase();
    if (!code || !promosData || !promosData.rules) { activePromo = null; return; }

    const p = promosData.rules.find(x => x.code === code && x.active);
    if (p) {
      const now = new Date();
      const exp = p.expires_at ? new Date(p.expires_at) : null;
      const subMxn = cartSubtotalCents(false) / 100;
      if ((!exp || now <= exp) && subMxn >= (p.min_amount_mxn || 0)) {
        activePromo = p;
        return;
      }
    }
    activePromo = null;
  };

  const cartSubtotalCents = (applyDiscount = false) => {
    const sub = cart.reduce((sum, it) => sum + (Number(it.priceCents || 0) * Number(it.qty || 1)), 0);
    if(!applyDiscount || !activePromo) return sub;

    const subMxn = sub / 100;
    let discountMultiplier = 1;
    if (activePromo.type === 'percent') {
      discountMultiplier = 1 - (Number(activePromo.value) || 0);
    } else if (activePromo.type === 'fixed_mxn') {
      const discountRatio = (subMxn - Number(activePromo.value)) / subMxn;
      discountMultiplier = Math.max(0, discountRatio);
    }
    return Math.round(sub * discountMultiplier);
  };

  const shippingCents = () => {
    if (shipping.mode === "pickup") return 0;
    if (activePromo && activePromo.type === 'free_shipping') return 0;

    const cents = Number(shipping.quote?.amount_cents || shipping.quote?.amount || 0);
    return Number.isFinite(cents) ? cents : 0;
  };

  const renderCart = () => {
    if (!cartItemsEl) return;
    if (cartCount) cartCount.textContent = String(cart.reduce((s, it) => s + Number(it.qty || 0), 0));
    cartItemsEl.innerHTML = "";

    if (!cart.length) {
      cartItemsEl.innerHTML = `
        <div class="hint" style="text-align:center; padding: 30px 10px;">
          <div style="font-size: 40px; margin-bottom: 10px;">🛒</div>
          Tu carrito de compras está vacío.<br><br>
        </div>`;
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
      const row = document.createElement("div"); row.className = "cartitem";

      const realProd = products.find(x => x.sku === it.sku);
      const availableSizes = realProd && realProd.sizes ? realProd.sizes : [it.size];
      const sizeOptions = availableSizes.map(s => `<option value="${s}" ${s === it.size ? 'selected' : ''}>${s}</option>`).join('');

      row.innerHTML = `
        <div class="cartitem__img">${it.img ? `<img src="${safeUrl(it.img)}" alt="${escapeHtml(it.title)}">` : ""}</div>
        <div style="flex-grow:1;">
          <h4 class="cartitem__title">${escapeHtml(it.title)}</h4>
          <div class="cartitem__meta" style="display:flex; align-items:center; gap:8px;">
            Talla: <select class="select cart-size-selector" data-sku="${it.sku}" data-old-size="${it.size}" style="padding: 2px 5px; width:auto; font-size:13px; font-weight:bold; height:auto; border-width:1px;">${sizeOptions}</select>
            <span>· ${money(it.priceCents)} c/u</span>
          </div>
          <div class="cartitem__controls">
            <div class="qty" aria-label="Cantidad">
              <button type="button" data-act="dec">−</button><span>${it.qty}</span><button type="button" data-act="inc">+</button>
            </div>
            <button class="trash" type="button" title="Eliminar">🗑️</button>
          </div>
        </div>
      `;
      row.querySelector('[data-act="dec"]').addEventListener("click", (ev) => { ev.stopPropagation(); setCartQty(it.sku, it.size, it.qty - 1); });
      row.querySelector('[data-act="inc"]').addEventListener("click", (ev) => { ev.stopPropagation(); setCartQty(it.sku, it.size, it.qty + 1); });
      row.querySelector(".trash").addEventListener("click", (ev) => { ev.stopPropagation(); removeCartItem(it.sku, it.size); });

      row.querySelector('.cart-size-selector').addEventListener("change", (ev) => {
        ev.stopPropagation();
        changeCartItemSize(ev.target.dataset.sku, ev.target.dataset.oldSize, ev.target.value);
      });

      frag.appendChild(row);
    }

    const clearWrap = document.createElement("div");
    clearWrap.style.textAlign = "center";
    clearWrap.style.marginTop = "10px";
    clearWrap.innerHTML = `<button type="button" class="btn btn--tiny btn--ghost" style="color:var(--red); border-color:var(--red); font-size: 11px;">🧨 Vaciar Carrito</button>`;
    clearWrap.querySelector("button").addEventListener("click", () => {
      if(confirm("¿Estás seguro de que deseas vaciar tu carrito?")) {
        cart = []; saveCart(); validatePromo(); renderCart();
      }
    });
    frag.appendChild(clearWrap);

    cartItemsEl.appendChild(frag);

    const subGross = cartSubtotalCents(false);
    const subNet = cartSubtotalCents(true);
    const ship = shippingCents();

    if (cartSubtotalEl) cartSubtotalEl.textContent = money(subGross);

    if (discountLineWrap && discountLineEl) {
      if (subNet < subGross && activePromo.type !== 'free_shipping') {
        discountLineWrap.hidden = false;
        discountLineEl.textContent = `-${money(subGross - subNet)}`;
      } else {
        discountLineWrap.hidden = true;
      }
    }

    if (shippingLineEl) {
      if (activePromo && activePromo.type === 'free_shipping' && shipping.mode !== "pickup") {
         shippingLineEl.innerHTML = `<span style="text-decoration: line-through; color: var(--muted2); font-size:12px; margin-right:5px;">${money(shipping.quote?.amount_mxn * 100 || 0)}</span> <b style="color:#28a745;">¡GRATIS!</b>`;
      } else {
         shippingLineEl.textContent = money(ship);
      }
    }

    if (cartTotalEl) cartTotalEl.textContent = money(subNet + ship);
  };

  const loadShipping = () => {
    try { const raw = localStorage.getItem(STORAGE_KEYS.ship); if (raw) shipping = { ...shipping, ...JSON.parse(raw) }; } catch {}
  };
  const saveShipping = () => { try { localStorage.setItem(STORAGE_KEYS.ship, JSON.stringify(shipping)); } catch {} };

  const getSelectedShipMode = () => { const el = document.querySelector('input[name="shipMode"]:checked'); return el ? String(el.value || "pickup") : "pickup"; };

  const refreshShippingUI = () => {
    shipping.mode = getSelectedShipMode();

    if (shipHint) {
      if(shipping.mode === "pickup") shipHint.textContent = "Fábrica";
      else if(shipping.quote) shipHint.textContent = shipping.quote.label;
      else shipHint.textContent = SHIPPING_LABELS[shipping.mode];
    }

    if (shippingNote) {
      if(shipping.mode === 'pickup') shippingNote.textContent = "Recoge gratis en nuestras instalaciones en Tijuana.";
      else if(shipping.mode === 'envia_mx') shippingNote.textContent = "Envío estándar nacional de 3 a 5 días.";
      else if(shipping.mode === 'envia_us') shippingNote.textContent = "Envío USA Internacional de 5 a 10 días.";
    }

    const needsZip = shipping.mode === "envia_mx" || shipping.mode === "envia_us";
    if (postalWrap) postalWrap.hidden = !needsZip;
    if (needsZip) { setTimeout(() => postalCodeInput?.focus(), 50); }

    if (!needsZip) { shipping.postal_code = ""; shipping.quote = null; if (postalCodeInput) postalCodeInput.value = ""; saveShipping(); renderCart(); return; }
    if (postalCodeInput) postalCodeInput.value = shipping.postal_code || "";
    renderCart();
  };

  const quoteShipping = async () => {
    if (checkoutMsg) checkoutMsg.hidden = true;
    const mode = getSelectedShipMode();
    if (mode === "pickup") { shipping.mode = "pickup"; shipping.quote = null; saveShipping(); renderCart(); return; }

    const postal_code = String(postalCodeInput?.value || "").trim();
    if (postal_code.length < 4) { showToast("⚠️ Ingresa un Código Postal o ZIP válido."); return; }
    if (!cart.length) { showToast("El carrito está vacío"); return; }

    if (quoteBtn) { quoteBtn.disabled = true; quoteBtn.textContent = "Calculando..."; }
    if (checkoutBtn) { checkoutBtn.disabled = true; }

    try {
      const body = { postal_code, shipping_mode: mode, country: mode === "envia_us" ? "US" : "MX", items: cart.map((it) => ({ sku: it.sku, qty: it.qty })) };
      const res = await fetch("/.netlify/functions/quote_shipping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar automáticamente con el proveedor.");

      shipping.mode = mode; shipping.postal_code = postal_code;
      shipping.quote = { amount_cents: Number(data.amount_cents || 0), amount_mxn: Number(data.amount_mxn || 0), label: String(data.label || "Standard"), country: String(data.country || body.country), provider: String(data.provider || "envia") };
      saveShipping(); refreshShippingUI(); showToast(`✅ Costo de envío calculado`);
    } catch (e) {
      shipping.quote = null; saveShipping(); refreshShippingUI(); showToast(`❌ Error de sistema de envíos. Verifica tu CP.`);
      if (checkoutMsg) { checkoutMsg.hidden = false; checkoutMsg.textContent = "No pudimos calcular el envío a tu código postal. Intenta nuevamente."; }
    } finally {
      if (quoteBtn) { quoteBtn.disabled = false; quoteBtn.textContent = "Calcular"; }
      if (checkoutBtn && cart.length > 0) { checkoutBtn.disabled = false; }
    }
  };

  // ---------- CHECKOUT LOCK (anti doble intento) ----------
  const checkoutLockRead = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.checkoutLock);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj.ts !== "number") return null;
      return obj;
    } catch { return null; }
  };

  const checkoutLockWrite = (fingerprint) => {
    try {
      localStorage.setItem(STORAGE_KEYS.checkoutLock, JSON.stringify({ ts: Date.now(), fp: String(fingerprint || "") }));
    } catch {}
  };

  const checkoutLockClear = () => { try { localStorage.removeItem(STORAGE_KEYS.checkoutLock); } catch {} };

  const checkoutFingerprint = () => {
    try {
      const items = cart
        .map((it) => ({ sku: it.sku, size: it.size, qty: Number(it.qty || 0) }))
        .sort((a, b) => `${a.sku}__${a.size}`.localeCompare(`${b.sku}__${b.size}`));
      return JSON.stringify({
        items,
        ship: getSelectedShipMode(),
        postal: String(postalCodeInput?.value || "").trim(),
        promo: String(promoCodeInput?.value || "").trim().toUpperCase(),
      });
    } catch {
      return String(Date.now());
    }
  };

const doCheckout = async () => {
    if (checkoutMsg) checkoutMsg.hidden = true;
    if (!cart.length) { showToast("Tu carrito está vacío"); return; }

    const fp = checkoutFingerprint();
    const lock = checkoutLockRead();
    if (lock && lock.fp === fp && (Date.now() - lock.ts) < 120000) {
      showToast("⏳ Ya estamos procesando tu pago. Espera un momento…");
      return;
    }
    if (lock && (Date.now() - lock.ts) > 600000) checkoutLockClear();

    const shipping_mode = getSelectedShipMode();
    const promo_code = String(promoCodeInput?.value || "").trim().toUpperCase();
    const postal_code = String(postalCodeInput?.value || "").trim();
    const needsZip = shipping_mode === "envia_mx" || shipping_mode === "envia_us";

    if (needsZip) {
      if (postal_code.length < 4) { showToast("Debes ingresar tu Código Postal o ZIP válido para calcular el envío."); return; }
      if (!shipping.quote || shipping.postal_code !== postal_code || shipping.mode !== shipping_mode) {
        await quoteShipping(); if (!shipping.quote) return;
      }
    }

    checkoutLockWrite(fp);

    if (checkoutBtn) { checkoutBtn.disabled = true; }
    if (checkoutLoader) { checkoutLoader.hidden = false; }

    try {
      const payload = { items: cart.map((it) => ({ sku: it.sku, qty: it.qty, size: it.size })), shipping_mode, postal_code: needsZip ? postal_code : "", promo_code };
      const res = await fetch("/.netlify/functions/create_checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.url) throw new Error(data?.error || "Error al iniciar pago seguro.");

      window.location.assign(data.url);
    } catch (e) {
      checkoutLockClear();
      if (checkoutLoader) { checkoutLoader.hidden = true; }
      if (checkoutMsg) { checkoutMsg.hidden = false; checkoutMsg.textContent = `Aviso del sistema: ${String(e?.message || e)}`; }
      showToast("Hubo un error al procesar el pago seguro.");
      if (checkoutBtn) { checkoutBtn.disabled = false; }
    }
  };

  const addChatMsg = (who, text) => {
    if (!aiOutput) return;
    const div = document.createElement("div"); div.className = `msg ${who === "me" ? "msg--me" : "msg--ai"}`;
    div.innerHTML = `<div>${escapeHtml(text)}</div><div class="msg__meta">${who === "me" ? "Tú" : "SCORE AI"}</div>`;
    aiOutput.appendChild(div); aiOutput.scrollTop = aiOutput.scrollHeight;
  };

  const sendAi = async () => {
    const msg = String(aiInput?.value || "").trim();
    if (!msg) return;
    if (aiInput) aiInput.value = "";
    addChatMsg("me", msg);
    if (aiSendBtn) { aiSendBtn.disabled = true; aiSendBtn.textContent = "…"; }

    try {
      const res = await fetch("/.netlify/functions/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: msg }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "AI error");
      addChatMsg("ai", String(data.reply || "Listo."));
    } catch (e) {
      addChatMsg("ai", "Sistemas de SCORE AI ocupados, intenta más tarde.");
    } finally {
      if (aiSendBtn) { aiSendBtn.disabled = false; aiSendBtn.textContent = "Enviar ➢"; }
    }
  };

  const openAiChat = () => {
    closeLayer(sideMenu); openLayer(aiModal);
    setTimeout(() => aiInput?.focus(), 50);
    if (!aiOutput?.children?.length) addChatMsg("ai", "¡Hola! Soy SCORE AI. ¿Te ayudo con tallas o pedidos de tu merch oficial?");
  };

  const init = async () => {
    if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;
    loadCart(); loadShipping();

    try {
      const lock = checkoutLockRead();
      if (lock && (Date.now() - lock.ts) > 600000) checkoutLockClear();
    } catch {}

    await fetchPromos();
    validatePromo();
    refreshShippingUI();

    if (overlay) overlay.addEventListener("click", closeAll);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });

    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));
    openCartBtn?.addEventListener("click", () => { openLayer(cartDrawer); refreshShippingUI(); renderCart(); });
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));
    navOpenCart?.addEventListener("click", () => { openLayer(cartDrawer); refreshShippingUI(); renderCart(); });

    scrollLeftBtn?.addEventListener("click", () => { productGrid?.scrollBy({ left: -320, behavior: 'smooth' }); });
    scrollRightBtn?.addEventListener("click", () => { productGrid?.scrollBy({ left: 320, behavior: 'smooth' }); });

    $$(".navitem[data-scroll]").forEach((btn) => {
      btn.addEventListener("click", () => { closeLayer(sideMenu); scrollToEl(btn.getAttribute("data-scroll")); });
    });

    scrollToCategoriesBtn?.addEventListener("click", () => scrollToEl("#categories"));

    clearFilterBtn?.addEventListener("click", () => {
      activeCategory = null; searchQuery = "";
      $$('.catcard').forEach(c => c.classList.remove('active'));
      if (searchInput) searchInput.value = "";
      if (menuSearchInput) menuSearchInput.value = "";
      if (categoryHint) categoryHint.hidden = false;
      updateFilterUI(); renderProducts();
    });

    searchInput?.addEventListener("input", debounce(() => {
      searchQuery = String(searchInput?.value || "").trim();
      if(searchQuery !== "") catalogCarouselSection.hidden = false;
      updateFilterUI(); renderProducts();
    }, 200));

    menuSearchInput?.addEventListener("input", debounce(() => {
      searchQuery = String(menuSearchInput?.value || "").trim();
      if (searchInput) searchInput.value = searchQuery;
      if(searchQuery !== "") catalogCarouselSection.hidden = false;
      updateFilterUI(); renderProducts();
    }, 200));

    sortSelect?.addEventListener("change", () => { sortMode = String(sortSelect.value || "featured"); renderProducts(); });

    pmClose?.addEventListener("click", () => closeLayer(productModal));
    pmBackBtn?.addEventListener("click", () => closeLayer(productModal));

    pmAdd?.addEventListener("click", () => {
      if (!currentProduct) return;
      if (pmAdd.disabled) return;

      pmAdd.disabled = true;
      const originalText = pmAdd.innerHTML;
      pmAdd.innerHTML = "✅ ¡Agregado!";
      pmAdd.style.backgroundColor = "#28a745";
      pmAdd.style.borderColor = "#28a745";

      setTimeout(() => {
        pmAdd.innerHTML = originalText;
        pmAdd.style.backgroundColor = "";
        pmAdd.style.borderColor = "";
        pmAdd.disabled = false;

        addToCart(currentProduct, String(pmSize?.value || "").trim(), clampInt(pmQty?.value, 1, 99));
        closeLayer(productModal);
        openLayer(cartDrawer);
        refreshShippingUI();
      }, 600);
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
    if(applyPromoBtn) {
      applyPromoBtn.addEventListener("click", () => {
        validatePromo();
        renderCart();
        const raw = String(promoCodeInput?.value || "").trim();
        if (!raw) { showToast("Ingresa un cupón para aplicar."); return; }
        if (activePromo) showToast("✅ Cupón aplicado");
        else showToast("⚠️ Cupón inválido o no aplica");
      });
    }

    checkoutBtn?.addEventListener("click", doCheckout);

    const consentDecision = localStorage.getItem(STORAGE_KEYS.consent);
    if (!consentDecision && cookieBanner) { cookieBanner.hidden = false; }
    cookieAccept?.addEventListener("click", () => { try { localStorage.setItem(STORAGE_KEYS.consent, "accept"); } catch {} if(cookieBanner) cookieBanner.hidden = true; });
    cookieReject?.addEventListener("click", () => { try { localStorage.setItem(STORAGE_KEYS.consent, "reject"); } catch {} if(cookieBanner) cookieBanner.hidden = true; });

    renderCart();

    try {
      catalog = await fetchCatalog();
      products = catalog.products.map(normalizeProduct).filter((p) => p.sku);
      products = products.map((p) => { if (!CATEGORY_CONFIG.some((c) => c.uiId === p.uiSection)) p.uiSection = "BAJA1000"; return p; });

      renderCategories();
      updateFilterUI();
      renderProducts();
    } catch (e) {
      showToast("Error de conexión al catálogo principal.");
      console.error(e);
    } finally {
      setTimeout(() => {
        if (splash) {
          splash.style.opacity = "0";
          setTimeout(() => (splash.hidden = true), 800);
        }
      }, 3500);
    }
  };

  init().catch((e) => { console.error(e); if (splash) splash.hidden = true; });
})();