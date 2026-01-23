/* SCORE STORE LOGIC — V2026 PRO DRAWER (NO SPEED BAR) */

(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_final_v3";
  const FAKE_MARKUP_FACTOR = 5;

  let cart = [];
  let catalogData = { products: [], sections: [] };
  let appliedPromo = null;

  const $ = (id) => document.getElementById(id);

  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
      Number.isFinite(Number(n)) ? Number(n) : 0
    );

  // Limpieza básica para URLs (evitar inyecciones raras)
  const cleanUrl = (u) => {
    try {
      if (!u) return "";
      const s = String(u).trim();
      if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s;
      return "/" + s.replace(/^\/+/, "");
    } catch {
      return "";
    }
  };

  function hideSplash() {
    const s = $("splash-screen");
    if (!s) return;
    s.classList.add("hidden");
    setTimeout(() => {
      try {
        s.remove();
      } catch (_) {}
    }, 800);
  }

  function loadCart() {
    try {
      const s = localStorage.getItem(CART_KEY);
      const parsed = s ? JSON.parse(s) : [];
      cart = Array.isArray(parsed) ? parsed : [];
    } catch {
      cart = [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json", { cache: "no-cache" });
      const data = await res.json();
      catalogData = {
        products: Array.isArray(data.products) ? data.products : [],
        sections: Array.isArray(data.sections) ? data.sections : [],
      };
    } catch (e) {
      console.error("Catalog Fail", e);
      catalogData = { products: [], sections: [] };
    }
  }

  // ===== UI helpers =====
  function showToast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = String(msg || "");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2400);
  }

  function openDrawer() {
    $("drawer")?.classList.add("active");
    $("overlay")?.classList.add("active");
    $("overlay")?.setAttribute("aria-hidden", "false");
  }

  function closeAll() {
    document.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
    $("overlay")?.classList.remove("active");
    $("overlay")?.setAttribute("aria-hidden", "true");
  }

  function scrollToId(id) {
    const el = $(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Exponer para HTML
  window.openDrawer = openDrawer;
  window.closeAll = closeAll;
  window.scrollToId = scrollToId;

  // ===== Catalog modal =====
  function setCatalogHeader(sectionId, fallbackTitle) {
    const sec = (catalogData.sections || []).find((s) => String(s.id) === String(sectionId));
    const ct = $("catTitle");
    if (!ct) return;

    const logo = sec && sec.logo ? cleanUrl(sec.logo) : "";
    const ttl = (sec && sec.title) ? sec.title : (fallbackTitle || "PRODUCTOS");

    if (logo) {
      ct.innerHTML = `<span class="logo-header"><img class="editionLogo" src="${logo}" alt="${ttl}"><span>${ttl}</span></span>`;
    } else {
      ct.textContent = ttl;
    }
  }

  window.openCatalog = (sectionId, title) => {
    const container = $("catContent");
    if (!container) return;

    setCatalogHeader(sectionId, title);

    const items = (catalogData.products || []).filter((p) => String(p.sectionId) === String(sectionId));
    container.innerHTML = "";

    if (!items.length) {
      container.innerHTML = `<p style="text-align:center;padding:40px;color:#ccc;">Agotado.</p>`;
      $("modalCatalog")?.classList.add("active");
      $("overlay")?.classList.add("active");
      return;
    }

    const grid = document.createElement("div");
    grid.className = "catGrid";

    items.forEach((p) => {
      const card = document.createElement("div");
      card.className = "prodCard";

      const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
      const defSize = sizes[0];

      const sellPrice = Number(p.baseMXN || 0);
      const listPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);

      const images = Array.isArray(p.images) && p.images.length ? p.images : [p.img].filter(Boolean);
      const slidesHtml = images
        .map(
          (src) => `
          <div class="prod-slide" style="min-width:100%; display:flex; justify-content:center;">
            <img src="${cleanUrl(src)}" class="prodImg" loading="lazy" decoding="async" onerror="this.closest('.prod-slide')?.remove()">
          </div>`
        )
        .join("");

      const sizesHtml = sizes
        .map(
          (s, i) =>
            `<button class="size-pill ${i === 0 ? "active" : ""}" onclick="selectSize(this,'${p.id}','${s}')">${s}</button>`
        )
        .join("");

      card.dataset.pid = p.id;
      card.dataset.selSize = defSize;

      card.innerHTML = `
        <div class="metallic-frame" style="position:relative; overflow:hidden; border-radius:12px; margin-bottom:10px;">
          <div class="prod-slider" style="display:flex; overflow:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch;">
            ${slidesHtml}
          </div>
        </div>

        <div class="prodName">${p.name || "Producto"}</div>

        <div class="prodPrice">
          <span style="text-decoration:line-through; color:rgba(255,255,255,.55); font-size:14px;">${money(listPrice)}</span>
          <span style="color:#E10600; font-weight:1000;">${money(sellPrice)}</span>
        </div>

        <div class="sizeRow">${sizesHtml}</div>

        <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR AL CARRITO</button>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);

    $("modalCatalog")?.classList.add("active");
    $("overlay")?.classList.add("active");
    $("overlay")?.setAttribute("aria-hidden", "false");
  };

  window.selectSize = (btn, pid, size) => {
    try {
      const card = btn.closest(".prodCard");
      if (card) {
        card.dataset.selSize = String(size || "Unitalla");
        card.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      }
    } catch {}
  };

  // ===== Cart logic =====
  function normalizeQty(q) {
    const n = Number(q);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(50, Math.floor(n));
  }

  window.addToCart = (pid) => {
    const p = (catalogData.products || []).find((x) => String(x.id) === String(pid));
    if (!p) return;

    const card = document.querySelector(`.prodCard[data-pid="${CSS.escape(String(pid))}"]`);
    const size = card?.dataset?.selSize || (Array.isArray(p.sizes) && p.sizes[0]) || "Unitalla";

    const existing = cart.find((x) => String(x.id) === String(pid) && String(x.size) === String(size));
    if (existing) existing.qty = normalizeQty(existing.qty + 1);
    else {
      cart.push({
        id: p.id,
        name: p.name,
        img: p.img || (Array.isArray(p.images) ? p.images[0] : ""),
        price: Number(p.baseMXN || 0),
        size,
        qty: 1,
        sectionId: p.sectionId,
        sku: p.sku || null,
      });
    }

    saveCart();
    updateCartUI();
    openDrawer();
    showToast("Agregado al carrito");
  };

  window.changeQty = (idx, delta) => {
    idx = Number(idx);
    delta = Number(delta);
    if (!Number.isFinite(idx) || !cart[idx]) return;

    cart[idx].qty = normalizeQty(cart[idx].qty + delta);
    if (cart[idx].qty < 1) cart.splice(idx, 1);

    saveCart();
    updateCartUI();
  };

  window.emptyCart = () => {
    cart = [];
    saveCart();
    updateCartUI();
    showToast("Carrito vacío");
  };

  // ===== Shipping UX (simple + robust) =====
  const shippingState = { mode: "pickup", cost: 0, quoting: false, label: "Recolección Gratis" };

  function getSelectedShipMode() {
    const r = document.querySelector('input[name="shipMode"]:checked');
    return r ? String(r.value) : "pickup";
  }

  async function quoteShipping() {
    const mode = shippingState.mode;
    if (mode === "pickup") return;

    const zip = String($("cp")?.value || "").trim();
    if (zip.length < 5) return;

    shippingState.quoting = true;
    updateCartUI();

    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip,
          country: mode === "us" ? "US" : "MX",
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
        }),
      });

      const data = await res.json();
      const floor = mode === "mx" ? 250 : 800;

      shippingState.cost = data && data.ok ? Math.max(Number(data.cost || 0), floor) : floor;
      shippingState.label = data && data.label ? String(data.label) : (mode === "mx" ? "Envío Nacional" : "Envío USA");
    } catch (e) {
      shippingState.cost = shippingState.mode === "mx" ? 250 : 800;
      shippingState.label = shippingState.mode === "mx" ? "Envío Nacional" : "Envío USA";
    } finally {
      shippingState.quoting = false;
      updateCartUI();
    }
  }

  function setupShippingEvents() {
    document.querySelectorAll('input[name="shipMode"]').forEach((r) => {
      r.addEventListener("change", () => {
        shippingState.mode = getSelectedShipMode();

        const form = $("shipForm");
        if (shippingState.mode === "pickup") {
          shippingState.cost = 0;
          shippingState.quoting = false;
          shippingState.label = "Recolección Gratis";
          form && (form.style.display = "none");
        } else {
          shippingState.cost = shippingState.mode === "mx" ? 250 : 800; // piso inicial visual
          shippingState.label = shippingState.mode === "mx" ? "Envío Nacional" : "Envío USA";
          form && (form.style.display = "block");
          if ((String($("cp")?.value || "").trim()).length === 5) quoteShipping();
        }
        updateCartUI();
      });
    });

    $("cp")?.addEventListener("input", (e) => {
      const v = String(e.target.value || "");
      if (v.length === 5 && shippingState.mode !== "pickup") quoteShipping();
    });
  }

  // ===== Promo =====
  window.applyPromoUI = () => {
    const el = $("promoCode");
    if (!el) return;
    const code = String(el.value || "").trim().toUpperCase();
    if (!code) return;
    appliedPromo = code;
    showToast(`Código ${code} listo para aplicar en el pago`);
  };

  // ===== Checkout =====
  function getCartSubtotal() {
    return cart.reduce((a, b) => a + Number(b.price || 0) * Number(b.qty || 0), 0);
  }

  function validateShippingInputs() {
    if (shippingState.mode === "pickup") return true;
    const zip = String($("cp")?.value || "").trim();
    const name = String($("name")?.value || "").trim();
    const addr = String($("addr")?.value || "").trim();

    if (zip.length < 5 || name.length < 2 || addr.length < 6) return false;
    return true;
  }

  window.checkout = async () => {
    if (!cart.length) return;

    if (!validateShippingInputs()) {
      showToast("Completa C.P., nombre y dirección");
      return;
    }

    const btn = $("checkoutBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "PROCESANDO...";
    }

    try {
      const payload = {
        items: cart.map((i) => ({
          id: i.id,
          qty: i.qty,
          size: i.size,
        })),
        ship: {
          mode: shippingState.mode,
          zip: String($("cp")?.value || "").trim(),
          name: String($("name")?.value || "").trim(),
          address: String($("addr")?.value || "").trim(),
        },
        promo: appliedPromo,
        org: CFG.orgSlug || "score-store",
      };

      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error(data?.error || "No URL de checkout");
    } catch (e) {
      console.error(e);
      showToast("Error al iniciar pago");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "PAGAR AHORA";
      }
    }
  };

  // ===== Render cart =====
  function updateCartUI() {
    const box = $("cartItems");
    const footer = $("cartFooter");
    const emptyState = $("cartEmpty");

    if (!box || !footer || !emptyState) return;

    const count = cart.reduce((a, b) => a + Number(b.qty || 0), 0);
    $("cartCount") && ($("cartCount").innerText = String(count));

    if (!cart.length) {
      box.innerHTML = "";
      emptyState.style.display = "flex";
      footer.style.display = "none";
      return;
    }

    emptyState.style.display = "none";
    footer.style.display = "block";

    box.innerHTML = cart
      .map(
        (it, idx) => `
        <div class="cartItem">
          <img src="${cleanUrl(it.img)}" class="cartThumb" alt="${String(it.name || "Producto")}">
          <div class="cInfo">
            <div class="cName">${String(it.name || "Producto")}</div>
            <div class="cMeta">${String(it.size || "Unitalla")}${it.sku ? ` · <span style="opacity:.7">${it.sku}</span>` : ""}</div>
            <div class="qtyControl">
              <button class="qtyBtn" onclick="changeQty(${idx}, -1)" aria-label="Menos">−</button>
              <span class="qtyVal">${Number(it.qty || 1)}</span>
              <button class="qtyBtn" onclick="changeQty(${idx}, 1)" aria-label="Más">+</button>
            </div>
          </div>
          <div class="cRight">
            <div class="cPrice">${money(Number(it.price || 0) * Number(it.qty || 0))}</div>
            <div class="cart-remove" onclick="changeQty(${idx}, -999)">Eliminar</div>
          </div>
        </div>`
      )
      .join("");

    const sub = getCartSubtotal();
    $("subTotal") && ($("subTotal").innerText = money(sub));

    // Shipping numbers (drawer)
    if (shippingState.mode === "pickup") {
      $("shipTotal") && ($("shipTotal").innerText = "GRATIS");
      $("grandTotal") && ($("grandTotal").innerText = money(sub));
    } else if (shippingState.quoting) {
      $("shipTotal") && ($("shipTotal").innerText = "COTIZANDO...");
      $("grandTotal") && ($("grandTotal").innerText = money(sub + Number(shippingState.cost || 0)));
    } else {
      $("shipTotal") && ($("shipTotal").innerText = money(Number(shippingState.cost || 0)));
      $("grandTotal") && ($("grandTotal").innerText = money(sub + Number(shippingState.cost || 0)));
    }

    const btn = $("checkoutBtn");
    if (btn) btn.disabled = !cart.length;
  }

  // ===== Promo bar (opcional) =====
  async function initPromoBar() {
    try {
      const bar = $("promo-bar");
      const text = $("promo-text");
      if (!bar || !text) return;

      const res = await fetch("/data/promos.json", { cache: "no-cache" });
      const data = await res.json();

      const active = Array.isArray(data.promos) ? data.promos.find((p) => p.active) : null;
      if (!active) return;

      text.textContent = active.text || "PROMO ACTIVA";
      bar.style.display = "flex";
    } catch {}
  }

  // ===== Cookie banner (opcional) =====
  function initCookieBanner() {
    const banner = $("cookieBanner");
    const accept = $("cookieAccept");
    const reject = $("cookieReject");
    if (!banner || !accept || !reject) return;

    const KEY = "score_cookie_ok_v1";
    const st = localStorage.getItem(KEY);

    if (st === "1" || st === "0") return;

    banner.style.display = "block";

    accept.addEventListener("click", () => {
      localStorage.setItem(KEY, "1");
      banner.style.display = "none";
    });

    reject.addEventListener("click", () => {
      localStorage.setItem(KEY, "0");
      banner.style.display = "none";
    });
  }

  async function init() {
    const safetyTimer = setTimeout(() => {
      // si algo sale mal, igual no te quedas atorado en el splash
      hideSplash();
    }, 7000);

    try {
      await loadCatalog();
      loadCart();
      updateCartUI();
      setupShippingEvents();
      initPromoBar();
      initCookieBanner();

      // scroll reveal (sin librerías, friendly con Lighthouse)
      const revealEls = document.querySelectorAll(".scroll-reveal");
      if (revealEls.length) {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("visible");
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.12 }
        );
        revealEls.forEach((el) => io.observe(el));
      }

      // splash auto
      setTimeout(hideSplash, 4000);
      $("skipIntro")?.addEventListener("click", hideSplash);
    } catch (err) {
      console.error("Critical Init Error:", err);
    } finally {
      clearTimeout(safetyTimer);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();