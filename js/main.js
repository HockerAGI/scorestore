/* SCORE STORE LOGIC — FIX INTRO HARDSTOP v2.2.3
   - Splash se oculta SIEMPRE (aunque falle todo)
   - Logs claros para detectar por qué no carga tienda
*/
(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";

  const API_BASE =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "/api"
      : "/.netlify/functions";

  const CART_KEY = "score_cart_prod_v5";

  let catalogData = { site: { currency: "MXN" }, sections: [], products: [] };
  let promoRules = [];
  let promoCode = "";
  let cart = [];
  const shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };

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

  // ---- SPLASH HARDSTOP (NO depende de CSS) ----
  function killSplash(reason) {
    const splash = $("splash-screen");
    if (!splash) return;

    // Mata visualmente aunque tu CSS no tenga .hide
    splash.style.opacity = "0";
    splash.style.pointerEvents = "none";
    splash.style.transition = "opacity 350ms ease";
    setTimeout(() => {
      splash.style.display = "none";
      splash.remove();
    }, 420);

    // debug
    console.log("[SCORE] Splash OFF:", reason);
  }

  // HARDSTOP global: pase lo que pase, se oculta en 2500ms
  setTimeout(() => killSplash("hard-timeout"), 2500);

  // ---- UI OPEN/CLOSE ----
  const open = (id) => {
    $(id)?.classList.add("active");
    $("overlay")?.classList.add("active");
    document.documentElement.classList.add("no-scroll");
  };

  const closeAll = () => {
    ["modalCatalog", "drawer", "overlay"].forEach((id) => $(id)?.classList.remove("active"));
    document.documentElement.classList.remove("no-scroll");
  };
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");

  // Compat: acepta openCatalog('BAJA_1000','BAJA 1000')
  window.openCatalog = (sectionId /*, titleHint */) => {
    const section = catalogData.sections.find((s) => s.id === sectionId);
    const title = section?.title || "COLECCIÓN";

    if ($("catTitle")) $("catTitle").textContent = title;

    const items = catalogData.products.filter((p) => p.sectionId === sectionId);
    const root = $("catContent");
    if (!root) return;

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
function setupShippingUI() {
    const radios = document.querySelectorAll('input[name="shipMode"]');
    const shipForm = $("shipForm");

    const applyMode = (mode) => {
      shippingState.mode = mode;

      if (mode === "pickup") {
        shippingState.cost = 0;
        shippingState.label = "Gratis (Fábrica TJ)";
        if (shipForm) shipForm.style.display = "none";
        updateTotals();
        return;
      }

      if (shipForm) shipForm.style.display = "block";

      shippingState.cost = mode === "us" ? 800 : mode === "tj" ? 200 : 250;
      shippingState.label =
        mode === "us" ? "Envío USA (Estándar)" : mode === "tj" ? "Local Express Tijuana" : "Envío Nacional (Estándar)";
      updateTotals();

      const zip = $("cp")?.value?.trim();
      if ((mode === "mx" || mode === "us") && zip && zip.length >= 5) quoteShipping(zip);
    };

    radios.forEach((r) => r.addEventListener("change", () => applyMode(String(r.value))));
    const checked = Array.from(radios).find((r) => r.checked);
    applyMode(checked ? String(checked.value) : "pickup");

    const cp = $("cp");
    if (cp) {
      cp.addEventListener("input", () => {
        const val = cp.value.trim();
        if ((shippingState.mode === "mx" || shippingState.mode === "us") && val.length >= 5) {
          quoteShipping(val);
        }
      });
    }
  }

  async function quoteShipping(zip) {
    const mode = shippingState.mode;
    if (mode !== "mx" && mode !== "us") return;

    try {
      const qty = cart.reduce((acc, i) => acc + i.qty, 0);
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip,
          country: mode === "us" ? "US" : "MX",
          items: qty,
        }),
      });

      const data = await res.json();
      if (data?.ok) {
        shippingState.cost = Number(data.cost || 0);
        shippingState.label = String(data.label || "");
        updateTotals();
      }
    } catch {}
  }

  function setupPromoBar() {
    const bar = $("promo-bar");
    const text = $("promo-text");
    if (!bar || !text) return;

    const msgs = [
      "🏁 80% DE DESCUENTO · SOLO HOY",
      "🔥 EDICIÓN LIMITADA · SE ACABA RÁPIDO",
      "⚡ ENVÍOS MX / USA · HECHO EN TIJUANA",
      "🎟️ CUPONES: SCORE25 · BAJA200 · ENVIOFREE",
    ];

    let i = 0;
    const animateSwap = () => {
      i = (i + 1) % msgs.length;
      text.classList.remove("promoPop");
      void text.offsetWidth;
      text.textContent = msgs[i];
      text.classList.add("promoPop");
    };

    text.textContent = msgs[0];
    text.classList.add("promoPop");
    window.__promoTimer = setInterval(animateSwap, 3600);

    bar.addEventListener("click", () => {
      const code = prompt("Ingresa tu cupón (ej: SCORE25, BAJA200, ENVIOFREE):", promoCode || "");
      if (code === null) return;

      promoCode = String(code || "").trim().toUpperCase();
      if (!promoCode) {
        text.textContent = "Cupón removido";
        toast("Cupón removido");
        updateTotals();
        return;
      }

      const rule = promoRules.find((r) => String(r.code).toUpperCase() === promoCode && r.active);
      if (!rule) {
        toast("Cupón inválido");
        promoCode = "";
        return;
      }

      text.textContent = `✅ CUPÓN ACTIVO: ${promoCode} — ${rule.description || ""}`.trim();
      text.classList.add("promoPop");
      toast("Cupón aplicado");
      updateTotals();
    });
  }

  window.checkout = async () => {
    const btn = $("checkoutBtn");
    if (!cart.length) return toast("Carrito vacío");

    const mode = shippingState.mode;
    const name = $("name")?.value?.trim() || "";
    const addr = $("addr")?.value?.trim() || "";
    const cp = $("cp")?.value?.trim() || "";

    if (mode !== "pickup") {
      if (!name || !addr || !cp) return toast("Faltan datos de envío");
      if (cp.length < 5) return toast("CP/ZIP inválido");
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "PROCESANDO...";
    }

    if (typeof fbq === "function") {
      fbq("track", "InitiateCheckout", { num_items: cart.reduce((a, i) => a + i.qty, 0) });
    }

    try {
      const payload = {
        orgSlug: ORG_SLUG,
        items: cart,
        mode,
        customer: { name, address: addr, postal_code: cp },
        promoCode: promoCode || "",
      };

      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data?.url) {
        location.href = data.url;
        return;
      }
      throw new Error(data?.error || "Checkout failed");
    } catch (err) {
      console.error("[SCORE] checkout error:", err);
      toast("Error: " + (err?.message || "Checkout"));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "PAGAR AHORA";
      }
    }
  };

  function handleQueryActions() {
    const p = new URLSearchParams(location.search);
    const status = p.get("status");
    if (!status) return;

    if (status === "success") {
      cart = [];
      saveCart();
      updateCartUI();
      toast("✅ Pago confirmado. Gracias.");
      if (typeof fbq === "function") fbq("track", "Purchase");
    } else if (status === "cancel") {
      toast("Pago cancelado");
    }

    history.replaceState({}, document.title, location.pathname + location.hash);
  }

  async function loadCatalog() {
    console.log("[SCORE] loading catalog...");
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    console.log("[SCORE] catalog status:", res.status);
    if (!res.ok) throw new Error("catalog.json no disponible");
    catalogData = await res.json();
    if (!Array.isArray(catalogData?.products)) throw new Error("Catálogo inválido");
    console.log("[SCORE] catalog OK products:", catalogData.products.length);
  }

  async function loadPromos() {
    try {
      const res = await fetch("/data/promos.json", { cache: "no-store" });
      const data = await res.json();
      promoRules = Array.isArray(data.rules) ? data.rules : [];
    } catch {
      promoRules = [];
    }
  }

  async function init() {
    console.log("[SCORE] main.js running ✅");

    try {
      await Promise.all([loadCatalog(), loadPromos()]);
      killSplash("loaded");
    } catch (e) {
      console.error("[SCORE] init failed:", e);

      // fallback sections (para que NO se quede muerto)
      catalogData.sections = [
        { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp", badge: "TIENDA OFICIAL" },
        { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp", badge: "EDICIÓN OFICIAL" },
        { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp", badge: "EDICIÓN ESPECIAL" },
        { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp", badge: "CLÁSICOS" },
      ];

      // IMPORTANTE: mata splash incluso con error
      killSplash("fallback");

      toast("⚠️ No cargó el catálogo. Revisa /data/catalog.json");
    }

    loadCart();
    setupShippingUI();
    setupPromoBar();
    updateCartUI();
    handleQueryActions();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  // Asegura que corra aunque el script cargue antes del DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();