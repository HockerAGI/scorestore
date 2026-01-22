/* SCORE STORE LOGIC — UNIFICADO (ÚNICO OS + Stripe + Envia) v2.2.2
   FIX: evita intro infinito aunque catálogo falle
   IMPORTANT: No cambia el diseño (markup compatible con CSS anterior)
*/
(function () {
  "use strict";

  // --- CONFIG (from index.html) ---
  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const META_PIXEL_ID = CFG.metaPixelId || null;

  // API base: /api for netlify dev, /.netlify/functions in production
  const API_BASE =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "/api"
      : "/.netlify/functions";

  // --- STATE ---
  const CART_KEY = "score_cart_prod_v5";
  let catalogData = { site: { currency: "MXN" }, sections: [], products: [] };
  let promoRules = [];
  let promoCode = ""; // optional
  let cart = []; // [{id,size,qty}]
  const shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };

  // --- DOM HELPERS ---
  const $ = (id) => document.getElementById(id);

  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
      Number(n || 0)
    );

  const escapeHtml = (str) =>
    String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const toast = (msg) => {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  };
  window.toast = toast;

  // --- UI OPEN/CLOSE (NO rompe tu layout) ---
  const open = (id) => {
    $(id)?.classList.add("active");
    $("overlay")?.classList.add("active");
    document.documentElement.classList.add("no-scroll");
  };

  const closeAll = () => {
    // Cierra SOLO lo que sabemos
    ["modalCatalog", "drawer", "overlay"].forEach((id) => $(id)?.classList.remove("active"));
    document.documentElement.classList.remove("no-scroll");
  };
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");

  // ACEPTA 2 params por compatibilidad con tu HTML actual
  window.openCatalog = (sectionId /*, titleHint */) => {
    const section = catalogData.sections.find((s) => s.id === sectionId);
    const title = section?.title || "COLECCIÓN";
    if ($("catTitle")) $("catTitle").textContent = title;

    const items = catalogData.products.filter((p) => p.sectionId === sectionId);
    const root = $("catContent");
    if (!root) return;

    // Markup neutral / compatible con CSS viejo:
    root.innerHTML = `
      <div class="catHeaderBlock">
        ${
          section?.logo
            ? `<img src="${section.logo}" class="catLogo" alt="${escapeHtml(title)}" />`
            : ""
        }
        <div class="catHeaderText">
          <div class="catTitleText">${escapeHtml(title)}</div>
          ${section?.badge ? `<div class="catBadge">${escapeHtml(section.badge)}</div>` : ""}
          <div class="catSubText">${items.length} productos</div>
        </div>
      </div>

      <div class="catItems">
        ${items.map((p) => renderProductCard(p)).join("")}
      </div>
    `;

    open("modalCatalog");
  };

  // --- CATALOG RENDER (no mete clases nuevas raras) ---
  function renderProductCard(p) {
    const img = p.img || (p.images && p.images[0]) || "";
    const price = Number(p.baseMXN || 0);

    const sizeOpts = (p.sizes || [])
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");

    return `
      <div class="productCard">
        <div class="productMedia">
          ${
            img
              ? `<img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" />`
              : `<div class="productNoImg"></div>`
          }
        </div>

        <div class="productInfo">
          <div class="productName">${escapeHtml(p.name)}</div>
          ${p.sku ? `<div class="productSku">${escapeHtml(p.sku)}</div>` : ""}
          <div class="productPrice">${money(price)}</div>

          <div class="productActions">
            <select class="inputField" id="size_${escapeHtml(p.id)}" aria-label="Talla">
              ${sizeOpts}
            </select>

            <button class="btn primary" onclick="addToCart('${escapeHtml(p.id)}')">
              AGREGAR
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- CART ---
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

  function findProduct(id) {
    return catalogData.products.find((p) => p.id === id);
  }

  window.addToCart = (id) => {
    const p = findProduct(id);
    if (!p) return toast("Producto no encontrado");

    const sizeEl = $("size_" + id);
    const size = String(sizeEl?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");

    const existing = cart.find((i) => i.id === id && i.size === size);
    if (existing) existing.qty += 1;
    else cart.push({ id, size, qty: 1 });

    saveCart();
    updateCartUI();
    toast("Agregado ✅");

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
  }

  function updateCartUI() {
    const list = $("cartItems");
    const empty = $("cartEmpty");
    const count = $("cartCount");

    const qtyTotal = cart.reduce((acc, i) => acc + i.qty, 0);
    if (count) count.textContent = String(qtyTotal);

    if (!list || !empty) return;

    if (!cart.length) {
      list.innerHTML = "";
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      list.innerHTML = cart
        .map((item, idx) => {
          const p = findProduct(item.id);
          const img = p?.img || p?.images?.[0] || "";
          const name = p?.name || item.id;
          const price = Number(p?.baseMXN || 0);

          // Markup neutral, sin clases nuevas agresivas
          return `
            <div class="cartItem">
              <div class="cartItemLeft">
                ${img ? `<img class="cartImg" src="${img}" alt="${escapeHtml(name)}">` : ""}
              </div>

              <div class="cartItemMid">
                <div class="cartTitle">${escapeHtml(name)}</div>
                <div class="cartMeta">Talla: <b>${escapeHtml(item.size)}</b> · ${money(price)}</div>

                <div class="cartQtyRow">
                  <button class="btnGhost" onclick="decQty(${idx})">−</button>
                  <div class="cartQtyNum">${item.qty}</div>
                  <button class="btnGhost" onclick="incQty(${idx})">+</button>
                </div>
              </div>

              <div class="cartItemRight">
                <button class="btnGhost" onclick="removeFromCart(${idx})">✕</button>
              </div>
            </div>
          `;
        })
        .join("");
    }

    updateTotals();
  }
/* SCORE STORE LOGIC — UNIFICADO (ÚNICO OS + Stripe + Envia) v2.2.2
   FIX: evita intro infinito aunque catálogo falle
   IMPORTANT: No cambia el diseño (markup compatible con CSS anterior)
*/
(function () {
  "use strict";

  // --- CONFIG (from index.html) ---
  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const META_PIXEL_ID = CFG.metaPixelId || null;

  // API base: /api for netlify dev, /.netlify/functions in production
  const API_BASE =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "/api"
      : "/.netlify/functions";

  // --- STATE ---
  const CART_KEY = "score_cart_prod_v5";
  let catalogData = { site: { currency: "MXN" }, sections: [], products: [] };
  let promoRules = [];
  let promoCode = ""; // optional
  let cart = []; // [{id,size,qty}]
  const shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };

  // --- DOM HELPERS ---
  const $ = (id) => document.getElementById(id);

  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
      Number(n || 0)
    );

  const escapeHtml = (str) =>
    String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const toast = (msg) => {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  };
  window.toast = toast;

  // --- UI OPEN/CLOSE (NO rompe tu layout) ---
  const open = (id) => {
    $(id)?.classList.add("active");
    $("overlay")?.classList.add("active");
    document.documentElement.classList.add("no-scroll");
  };

  const closeAll = () => {
    // Cierra SOLO lo que sabemos
    ["modalCatalog", "drawer", "overlay"].forEach((id) => $(id)?.classList.remove("active"));
    document.documentElement.classList.remove("no-scroll");
  };
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");

  // ACEPTA 2 params por compatibilidad con tu HTML actual
  window.openCatalog = (sectionId /*, titleHint */) => {
    const section = catalogData.sections.find((s) => s.id === sectionId);
    const title = section?.title || "COLECCIÓN";
    if ($("catTitle")) $("catTitle").textContent = title;

    const items = catalogData.products.filter((p) => p.sectionId === sectionId);
    const root = $("catContent");
    if (!root) return;

    // Markup neutral / compatible con CSS viejo:
    root.innerHTML = `
      <div class="catHeaderBlock">
        ${
          section?.logo
            ? `<img src="${section.logo}" class="catLogo" alt="${escapeHtml(title)}" />`
            : ""
        }
        <div class="catHeaderText">
          <div class="catTitleText">${escapeHtml(title)}</div>
          ${section?.badge ? `<div class="catBadge">${escapeHtml(section.badge)}</div>` : ""}
          <div class="catSubText">${items.length} productos</div>
        </div>
      </div>

      <div class="catItems">
        ${items.map((p) => renderProductCard(p)).join("")}
      </div>
    `;

    open("modalCatalog");
  };

  // --- CATALOG RENDER (no mete clases nuevas raras) ---
  function renderProductCard(p) {
    const img = p.img || (p.images && p.images[0]) || "";
    const price = Number(p.baseMXN || 0);

    const sizeOpts = (p.sizes || [])
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");

    return `
      <div class="productCard">
        <div class="productMedia">
          ${
            img
              ? `<img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" />`
              : `<div class="productNoImg"></div>`
          }
        </div>

        <div class="productInfo">
          <div class="productName">${escapeHtml(p.name)}</div>
          ${p.sku ? `<div class="productSku">${escapeHtml(p.sku)}</div>` : ""}
          <div class="productPrice">${money(price)}</div>

          <div class="productActions">
            <select class="inputField" id="size_${escapeHtml(p.id)}" aria-label="Talla">
              ${sizeOpts}
            </select>

            <button class="btn primary" onclick="addToCart('${escapeHtml(p.id)}')">
              AGREGAR
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- CART ---
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

  function findProduct(id) {
    return catalogData.products.find((p) => p.id === id);
  }

  window.addToCart = (id) => {
    const p = findProduct(id);
    if (!p) return toast("Producto no encontrado");

    const sizeEl = $("size_" + id);
    const size = String(sizeEl?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");

    const existing = cart.find((i) => i.id === id && i.size === size);
    if (existing) existing.qty += 1;
    else cart.push({ id, size, qty: 1 });

    saveCart();
    updateCartUI();
    toast("Agregado ✅");

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
  }

  function updateCartUI() {
    const list = $("cartItems");
    const empty = $("cartEmpty");
    const count = $("cartCount");

    const qtyTotal = cart.reduce((acc, i) => acc + i.qty, 0);
    if (count) count.textContent = String(qtyTotal);

    if (!list || !empty) return;

    if (!cart.length) {
      list.innerHTML = "";
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      list.innerHTML = cart
        .map((item, idx) => {
          const p = findProduct(item.id);
          const img = p?.img || p?.images?.[0] || "";
          const name = p?.name || item.id;
          const price = Number(p?.baseMXN || 0);

          // Markup neutral, sin clases nuevas agresivas
          return `
            <div class="cartItem">
              <div class="cartItemLeft">
                ${img ? `<img class="cartImg" src="${img}" alt="${escapeHtml(name)}">` : ""}
              </div>

              <div class="cartItemMid">
                <div class="cartTitle">${escapeHtml(name)}</div>
                <div class="cartMeta">Talla: <b>${escapeHtml(item.size)}</b> · ${money(price)}</div>

                <div class="cartQtyRow">
                  <button class="btnGhost" onclick="decQty(${idx})">−</button>
                  <div class="cartQtyNum">${item.qty}</div>
                  <button class="btnGhost" onclick="incQty(${idx})">+</button>
                </div>
              </div>

              <div class="cartItemRight">
                <button class="btnGhost" onclick="removeFromCart(${idx})">✕</button>
              </div>
            </div>
          `;
        })
        .join("");
    }

    updateTotals();
  }