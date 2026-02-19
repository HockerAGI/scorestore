/* =========================================================
   SCORE STORE — Frontend (PRO) v2026.02.19 (FULL)
   - 4 catálogos (BAJA1000, BAJA500, BAJA400, SF250)
   - Baja1000 mezcla Edición 2025 + Otras ediciones (misma sección)
   - Carrito + cotización Envía (/api/quote)
   - Checkout real Stripe (/api/checkout)
   - SCORE AI Gemini (/api/chat)
   - UI Light / Pro (no dark)
   ========================================================= */

(() => {
  "use strict";

  const APP_VERSION = window.__APP_VERSION__ || "dev";

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
  const scrollToCatalogBtn = $("#scrollToCatalogBtn");

  const categoryGrid = $("#categoryGrid");
  const clearCategoryBtn = $("#clearCategoryBtn");
  const categoryHint = $("#categoryHint");

  const productGrid = $("#productGrid");
  const statusRow = $("#statusRow");

  const searchInput = $("#searchInput");
  const sortSelect = $("#sortSelect");

  const activeFilterRow = $("#activeFilterRow");
  const activeFilterLabel = $("#activeFilterLabel");
  const clearFilterBtn = $("#clearFilterBtn");

  const cartCount = $("#cartCount");
  const cartItemsEl = $("#cartItems");
  const cartSubtotalEl = $("#cartSubtotal");
  const shippingLineEl = $("#shippingLine");
  const cartTotalEl = $("#cartTotal");

  const shipHint = $("#shipHint");
  const postalWrap = $("#postalWrap");
  const postalCodeInput = $("#postalCode");
  const quoteBtn = $("#quoteBtn");

  const promoCodeInput = $("#promoCode");
  const checkoutBtn = $("#checkoutBtn");
  const checkoutMsg = $("#checkoutMsg");

  const productModal = $("#productModal");
  const pmClose = $("#pmClose");
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
  const aiClose = $("#aiClose");
  const aiOutput = $("#aiOutput");
  const aiInput = $("#aiInput");
  const aiSendBtn = $("#aiSendBtn");

  const legalModal = $("#legalModal");
  const legalTitle = $("#legalTitle");
  const legalBody = $("#legalBody");
  const legalClose = $("#legalClose");
  const openLegalBtn = $("#openLegalBtn");
  const openPrivacyBtn = $("#openPrivacyBtn");

  const cookieBanner = $("#cookieBanner");
  const cookieAccept = $("#cookieAccept");
  const cookieReject = $("#cookieReject");

  const toast = $("#toast");
  const appVersionLabel = $("#appVersionLabel");

  const REQUIRED = [
    categoryGrid, productGrid, statusRow,
    cartCount, cartItemsEl, cartSubtotalEl, shippingLineEl, cartTotalEl,
    postalWrap, postalCodeInput, quoteBtn,
    checkoutBtn, checkoutMsg,
  ];
  if (REQUIRED.some((x) => !x)) {
    console.error("[ScoreStore] Faltan elementos críticos en el DOM.");
    return;
  }

  // ---------- CONFIG ----------
  const STORAGE_KEYS = {
    cart: "scorestore_cart_v1",
    ship: "scorestore_ship_v1",
    consent: "scorestore_consent_v1",
  };

  const CATEGORY_CONFIG = [
    {
      uiId: "BAJA1000",
      name: "BAJA 1000",
      logo: "assets/logo-baja1000.webp",
      texture: "assets/baja1000-texture.webp",
      mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES"],
    },
    {
      uiId: "BAJA500",
      name: "BAJA 500",
      logo: "assets/logo-baja500.webp",
      texture: "assets/baja1000-texture.webp",
      mapFrom: ["BAJA500", "BAJA_500"],
    },
    {
      uiId: "BAJA400",
      name: "BAJA 400",
      logo: "assets/logo-baja400.webp",
      texture: "assets/baja1000-texture.webp",
      mapFrom: ["BAJA400", "BAJA_400"],
    },
    {
      uiId: "SF250",
      name: "SAN FELIPE 250",
      logo: "assets/logo-sf250.webp",
      texture: "assets/baja1000-texture.webp",
      mapFrom: ["SF250", "SF_250"],
    },
  ];

  const SHIPPING_LABELS = {
    pickup: "Recoger en fábrica (Tijuana)",
    envia_mx: "Envío México (Envía.com)",
    envia_us: "Envío USA (Envía.com)",
  };

  // ---------- STATE ----------
  let catalog = null;
  let products = [];
  let activeCategory = null;
  let searchQuery = "";
  let sortMode = "featured";

  let cart = [];
  let shipping = {
    mode: "pickup",
    postal_code: "",
    quote: null, 
  };

  // ---------- UTILS ----------
  const escapeHtml = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

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
      return encodeURI(String(p || ""));
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

  const showToast = (text) => {
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), 2600);
  };

  const setStatus = (text) => {
    statusRow.textContent = text || "";
  };

  const openSet = new Set(); 

  const lockScrollIfNeeded = () => {
    if (openSet.size > 0) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  };

  const refreshOverlay = () => {
    overlay.hidden = openSet.size === 0;
    lockScrollIfNeeded();
  };

  const openLayer = (el) => {
    if (!el) return;
    el.hidden = false;
    openSet.add(el);
    refreshOverlay();
  };

  const closeLayer = (el) => {
    if (!el) return;
    el.hidden = true;
    openSet.delete(el);
    refreshOverlay();
  };

  const closeAll = () => {
    [sideMenu, cartDrawer, productModal, aiModal, legalModal].forEach((el) => {
      if (el && !el.hidden) el.hidden = true;
    });
    openSet.clear();
    refreshOverlay();
  };

  const scrollToEl = (sel) => {
    const el = $(sel);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const normalizeSectionIdToUi = (sectionId) => {
    const sid = String(sectionId || "").trim();
    const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
    return found ? found.uiId : null;
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

    const priceCents = Number.isFinite(Number(p?.price_cents))
      ? Math.round(Number(p.price_cents))
      : Number.isFinite(Number(p?.baseMXN))
      ? Math.round(Number(p.baseMXN) * 100)
      : Number.isFinite(Number(p?.price))
      ? Math.round(Number(p.price) * 100)
      : 0;

    const images = Array.isArray(p?.images) ? p.images : p?.img ? [p.img] : [];
    const img = images[0] ? safeUrl(images[0]) : "";

    const sizes =
      Array.isArray(p?.sizes) && p.sizes.length
        ? p.sizes
        : Array.isArray(p?.variants) && p.variants.length
        ? p.variants.map((v) => v?.size).filter(Boolean)
        : ["S", "M", "L", "XL"];

    const rawSection = String(p?.sectionId || p?.categoryId || p?.section || "").trim();
    const uiSection = normalizeSectionIdToUi(rawSection) || "BAJA1000";
    const collection = inferCollection(p);

    const rank = Number.isFinite(Number(p?.rank)) ? Number(p.rank) : 999;

    return {
      sku,
      id: sku,
      title,
      description: desc,
      priceCents,
      images: images.map(safeUrl),
      img,
      sizes: sizes.map((s) => String(s || "").trim()).filter(Boolean),
      rawSection,
      uiSection,
      collection,
      rank,
    };
  };

  const fetchCatalog = async () => {
    const url = `data/catalog.json?cv=${encodeURIComponent(APP_VERSION)}`;
    const res = await fetch(url, { headers: { "cache-control": "no-store" } });
    if (!res.ok) throw new Error(`No se pudo cargar catálogo (${res.status})`);
    const data = await res.json();
    if (!data || !Array.isArray(data.products)) throw new Error("Catálogo inválido");
    return data;
  };

  const getCategoryCounts = () => {
    const counts = Object.fromEntries(CATEGORY_CONFIG.map((c) => [c.uiId, 0]));
    for (const p of products) {
      if (!(p.uiSection in counts)) continue;
      counts[p.uiSection] += 1;
    }
    return counts;
  };

  const renderCategories = () => {
    const counts = getCategoryCounts();
    categoryGrid.innerHTML = "";

    for (const cat of CATEGORY_CONFIG) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "catcard";
      card.setAttribute("data-cat", cat.uiId);

      card.innerHTML = `
        <div class="catcard__bg" style="background-image:url('${safeUrl(cat.texture)}')"></div>
        <div class="catcard__inner">
          <img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}">
          <div class="catcard__meta">
            <div class="catcard__name">${escapeHtml(cat.name)}</div>
            <div class="catcard__count">${counts[cat.uiId] || 0} producto(s)</div>
            <div class="catcard__tag">● Ver catálogo</div>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        activeCategory = cat.uiId;
        categoryHint.hidden = true;
        updateFilterUI();
        renderProducts();
        scrollToEl("#catalog");
      });

      categoryGrid.appendChild(card);
    }

    categoryHint.hidden = false;
  };

  const updateFilterUI = () => {
    const pieces = [];
    if (activeCategory) {
      const c = CATEGORY_CONFIG.find((x) => x.uiId === activeCategory);
      if (c) pieces.push(`Catálogo: ${c.name}`);
    }
    if (searchQuery) pieces.push(`Búsqueda: “${searchQuery}”`);

    if (pieces.length) {
      activeFilterRow.hidden = false;
      activeFilterLabel.textContent = pieces.join(" · ");
    } else {
      activeFilterRow.hidden = true;
      activeFilterLabel.textContent = "";
    }
  };

  const applyFilters = (list) => {
    let out = list.slice();

    if (activeCategory) {
      out = out.filter((p) => p.uiSection === activeCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      out = out.filter((p) => {
        const hay = `${p.title} ${p.description} ${p.collection} ${p.uiSection}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (sortMode === "price_asc") out.sort((a, b) => a.priceCents - b.priceCents);
    else if (sortMode === "price_desc") out.sort((a, b) => b.priceCents - a.priceCents);
    else if (sortMode === "name_asc") out.sort((a, b) => a.title.localeCompare(b.title, "es"));
    else {
      out.sort((a, b) => (a.rank - b.rank) || a.title.localeCompare(b.title, "es"));
    }

    return out;
  };

  const renderProducts = () => {
    const list = applyFilters(products);
    productGrid.innerHTML = "";

    if (!products.length) {
      setStatus("No hay productos cargados.");
      return;
    }

    setStatus(`${list.length} producto(s)`);

    if (!list.length) {
      productGrid.innerHTML = `<div class="hint">Sin resultados. Prueba otra búsqueda.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();

    for (const p of list) {
      const card = document.createElement("article");
      card.className = "card";
      card.setAttribute("data-sku", p.sku);

      const pill = p.collection
        ? `<span class="pill pill--red">${escapeHtml(p.collection)}</span>`
        : `<span class="pill">${escapeHtml(p.uiSection)}</span>`;

      card.innerHTML = `
        <div class="card__media">
          ${p.img ? `<img loading="lazy" decoding="async" src="${p.img}" alt="${escapeHtml(p.title)}">` : ""}
        </div>
        <div class="card__body">
          <h3 class="card__title">${escapeHtml(p.title)}</h3>
          <div class="card__row">
            <div class="price">${money(p.priceCents)}</div>
            ${pill}
          </div>
        </div>
      `;

      card.addEventListener("click", () => openProduct(p.sku));
      frag.appendChild(card);
    }

    productGrid.appendChild(frag);
  };

  let currentProduct = null;

  const openProduct = (sku) => {
    const p = products.find((x) => x.sku === sku);
    if (!p) return;

    currentProduct = p;

    pmTitle.textContent = p.title;
    pmPrice.textContent = money(p.priceCents);
    pmDesc.textContent = p.description || "Merch oficial Score Store.";

    pmChips.innerHTML = "";
    if (p.uiSection) pmChips.innerHTML += `<span class="pill">${escapeHtml(p.uiSection)}</span>`;
    if (p.collection) pmChips.innerHTML += `<span class="pill pill--red">${escapeHtml(p.collection)}</span>`;

    pmSize.innerHTML = "";
    for (const s of p.sizes) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      pmSize.appendChild(opt);
    }

    pmQty.value = "1";

    const imgs = p.images && p.images.length ? p.images : (p.img ? [p.img] : []);
    pmCarousel.innerHTML = `
      <div class="pm__track">
        ${(imgs || []).map((src) => `<img src="${safeUrl(src)}" alt="${escapeHtml(p.title)}">`).join("")}
      </div>
    `;

    openLayer(productModal);
  };

  const saveCart = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
    } catch {}
  };

  const loadCart = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.cart);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cart = parsed;
    } catch {}
  };

  const cartItemKey = (sku, size) => `${sku}__${size || ""}`;

  const addToCart = (p, size, qty) => {
    const q = clampInt(qty, 1, 99);
    const s = String(size || "").trim() || (p.sizes?.[0] || "M");

    const key = cartItemKey(p.sku, s);
    const idx = cart.findIndex((x) => cartItemKey(x.sku, x.size) === key);

    if (idx >= 0) cart[idx].qty = clampInt(cart[idx].qty + q, 1, 99);
    else {
      cart.push({
        sku: p.sku,
        title: p.title,
        priceCents: p.priceCents,
        size: s,
        qty: q,
        img: p.img || "",
        uiSection: p.uiSection || "",
        collection: p.collection || "",
      });
    }

    saveCart();
    renderCart();
    showToast("Agregado al carrito");
  };

  const removeCartItem = (sku, size) => {
    cart = cart.filter((x) => !(x.sku === sku && x.size === size));
    saveCart();
    renderCart();
  };

  const setCartQty = (sku, size, qty) => {
    const q = clampInt(qty, 1, 99);
    const it = cart.find((x) => x.sku === sku && x.size === size);
    if (!it) return;
    it.qty = q;
    saveCart();
    renderCart();
  };

  const cartSubtotalCents = () =>
    cart.reduce((sum, it) => sum + (Number(it.priceCents || 0) * Number(it.qty || 1)), 0);

  const shippingCents = () => {
    if (shipping.mode === "pickup") return 0;
    const cents = Number(shipping.quote?.amount_cents || shipping.quote?.amount || 0);
    return Number.isFinite(cents) ? cents : 0;
  };

  const renderCart = () => {
    cartCount.textContent = String(cart.reduce((s, it) => s + Number(it.qty || 0), 0));
    cartItemsEl.innerHTML = "";

    if (!cart.length) {
      cartItemsEl.innerHTML = `<div class="hint">Tu carrito está vacío.</div>`;
      cartSubtotalEl.textContent = money(0);
      shippingLineEl.textContent = money(0);
      cartTotalEl.textContent = money(0);
      return;
    }

    const frag = document.createDocumentFragment();

    for (const it of cart) {
      const row = document.createElement("div");
      row.className = "cartitem";

      row.innerHTML = `
        <div class="cartitem__img">
          ${it.img ? `<img src="${safeUrl(it.img)}" alt="${escapeHtml(it.title)}">` : ""}
        </div>
        <div>
          <p class="cartitem__title">${escapeHtml(it.title)}</p>
          <div class="cartitem__meta">Talla: <b>${escapeHtml(it.size)}</b> · ${money(it.priceCents)} c/u</div>

          <div class="cartitem__controls">
            <div class="qty" aria-label="Cantidad">
              <button type="button" data-act="dec">−</button>
              <span>${it.qty}</span>
              <button type="button" data-act="inc">+</button>
            </div>

            <button class="trash" type="button">Quitar</button>
          </div>
        </div>
      `;

      const dec = row.querySelector('[data-act="dec"]');
      const inc = row.querySelector('[data-act="inc"]');
      const trash = row.querySelector(".trash");

      dec.addEventListener("click", (ev) => { ev.stopPropagation(); setCartQty(it.sku, it.size, it.qty - 1); });
      inc.addEventListener("click", (ev) => { ev.stopPropagation(); setCartQty(it.sku, it.size, it.qty + 1); });
      trash.addEventListener("click", (ev) => { ev.stopPropagation(); removeCartItem(it.sku, it.size); });

      frag.appendChild(row);
    }

    cartItemsEl.appendChild(frag);

    const sub = cartSubtotalCents();
    const ship = shippingCents();
    cartSubtotalEl.textContent = money(sub);
    shippingLineEl.textContent = money(ship);
    cartTotalEl.textContent = money(sub + ship);
  };

  const loadShipping = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ship);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") shipping = { ...shipping, ...parsed };
    } catch {}
  };

  const saveShipping = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.ship, JSON.stringify(shipping));
    } catch {}
  };

  const getSelectedShipMode = () => {
    const el = document.querySelector('input[name="shipMode"]:checked');
    return el ? String(el.value || "pickup") : "pickup";
  };

  const syncShippingLabelsInUI = () => {
    const pickupLabelSpan = document.querySelector('input[name="shipMode"][value="pickup"]')?.closest("label")?.querySelector("span");
    if (pickupLabelSpan) pickupLabelSpan.textContent = "Recoger en fábrica (Tijuana)";

    const mxLabelSpan = document.querySelector('input[name="shipMode"][value="envia_mx"]')?.closest("label")?.querySelector("span");
    if (mxLabelSpan) mxLabelSpan.textContent = "Envío México";

    const usLabelSpan = document.querySelector('input[name="shipMode"][value="envia_us"]')?.closest("label")?.querySelector("span");
    if (usLabelSpan) usLabelSpan.textContent = "Envío USA";
  };

  const setShipModeChecked = (mode) => {
    const el = document.querySelector(`input[name="shipMode"][value="${mode}"]`);
    if (el) el.checked = true;
  };

  const refreshShippingUI = () => {
    shipping.mode = getSelectedShipMode();

    shipHint.textContent = SHIPPING_LABELS[shipping.mode] || "Selecciona modo";

    const needsZip = shipping.mode === "envia_mx" || shipping.mode === "envia_us";
    postalWrap.hidden = !needsZip;

    if (!needsZip) {
      shipping.postal_code = "";
      shipping.quote = null;
      postalCodeInput.value = "";
      saveShipping();
      renderCart();
      return;
    }

    postalCodeInput.value = shipping.postal_code || "";
    renderCart();
  };

  const quoteShipping = async () => {
    checkoutMsg.hidden = true;

    const mode = getSelectedShipMode();
    if (!(mode === "envia_mx" || mode === "envia_us")) {
      shipping.mode = "pickup";
      shipping.quote = null;
      saveShipping();
      renderCart();
      return;
    }

    const postal_code = String(postalCodeInput.value || "").trim();
    if (postal_code.length < 4) {
      showToast("Ingresa un CP/ZIP válido");
      return;
    }

    if (!cart.length) {
      showToast("Carrito vacío");
      return;
    }

    quoteBtn.disabled = true;
    quoteBtn.textContent = "Cotizando…";

    try {
      const body = {
        postal_code,
        shipping_mode: mode,
        country: mode === "envia_us" ? "US" : "MX",
        items: cart.map((it) => ({ sku: it.sku, qty: it.qty })),
      };

      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo cotizar");
      }

      shipping.mode = mode;
      shipping.postal_code = postal_code;
      shipping.quote = {
        amount_cents: Number(data.amount_cents || data.amount || 0),
        amount_mxn: Number(data.amount_mxn || 0),
        label: String(data.label || "Standard"),
        country: String(data.country || body.country),
        provider: String(data.provider || "envia"),
      };

      saveShipping();
      renderCart();
      showToast(`Envío: ${money(shipping.quote.amount_cents)}`);
    } catch (e) {
      shipping.quote = null;
      saveShipping();
      renderCart();
      showToast(`Error: ${String(e?.message || e)}`);
    } finally {
      quoteBtn.disabled = false;
      quoteBtn.textContent = "Cotizar";
    }
  };

  const doCheckout = async () => {
    checkoutMsg.hidden = true;

    if (!cart.length) {
      showToast("Tu carrito está vacío");
      return;
    }

    const shipping_mode = getSelectedShipMode();
    const promo_code = String(promoCodeInput?.value || "").trim();
    const postal_code = String(postalCodeInput.value || "").trim();

    const needsZip = shipping_mode === "envia_mx" || shipping_mode === "envia_us";
    if (needsZip) {
      if (postal_code.length < 4) {
        showToast("Ingresa tu CP/ZIP");
        return;
      }
      if (!shipping.quote || shipping.postal_code !== postal_code || shipping.mode !== shipping_mode) {
        await quoteShipping();
        if (!shipping.quote) return;
      }
    }

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Creando checkout…";

    try {
      const payload = {
        items: cart.map((it) => ({
          sku: it.sku,
          qty: it.qty,
          size: it.size,
        })),
        shipping_mode,
        postal_code: needsZip ? postal_code : "",
        promo_code,
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || "Checkout error. Posible cupón inválido.");
      }

      window.location.href = data.url;
    } catch (e) {
      checkoutMsg.hidden = false;
      checkoutMsg.textContent = `Aviso: ${String(e?.message || e)}`;
      showToast("No se pudo iniciar pago");
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = "Pagar (Stripe + OXXO)";
    }
  };

  const addChatMsg = (who, text) => {
    const div = document.createElement("div");
    div.className = `msg ${who === "me" ? "msg--me" : "msg--ai"}`;
    div.innerHTML = `<div>${escapeHtml(text)}</div><div class="msg__meta">${who === "me" ? "Tú" : "SCORE AI"}</div>`;
    aiOutput.appendChild(div);
    aiOutput.scrollTop = aiOutput.scrollHeight;
  };

  const sendAi = async () => {
    const msg = String(aiInput.value || "").trim();
    if (!msg) return;

    aiInput.value = "";
    addChatMsg("me", msg);

    aiSendBtn.disabled = true;
    aiSendBtn.textContent = "…";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "AI error");

      addChatMsg("ai", String(data.reply || "Listo."));
    } catch (e) {
      addChatMsg("ai", "Ahorita no puedo responder (API). Intenta de nuevo o contacta soporte.");
    } finally {
      aiSendBtn.disabled = false;
      aiSendBtn.textContent = "Enviar";
    }
  };

  const LEGAL_TERMS = `
    <h3>Términos y Condiciones</h3>
    <p>Esta tienda es el canal oficial de mercancía (merch) de SCORE STORE. Los pagos se procesan por Stripe. Algunas formas de pago pueden incluir OXXO (según disponibilidad de Stripe en tu región).</p>
    <p>Los tiempos de producción y entrega pueden variar según disponibilidad y logística. Para envíos se utiliza Envía.com como proveedor de cotización/guías (cuando aplique).</p>
    <p>Si necesitas soporte, contáctanos por los canales oficiales.</p>
  `;

  const LEGAL_PRIV = `
    <h3>Aviso de Privacidad</h3>
    <p>Los datos capturados durante el proceso de compra se usan únicamente para procesar pagos, envío y soporte. Stripe puede solicitar información adicional para validar el pago.</p>
    <p>Si aceptas cookies/tracking, podemos habilitar medición para mejorar campañas y experiencia. Puedes continuar sin tracking.</p>
  `;

  const openLegal = (type) => {
    legalTitle.textContent = type === "privacy" ? "Privacidad" : "Términos";
    legalBody.innerHTML = `<div class="legal">${type === "privacy" ? LEGAL_PRIV : LEGAL_TERMS}</div>`;
    openLayer(legalModal);
  };

  const initConsent = () => {
    try {
      const v = localStorage.getItem(STORAGE_KEYS.consent);
      if (v) return;
      cookieBanner.hidden = false;
    } catch {
      cookieBanner.hidden = false;
    }
  };

  const setConsent = (val) => {
    try {
      localStorage.setItem(STORAGE_KEYS.consent, val ? "accept" : "reject");
    } catch {}
    cookieBanner.hidden = true;
  };

  const registerSW = () => {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`sw.js?cv=${encodeURIComponent(APP_VERSION)}`)
        .catch(() => {});
    });
  };

  const init = async () => {
    if (appVersionLabel) appVersionLabel.textContent = APP_VERSION;

    loadCart();
    loadShipping();

    setShipModeChecked(shipping.mode || "pickup");
    syncShippingLabelsInUI();
    refreshShippingUI();

    overlay.addEventListener("click", closeAll);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });

    openMenuBtn?.addEventListener("click", () => openLayer(sideMenu));
    closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));

    openCartBtn?.addEventListener("click", () => {
      openLayer(cartDrawer);
      refreshShippingUI();
      renderCart();
    });
    closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));

    navOpenCart?.addEventListener("click", () => {
      closeLayer(sideMenu);
      openLayer(cartDrawer);
      refreshShippingUI();
      renderCart();
    });

    $$(".navitem[data-scroll]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = btn.getAttribute("data-scroll");
        closeLayer(sideMenu);
        if (sel) scrollToEl(sel);
      });
    });

    scrollToCategoriesBtn?.addEventListener("click", () => scrollToEl("#categories"));
    scrollToCatalogBtn?.addEventListener("click", () => scrollToEl("#catalog"));

    clearCategoryBtn?.addEventListener("click", () => {
      activeCategory = null;
      categoryHint.hidden = false;
      updateFilterUI();
      renderProducts();
      showToast("Mostrando todo");
    });

    clearFilterBtn?.addEventListener("click", () => {
      activeCategory = null;
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      categoryHint.hidden = false;
      updateFilterUI();
      renderProducts();
      showToast("Filtros limpiados");
    });

    const onSearch = debounce(() => {
      searchQuery = String(searchInput?.value || "").trim();
      updateFilterUI();
      renderProducts();
    }, 160);

    searchInput?.addEventListener("input", onSearch);

    sortSelect?.addEventListener("change", () => {
      sortMode = String(sortSelect.value || "featured");
      renderProducts();
    });

    pmClose?.addEventListener("click", () => closeLayer(productModal));
    productModal?.addEventListener("click", (e) => {
      if (e.target === productModal) closeLayer(productModal);
    });

    pmAdd?.addEventListener("click", () => {
      if (!currentProduct) return;
      const size = String(pmSize.value || "").trim();
      const qty = clampInt(pmQty.value, 1, 99);
      addToCart(currentProduct, size, qty);
      closeLayer(productModal);
      openLayer(cartDrawer);
      refreshShippingUI();
    });

    openAiBtn?.addEventListener("click", () => {
      openLayer(aiModal);
      setTimeout(() => aiInput?.focus(), 30);
      if (!aiOutput?.children?.length) {
        addChatMsg("ai", "Soy SCORE AI. Dime qué producto buscas, tallas, envíos o cambios.");
      }
    });

    navOpenAi?.addEventListener("click", () => {
      closeLayer(sideMenu);
      openLayer(aiModal);
      setTimeout(() => aiInput?.focus(), 30);
      if (!aiOutput?.children?.length) {
        addChatMsg("ai", "Soy SCORE AI. Dime qué producto buscas, tallas, envíos o cambios.");
      }
    });

    aiClose?.addEventListener("click", () => closeLayer(aiModal));
    aiModal?.addEventListener("click", (e) => {
      if (e.target === aiModal) closeLayer(aiModal);
    });

    aiSendBtn?.addEventListener("click", sendAi);
    aiInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAi();
    });

    openLegalBtn?.addEventListener("click", () => openLegal("terms"));
    openPrivacyBtn?.addEventListener("click", () => openLegal("privacy"));
    legalClose?.addEventListener("click", () => closeLayer(legalModal));
    legalModal?.addEventListener("click", (e) => {
      if (e.target === legalModal) closeLayer(legalModal);
    });

    $$('input[name="shipMode"]').forEach((r) => {
      r.addEventListener("change", () => {
        refreshShippingUI();
      });
    });

    quoteBtn?.addEventListener("click", quoteShipping);

    postalCodeInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") quoteShipping();
    });

    checkoutBtn?.addEventListener("click", doCheckout);

    initConsent();
    cookieAccept?.addEventListener("click", () => setConsent(true));
    cookieReject?.addEventListener("click", () => setConsent(false));

    renderCart();

    try {
      setStatus("Cargando catálogo…");
      catalog = await fetchCatalog();
      products = catalog.products.map(normalizeProduct).filter((p) => p.sku);

      products = products.map((p) => {
        if (!CATEGORY_CONFIG.some((c) => c.uiId === p.uiSection)) p.uiSection = "BAJA1000";
        return p;
      });

      renderCategories();
      updateFilterUI();
      renderProducts();
      setStatus(`${products.length} producto(s) cargados`);
    } catch (e) {
      console.error(e);
      setStatus("Error cargando catálogo.");
      showToast("No se pudo cargar el catálogo");
    } finally {
      if (splash) {
        splash.style.opacity = "0";
        splash.style.pointerEvents = "none";
        setTimeout(() => (splash.hidden = true), 280);
      }
    }

    registerSW();
  };

  init().catch((e) => {
    console.error("[ScoreStore:init]", e);
    try {
      setStatus("Error inicializando.");
      showToast("Error inicializando");
      if (splash) splash.hidden = true;
    } catch {}
  });
})();
