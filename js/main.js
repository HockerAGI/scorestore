/* SCORE STORE LOGIC — UNIFICADO (ÚNICO OS + Stripe + Envia) v2.2.0 */
(function () {
  "use strict";

  // --- CONFIG (from index.html) ---
  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const STRIPE_PUBLISHABLE_KEY = CFG.stripePublishableKey || "pk_live_"; // fallback public key
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
  let promoCode = ""; // applied promo code (optional)
  let cart = []; // [{id,size,qty}]
  const shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };

  // --- DOM HELPERS ---
  const $ = (id) => document.getElementById(id);
  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  const toast = (msg) => {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  };
  window.toast = toast; // backward compatibility

  // --- UI OPEN/CLOSE ---
  const open = (id) => {
    $(id)?.classList.add("active");
    $("overlay")?.classList.add("active");
  };
  const closeAll = () => {
    document.querySelectorAll(".active").forEach((e) => e.classList.remove("active"));
  };
  window.closeAll = closeAll;

  window.openDrawer = () => open("drawer");
  window.openCatalog = (sectionId) => {
    const section = catalogData.sections.find((s) => s.id === sectionId);
    const title = section?.title || "COLECCIÓN";
    if ($("catTitle")) $("catTitle").textContent = title;
    const items = catalogData.products.filter((p) => p.sectionId === sectionId);

    const root = $("catContent");
    if (!root) return;

    root.innerHTML = `
      <div class="catTop">
        <div class="catHeader">
          ${section?.logo ? `<img src="${section.logo}" class="catLogo" alt="${title}">` : ""}
          <div>
            <div class="catTitle">${title}</div>
            ${section?.badge ? `<div class="catBadge">${section.badge}</div>` : ""}
          </div>
        </div>
        <div class="catCount">${items.length} productos</div>
      </div>

      <div class="grid">
        ${items.map((p) => renderProductCard(p)).join("")}
      </div>
    `;

    open("modalCatalog");
  };

  // --- CATALOG RENDER ---
  function renderProductCard(p) {
    const sizeOpts = (p.sizes || []).map((s) => `<option value="${s}">${s}</option>`).join("");
    const img = p.img || (p.images && p.images[0]) || "";
    const price = Number(p.baseMXN || 0);

    return `
      <article class="pCard" data-pid="${p.id}">
        <div class="pMedia">
          <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy"/>
        </div>
        <div class="pBody">
          <div class="pName">${escapeHtml(p.name)}</div>
          <div class="pMeta">
            <span class="pSku">${escapeHtml(p.sku || "")}</span>
            <span class="pPrice">${money(price)}</span>
          </div>

          <div class="pActions">
            <select class="pSize" id="size_${p.id}" aria-label="Talla">
              ${sizeOpts}
            </select>
            <button class="btn small primary" onclick="addToCart('${p.id}')">AGREGAR</button>
          </div>
        </div>
      </article>
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
    toast("Agregado");

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

  function updateCartUI() {
    const list = $("cartItems");
    const empty = $("cartEmpty");
    const count = $("cartCount");

    if (count) count.textContent = String(cart.reduce((acc, i) => acc + i.qty, 0));

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
            <div class="cRow">
              <img class="cImg" src="${img}" alt="${escapeHtml(name)}"/>
              <div class="cInfo">
                <div class="cName">${escapeHtml(name)}</div>
                <div class="cSub">Talla: <b>${escapeHtml(item.size)}</b> · ${money(price)}</div>
                <div class="cQty">
                  <button class="qtyBtn" onclick="decQty(${idx})">−</button>
                  <span>${item.qty}</span>
                  <button class="qtyBtn" onclick="incQty(${idx})">+</button>
                </div>
              </div>
              <button class="cDel" onclick="removeFromCart(${idx})" aria-label="Eliminar">✕</button>
            </div>
          `;
        })
        .join("");
    }

    updateTotals();
  }

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

    $("subTotal") && ($("subTotal").textContent = money(sub));
    $("shipTotal") && ($("shipTotal").textContent = shippingState.mode === "pickup" ? "Gratis" : money(ship));
    $("grandTotal") && ($("grandTotal").textContent = money(total));
  }
