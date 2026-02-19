/* =========================================================
   SCORE STORE — main.js (launch 2026.02.18)
   - UI + Cart + Promo + Shipping quote (Envia) + Stripe Checkout
   - AI chat (Gemini via Netlify Function)
   - Cookie consent + Meta Pixel (loads ONLY on accept)
   ========================================================= */

(() => {
  "use strict";

  // ---- Config ----
  const STORAGE = {
    CART: "score_cart_v1",
    PROMO: "score_promo_v1",
    SHIP: "score_ship_v1",
    COOKIE: "score_cookie_v1"
  };

  const META_PIXEL_ID = "4249947775334413"; // from repo 03
  const LOCAL_TJ_FLAT_MXN = 200; // front hint (backend uses LOCAL_TJ_FLAT_MXN env var)

  // ---- Helpers ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const fmtMXN = (n) => {
    const val = Number(n || 0) || 0;
    try {
      return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
    } catch {
      return "$" + val.toFixed(2);
    }
  };

  const safeJson = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  const lsGet = (k, fallback) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : safeJson(v, fallback);
    } catch {
      return fallback;
    }
  };

  const lsSet = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };

  const encodePath = (p) => {
    // Encode spaces and special chars safely, but keep slashes.
    // Example: "/assets/BAJA400/camiseta-cafe- oscuro.webp" -> encoded
    try {
      return p.split("/").map(seg => encodeURIComponent(seg)).join("/").replaceAll("%2F", "/");
    } catch {
      return p;
    }
  };

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) ? (data.error || data.message) : (text || "Error");
      throw new Error(msg);
    }
    return data;
  }

  // ---- State ----
  let catalog = null;
  let promosDb = null;
  let currentSectionId = null;

  let cart = lsGet(STORAGE.CART, []);
  let promo = lsGet(STORAGE.PROMO, null);
  let ship = lsGet(STORAGE.SHIP, { mode: "pickup", postal_code: "", quote: null });

  // ---- Elements ----
  const splash = $("#splash");
  const categoryView = $("#category-view");
  const productView = $("#product-view");
  const productsGrid = $("#productsGrid");
  const currentTitle = $("#current-category-title");

  const openCartBtn = $("#openCartBtn");
  const cartDrawer = $("#cartDrawer");
  const closeCartBtn = $("#closeCartBtn");
  const pageOverlay = $("#pageOverlay");
  const cartItemsEl = $("#cartItems");
  const cartCountEls = $$(".cartCount");
  const cartSubtotalEl = $("#cartSubtotal");
  const cartDiscountRow = $("#cartDiscountRow");
  const cartDiscountEl = $("#cartDiscount");
  const cartShippingEl = $("#cartShipping");
  const cartTotalEl = $("#cartTotal");
  const cartErrorEl = $("#cartError");
  const checkoutBtn = $("#checkoutBtn");

  const promoInput = $("#promoCodeInput");
  const promoBtn = $("#applyPromoBtn");
  const promoMsg = $("#promoMessage");

  const shipModeEl = $("#shipMode");
  const shipPostalWrap = $("#shipPostalWrap");
  const shipPostalEl = $("#shipPostal");
  const quoteBtn = $("#quoteShippingBtn");
  const shipQuotePrice = $("#shipQuotePrice");
  const shipQuoteMeta = $("#shipQuoteMeta");

  const scrollToCatalogBtn = $("#scrollToCatalogBtn");
  const backToCategoriesBtn = $("#backToCategoriesBtn");

  const aiFab = $("#aiFab");
  const modalOverlay = $("#modalOverlay");
  const aiModal = $("#aiModal");
  const aiCloseBtn = $("#aiCloseBtn");
  const aiOutput = $("#aiOutput");
  const aiInput = $("#aiInput");
  const aiSendBtn = $("#aiSendBtn");

  const cookieBar = $("#cookieBar");
  const cookieAcceptBtn = $("#cookieAcceptBtn");
  const cookieRejectBtn = $("#cookieRejectBtn");

  // ---- Catalog / Rendering ----
  const SECTION_LOGO = {
    BAJA1000: "/assets/logo-baja1000.webp",
    BAJA500: "/assets/logo-baja500.webp",
    BAJA400: "/assets/logo-baja400.webp",
    SF250: "/assets/logo-sf250.webp",
  };

  function normalizeProduct(p) {
    const sku = String(p.sku || p.id || "").trim();
    const id = String(p.id || sku).trim();
    const sectionId = String(p.sectionId || "").trim();
    const name = String(p.name || "Producto").trim();
    const baseMXN = Number(p.baseMXN || 0) || 0;

    const sizes = Array.isArray(p.sizes) ? p.sizes.map(s => String(s).trim()).filter(Boolean) : null;
    const img = String(p.img || "").trim();
    const images = Array.isArray(p.images) ? p.images.map(s => String(s).trim()).filter(Boolean) : [];

    return { ...p, id, sku, sectionId, name, baseMXN, sizes, img, images };
  }

  function renderCategories() {
    if (!catalog || !Array.isArray(catalog.sections)) return;
    categoryView.innerHTML = "";

    catalog.sections.forEach(sec => {
      const id = String(sec.id || "").trim();
      const title = String(sec.name || id || "Edición").trim();
      const subtitle = String(sec.subtitle || sec.description || "").trim();

      const card = document.createElement("div");
      card.className = "category-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.dataset.sectionId = id;

      const top = document.createElement("div");
      top.className = "cat-top";

      const logo = document.createElement("img");
      logo.className = "cat-logo";
      logo.alt = title;
      logo.loading = "lazy";
      logo.src = encodePath(SECTION_LOGO[id] || "/assets/logo-score.webp");

      const badge = document.createElement("div");
      badge.style.color = "rgba(255,255,255,.65)";
      badge.style.fontWeight = "900";
      badge.style.letterSpacing = ".12em";
      badge.style.fontSize = "12px";
      badge.textContent = "OFFICIAL";

      top.appendChild(logo);
      top.appendChild(badge);

      const h = document.createElement("div");
      h.className = "cat-title";
      h.textContent = title;

      const sub = document.createElement("div");
      sub.className = "cat-sub";
      sub.textContent = subtitle || "Colección oficial";

      card.appendChild(top);
      card.appendChild(h);
      card.appendChild(sub);

      card.addEventListener("click", () => openCategory(id));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openCategory(id);
      });

      categoryView.appendChild(card);
    });
  }

  function openCategory(sectionId) {
    currentSectionId = sectionId;

    categoryView.classList.add("hidden");
    productView.classList.remove("hidden");

    const sec = (catalog.sections || []).find(s => String(s.id) === String(sectionId));
    currentTitle.textContent = sec ? (sec.name || sectionId) : sectionId;

    const products = (catalog.products || []).map(normalizeProduct).filter(p => p.sectionId === sectionId);
    renderProducts(products);

    // scroll to products
    productView.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function backToCategories() {
    currentSectionId = null;
    productView.classList.add("hidden");
    categoryView.classList.remove("hidden");
    productsGrid.innerHTML = "";
    categoryView.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderProducts(products) {
    productsGrid.innerHTML = "";

    if (!products.length) {
      const msg = document.createElement("div");
      msg.className = "cartEmpty";
      msg.textContent = "No hay productos en esta edición todavía.";
      productsGrid.appendChild(msg);
      return;
    }

    products.forEach(p => {
      const card = document.createElement("article");
      card.className = "product-card";

      const media = document.createElement("div");
      media.className = "product-media";

      const img = document.createElement("img");
      img.alt = p.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.src = encodePath(p.img || "/assets/logo-score.webp");
      media.appendChild(img);

      const body = document.createElement("div");
      body.className = "product-body";

      const name = document.createElement("h4");
      name.className = "product-name";
      name.textContent = p.name;

      const meta = document.createElement("div");
      meta.className = "product-meta";

      const price = document.createElement("div");
      price.className = "price";
      price.textContent = fmtMXN(p.baseMXN);

      meta.appendChild(price);

      body.appendChild(name);
      body.appendChild(meta);

      let sizeSel = null;
      if (p.sizes && p.sizes.length) {
        sizeSel = document.createElement("select");
        sizeSel.className = "sizeSelect";
        const opt0 = document.createElement("option");
        opt0.value = "";
        opt0.textContent = "Selecciona talla…";
        sizeSel.appendChild(opt0);
        p.sizes.forEach(s => {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          sizeSel.appendChild(opt);
        });
        body.appendChild(sizeSel);
      }

      const btn = document.createElement("button");
      btn.className = "addBtn";
      btn.type = "button";
      btn.textContent = "AGREGAR AL CARRITO";
      btn.addEventListener("click", () => {
        const size = sizeSel ? String(sizeSel.value || "") : "";
        if (sizeSel && !size) {
          toastPromo("Selecciona una talla primero.");
          sizeSel.focus();
          return;
        }
        addToCart(p, size || "M");
      });

      body.appendChild(btn);

      card.appendChild(media);
      card.appendChild(body);
      productsGrid.appendChild(card);
    });
  }

  // ---- Cart ----
  function cartKeyOf(item) {
    return `${item.sku}__${item.size || "M"}`;
  }

  function addToCart(p, size) {
    const sku = String(p.sku || p.id || "").trim();
    if (!sku) return;

    const key = `${sku}__${size}`;
    const idx = cart.findIndex(it => cartKeyOf(it) === key);
    if (idx >= 0) {
      cart[idx].qty = clamp((Number(cart[idx].qty) || 1) + 1, 1, 99);
    } else {
      cart.push({
        sku,
        id: String(p.id || sku),
        name: String(p.name || "Producto"),
        price_mxn: Number(p.baseMXN || 0) || 0,
        img: String(p.img || ""),
        size: String(size || "M"),
        qty: 1
      });
    }
    persistCart();
    openCart();
  }

  function persistCart() {
    lsSet(STORAGE.CART, cart);
    updateCartCount();
    renderCart();
  }

  function updateCartCount() {
    const count = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    cartCountEls.forEach(el => { el.textContent = String(count); });
  }

  function renderCart() {
    cartItemsEl.innerHTML = "";
    cartErrorEl.textContent = "";

    if (!cart.length) {
      const empty = document.createElement("div");
      empty.className = "cartEmpty";
      empty.textContent = "Tu carrito está vacío. Elige una edición y agrega productos.";
      cartItemsEl.appendChild(empty);
      updateTotals();
      return;
    }

    cart.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.dataset.idx = String(idx);

      const thumb = document.createElement("div");
      thumb.className = "cartThumb";
      const img = document.createElement("img");
      img.alt = it.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.src = encodePath(it.img || "/assets/logo-score.webp");
      thumb.appendChild(img);

      const info = document.createElement("div");
      info.className = "cartInfo";

      const title = document.createElement("div");
      title.className = "cartTitle";
      title.textContent = it.name;

      const sub = document.createElement("div");
      sub.className = "cartSub";
      sub.textContent = `Talla: ${it.size || "M"} • ${fmtMXN(it.price_mxn)}`;

      const bottom = document.createElement("div");
      bottom.className = "cartRow";

      const qty = document.createElement("div");
      qty.className = "qtyCtl";
      const minus = document.createElement("button");
      minus.className = "qtyBtn";
      minus.type = "button";
      minus.textContent = "−";
      minus.addEventListener("click", () => changeQty(idx, -1));

      const num = document.createElement("div");
      num.className = "qtyNum";
      num.textContent = String(it.qty);

      const plus = document.createElement("button");
      plus.className = "qtyBtn";
      plus.type = "button";
      plus.textContent = "+";
      plus.addEventListener("click", () => changeQty(idx, +1));

      qty.appendChild(minus);
      qty.appendChild(num);
      qty.appendChild(plus);

      const remove = document.createElement("button");
      remove.className = "removeBtn";
      remove.type = "button";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", () => removeItem(idx));

      bottom.appendChild(qty);
      bottom.appendChild(remove);

      info.appendChild(title);
      info.appendChild(sub);
      info.appendChild(bottom);

      row.appendChild(thumb);
      row.appendChild(info);
      cartItemsEl.appendChild(row);
    });

    updateTotals();
  }

  function changeQty(idx, delta) {
    if (!cart[idx]) return;
    cart[idx].qty = clamp((Number(cart[idx].qty) || 1) + delta, 1, 99);
    persistCart();
  }

  function removeItem(idx) {
    cart.splice(idx, 1);
    persistCart();
  }

  // ---- Promo ----
  function toastPromo(msg) {
    promoMsg.textContent = msg || "";
  }

  async function ensurePromos() {
    if (promosDb) return promosDb;
    promosDb = await fetchJson("/data/promos.json");
    return promosDb;
  }

  async function applyPromo(codeRaw) {
    const code = String(codeRaw || "").trim().toUpperCase();
    if (!code) {
      promo = null;
      lsSet(STORAGE.PROMO, null);
      toastPromo("Cupón removido.");
      updateTotals();
      return;
    }

    const db = await ensurePromos();
    const rules = Array.isArray(db?.rules) ? db.rules : (Array.isArray(db?.promos) ? db.promos : []);
    const rule = rules.find(r => String(r?.code || "").trim().toUpperCase() === code && (r?.active === true || r?.active === 1));
    if (!rule) throw new Error("Código inválido.");

    promo = {
      code: String(rule.code || code).trim().toUpperCase(),
      type: String(rule.type || "").trim(),
      value: Number(rule.value || 0) || 0,
      description: String(rule.description || "").trim()
    };
    lsSet(STORAGE.PROMO, promo);

    toastPromo(promo.description ? `✅ ${promo.description}` : "✅ Cupón aplicado.");
    updateTotals();
  }

  // ---- Shipping ----
  function setShipMode(mode) {
    ship.mode = String(mode || "pickup");
    ship.quote = null; // reset quote when mode changes
    lsSet(STORAGE.SHIP, ship);
    syncShippingUI();
    updateTotals();
  }

  function syncShippingUI() {
    if (!shipModeEl) return;
    shipModeEl.value = ship.mode || "pickup";
    shipPostalEl.value = ship.postal_code || "";

    const needsPostal = (ship.mode === "envia_mx" || ship.mode === "envia_us");
    shipPostalWrap.style.display = needsPostal ? "flex" : "none";
    quoteBtn.disabled = !needsPostal || cart.length === 0;

    // quote display
    if (ship.mode === "pickup") {
      shipQuotePrice.textContent = fmtMXN(0);
      shipQuoteMeta.textContent = "Pickup";
    } else if (ship.mode === "local_tj") {
      shipQuotePrice.textContent = fmtMXN(LOCAL_TJ_FLAT_MXN);
      shipQuoteMeta.textContent = "Local TJ";
    } else if (needsPostal) {
      if (ship.quote && ship.quote.ok) {
        shipQuotePrice.textContent = fmtMXN(ship.quote.amount_mxn || 0);
        shipQuoteMeta.textContent = ship.quote.label ? `(${ship.quote.label})` : "";
      } else {
        shipQuotePrice.textContent = "—";
        shipQuoteMeta.textContent = "Cotiza para ver precio";
      }
    }
  }

  async function quoteShipping() {
    const needs = (ship.mode === "envia_mx" || ship.mode === "envia_us");
    if (!needs) return;

    const zip = String(shipPostalEl.value || "").trim();
    if (!zip) throw new Error("Escribe tu código postal.");

    // items qty
    const items_qty = cart.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    if (items_qty <= 0) throw new Error("Carrito vacío.");

    const country = ship.mode === "envia_us" ? "US" : "MX";

    quoteBtn.disabled = true;
    quoteBtn.textContent = "COTIZANDO…";

    try {
      const data = await fetchJson("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, country, items_qty })
      });

      if (!data?.ok) throw new Error(data?.error || "No se pudo cotizar.");

      ship.postal_code = zip;
      ship.quote = { ok: true, amount_mxn: Number(data.amount_mxn || 0) || 0, label: String(data.label || "") };
      lsSet(STORAGE.SHIP, ship);

      shipQuotePrice.textContent = fmtMXN(ship.quote.amount_mxn);
      shipQuoteMeta.textContent = ship.quote.label ? `(${ship.quote.label})` : "";
      cartErrorEl.textContent = "";
      updateTotals();
    } finally {
      quoteBtn.disabled = false;
      quoteBtn.textContent = "COTIZAR ENVÍO";
      syncShippingUI();
    }
  }

  // ---- Totals ----
  function computeTotals() {
    const subtotal = cart.reduce((s, it) => s + (Number(it.price_mxn) || 0) * (Number(it.qty) || 0), 0);

    // discount on subtotal
    let discount = 0;
    let freeShipping = false;

    if (promo && promo.code) {
      if (promo.type === "percent") {
        const pct = promo.value <= 1 ? promo.value : (promo.value / 100);
        discount = subtotal * clamp(pct, 0, 1);
      } else if (promo.type === "fixed_mxn") {
        discount = clamp(promo.value, 0, subtotal);
      } else if (promo.type === "free_shipping") {
        freeShipping = true;
      }
    }

    // shipping
    let shipping = 0;
    if (ship.mode === "pickup") shipping = 0;
    else if (ship.mode === "local_tj") shipping = LOCAL_TJ_FLAT_MXN;
    else if (ship.mode === "envia_mx" || ship.mode === "envia_us") {
      shipping = (ship.quote && ship.quote.ok) ? (Number(ship.quote.amount_mxn) || 0) : 0;
    }

    if (freeShipping) shipping = 0;

    const total = Math.max(0, subtotal - discount + shipping);
    return { subtotal, discount, shipping, total, freeShipping };
  }

  function updateTotals() {
    const t = computeTotals();

    cartSubtotalEl.textContent = fmtMXN(t.subtotal);

    if (t.discount > 0.001) {
      cartDiscountRow.classList.remove("hidden");
      cartDiscountEl.textContent = "-" + fmtMXN(t.discount);
    } else {
      cartDiscountRow.classList.add("hidden");
      cartDiscountEl.textContent = "-" + fmtMXN(0);
    }

    cartShippingEl.textContent = fmtMXN(t.shipping);
    cartTotalEl.textContent = fmtMXN(t.total);

    // Checkout enable rules
    const needsQuote = (ship.mode === "envia_mx" || ship.mode === "envia_us");
    const quoteOk = !needsQuote || (ship.quote && ship.quote.ok && (Number(ship.quote.amount_mxn) || 0) >= 0);
    const hasPostal = !needsQuote || String(shipPostalEl.value || "").trim().length > 0;

    checkoutBtn.disabled = (cart.length === 0) || (needsQuote && (!hasPostal || !quoteOk));
  }

  // ---- Drawer / Modal toggles ----
  function openCart() {
    if (!cartDrawer) return;
    cartDrawer.classList.add("open");
    pageOverlay.classList.add("show");
    document.body.classList.add("no-scroll");
    cartDrawer.setAttribute("aria-hidden", "false");
    pageOverlay.setAttribute("aria-hidden", "false");
  }

  function closeCart() {
    cartDrawer.classList.remove("open");
    pageOverlay.classList.remove("show");
    document.body.classList.remove("no-scroll");
    cartDrawer.setAttribute("aria-hidden", "true");
    pageOverlay.setAttribute("aria-hidden", "true");
  }

  function openModal(modalEl) {
    modalOverlay.classList.add("show");
    modalEl.classList.add("show");
    modalOverlay.setAttribute("aria-hidden", "false");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }

  function closeModal(modalEl) {
    modalOverlay.classList.remove("show");
    modalEl.classList.remove("show");
    modalOverlay.setAttribute("aria-hidden", "true");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  // ---- Checkout ----
  async function checkout() {
    cartErrorEl.textContent = "";

    if (!cart.length) {
      cartErrorEl.textContent = "Tu carrito está vacío.";
      return;
    }

    const shipping_mode = String(ship.mode || "pickup");
    const postal_code = String(shipPostalEl.value || "").trim();
    const needsPostal = (shipping_mode === "envia_mx" || shipping_mode === "envia_us");

    if (needsPostal && !postal_code) {
      cartErrorEl.textContent = "Escribe tu código postal para cotizar.";
      shipPostalEl.focus();
      return;
    }

    // If needs quote, ensure quote exists and matches postal
    if (needsPostal) {
      if (!ship.quote || !ship.quote.ok) {
        cartErrorEl.textContent = "Cotiza el envío antes de pagar.";
        return;
      }
      // keep ship state consistent
      ship.postal_code = postal_code;
      lsSet(STORAGE.SHIP, ship);
    }

    const payload = {
      items: cart.map(it => ({ sku: it.sku, qty: Number(it.qty) || 1, size: it.size || "M" })),
      shipping_mode,
      postal_code: needsPostal ? postal_code : "",
      promo_code: promo && promo.code ? promo.code : ""
    };

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "CREANDO CHECKOUT…";

    try {
      const data = await fetchJson("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (data && data.url) {
        location.href = data.url;
        return;
      }
      throw new Error("No se recibió URL de checkout.");
    } catch (e) {
      cartErrorEl.textContent = String(e?.message || e || "Error en checkout");
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = "FINALIZAR COMPRA";
      updateTotals();
    }
  }

  // ---- AI chat ----
  function appendMsg(text, who) {
    const div = document.createElement("div");
    div.className = "msg" + (who === "me" ? " me" : "");
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = who === "me" ? "Tú" : "SCORE AI";
    const body = document.createElement("div");
    body.textContent = text;
    div.appendChild(meta);
    div.appendChild(body);
    aiOutput.appendChild(div);
    aiOutput.scrollTop = aiOutput.scrollHeight;
  }

  async function sendAi() {
    const q = String(aiInput.value || "").trim();
    if (!q) return;
    aiInput.value = "";
    appendMsg(q, "me");

    aiSendBtn.disabled = true;
    aiSendBtn.textContent = "…";

    try {
      const data = await fetchJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q })
      });

      const answer = String(data?.answer || data?.text || "").trim() || "No tuve respuesta. Intenta de nuevo.";
      appendMsg(answer, "ai");
    } catch (e) {
      appendMsg("Error de AI: " + String(e?.message || e), "ai");
    } finally {
      aiSendBtn.disabled = false;
      aiSendBtn.textContent = "ENVIAR";
    }
  }

  // ---- Cookies / Pixel ----
  function getCookieConsent() {
    const c = lsGet(STORAGE.COOKIE, null);
    return c && (c.choice === "accept" || c.choice === "reject") ? c.choice : null;
  }

  function setCookieConsent(choice) {
    lsSet(STORAGE.COOKIE, { choice, ts: Date.now() });
  }

  function showCookieBar() {
    cookieBar.classList.add("show");
    cookieBar.setAttribute("aria-hidden", "false");
  }

  function hideCookieBar() {
    cookieBar.classList.remove("show");
    cookieBar.setAttribute("aria-hidden", "true");
  }

  function loadMetaPixel() {
    if (!META_PIXEL_ID) return;
    if (window.fbq) return;

    // Standard Meta Pixel loader
    !(function(f,b,e,v,n,t,s){
      if(f.fbq)return; n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n; n.push=n; n.loaded=!0; n.version='2.0';
      n.queue=[]; t=b.createElement(e); t.async=!0;
      t.src=v; s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    })(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');

    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }

  // ---- Init ----
  async function init() {
    // Splash hide
    window.addEventListener("load", () => {
      setTimeout(() => splash?.classList.add("hidden"), 550);
    });

    // PWA SW
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Load catalog
    try {
      catalog = await fetchJson("/data/catalog.json");
      renderCategories();
    } catch (e) {
      categoryView.innerHTML = `<div class="cartEmpty">No se pudo cargar el catálogo. ${String(e?.message || e)}</div>`;
    }

    // Cart
    updateCartCount();
    renderCart();

    // Restore promo UI
    if (promo && promo.code) {
      promoInput.value = promo.code;
      toastPromo(promo.description ? `✅ ${promo.description}` : "✅ Cupón activo.");
    }

    // Restore shipping UI
    if (shipModeEl) shipModeEl.value = ship.mode || "pickup";
    if (shipPostalEl) shipPostalEl.value = ship.postal_code || "";
    syncShippingUI();
    updateTotals();

    // Events
    openCartBtn?.addEventListener("click", openCart);
    closeCartBtn?.addEventListener("click", closeCart);
    pageOverlay?.addEventListener("click", closeCart);

    backToCategoriesBtn?.addEventListener("click", backToCategories);

    scrollToCatalogBtn?.addEventListener("click", () => {
      $("#catalog-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    promoBtn?.addEventListener("click", async () => {
      try {
        await applyPromo(promoInput.value);
      } catch (e) {
        toastPromo("❌ " + String(e?.message || e));
      }
    });

    promoInput?.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        promoBtn?.click();
      }
    });

    shipModeEl?.addEventListener("change", () => setShipMode(shipModeEl.value));
    shipPostalEl?.addEventListener("input", () => {
      ship.postal_code = String(shipPostalEl.value || "").trim();
      lsSet(STORAGE.SHIP, ship);
      updateTotals();
    });

    quoteBtn?.addEventListener("click", async () => {
      try {
        await quoteShipping();
      } catch (e) {
        cartErrorEl.textContent = "Envío: " + String(e?.message || e);
      }
    });

    checkoutBtn?.addEventListener("click", checkout);

    // AI
    aiFab?.addEventListener("click", () => {
      openModal(aiModal);
      if (!aiOutput.childElementCount) {
        appendMsg("Hola 👋 Soy SCORE AI. Dime qué edición quieres y te ayudo con tallas/envío.", "ai");
      }
      setTimeout(() => aiInput?.focus(), 50);
    });
    aiCloseBtn?.addEventListener("click", () => closeModal(aiModal));
    modalOverlay?.addEventListener("click", () => closeModal(aiModal));
    aiSendBtn?.addEventListener("click", sendAi);
    aiInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAi();
    });

    // Cookie consent
    const consent = getCookieConsent();
    if (!consent) {
      showCookieBar();
    } else if (consent === "accept") {
      loadMetaPixel();
    }

    cookieAcceptBtn?.addEventListener("click", () => {
      setCookieConsent("accept");
      hideCookieBar();
      loadMetaPixel();
    });
    cookieRejectBtn?.addEventListener("click", () => {
      setCookieConsent("reject");
      hideCookieBar();
    });
  }

  init();
})();