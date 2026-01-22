/* SCORE STORE — main.js (UNIFICADO + FIXES) v2.6.0
   - Fix pegado roto (options, markup, assets)
   - openCatalog acepta 1 o 2 params
   - Promo bar racing (rotación de mensajes)
   - Cart UI render robusto
*/
(function () {
  "use strict";

  // --- CONFIG (from index.html) ---
  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";

  // API base: /api for netlify dev, /.netlify/functions in production
  const API_BASE =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "/api"
      : "/.netlify/functions";

  // --- STATE ---
  const CART_KEY = "score_cart_prod_v6";
  let catalogData = { site: { currency: "MXN" }, sections: [], products: [] };
  let promoRules = [];
  let promoCode = "";
  let cart = []; // [{id,size,qty}]
  const shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };

  // --- DOM HELPERS ---
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
      Number(n || 0)
    );

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const toast = (msg) => {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  };
  window.toast = toast;

  // --- UI OPEN/CLOSE ---
  function open(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("active");
    $("overlay")?.classList.add("active");
    document.body.classList.add("no-scroll");
  }

  function closeAll() {
    qsa(".active").forEach((e) => e.classList.remove("active"));
    $("overlay")?.classList.remove("active");
    document.body.classList.remove("no-scroll");
  }
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");

  // --- DATA FINDERS ---
  function findSection(sectionId) {
    return catalogData.sections.find((s) => s.id === sectionId);
  }
  function findProduct(id) {
    return catalogData.products.find((p) => p.id === id);
  }

  // --- CATALOG / MODAL ---
  window.openCatalog = (sectionId, optionalTitle) => {
    try {
      const section = findSection(sectionId);
      const title =
        String(optionalTitle || section?.title || "COLECCIÓN").trim() || "COLECCIÓN";

      if ($("catTitle")) $("catTitle").textContent = title;

      const items = catalogData.products.filter((p) => p.sectionId === sectionId);
      const root = $("catContent");
      if (!root) return;

      root.innerHTML = `
        <div class="catTop">
          <div class="catHeader">
            ${
              section?.logo
                ? `<img src="${section.logo}" class="catLogo" alt="${escapeHtml(title)}" loading="lazy">`
                : ""
            }
            <div class="catHeaderText">
              <div class="catTitle">${escapeHtml(title)}</div>
              ${section?.badge ? `<div class="catBadge">${escapeHtml(section.badge)}</div>` : ""}
            </div>
          </div>
          <div class="catCount">${items.length} productos</div>
        </div>

        <div class="grid catGrid">
          ${items.map((p) => renderProductCard(p)).join("")}
        </div>
      `;

      open("modalCatalog");
    } catch (e) {
      console.error("openCatalog error", e);
      toast("No se pudo abrir la colección");
    }
  };

  function renderProductCard(p) {
    const img = p.img || (Array.isArray(p.images) ? p.images[0] : "") || "";
    const price = Number(p.baseMXN || 0);
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const sizeOpts = sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    // data-imgs para después (galería simple)
    const imgs = Array.isArray(p.images) && p.images.length ? p.images : img ? [img] : [];
    const imgsAttr = escapeHtml(JSON.stringify(imgs));

    return `
      <article class="pCard" data-pid="${escapeHtml(p.id)}" data-imgs='${imgsAttr}'>
        <button class="pMedia" type="button" onclick="previewProduct('${escapeHtml(p.id)}')" aria-label="Ver detalles">
          <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy"/>
          <span class="pZoom">VER</span>
        </button>

        <div class="pBody">
          <div class="pName">${escapeHtml(p.name)}</div>

          <div class="pMeta">
            <span class="pSku">${escapeHtml(p.sku || "")}</span>
            <span class="pPrice">${money(price)}</span>
          </div>

          <div class="pActions">
            <select class="pSize" id="size_${escapeHtml(p.id)}" aria-label="Talla">
              ${sizeOpts || `<option value="">-</option>`}
            </select>
            <button class="btn small primary" onclick="addToCart('${escapeHtml(p.id)}')">AGREGAR</button>
          </div>
        </div>
      </article>
    `;
  }

  // Preview simple (racing vibe: “pit stop” quick view)
  window.previewProduct = (id) => {
    const p = findProduct(id);
    if (!p) return;
    const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.img ? [p.img] : []);
    const root = $("catContent");
    if (!root) return;

    // Si ya estás dentro del modal, solo abre un “panel” arriba (sin cambiar tu HTML base)
    const panelId = "quickView";
    let panel = $(panelId);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = panelId;
      panel.className = "quickView";
      root.prepend(panel);
    }

    panel.innerHTML = `
      <div class="qvInner">
        <button class="qvClose" type="button" onclick="closeQuickView()" aria-label="Cerrar">×</button>

        <div class="qvMedia">
          <img id="qvImg" src="${imgs[0] || ""}" alt="${escapeHtml(p.name)}" loading="eager"/>
          <div class="qvThumbs">
            ${imgs
              .map(
                (src, i) =>
                  `<button type="button" class="qvThumb ${i === 0 ? "active" : ""}" onclick="qvSetImg('${escapeHtml(src)}', ${i})">
                     <img src="${src}" alt="Vista ${i + 1}" loading="lazy"/>
                   </button>`
              )
              .join("")}
          </div>
        </div>

        <div class="qvInfo">
          <div class="qvTitle">${escapeHtml(p.name)}</div>
          <div class="qvRow">
            <span class="qvSku">${escapeHtml(p.sku || "")}</span>
            <strong class="qvPrice">${money(Number(p.baseMXN || 0))}</strong>
          </div>
          <div class="qvRow">
            <label class="qvLabel">Talla</label>
            <select class="inputField qvSelect" id="qvSize">
              ${(p.sizes || []).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
            </select>
          </div>

          <div class="qvActions">
            <button class="btn primary full" type="button" onclick="qvAdd('${escapeHtml(p.id)}')">AGREGAR AL PEDIDO</button>
          </div>

          <div class="qvNote">Edición oficial · Calidad Único · Hecho en Tijuana</div>
        </div>
      </div>
    `;

    panel.classList.add("active");
    // micro vibración racing (si existe)
    navigator.vibrate?.(20);
  };

  window.closeQuickView = () => {
    const panel = $("quickView");
    if (panel) panel.classList.remove("active");
  };

  window.qvSetImg = (src, idx) => {
    const img = $("qvImg");
    if (img) img.src = src;
    qsa(".qvThumb").forEach((b, i) => b.classList.toggle("active", i === idx));
  };

  window.qvAdd = (id) => {
    const p = findProduct(id);
    if (!p) return;
    const size = String($("qvSize")?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");
    addItemToCart(id, size, 1);
    closeQuickView();
    toast("Agregado");
  };

  // --- CART STORAGE ---
  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      cart = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(cart)) cart = [];
    } catch {
      cart = [];
    }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function normalizeQty(q) {
    const n = parseInt(q, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function addItemToCart(id, size, qty) {
    const q = normalizeQty(qty);
    const existing = cart.find((i) => i.id === id && i.size === size);
    if (existing) existing.qty += q;
    else cart.push({ id, size, qty: q });
    saveCart();
    updateCartUI();
  }

  window.addToCart = (id) => {
    const p = findProduct(id);
    if (!p) return toast("Producto no encontrado");

    const sizeEl = $("size_" + id);
    const size = String(sizeEl?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");

    addItemToCart(id, size, 1);

    // Pixel event
    if (typeof fbq === "function") {
      fbq("track", "AddToCart", { content_ids: [id], content_type: "product" });
    }
  };

  window.removeFromCart = (idx) => {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
  };

  window.emptyCart = () => {
    cart = [];
    saveCart();
    updateCartUI();
    toast("Carrito vacío");
  };

  window.incQty = (idx) => {
    if (!cart[idx]) return;
    cart[idx].qty += 1;
    saveCart();
    updateCartUI();
  };

  window.decQty = (idx) => {
    if (!cart[idx]) return;
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart();
    updateCartUI();
  };

  function subTotal() {
    return cart.reduce((acc, item) => {
      const p = findProduct(item.id);
      const price = Number(p?.baseMXN || 0);
      return acc + price * item.qty;
    }, 0);
  }

  function updateTotals() {
    const sub = subTotal();
    const ship = shippingState.mode === "pickup" ? 0 : Number(shippingState.cost || 0);
    const total = sub + ship;

    if ($("subTotal")) $("subTotal").textContent = money(sub);
    if ($("shipTotal"))
      $("shipTotal").textContent = shippingState.mode === "pickup" ? "Gratis" : money(ship);
    if ($("grandTotal")) $("grandTotal").textContent = money(total);

    // Extra: “speed bar” visual hook (si existe en CSS)
    const bar = qs(".cartSpeedBar");
    if (bar) {
      const pct = Math.min(100, Math.round((total / 6000) * 100)); // escala simple
      bar.style.width = pct + "%";
    }
  }

  function updateCartUI() {
    const list = $("cartItems");
    const empty = $("cartEmpty");
    const count = $("cartCount");

    const totalItems = cart.reduce((acc, i) => acc + normalizeQty(i.qty), 0);
    if (count) count.textContent = String(totalItems);

    if (!list || !empty) return;

    if (!cart.length) {
      list.innerHTML = `
        <div class="cartEmptyCard">
          <div class="cecTitle">PIT STOP VACÍO</div>
          <div class="cecText">Agrega productos y arma tu kit oficial.</div>
        </div>
      `;
      empty.style.display = "none";
    } else {
      empty.style.display = "none";
      list.innerHTML = cart
        .map((item, idx) => {
          const p = findProduct(item.id);
          const img = p?.img || p?.images?.[0] || "";
          const name = p?.name || item.id;
          const price = Number(p?.baseMXN || 0);
          const line = price * item.qty;

          return `
            <div class="cRow racingRow">
              <div class="cImgWrap">
                <img class="cImg" src="${img}" alt="${escapeHtml(name)}" loading="lazy"/>
                <span class="cTag">OFICIAL</span>
              </div>

              <div class="cInfo">
                <div class="cName">${escapeHtml(name)}</div>
                <div class="cSub">
                  Talla: <b>${escapeHtml(item.size)}</b>
                  <span class="cDot">•</span>
                  <span>${money(price)}</span>
                </div>

                <div class="cControls">
                  <div class="cQty">
                    <button class="qtyBtn" type="button" onclick="decQty(${idx})" aria-label="Menos">−</button>
                    <span class="qtyNum">${item.qty}</span>
                    <button class="qtyBtn" type="button" onclick="incQty(${idx})" aria-label="Más">+</button>
                  </div>

                  <div class="cLine">${money(line)}</div>
                </div>
              </div>

              <button class="cDel" type="button" onclick="removeFromCart(${idx})" aria-label="Eliminar">✕</button>
            </div>
          `;
        })
        .join("");
    }

    updateTotals();
  }
/* SCORE STORE — main.js (UNIFICADO + FIXES) v2.6.0
   - Fix pegado roto (options, markup, assets)
   - openCatalog acepta 1 o 2 params
   - Promo bar racing (rotación de mensajes)
   - Cart UI render robusto
*/
(function () {
  "use strict";

  // --- CONFIG (from index.html) ---
  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";

  // API base: /api for netlify dev, /.netlify/functions in production
  const API_BASE =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "/api"
      : "/.netlify/functions";

  // --- STATE ---
  const CART_KEY = "score_cart_prod_v6";
  let catalogData = { site: { currency: "MXN" }, sections: [], products: [] };
  let promoRules = [];
  let promoCode = "";
  let cart = []; // [{id,size,qty}]
  const shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };

  // --- DOM HELPERS ---
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
      Number(n || 0)
    );

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const toast = (msg) => {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  };
  window.toast = toast;

  // --- UI OPEN/CLOSE ---
  function open(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("active");
    $("overlay")?.classList.add("active");
    document.body.classList.add("no-scroll");
  }

  function closeAll() {
    qsa(".active").forEach((e) => e.classList.remove("active"));
    $("overlay")?.classList.remove("active");
    document.body.classList.remove("no-scroll");
  }
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");

  // --- DATA FINDERS ---
  function findSection(sectionId) {
    return catalogData.sections.find((s) => s.id === sectionId);
  }
  function findProduct(id) {
    return catalogData.products.find((p) => p.id === id);
  }

  // --- CATALOG / MODAL ---
  window.openCatalog = (sectionId, optionalTitle) => {
    try {
      const section = findSection(sectionId);
      const title =
        String(optionalTitle || section?.title || "COLECCIÓN").trim() || "COLECCIÓN";

      if ($("catTitle")) $("catTitle").textContent = title;

      const items = catalogData.products.filter((p) => p.sectionId === sectionId);
      const root = $("catContent");
      if (!root) return;

      root.innerHTML = `
        <div class="catTop">
          <div class="catHeader">
            ${
              section?.logo
                ? `<img src="${section.logo}" class="catLogo" alt="${escapeHtml(title)}" loading="lazy">`
                : ""
            }
            <div class="catHeaderText">
              <div class="catTitle">${escapeHtml(title)}</div>
              ${section?.badge ? `<div class="catBadge">${escapeHtml(section.badge)}</div>` : ""}
            </div>
          </div>
          <div class="catCount">${items.length} productos</div>
        </div>

        <div class="grid catGrid">
          ${items.map((p) => renderProductCard(p)).join("")}
        </div>
      `;

      open("modalCatalog");
    } catch (e) {
      console.error("openCatalog error", e);
      toast("No se pudo abrir la colección");
    }
  };

  function renderProductCard(p) {
    const img = p.img || (Array.isArray(p.images) ? p.images[0] : "") || "";
    const price = Number(p.baseMXN || 0);
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const sizeOpts = sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

    // data-imgs para después (galería simple)
    const imgs = Array.isArray(p.images) && p.images.length ? p.images : img ? [img] : [];
    const imgsAttr = escapeHtml(JSON.stringify(imgs));

    return `
      <article class="pCard" data-pid="${escapeHtml(p.id)}" data-imgs='${imgsAttr}'>
        <button class="pMedia" type="button" onclick="previewProduct('${escapeHtml(p.id)}')" aria-label="Ver detalles">
          <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy"/>
          <span class="pZoom">VER</span>
        </button>

        <div class="pBody">
          <div class="pName">${escapeHtml(p.name)}</div>

          <div class="pMeta">
            <span class="pSku">${escapeHtml(p.sku || "")}</span>
            <span class="pPrice">${money(price)}</span>
          </div>

          <div class="pActions">
            <select class="pSize" id="size_${escapeHtml(p.id)}" aria-label="Talla">
              ${sizeOpts || `<option value="">-</option>`}
            </select>
            <button class="btn small primary" onclick="addToCart('${escapeHtml(p.id)}')">AGREGAR</button>
          </div>
        </div>
      </article>
    `;
  }

  // Preview simple (racing vibe: “pit stop” quick view)
  window.previewProduct = (id) => {
    const p = findProduct(id);
    if (!p) return;
    const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.img ? [p.img] : []);
    const root = $("catContent");
    if (!root) return;

    // Si ya estás dentro del modal, solo abre un “panel” arriba (sin cambiar tu HTML base)
    const panelId = "quickView";
    let panel = $(panelId);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = panelId;
      panel.className = "quickView";
      root.prepend(panel);
    }

    panel.innerHTML = `
      <div class="qvInner">
        <button class="qvClose" type="button" onclick="closeQuickView()" aria-label="Cerrar">×</button>

        <div class="qvMedia">
          <img id="qvImg" src="${imgs[0] || ""}" alt="${escapeHtml(p.name)}" loading="eager"/>
          <div class="qvThumbs">
            ${imgs
              .map(
                (src, i) =>
                  `<button type="button" class="qvThumb ${i === 0 ? "active" : ""}" onclick="qvSetImg('${escapeHtml(src)}', ${i})">
                     <img src="${src}" alt="Vista ${i + 1}" loading="lazy"/>
                   </button>`
              )
              .join("")}
          </div>
        </div>

        <div class="qvInfo">
          <div class="qvTitle">${escapeHtml(p.name)}</div>
          <div class="qvRow">
            <span class="qvSku">${escapeHtml(p.sku || "")}</span>
            <strong class="qvPrice">${money(Number(p.baseMXN || 0))}</strong>
          </div>
          <div class="qvRow">
            <label class="qvLabel">Talla</label>
            <select class="inputField qvSelect" id="qvSize">
              ${(p.sizes || []).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
            </select>
          </div>

          <div class="qvActions">
            <button class="btn primary full" type="button" onclick="qvAdd('${escapeHtml(p.id)}')">AGREGAR AL PEDIDO</button>
          </div>

          <div class="qvNote">Edición oficial · Calidad Único · Hecho en Tijuana</div>
        </div>
      </div>
    `;

    panel.classList.add("active");
    // micro vibración racing (si existe)
    navigator.vibrate?.(20);
  };

  window.closeQuickView = () => {
    const panel = $("quickView");
    if (panel) panel.classList.remove("active");
  };

  window.qvSetImg = (src, idx) => {
    const img = $("qvImg");
    if (img) img.src = src;
    qsa(".qvThumb").forEach((b, i) => b.classList.toggle("active", i === idx));
  };

  window.qvAdd = (id) => {
    const p = findProduct(id);
    if (!p) return;
    const size = String($("qvSize")?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");
    addItemToCart(id, size, 1);
    closeQuickView();
    toast("Agregado");
  };

  // --- CART STORAGE ---
  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      cart = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(cart)) cart = [];
    } catch {
      cart = [];
    }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function normalizeQty(q) {
    const n = parseInt(q, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function addItemToCart(id, size, qty) {
    const q = normalizeQty(qty);
    const existing = cart.find((i) => i.id === id && i.size === size);
    if (existing) existing.qty += q;
    else cart.push({ id, size, qty: q });
    saveCart();
    updateCartUI();
  }

  window.addToCart = (id) => {
    const p = findProduct(id);
    if (!p) return toast("Producto no encontrado");

    const sizeEl = $("size_" + id);
    const size = String(sizeEl?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");

    addItemToCart(id, size, 1);

    // Pixel event
    if (typeof fbq === "function") {
      fbq("track", "AddToCart", { content_ids: [id], content_type: "product" });
    }
  };

  window.removeFromCart = (idx) => {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
  };

  window.emptyCart = () => {
    cart = [];
    saveCart();
    updateCartUI();
    toast("Carrito vacío");
  };

  window.incQty = (idx) => {
    if (!cart[idx]) return;
    cart[idx].qty += 1;
    saveCart();
    updateCartUI();
  };

  window.decQty = (idx) => {
    if (!cart[idx]) return;
    cart[idx].qty -= 1;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart();
    updateCartUI();
  };

  function subTotal() {
    return cart.reduce((acc, item) => {
      const p = findProduct(item.id);
      const price = Number(p?.baseMXN || 0);
      return acc + price * item.qty;
    }, 0);
  }

  function updateTotals() {
    const sub = subTotal();
    const ship = shippingState.mode === "pickup" ? 0 : Number(shippingState.cost || 0);
    const total = sub + ship;

    if ($("subTotal")) $("subTotal").textContent = money(sub);
    if ($("shipTotal"))
      $("shipTotal").textContent = shippingState.mode === "pickup" ? "Gratis" : money(ship);
    if ($("grandTotal")) $("grandTotal").textContent = money(total);

    // Extra: “speed bar” visual hook (si existe en CSS)
    const bar = qs(".cartSpeedBar");
    if (bar) {
      const pct = Math.min(100, Math.round((total / 6000) * 100)); // escala simple
      bar.style.width = pct + "%";
    }
  }

  function updateCartUI() {
    const list = $("cartItems");
    const empty = $("cartEmpty");
    const count = $("cartCount");

    const totalItems = cart.reduce((acc, i) => acc + normalizeQty(i.qty), 0);
    if (count) count.textContent = String(totalItems);

    if (!list || !empty) return;

    if (!cart.length) {
      list.innerHTML = `
        <div class="cartEmptyCard">
          <div class="cecTitle">PIT STOP VACÍO</div>
          <div class="cecText">Agrega productos y arma tu kit oficial.</div>
        </div>
      `;
      empty.style.display = "none";
    } else {
      empty.style.display = "none";
      list.innerHTML = cart
        .map((item, idx) => {
          const p = findProduct(item.id);
          const img = p?.img || p?.images?.[0] || "";
          const name = p?.name || item.id;
          const price = Number(p?.baseMXN || 0);
          const line = price * item.qty;

          return `
            <div class="cRow racingRow">
              <div class="cImgWrap">
                <img class="cImg" src="${img}" alt="${escapeHtml(name)}" loading="lazy"/>
                <span class="cTag">OFICIAL</span>
              </div>

              <div class="cInfo">
                <div class="cName">${escapeHtml(name)}</div>
                <div class="cSub">
                  Talla: <b>${escapeHtml(item.size)}</b>
                  <span class="cDot">•</span>
                  <span>${money(price)}</span>
                </div>

                <div class="cControls">
                  <div class="cQty">
                    <button class="qtyBtn" type="button" onclick="decQty(${idx})" aria-label="Menos">−</button>
                    <span class="qtyNum">${item.qty}</span>
                    <button class="qtyBtn" type="button" onclick="incQty(${idx})" aria-label="Más">+</button>
                  </div>

                  <div class="cLine">${money(line)}</div>
                </div>
              </div>

              <button class="cDel" type="button" onclick="removeFromCart(${idx})" aria-label="Eliminar">✕</button>
            </div>
          `;
        })
        .join("");
    }

    updateTotals();
  }