/* SCORE STORE LOGIC — v2.2.8 (INDEX-ALIGNED + RACING + UNICO TUNED)
   - Splash HARDSTOP: jamás se queda pegado
   - Overlay: #overlay (match exacto index + CSS)
   - Promo: sin cupones, click abre carrito, swap anim
   - Catálogo modal: header con LOGO OFICIAL (no texto) + grid CSS (.pCard/.catGrid/.quickView)
   - Carrito: mantiene tu HTML + speed bar + micro-animaciones
   - UI: iconos verdes (SVG), Hero sin H1, Partners oficiales, Footer Único/BAJATEX
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
  let promoRules = []; // compat (no UI)
  let promoCode = "";  // compat (no UI)
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

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

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

    splash.style.transition = "opacity 350ms ease";
    splash.style.opacity = "0";
    splash.style.pointerEvents = "none";

    setTimeout(() => {
      splash.style.display = "none";
      try { splash.remove(); } catch {}
    }, 420);

    // console.log("[SCORE] Splash OFF:", reason);
  }

  // HARDSTOP global
  setTimeout(() => killSplash("hard-timeout"), 2500);

  // ---- UI OPEN/CLOSE ----
  const open = (id) => {
    $(id)?.classList.add("active");
    $("overlay")?.classList.add("active");
    document.documentElement.classList.add("no-scroll");
    document.body?.classList.add("no-scroll");
  };

  const closeAll = () => {
    ["modalCatalog", "drawer", "overlay"].forEach((id) => $(id)?.classList.remove("active"));
    document.documentElement.classList.remove("no-scroll");
    document.body?.classList.remove("no-scroll");
  };
  window.closeAll = closeAll;
  window.openDrawer = () => open("drawer");

  // ---- UI TUNES (idempotentes, no rompen si ya está) ----

  // 1) Icono carrito: si ya hay SVG (index nuevo), no toca nada.
  function injectCartIcon() {
    const btn = document.querySelector(".cartBtn");
    if (!btn) return;
    if (btn.querySelector("svg")) return; // ya viene en el index

    // limpia emoji si existía en versiones viejas
    try {
      btn.childNodes.forEach((n) => {
        if (n && n.nodeType === 3 && /🛒/.test(n.textContent)) {
          n.textContent = n.textContent.replace(/🛒/g, "").trim();
        }
      });
    } catch {}

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.classList.add("icon");
    svg.innerHTML = `
      <path d="M6.5 6h14l-1.2 7.2a2 2 0 0 1-2 1.7H9.2a2 2 0 0 1-2-1.6L5.5 3H2"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="9" cy="20" r="1.6" fill="currentColor"/>
      <circle cx="17" cy="20" r="1.6" fill="currentColor"/>
    `;
    btn.prepend(svg);
    btn.style.gap = "10px";
  }

  // 2) Hero: elimina H1 si existiera + refuerza copy (no pisa si tu index ya trae lo correcto)
  function tuneHeroCopy() {
    const h1 = document.querySelector(".hero-title");
    if (h1) h1.remove();

    const copy = document.querySelector(".marketing-copy");
    if (!copy) return;

    // Si ya contiene logo-unico, no vuelvas a reescribir (evita parpadeos)
    if (copy.innerHTML && copy.innerHTML.includes("logo-unico.webp")) return;

    copy.innerHTML = `
      <strong>MERCANCÍA OFICIAL</strong> · Fabricado por
      <img src="/assets/logo-unico.webp" alt="Único Uniformes"
        style="display:inline-block;height:22px;vertical-align:middle;margin:0 6px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35));"
        loading="lazy" />
      <strong>PATROCINADOR OFICIAL</strong>
    `;
  }

  // 3) Partners: set oficial + logos (sin tarjeta; el look lo hace el CSS)
  function tunePartners() {
    const h3 = document.querySelector(".partners h3");
    if (h3) h3.textContent = "PARTNERS OFICIALES";

    const grid = document.querySelector(".partnersGrid");
    if (!grid) return;

    const logos = [
      { src: "/assets/logo-unico.webp", alt: "Único Uniformes" },
      { src: "/assets/logo-score.webp", alt: "SCORE International" },
      { src: "/assets/logo-bfgodrich.webp", alt: "BFGoodrich" },
      { src: "/assets/logo-rzr.webp", alt: "RZR" },
      { src: "/assets/logo-ford.webp", alt: "Ford" },
    ];

    // si ya están, no re-renderices
    if (grid.querySelectorAll("img.pLogo").length >= 4) return;

    grid.innerHTML = logos
      .map((l) => `<img class="pLogo" src="${l.src}" alt="${escapeHtml(l.alt)}" loading="lazy">`)
      .join("");
  }

  // 4) Footer: marca pública Único + fiscal BAJATEX (soporta index viejo con <small> y nuevo sin <small>)
  function tuneFooter() {
    const brand = document.querySelector(".footerBrandName");
    if (brand) brand.textContent = "ÚNICO UNIFORMES";

    // index nuevo: .copy es un div de texto (sin small)
    const copyDiv = document.querySelector(".copy");
    if (copyDiv) copyDiv.textContent = "© 2026 Único Uniformes · BAJATEX";
  }

  // ---- QUICK VIEW (opcional, no rompe si no existe) ----
  function ensureQuickView(root) {
    if (!root) return null;
    let qv = root.querySelector("#quickView");
    if (qv) return qv;

    qv = document.createElement("div");
    qv.id = "quickView";
    qv.className = "quickView";
    qv.innerHTML = `
      <div class="qvInner">
        <button class="qvClose" type="button" aria-label="Cerrar">×</button>

        <div class="qvMedia">
          <img id="qvMainImg" src="" alt="Vista rápida" />
          <div class="qvThumbs" id="qvThumbs"></div>
        </div>

        <div class="qvInfo">
          <h4 class="qvTitle" id="qvTitle">Producto</h4>

          <div class="qvRow">
            <div class="qvSku" id="qvSku"></div>
            <div class="qvPrice" id="qvPrice"></div>
          </div>

          <div class="qvLabel">Talla</div>
          <select class="inputField" id="qvSize"></select>

          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" id="qvAddBtn" type="button">AGREGAR AL CARRITO</button>
            <button class="btn secondary" id="qvGoCartBtn" type="button">VER CARRITO</button>
          </div>

          <div class="qvNote" id="qvNote">Hecho en Tijuana · Oficial</div>
        </div>
      </div>
    `;
    root.prepend(qv);

    qv.querySelector(".qvClose")?.addEventListener("click", () => qv.classList.remove("active"));
    qv.querySelector("#qvGoCartBtn")?.addEventListener("click", () => {
      qv.classList.remove("active");
      open("drawer");
    });

    return qv;
  }

  function openQuickView(p, root) {
    const qv = ensureQuickView(root);
    if (!qv) return;

    const title = p?.name || "Producto";
    const sku = p?.sku ? String(p.sku) : "";
    const price = money(Number(p?.baseMXN || 0));
    const imgs = Array.isArray(p?.images) && p.images.length ? p.images : [p?.img].filter(Boolean);

    const mainImg = qv.querySelector("#qvMainImg");
    const thumbs = qv.querySelector("#qvThumbs");
    const tEl = qv.querySelector("#qvTitle");
    const skuEl = qv.querySelector("#qvSku");
    const priceEl = qv.querySelector("#qvPrice");
    const sizeSel = qv.querySelector("#qvSize");
    const addBtn = qv.querySelector("#qvAddBtn");

    if (tEl) tEl.textContent = title;
    if (skuEl) skuEl.textContent = sku ? `SKU · ${sku}` : "";
    if (priceEl) priceEl.textContent = price;

    const sizes = Array.isArray(p?.sizes) ? p.sizes : [];
    if (sizeSel) {
      sizeSel.innerHTML = sizes
        .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
        .join("");
    }

    const setMain = (src) => {
      if (mainImg) {
        mainImg.src = src || "";
        mainImg.alt = title;
      }
    };

    if (thumbs) {
      thumbs.innerHTML = (imgs || [])
        .map((src, i) => {
          const safe = escapeHtml(src || "");
          return `
            <button class="qvThumb ${i === 0 ? "active" : ""}" type="button" data-src="${safe}">
              <img src="${safe}" alt="${escapeHtml(title)} ${i + 1}" loading="lazy" />
            </button>
          `;
        })
        .join("");

      thumbs.querySelectorAll(".qvThumb").forEach((btn) => {
        btn.addEventListener("click", () => {
          thumbs.querySelectorAll(".qvThumb").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          setMain(btn.getAttribute("data-src") || "");
        });
      });
    }

    setMain((imgs && imgs[0]) || "");

    if (addBtn) {
      addBtn.onclick = () => {
        const size = String(sizeSel?.value || (sizes?.[0] || "")).trim();
        if (!size) return toast("Selecciona talla");
        addToCart(p.id, size);
        qv.classList.remove("active");
      };
    }

    qv.classList.add("active");
  }

  // ---- CART STORAGE ----
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
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }

  function findProduct(id) {
    return (catalogData.products || []).find((p) => p.id === id);
  }

  function addToCart(id, forcedSize) {
    const p = findProduct(id);
    if (!p) return toast("Producto no encontrado");

    const sizeEl = $("size_" + id);
    const size = String(forcedSize || sizeEl?.value || (p.sizes?.[0] || "")).trim();
    if (!size) return toast("Selecciona talla");

    const existing = cart.find((i) => i.id === id && i.size === size);
    if (existing) existing.qty += 1;
    else cart.push({ id, size, qty: 1 });

    saveCart();
    updateCartUI();
    bumpCartBtn();
    toast("Agregado ✅");

    if (typeof fbq === "function") {
      fbq("track", "AddToCart", { content_ids: [id], content_type: "product" });
    }
  }

  window.addToCart = (id) => addToCart(id);

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

    const bar = $("cartSpeedBar");
    if (bar) {
      const pct = clamp((sub / 6000) * 100, 0, 100);
      bar.style.width = pct.toFixed(0) + "%";
    }
  }

  function bumpCartBtn() {
    const btn = document.querySelector(".cartBtn");
    if (!btn) return;
    btn.style.transform = "translateY(-1px) scale(1.03)";
    setTimeout(() => { btn.style.transform = ""; }, 180);
  }

  function renderEmptyCart() {
    const empty = $("cartEmpty");
    const list = $("cartItems");
    if (!empty || !list) return;

    empty.style.display = "block";
    empty.innerHTML = `
      <div class="cartEmptyCard">
        <div class="cecTitle">🏁 SIN PRODUCTOS</div>
        <div class="cecText">Agrega artículos y prepara tu pedido. Envío MX/USA · Hecho en Tijuana.</div>
      </div>
    `;
    list.innerHTML = "";
  }

  function updateCartUI() {
    const list = $("cartItems");
    const empty = $("cartEmpty");
    const count = $("cartCount");

    const qtyTotal = cart.reduce((acc, i) => acc + i.qty, 0);
    if (count) count.textContent = String(qtyTotal);

    if (!list || !empty) return;

    if (!cart.length) {
      renderEmptyCart();
      updateTotals();
      return;
    }

    empty.style.display = "none";

    list.innerHTML = cart
      .map((item, idx) => {
        const p = findProduct(item.id);
        const img = p?.img || p?.images?.[0] || "";
        const name = p?.name || item.id;
        const price = Number(p?.baseMXN || 0);
        const line = price * item.qty;

        return `
          <div class="cartItem">
            <div class="cartItemLeft">
              ${img ? `<img class="cartImg" src="${escapeHtml(img)}" alt="${escapeHtml(name)}" loading="lazy">` : ``}
            </div>

            <div class="cartItemMid">
              <div class="cartTitle">${escapeHtml(name)}</div>
              <div class="cartMeta">Talla: <b>${escapeHtml(item.size)}</b> · ${money(price)}</div>

              <div class="cartQtyRow">
                <button class="btnGhost" onclick="decQty(${idx})" aria-label="Bajar">−</button>
                <div class="cartQtyNum">${item.qty}</div>
                <button class="btnGhost" onclick="incQty(${idx})" aria-label="Subir">+</button>

                <div style="margin-left:auto; font-weight:900;">${money(line)}</div>
              </div>
            </div>

            <div class="cartItemRight">
              <button class="btnGhost" onclick="removeFromCart(${idx})" aria-label="Quitar">✕</button>
            </div>
          </div>
        `;
      })
      .join("");

    updateTotals();
  }

  // ---- SHIPPING UI ----
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
        mode === "us"
          ? "Envío USA (Estándar)"
          : mode === "tj"
          ? "Local Express Tijuana"
          : "Envío Nacional (Estándar)";

      updateTotals();

      const zip = $("cp")?.value?.trim();
      if ((mode === "mx" || mode === "us") && zip && zip.length >= 5 && cart.length) {
        quoteShipping(zip);
      }
    };

    radios.forEach((r) => r.addEventListener("change", () => applyMode(String(r.value))));
    const checked = Array.from(radios).find((r) => r.checked);
    applyMode(checked ? String(checked.value) : "pickup");

    const cp = $("cp");
    if (cp) {
      cp.addEventListener("input", () => {
        const val = cp.value.trim();
        if ((shippingState.mode === "mx" || shippingState.mode === "us") && val.length >= 5 && cart.length) {
          quoteShipping(val);
        }
      });
    }
  }

  async function quoteShipping(zip) {
    const mode = shippingState.mode;
    if (mode !== "mx" && mode !== "us") return;
    if (!cart.length) return;

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

      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        shippingState.cost = Number(data.cost || 0);
        shippingState.label = String(data.label || "");
        updateTotals();
        $("shipTotal")?.classList.add("flash");
        setTimeout(() => $("shipTotal")?.classList.remove("flash"), 520);
      }
    } catch {
      // silencio
    }
  }

  // ---- PROMO BAR (SIN CUPONES) ----
  function setupPromoBar() {
    const bar = $("promo-bar");
    const text = $("promo-text");
    if (!bar || !text) return;

    const msgs = [
      "⏳ DESCUENTO POR TIEMPO LIMITADO · HASTA 80% OFF",
      "🔥 ADQUIERE TU FAVORITO HOY · STOCK LIMITADO",
      "🇲🇽🇺🇸 ENVÍO MX/USA · HECHO EN TIJUANA",
      "🏁 MERCANCÍA OFICIAL · CALIDAD ÚNICO",
      "⚡ ASEGURA TU TALLA · COMPRA RÁPIDO",
    ];

    let i = 0;

    const swap = () => {
      i = (i + 1) % msgs.length;
      text.classList.remove("promoPop", "swap");
      void text.offsetWidth;
      text.textContent = msgs[i];
      text.classList.add("promoPop");
    };

    text.textContent = msgs[0];
    text.classList.add("promoPop");
    clearInterval(window.__promoTimer);
    window.__promoTimer = setInterval(swap, 3800);

    // click abre carrito
    bar.addEventListener("click", () => open("drawer"));
  }

  // ---- CATALOG MODAL (LOGO MANDA) ----
  window.openCatalog = (sectionId) => {
    const section = (catalogData.sections || []).find((s) => s.id === sectionId);
    const title = section?.title || "COLECCIÓN";

    // El header del modal arriba queda vacío (logo manda)
    if ($("catTitle")) $("catTitle").textContent = "";

    const items = (catalogData.products || []).filter((p) => p.sectionId === sectionId);
    const root = $("catContent");
    if (!root) return;

    const logoSrc =
      section?.logo ||
      (sectionId === "BAJA_1000" ? "/assets/logo-baja1000.webp" :
       sectionId === "BAJA_500"  ? "/assets/logo-baja500.webp"  :
       sectionId === "BAJA_400"  ? "/assets/logo-baja400.webp"  :
       sectionId === "SF_250"    ? "/assets/logo-sf250.webp"    : "");

    root.innerHTML = `
      <div class="catHeaderBlock">
        ${logoSrc ? `<img class="catLogo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(title)}" style="height:56px;">` : ""}
        <div class="catHeaderText">
          <div class="catTitleText">COLECCIÓN OFICIAL</div>
          <div class="catSubText">${escapeHtml(title)}</div>
        </div>
        <div class="catBadge">${items.length} PRODUCTOS</div>
      </div>

      <div class="catItems">
        <div class="grid catGrid">
          ${items.map((p) => renderProductCard(p)).join("")}
        </div>
      </div>
    `;

    root.querySelectorAll("[data-qv]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-qv");
        const p = findProduct(id);
        if (!p) return;
        openQuickView(p, root);
      });
    });

    open("modalCatalog");
  };

  function renderProductCard(p) {
    const img = p?.img || (p?.images && p.images[0]) || "";
    const price = Number(p?.baseMXN || 0);

    const sizes = Array.isArray(p?.sizes) ? p.sizes : [];
    const sizeOpts = sizes
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");

    return `
      <div class="pCard">
        <button class="pMedia" type="button" data-qv="${escapeHtml(p.id)}" aria-label="Vista rápida">
          ${
            img
              ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy" />`
              : `<div class="productNoImg"></div>`
          }
          <div class="pZoom">VER</div>
        </button>

        <div class="pBody">
          <div class="pName">${escapeHtml(p.name)}</div>

          <div class="pMeta">
            ${p?.sku ? `<div class="pSku">${escapeHtml(p.sku)}</div>` : `<div class="pSku">OFICIAL</div>`}
            <div class="pPrice">${money(price)}</div>
          </div>

          <div class="pActions">
            <select class="pSize" id="size_${escapeHtml(p.id)}" aria-label="Talla">
              ${sizeOpts}
            </select>

            <button class="btn primary small" onclick="addToCart('${escapeHtml(p.id)}')" type="button">
              AGREGAR
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ---- CHECKOUT ----
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
        promoCode: "", // UI sin cupones (si luego quieres promos server-side, se reactiva)
      };

      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
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

  // ---- URL status ----
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

  // ---- LOAD DATA ----
  async function loadCatalog() {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("catalog.json no disponible");
    catalogData = await res.json();
    if (!Array.isArray(catalogData?.products)) throw new Error("Catálogo inválido");
  }

  async function loadPromos() {
    // compat
    try {
      const res = await fetch("/data/promos.json", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      promoRules = Array.isArray(data?.rules) ? data.rules : [];
    } catch {
      promoRules = [];
    }
  }

  function injectCartSpeedBar() {
    const drawerBody = document.querySelector("#drawer .dBody");
    if (!drawerBody) return;

    if (!$("cartSpeedWrap")) {
      const wrap = document.createElement("div");
      wrap.className = "cartSpeedWrap";
      wrap.id = "cartSpeedWrap";
      wrap.innerHTML = `<div class="cartSpeedBar" id="cartSpeedBar"></div>`;

      const hrs = drawerBody.querySelectorAll("hr");
      if (hrs && hrs.length) drawerBody.insertBefore(wrap, hrs[0]);
      else drawerBody.prepend(wrap);
    }
  }

  async function init() {
    try {
      await Promise.all([loadCatalog(), loadPromos()]);
      killSplash("loaded");
    } catch (e) {
      console.error("[SCORE] init failed:", e);

      // fallback sections con LOGOS reales (tus assets)
      catalogData.sections = [
        { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp" },
        { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp" },
        { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp" },
        { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp" },
      ];

      killSplash("fallback");
      toast("⚠️ No cargó el catálogo. Revisa /data/catalog.json");
    }

    loadCart();
    injectCartSpeedBar();
    setupShippingUI();
    setupPromoBar();

    // UI tunes
    injectCartIcon();
    tuneHeroCopy();
    tunePartners();
    tuneFooter();

    updateCartUI();
    handleQueryActions();

    $("overlay")?.addEventListener("click", closeAll);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });

    // SW (opcional)
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