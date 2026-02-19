/* =========================================================
   SCORE STORE — MAIN (PROD, NO-ROT, HTML↔CSS↔JS alineado)
   - 4 catálogos: BAJA1000, BAJA500, BAJA400, SF250
   - BAJA1000 incluye EDICION_2025 + OTRAS_EDICIONES (no separado)
   - Carrusel tipo FB (snap + dots + flechas)
   - Stripe Checkout + OXXO via /api/checkout
   - Envío via /api/quote (Envía.com) + fallback seguro
   - PWA + SW anti-cache
   ========================================================= */

(() => {
  const APP_VERSION = window.__APP_VERSION__ || "dev";
  const STORAGE_KEY = "scorestore_cart_v2";

  const CONFIG = {
    endpoints: {
      catalog: `/data/catalog.json?v=${encodeURIComponent(APP_VERSION)}`,
      quote: "/api/quote",
      checkout: "/api/checkout",
    },
    currency: "MXN",
    locale: "es-MX",
  };

  /* ---------------- DOM helpers ---------------- */
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const dom = {
    intro: $("#intro"),

    overlay: $("#overlay"),
    drawerMenu: $("#drawerMenu"),
    drawerCart: $("#drawerCart"),

    btnMenu: $("#btnMenu"),
    btnCloseMenu: $("#btnCloseMenu"),
    btnCart: $("#btnCart"),
    btnCloseCart: $("#btnCloseCart"),
    btnOpenCartFromMenu: $("#btnOpenCartFromMenu"),

    btnGoCatalogos: $("#btnGoCatalogos"),
    btnGoProductos: $("#btnGoProductos"),

    appVersionLabel: $("#appVersionLabel"),

    searchInput: $("#searchInput"),
    sortSelect: $("#sortSelect"),

    catalogGrid: $("#catalogGrid"),
    btnAllCatalogs: $("#btnAllCatalogs"),

    activeFilterRow: $("#activeFilterRow"),
    activeFilterLabel: $("#activeFilterLabel"),
    btnClearFilter: $("#btnClearFilter"),

    statusRow: $("#statusRow"),
    productGrid: $("#productGrid"),

    cartCount: $("#cartCount"),
    cartItems: $("#cartItems"),
    cartSubtotal: $("#cartSubtotal"),
    shippingLine: $("#shippingLine"),
    cartTotal: $("#cartTotal"),

    shipHint: $("#shipHint"),
    shipForm: $("#shipForm"),
    shipCP: $("#shipCP"),
    shipCity: $("#shipCity"),
    shipState: $("#shipState"),
    btnQuote: $("#btnQuote"),
    quoteMsg: $("#quoteMsg"),

    btnCheckout: $("#btnCheckout"),
    checkoutMsg: $("#checkoutMsg"),

    productModal: $("#productModal"),
    pmClose: $("#pmClose"),
    pmTitle: $("#pmTitle"),
    pmCarousel: $("#pmCarousel"),
    pmPrice: $("#pmPrice"),
    pmDesc: $("#pmDesc"),
    pmSize: $("#pmSize"),
    pmQty: $("#pmQty"),
    pmAdd: $("#pmAdd"),

    legalModal: $("#legalModal"),
    legalClose: $("#legalClose"),
    legalTitle: $("#legalTitle"),
    legalBody: $("#legalBody"),
    btnOpenTerms: $("#btnOpenTerms"),
    btnOpenPrivacy: $("#btnOpenPrivacy"),

    toast: $("#toast"),
  };

  /* ---------------- State ---------------- */
  const state = {
    catalog: null,
    catalogs: [], // 4
    products: [],

    activeCatalogId: null,
    search: "",
    sort: "featured",

    cart: loadCart(),

    shippingMode: "pickup", // pickup | delivery
    shippingQuoteCents: 0,
    shipTo: { postal_code: "", city: "", state: "" },

    modalProduct: null,
  };

  /* ---------------- Utils ---------------- */
  const money = (mxn) => {
    try {
      return new Intl.NumberFormat(CONFIG.locale, { style:"currency", currency: CONFIG.currency }).format(mxn);
    } catch {
      return `$${Number(mxn || 0).toFixed(0)}`;
    }
  };
  const centsToMXN = (c) => Math.max(0, Math.round(Number(c || 0))) / 100;
  const clampQty = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 1;
    return Math.max(1, Math.min(99, Math.round(v)));
  };

  const escapeHtml = (str) =>
    String(str || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");

  const safeAssetUrl = (path) => {
    if (!path) return "";
    const p = String(path).trim();
    const normalized = p.startsWith("/") ? p : `/${p}`;
    return encodeURI(normalized); // espacios => %20
  };

  const debounce = (fn, ms=220) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const toast = (msg) => {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (dom.toast.hidden = true), 2200);
  };

  const scrollToSel = (sel) => {
    const el = $(sel);
    if (!el) return;
    el.scrollIntoView({ behavior:"smooth", block:"start" });
  };

  function openOverlay() {
    dom.overlay.hidden = false;
  }
  function closeOverlay() {
    dom.overlay.hidden = true;
  }
  function openDrawer(el) {
    openOverlay();
    el.hidden = false;
  }
  function closeDrawer(el) {
    el.hidden = true;
    closeOverlay();
  }
  function openModal(el) {
    openOverlay();
    el.hidden = false;
  }
  function closeModal(el) {
    el.hidden = true;
    closeOverlay();
  }

  /* ---------------- Cart storage ---------------- */
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart)); } catch {}
    updateCartBadge();
  }
  function updateCartBadge() {
    const count = state.cart.reduce((a, it) => a + (it.qty || 0), 0);
    dom.cartCount.textContent = String(count);
  }

  /* ---------------- Product helpers ---------------- */
  function getTitle(p){ return p.title || p.name || "Producto"; }
  function getDesc(p){ return p.description || p.desc || ""; }
  function getSku(p){ return p.sku || p.id || getTitle(p); }
  function getPriceCents(p){
    if (Number.isFinite(Number(p.price_cents))) return Number(p.price_cents);
    if (Number.isFinite(Number(p.priceMXN))) return Number(p.priceMXN) * 100;
    return 0;
  }
  function getSizes(p){
    const arr = p.sizes || p.variants || [];
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  }
  function getImages(p){
    const imgs = []
      .concat(p.images || [])
      .concat(p.img ? [p.img] : [])
      .filter(Boolean);

    // de-dup
    const seen = new Set();
    const out = [];
    for (const x of imgs){
      const k = String(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out.length ? out : ["/assets/hero.webp"];
  }

  /* ---------------- Catalog loading ---------------- */
  async function loadCatalog(){
    dom.statusRow.textContent = "Cargando catálogo…";
    try{
      const r = await fetch(CONFIG.endpoints.catalog, { cache:"no-store" });
      if (!r.ok) throw new Error("catalog fetch failed");
      const data = await r.json();

      state.catalog = data;
      state.catalogs = Array.isArray(data.catalogs) ? data.catalogs : [];
      state.products = Array.isArray(data.products) ? data.products : [];

      dom.statusRow.textContent = "";
      renderCatalogs();
      renderProducts();
    } catch(e){
      dom.statusRow.textContent = "No se pudo cargar data/catalog.json. Revisa el archivo.";
    }
  }

  function renderCatalogs(){
    dom.catalogGrid.innerHTML = "";
    for (const c of state.catalogs){
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catalogCard";
      card.innerHTML = `
        <div class="catalogCard__bg"></div>
        <div class="catalogCard__content">
          <div class="catalogCard__text">
            <p class="catalogCard__title">${escapeHtml(c.name)}</p>
            <p class="catalogCard__sub">${escapeHtml(c.subtitle || "Merch oficial")}</p>
          </div>
          <img class="catalogCard__logo" src="${safeAssetUrl(c.logo)}" alt="${escapeHtml(c.name)}" loading="lazy"
               onerror="this.style.opacity=.2" />
        </div>
      `;

      card.addEventListener("click", () => {
        state.activeCatalogId = c.id;
        dom.activeFilterRow.hidden = false;
        dom.activeFilterLabel.textContent = `Catálogo: ${c.name}`;
        renderProducts(true);
        scrollToSel("#productos");
        toast(`Filtrando: ${c.name}`);
      });

      dom.catalogGrid.appendChild(card);
    }
  }

  function filteredProducts(){
    let list = [...state.products];

    if (state.activeCatalogId){
      list = list.filter(p => String(p.catalogId || "") === String(state.activeCatalogId));
    }

    if (state.search){
      const q = state.search.toLowerCase();
      list = list.filter(p => {
        const t = getTitle(p).toLowerCase();
        const d = getDesc(p).toLowerCase();
        return t.includes(q) || d.includes(q);
      });
    }

    switch(state.sort){
      case "price_asc": list.sort((a,b)=>getPriceCents(a)-getPriceCents(b)); break;
      case "price_desc": list.sort((a,b)=>getPriceCents(b)-getPriceCents(a)); break;
      case "name_asc": list.sort((a,b)=>getTitle(a).localeCompare(getTitle(b),"es")); break;
      case "featured":
      default:
        list.sort((a,b)=>(Number(a.rank||0)-Number(b.rank||0)));
        break;
    }

    return list;
  }

  function renderProducts(fromUser=false){
    const list = filteredProducts();
    dom.productGrid.innerHTML = "";

    dom.statusRow.textContent = list.length
      ? `${list.length} producto(s) disponibles.`
      : "Sin resultados.";

    for (const p of list){
      const title = getTitle(p);
      const images = getImages(p);
      const price = money(centsToMXN(getPriceCents(p)));
      const sizes = getSizes(p);

      const card = document.createElement("article");
      card.className = "card";

      const carousel = buildCarousel(images, title);

      const body = document.createElement("div");
      body.className = "card__body";
      body.innerHTML = `
        <h3 class="card__title">${escapeHtml(title)}</h3>
        <div class="card__meta">
          <div class="price">${price}</div>
          <div class="small">${sizes.length ? `Tallas: ${escapeHtml(sizes.join(", "))}` : "Talla: N/A"}</div>
        </div>
        <div class="card__actions">
          <button class="btn btn--ghost" type="button" data-action="view">Ver</button>
          <button class="btn btn--primary" type="button" data-action="add">Agregar</button>
        </div>
      `;

      body.querySelector('[data-action="view"]').addEventListener("click", () => openProductModal(p));
      body.querySelector('[data-action="add"]').addEventListener("click", () => {
        addToCart(p, sizes[0] || "", 1);
      });

      card.appendChild(carousel);
      card.appendChild(body);
      dom.productGrid.appendChild(card);
    }

    if (fromUser) dom.productGrid.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  /* ---------------- Carousel ---------------- */
  function buildCarousel(images, title){
    const wrap = document.createElement("div");
    wrap.className = "carousel";

    const imgs = (images && images.length) ? images : ["/assets/hero.webp"];

    const track = document.createElement("div");
    track.className = "carousel__track";

    for (const src of imgs){
      const slide = document.createElement("div");
      slide.className = "carousel__slide";
      slide.innerHTML = `
        <img class="carousel__img" src="${safeAssetUrl(src)}" alt="${escapeHtml(title)}" loading="lazy"
             onerror="this.style.opacity=.25" />
      `;
      track.appendChild(slide);
    }

    const dots = document.createElement("div");
    dots.className = "carousel__dots";
    dots.innerHTML = imgs.map((_,i)=>`<span class="dot ${i===0?"is-on":""}"></span>`).join("");

    const prev = document.createElement("button");
    prev.type="button";
    prev.className="carousel__nav carousel__nav--prev";
    prev.innerHTML="‹";
    prev.setAttribute("aria-label","Anterior");

    const next = document.createElement("button");
    next.type="button";
    next.className="carousel__nav carousel__nav--next";
    next.innerHTML="›";
    next.setAttribute("aria-label","Siguiente");

    const setNav = () => {
      const idx = getActiveIndex(track);
      const dotEls = $$(".dot", dots);
      dotEls.forEach((d,i)=>d.classList.toggle("is-on", i===idx));
      prev.disabled = idx<=0;
      next.disabled = idx>=imgs.length-1;
    };

    track.addEventListener("scroll", debounce(setNav, 70), { passive:true });
    prev.addEventListener("click", () => { scrollToIndex(track, Math.max(0, getActiveIndex(track)-1)); setNav(); });
    next.addEventListener("click", () => { scrollToIndex(track, Math.min(imgs.length-1, getActiveIndex(track)+1)); setNav(); });

    setNav();

    wrap.appendChild(track);
    if (imgs.length>1){
      wrap.appendChild(dots);
      wrap.appendChild(prev);
      wrap.appendChild(next);
    }
    return wrap;
  }

  function getActiveIndex(track){
    const w = track.clientWidth || 1;
    return Math.round(track.scrollLeft / w);
  }
  function scrollToIndex(track, idx){
    const w = track.clientWidth || 1;
    track.scrollTo({ left: idx*w, behavior:"smooth" });
  }

  /* ---------------- Product modal ---------------- */
  function openProductModal(p){
    state.modalProduct = p;

    const title = getTitle(p);
    const desc = getDesc(p);
    const images = getImages(p);
    const price = money(centsToMXN(getPriceCents(p)));
    const sizes = getSizes(p);

    dom.pmTitle.textContent = title;
    dom.pmDesc.textContent = desc || "—";
    dom.pmPrice.textContent = price;

    dom.pmSize.innerHTML = "";
    if (sizes.length){
      for (const s of sizes){
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        dom.pmSize.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "Única";
      dom.pmSize.appendChild(opt);
    }

    dom.pmQty.value = "1";
    dom.pmCarousel.innerHTML = "";
    dom.pmCarousel.appendChild(buildCarousel(images, title));

    openModal(dom.productModal);
  }

  /* ---------------- Cart ops ---------------- */
  function addToCart(p, size, qty){
    const sku = getSku(p);
    const key = `${sku}__${size||""}`;
    const it = state.cart.find(x => x.key === key);

    if (it){
      it.qty = clampQty(it.qty + qty);
    } else {
      const images = getImages(p);
      state.cart.push({
        key,
        sku,
        title: getTitle(p),
        size: size || "",
        qty: clampQty(qty),
        price_cents: getPriceCents(p),
        img: images[0] || "",
      });
    }

    saveCart();
    renderCart();
    toast("Agregado al carrito");
  }

  function removeFromCart(key){
    state.cart = state.cart.filter(x => x.key !== key);
    saveCart();
    renderCart();
  }

  function changeQty(key, delta){
    const it = state.cart.find(x => x.key === key);
    if (!it) return;
    it.qty = clampQty(it.qty + delta);
    saveCart();
    renderCart();
  }

  function subtotalCents(){
    return state.cart.reduce((a, it) => a + (Number(it.price_cents||0) * Number(it.qty||0)), 0);
  }
  function totalCents(){
    return subtotalCents() + Number(state.shippingQuoteCents||0);
  }

  function renderCart(){
    dom.cartItems.innerHTML = "";

    if (!state.cart.length){
      dom.cartItems.innerHTML = `<div class="hint">Tu carrito está vacío.</div>`;
      state.shippingQuoteCents = 0;
      dom.cartSubtotal.textContent = money(0);
      dom.shippingLine.textContent = money(0);
      dom.cartTotal.textContent = money(0);
      updateCartBadge();
      return;
    }

    for (const it of state.cart){
      const row = document.createElement("div");
      row.className = "cartitem";
      row.innerHTML = `
        <img class="cartitem__img" src="${safeAssetUrl(it.img)}" alt="" loading="lazy" onerror="this.style.opacity=.25" />
        <div>
          <p class="cartitem__title">${escapeHtml(it.title)} <span class="small">${it.size ? `· ${escapeHtml(it.size)}` : ""}</span></p>
          <div class="cartitem__meta">
            <div class="qty">
              <button type="button" aria-label="Menos">−</button>
              <span>${it.qty}</span>
              <button type="button" aria-label="Más">+</button>
            </div>
            <div><b>${money(centsToMXN(Number(it.price_cents||0) * Number(it.qty||0)))}</b></div>
          </div>
          <div style="display:flex; gap:10px; margin-top:8px;">
            <button class="btn btn--tiny btn--ghost" type="button" data-remove="1">Quitar</button>
          </div>
        </div>
      `;

      const [minusBtn, plusBtn] = $$('button[aria-label]', row);
      minusBtn.addEventListener("click", () => changeQty(it.key, -1));
      plusBtn.addEventListener("click", () => changeQty(it.key, +1));
      row.querySelector("[data-remove]").addEventListener("click", () => removeFromCart(it.key));

      dom.cartItems.appendChild(row);
    }

    dom.cartSubtotal.textContent = money(centsToMXN(subtotalCents()));
    dom.shippingLine.textContent = money(centsToMXN(state.shippingQuoteCents||0));
    dom.cartTotal.textContent = money(centsToMXN(totalCents()));
    updateCartBadge();
  }

  /* ---------------- Shipping mode + quote ---------------- */
  function setShippingMode(mode){
    state.shippingMode = mode === "delivery" ? "delivery" : "pickup";

    if (state.shippingMode === "delivery"){
      dom.shipForm.hidden = false;
      dom.shipHint.textContent = "Ingresa datos para cotizar";
    } else {
      dom.shipForm.hidden = true;
      dom.shipHint.textContent = "Pickup seleccionado";
      state.shippingQuoteCents = 0;
      renderCart();
    }
  }

  function readShipTo(){
    const cp = (dom.shipCP.value || "").trim();
    const city = (dom.shipCity.value || "").trim();
    const st = (dom.shipState.value || "").trim();
    return { postal_code: cp, city, state: st };
  }

  async function quoteShipping(){
    if (state.shippingMode !== "delivery") return;

    const shipTo = readShipTo();
    state.shipTo = shipTo;

    if (!/^\d{5}$/.test(shipTo.postal_code)){
      dom.quoteMsg.hidden = false;
      dom.quoteMsg.textContent = "CP inválido (5 dígitos).";
      toast("CP inválido");
      return;
    }
    if (!shipTo.city || !shipTo.state){
      dom.quoteMsg.hidden = false;
      dom.quoteMsg.textContent = "Ciudad y Estado son requeridos para cotizar real.";
      toast("Falta ciudad/estado");
      return;
    }

    dom.btnQuote.disabled = true;
    dom.btnQuote.textContent = "Cotizando…";
    dom.quoteMsg.hidden = true;

    try{
      const payload = {
        destination: shipTo,
        items: state.cart.map(it => ({ sku: it.sku, qty: it.qty, size: it.size })),
      };

      const r = await fetch(CONFIG.endpoints.quote, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(()=>null);
      if (!r.ok || !data?.ok) throw new Error(data?.error || "quote failed");

      state.shippingQuoteCents = Number(data.quote?.total_cents || 0);
      dom.shipHint.textContent = "Cotización lista";
      dom.quoteMsg.hidden = false;
      dom.quoteMsg.textContent = data.quote?.service
        ? `Servicio: ${data.quote.service} · ${money(centsToMXN(state.shippingQuoteCents))}`
        : `Envío: ${money(centsToMXN(state.shippingQuoteCents))}`;

      renderCart();
      toast("Envío cotizado");
    } catch(e){
      // Fallback seguro: NO rompe la app
      state.shippingQuoteCents = 0;
      dom.shipHint.textContent = "No se pudo cotizar";
      dom.quoteMsg.hidden = false;
      dom.quoteMsg.textContent = "No se pudo cotizar (API/Key). Puedes seguir con pickup o intentar de nuevo.";
      renderCart();
      toast("No se pudo cotizar");
    } finally {
      dom.btnQuote.disabled = false;
      dom.btnQuote.textContent = "Cotizar";
    }
  }

  /* ---------------- Checkout ---------------- */
  async function checkout(){
    if (!state.cart.length){
      toast("Tu carrito está vacío");
      return;
    }

    dom.btnCheckout.disabled = true;
    dom.checkoutMsg.hidden = true;

    // Si es envío, exige que haya cotización (real)
    if (state.shippingMode === "delivery"){
      const shipTo = readShipTo();
      if (!/^\d{5}$/.test(shipTo.postal_code) || !shipTo.city || !shipTo.state){
        dom.checkoutMsg.hidden = false;
        dom.checkoutMsg.textContent = "Para envío, completa CP/Ciudad/Estado y cotiza primero.";
        dom.btnCheckout.disabled = false;
        return;
      }
      if (!state.shippingQuoteCents){
        dom.checkoutMsg.hidden = false;
        dom.checkoutMsg.textContent = "Cotiza el envío antes de pagar (para cobrar envío real).";
        dom.btnCheckout.disabled = false;
        return;
      }
    }

    try{
      const payload = {
        items: state.cart.map(it => ({ sku: it.sku, qty: it.qty, size: it.size })),
        shipping_mode: state.shippingMode,
        destination: state.shippingMode === "delivery" ? readShipTo() : null,
      };

      const r = await fetch(CONFIG.endpoints.checkout, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json().catch(()=>null);
      if (!r.ok || !data?.url) throw new Error(data?.error || "checkout failed");

      window.location.href = data.url;
    } catch(e){
      dom.checkoutMsg.hidden = false;
      dom.checkoutMsg.textContent = "No se pudo iniciar el pago. Revisa /api/checkout (Netlify Function).";
      toast("Error al iniciar pago");
    } finally {
      dom.btnCheckout.disabled = false;
    }
  }

  /* ---------------- Legal ---------------- */
  function openLegal(kind){
    const isPrivacy = kind === "privacy";
    dom.legalTitle.textContent = isPrivacy ? "Privacidad" : "Términos";
    dom.legalBody.innerHTML = isPrivacy
      ? `<b>Privacidad</b><br/><br/>Usamos datos mínimos para operar la tienda. El carrito se guarda localmente en tu dispositivo.`
      : `<b>Términos</b><br/><br/>Pagos procesados por Stripe Checkout. OXXO disponible si tu cuenta Stripe lo habilita para MXN.`;
    openModal(dom.legalModal);
  }

  /* ---------------- Events ---------------- */
  function bindEvents(){
    dom.appVersionLabel.textContent = APP_VERSION;

    dom.overlay.addEventListener("click", () => {
      // cierra todo
      [dom.drawerMenu, dom.drawerCart, dom.productModal, dom.legalModal].forEach(el => {
        if (el && !el.hidden) el.hidden = true;
      });
      closeOverlay();
    });

    dom.btnMenu.addEventListener("click", () => openDrawer(dom.drawerMenu));
    dom.btnCloseMenu.addEventListener("click", () => closeDrawer(dom.drawerMenu));

    dom.btnCart.addEventListener("click", () => { openDrawer(dom.drawerCart); renderCart(); });
    dom.btnCloseCart.addEventListener("click", () => closeDrawer(dom.drawerCart));
    dom.btnOpenCartFromMenu.addEventListener("click", () => { closeDrawer(dom.drawerMenu); openDrawer(dom.drawerCart); renderCart(); });

    $$(".navitem[data-scroll]", dom.drawerMenu).forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-scroll");
        closeDrawer(dom.drawerMenu);
        scrollToSel(target);
      });
    });

    dom.btnGoCatalogos.addEventListener("click", () => scrollToSel("#catalogos"));
    dom.btnGoProductos.addEventListener("click", () => scrollToSel("#productos"));

    dom.searchInput.addEventListener("input", debounce(() => {
      state.search = (dom.searchInput.value || "").trim();
      renderProducts(true);
    }, 160));

    dom.sortSelect.addEventListener("change", () => {
      state.sort = dom.sortSelect.value || "featured";
      renderProducts(true);
    });

    dom.btnAllCatalogs.addEventListener("click", () => {
      state.activeCatalogId = null;
      dom.activeFilterRow.hidden = true;
      renderProducts(true);
      toast("Mostrando todo");
    });

    dom.btnClearFilter.addEventListener("click", () => {
      state.activeCatalogId = null;
      dom.activeFilterRow.hidden = true;
      renderProducts(true);
    });

    $$('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", () => setShippingMode(r.value));
    });

    dom.btnQuote.addEventListener("click", quoteShipping);
    dom.shipCP.addEventListener("input", debounce(() => {
      if (state.shippingMode === "delivery"){
        // no auto-quote agresivo, pero ayuda
        dom.quoteMsg.hidden = true;
      }
    }, 200));

    dom.btnCheckout.addEventListener("click", checkout);

    dom.pmClose.addEventListener("click", () => closeModal(dom.productModal));
    dom.pmAdd.addEventListener("click", () => {
      if (!state.modalProduct) return;
      const size = dom.pmSize.value || "";
      const qty = clampQty(dom.pmQty.value);
      addToCart(state.modalProduct, size, qty);
      closeModal(dom.productModal);
      openDrawer(dom.drawerCart);
    });

    dom.btnOpenTerms.addEventListener("click", () => openLegal("terms"));
    dom.btnOpenPrivacy.addEventListener("click", () => openLegal("privacy"));
    dom.legalClose.addEventListener("click", () => closeModal(dom.legalModal));

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      [dom.drawerMenu, dom.drawerCart, dom.productModal, dom.legalModal].forEach(el => {
        if (el && !el.hidden) el.hidden = true;
      });
      closeOverlay();
    });
  }

  /* ---------------- PWA Service Worker ---------------- */
  function registerSW(){
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }

  /* ---------------- Boot ---------------- */
  async function boot(){
    dom.appVersionLabel.textContent = APP_VERSION;
    updateCartBadge();
    bindEvents();
    renderCart();
    registerSW();

    await loadCatalog();

    // intro off
    setTimeout(() => {
      if (!dom.intro) return;
      dom.intro.classList.add("is-off");
      setTimeout(() => { dom.intro.remove(); }, 380);
    }, 520);
  }

  boot();
})();