// --- SHIPPING MODE + QUOTE ---
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

      // default fallback while quoting
      shippingState.cost = mode === "us" ? 800 : 250;
      shippingState.label = mode === "us" ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)";
      updateTotals();

      // auto-quote if zip already present
      const zip = $("cp")?.value?.trim();
      if (zip && zip.length >= 5) quoteShipping(zip);
    };

    radios.forEach((r) => {
      r.addEventListener("change", () => applyMode(String(r.value)));
    });

    // initial
    const checked = Array.from(radios).find((r) => r.checked);
    applyMode(checked ? String(checked.value) : "pickup");

    // quote on zip input
    const cp = $("cp");
    if (cp) {
      cp.addEventListener("input", () => {
        const val = cp.value.trim();
        if (shippingState.mode !== "pickup" && val.length >= 5) quoteShipping(val);
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
        body: JSON.stringify({ zip, country: mode === "us" ? "US" : "MX", items: qty }),
      });
      const data = await res.json();

      if (data?.ok) {
        shippingState.cost = Number(data.cost || 0);
        shippingState.label = String(data.label || "");
        updateTotals();
        return;
      }
    } catch {}
  }

  // --- PROMO BAR (optional) ---
  function setupPromoBar() {
    const bar = $("promo-bar");
    if (!bar) return;

    // Click to apply a coupon code (real backend enforcement)
    bar.addEventListener("click", async () => {
      const code = prompt("Ingresa tu cupón (ej: SCORE25, BAJA200, ENVIOFREE):", promoCode || "");
      if (code === null) return;

      promoCode = String(code || "").trim().toUpperCase();
      if (!promoCode) {
        $("promo-text") && ($("promo-text").textContent = "Cupón removido");
        toast("Cupón removido");
        return;
      }

      // Validate against promos.json (frontend hint only; backend enforces too)
      const rule = promoRules.find((r) => String(r.code).toUpperCase() === promoCode && r.active);
      if (!rule) {
        toast("Cupón inválido");
        promoCode = "";
        return;
      }

      $("promo-text") && ($("promo-text").textContent = `✅ CUPÓN ACTIVO: ${promoCode} — ${rule.description || ""}`.trim());
      toast("Cupón aplicado");
      updateTotals();
    });
  }

  // --- CHECKOUT ---
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

    // Pixel: InitiateCheckout
    if (typeof fbq === "function") {
      fbq("track", "InitiateCheckout", { num_items: cart.reduce((a, i) => a + i.qty, 0) });
    }

    try {
      const payload = {
        orgSlug: ORG_SLUG,
        items: cart, // old schema (backend accepts both)
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
      toast("Error: " + (err?.message || "Checkout"));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "PAGAR AHORA";
      }
    }
  };

  // --- SUCCESS/CANCEL HANDLING ---
  function handleQueryActions() {
    const p = new URLSearchParams(location.search);
    const status = p.get("status");

    if (!status) return;

    if (status === "success") {
      // Clear cart after successful payment
      cart = [];
      saveCart();
      updateCartUI();
      toast("✅ Pago confirmado. Gracias.");

      // Pixel: Purchase (value is unknown client-side; keep minimal)
      if (typeof fbq === "function") fbq("track", "Purchase");
    } else if (status === "cancel") {
      toast("Pago cancelado");
    }

    // Clean URL
    history.replaceState({}, document.title, location.pathname + location.hash);
  }

  // --- LOADERS ---
  async function loadCatalog() {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    catalogData = await res.json();
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

  function hideSplash() {
    const splash = $("splash-screen");
    if (!splash) return;
    setTimeout(() => splash.classList.add("hide"), 550);
    setTimeout(() => splash.remove(), 1400);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function init() {
    try {
      await Promise.all([loadCatalog(), loadPromos()]);
    } catch {
      // fallback hard sections if catalog fails
      catalogData.sections = [
        { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp" },
        { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp" },
        { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp" },
        { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp" },
      ];
    }

    loadCart();
    setupShippingUI();
    setupPromoBar();
    updateCartUI();
    handleQueryActions();
    hideSplash();

    // Register SW
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  init();
})();