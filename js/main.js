/* SCORE STORE LOGIC — FIX INTRO HARDSTOP v2.2.4 (ALIGNED)
   - Splash se oculta SIEMPRE (aunque falle todo)
   - Alineado a CSS racing pre-dark (pCard / pMedia / pBody / pActions / pSize)
   - no-scroll aplica en html + body
   - promoPop + swap (compat)
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

    splash.style.opacity = "0";
    splash.style.pointerEvents = "none";
    splash.style.transition = "opacity 350ms ease";

    setTimeout(() => {
      splash.style.display = "none";
      splash.remove();
    }, 420);

    console.log("[SCORE] Splash OFF:", reason);
  }

  // HARDSTOP global
  setTimeout(() => killSplash("hard-timeout"), 2500);

  // ---- UI OPEN/CLOSE ----
  const overlayEl = () => $("overlay") || document.querySelector(".page-overlay");

  const setNoScroll = (on) => {
    document.documentElement.classList.toggle("no-scroll", on);
    document.body.classList.toggle("no-scroll", on);
  };

  const open = (id) => {
    $(id)?.classList.add("active");
    overlayEl()?.classList.add("active");
    setNoScroll(true);
  };

  const closeAll = () => {
    ["modalCatalog", "drawer"].forEach((id) => $(id)?.classList.remove("active"));
    overlayEl()?.classList.remove("active");
    setNoScroll(false);
  };
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");

  // Cierra overlay click
  document.addEventListener("click", (e) => {
    const ov = overlayEl();
    if (ov && e.target === ov) closeAll();
  });

  function findProduct(id) {
    return catalogData.products.find((p) => p.id === id);
  }

  // ---------- CATALOGO (ALINEADO A CSS racing) ----------
  window.openCatalog = (sectionId /*, titleHint */) => {
    const section = catalogData.sections.find((s) => s.id === sectionId);
    const title = section?.title || "COLECCIÓN";

    if ($("catTitle")) $("catTitle").textContent = title;

    const items = catalogData.products.filter((p) => p.sectionId === sectionId);
    const root = $("catContent");
    if (!root) return;

    const badge = section?.badge ? `<span class="catBadge">${escapeHtml(section.badge)}</span>` : "";
    const logo = section?.logo
      ? `<img src="${section.logo}" class="catLogo" alt="${escapeHtml(title)}" />`
      : "";

    root.innerHTML = `
      <div class="catTop">
        <div class="catHeader">
          ${logo}
          <div class="catHeaderText">
            <div class="catTitle">${escapeHtml(title)}</div>
            ${badge}
          </div>
        </div>
        <div class="catCount">${items.length} PRODUCTOS</div>
      </div>

      <div class="grid catGrid">
        ${items.map((p) => renderProductCardAligned(p)).join("")}
      </div>
    `;

    open("modalCatalog");
  };

  function renderProductCardAligned(p) {
    const img = p.img || (p.images && p.images[0]) || "";
    const price = Number(p.baseMXN || 0);

    const sizeOpts = (p.sizes || [])
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");

    const zoomLabel = (p.subSection || "VER").toUpperCase();

    return `
      <div class="pCard">
        <button class="pMedia" type="button" onclick="quickView('${escapeHtml(p.id)}')" aria-label="Ver producto">
          ${
            img
              ? `<img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy" />`
              : `<div style="aspect-ratio:4/3; background:rgba(255,255,255,.06)"></div>`
          }
          <div class="pZoom">${escapeHtml(zoomLabel)}</div>
        </button>

        <div class="pBody">
          <div class="pName">${escapeHtml(p.name)}</div>
          ${p.sku ? `<div class="pSku">${escapeHtml(p.sku)}</div>` : ""}

          <div class="pMeta">
            <div class="pSku">${escapeHtml(p.subSection || "")}</div>
            <div class="pPrice">${money(price)}</div>
          </div>

          <div class="pActions">
            <select class="pSize" id="size_${escapeHtml(p.id)}" aria-label="Talla">
              ${sizeOpts}
            </select>

            <button class="btn primary small" onclick="addToCart('${escapeHtml(p.id)}')">
              AGREGAR
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Quick view (si tu HTML lo trae). Si no existe, abre el modal normal.
  window.quickView = (id) => {
    const qv = $("quickView");
    const p = findProduct(id);
    if (!p) return;

    // Si no existe quickView en tu HTML, solo abre el catálogo (no rompe)
    if (!qv) return;

    const imgs = Array.isArray(p.images) && p.images.length ? p.images : [p.img].filter(Boolean);
    const mainImg = imgs[0] || "";

    qv.classList.add("active");
    qv.innerHTML = `
      <div class="qvInner">
        <button class="qvClose" onclick="closeQuickView()" aria-label="Cerrar">×</button>

        <div class="qvMedia">
          ${mainImg ? `<img id="qvMain" src="${mainImg}" alt="${escapeHtml(p.name)}">` : ""}
          <div class="qvThumbs">
            ${imgs
              .map(
                (src, i) => `
                <button class="qvThumb ${i === 0 ? "active" : ""}" onclick="setQvImg('${escapeHtml(
                  src
                )}', this)" aria-label="Imagen ${i + 1}">
                  <img src="${src}" alt="">
                </button>
              `
              )
              .join("")}
          </div>
        </div>

        <div class="qvInfo">
          <h3 class="qvTitle">${escapeHtml(p.name)}</h3>
          <div class="qvRow">
            <div class="qvSku">${escapeHtml(p.sku || "")}</div>
            <div class="qvPrice">${money(p.baseMXN || 0)}</div>
          </div>

          <div class="qvLabel">TALLA</div>
          <select class="inputField" id="size_${escapeHtml(p.id)}">
            ${(p.sizes || []).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
          </select>

          <button class="btn primary full" style="margin-top:12px" onclick="addToCart('${escapeHtml(p.id)}')">
            AGREGAR AL CARRITO
          </button>

          <div class="qvNote">Producto oficial · Hecho en Tijuana · Listo para competir 🏁</div>
        </div>
      </div>
    `;
  };

  window.setQvImg = (src, btn) => {
    const img = $("qvMain");
    if (img) img.src = src;
    document.querySelectorAll(".qvThumb").forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
  };

  window.closeQuickView = () => {
    const qv = $("quickView");
    if (!qv) return;
    qv.classList.remove("active");
    qv.innerHTML = "";
  };

  // ---------- CART ----------
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
// ---------- SHIPPING ----------
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

      // valores base (si tu API devuelve algo, lo sobreescribe)
      shippingState.cost = mode === "us" ? 800 : mode === "tj" ? 200 : 250;
      shippingState.label =
        mode === "us"
          ? "Envío USA (Estándar)"
          : mode === "tj"
          ? "Local Express Tijuana"
          : "Envío Nacional (Estándar)";

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

  // ---------- PROMO BAR (RACING) ----------
  function setupPromoBar() {
    const bar = $("promo-bar");
    const text = $("promo-text");
    if (!bar || !text) return;

    // Mensajes racing (sin el “solo hoy” repetitivo)
    const msgs = [
      "🏁 GRID ABIERTO · MERCH OFICIAL SCORE",
      "🔥 DROP LIMITADO · CUANDO SE VA, SE VA",
      "⚡ MX + USA · HECHO EN TIJUANA",
      "🎟️ CUPONES · SCORE25 · BAJA200 · ENVIOFREE",
    ];

    let i = 0;

    const pulseSwap = () => {
      i = (i + 1) % msgs.length;

      // compat: activa ambas clases (swap + promoPop)
      text.classList.remove("swap", "promoPop");
      void text.offsetWidth;
      text.textContent = msgs[i];
      text.classList.add("swap", "promoPop");
    };

    text.textContent = msgs[0];
    text.classList.add("swap", "promoPop");
    window.__promoTimer = setInterval(pulseSwap, 3600);

    bar.addEventListener("click", () => {
      const code = prompt(
        "Ingresa tu cupón (ej: SCORE25, BAJA200, ENVIOFREE):",
        promoCode || ""
      );
      if (code === null) return;

      promoCode = String(code || "").trim().toUpperCase();

      if (!promoCode) {
        text.textContent = "Cupón removido";
        toast("Cupón removido");
        updateTotals();
        return;
      }

      const rule = promoRules.find(
        (r) => String(r.code).toUpperCase() === promoCode && r.active
      );
      if (!rule) {
        toast("Cupón inválido");
        promoCode = "";
        return;
      }

      text.textContent = `✅ CUPÓN ACTIVO: ${promoCode} — ${rule.description || ""}`.trim();
      text.classList.add("swap", "promoPop");
      toast("Cupón aplicado");
      updateTotals();
    });
  }

  // ---------- CHECKOUT ----------
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();