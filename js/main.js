/* SCORE STORE LOGIC — PRO RACING v2026 (PRODUCTION) */
(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const CART_KEY = "score_cart_v2026_prod";
  const API_BASE = "/.netlify/functions";
  const FAKE_MARKUP_FACTOR = 5;

  let cart = [];
  let catalogData = { products: [], sections: [] };
  let shipping = { mode: "pickup", cost: 0, quoting: false, label: "GRATIS" };
  let appliedPromo = null;

  const $ = (id) => document.getElementById(id);
  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
      Number(n || 0)
    );

  const cleanUrl = (u) => (u ? encodeURI(String(u).trim()) : "");

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function hideSplash() {
    const s = $("splash-screen");
    if (!s) return;
    s.classList.add("hidden");
    setTimeout(() => {
      try { s.remove(); } catch (_) {}
    }, 800);
  }

  async function init() {
    await loadCatalog();
    loadCart();
    setupEvents();
    setupScrollReveal();

    updateCartUI();

    // Intro auto-close
    setTimeout(hideSplash, 4000);

    // Si luego agregas un botón con id="skipIntro", quedará listo
    const skipBtn = document.getElementById("skipIntro");
    if (skipBtn) skipBtn.addEventListener("click", hideSplash);
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("Catalog fetch failed");
      catalogData = await res.json();
      if (!catalogData || !Array.isArray(catalogData.products)) {
        catalogData = { products: [], sections: [] };
      }
      if (!Array.isArray(catalogData.sections)) catalogData.sections = [];
    } catch (e) {
      console.error("Catalog Fail", e);
      catalogData = { products: [], sections: [] };
    }
  }

  function loadCart() {
    try {
      const s = localStorage.getItem(CART_KEY);
      cart = s ? JSON.parse(s) : [];
      if (!Array.isArray(cart)) cart = [];
    } catch {
      cart = [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function setupScrollReveal() {
    const els = document.querySelectorAll(".scroll-reveal");
    if (!els.length) return;

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

    els.forEach((el) => io.observe(el));
  }

  function setupEvents() {
    // Shipping mode change
    document.querySelectorAll('input[name="shipMode"]').forEach((r) => {
      r.addEventListener("change", (e) => {
        shipping.mode = String(e.target.value || "pickup");

        const form = $("shipForm");
        if (shipping.mode === "pickup") {
          shipping.cost = 0;
          shipping.quoting = false;
          shipping.label = "GRATIS";
          form && form.classList.remove("active");
        } else {
          shipping.cost = null;
          shipping.quoting = false;
          shipping.label = "Cotizar";
          form && form.classList.add("active");
          if ((String($("cp")?.value || "")).length === 5) quoteShipping();
        }
        updateCartUI();
      });
    });

    // CP input
    $("cp")?.addEventListener("input", (e) => {
      const v = String(e.target.value || "");
      if (v.length === 5) quoteShipping();
      if (v.length < 5 && shipping.mode !== "pickup") {
        shipping.cost = null;
        updateCartUI();
      }
    });
  }

  async function quoteShipping() {
    const zip = String($("cp")?.value || "").trim();
    if (zip.length < 5 || shipping.mode === "pickup") return;
    if (!cart.length) return;

    shipping.quoting = true;
    updateCartUI();

    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          zip,
          country: shipping.mode === "us" ? "US" : "MX",
          items: cart,
        }),
      });

      const data = await res.json().catch(() => ({}));

      const floor = shipping.mode === "mx" ? 250 : 800;
      shipping.cost = data.ok ? Math.max(Number(data.cost || 0), floor) : floor;
      shipping.label = data.label || (shipping.mode === "us" ? "USA" : "MX");

      // update labels in radio cards if exist
      if (shipping.mode === "mx" && $("price-mx")) $("price-mx").innerText = money(shipping.cost);
      if (shipping.mode === "us" && $("price-us")) $("price-us").innerText = money(shipping.cost);
    } catch (e) {
      const fallback = shipping.mode === "mx" ? 250 : 800;
      shipping.cost = fallback;
      shipping.label = "Fallback";
    } finally {
      shipping.quoting = false;
      updateCartUI();
    }
  }

  function calcSubtotal() {
    return cart.reduce((acc, it) => acc + Number(it.price || 0) * Number(it.qty || 0), 0);
  }

  function updateCartUI() {
    const count = cart.reduce((a, b) => a + Number(b.qty || 0), 0);
    if ($("cartCount")) $("cartCount").innerText = String(count);

    const box = $("cartItems");
    const empty = $("cartEmpty");
    const footer = $("cartFooter");

    if (!cart.length) {
      if (box) box.innerHTML = "";
      if (empty) empty.style.display = "block";
      if (footer) footer.style.display = "none";
      return;
    }

    if (empty) empty.style.display = "none";
    if (footer) footer.style.display = "block";

    if (box) {
      box.innerHTML = cart
        .map(
          (it, idx) => `
          <div class="cartItem">
            <img src="${cleanUrl(it.img)}" class="cartThumb" alt="">
            <div class="cInfo">
              <div class="cName">${it.name || "Producto"}</div>
              <div class="cMeta">${it.size || "Unitalla"}</div>
              <div class="qtyControl" aria-label="Cantidad">
                <button class="qtyBtn" onclick="changeQty(${idx},-1)" aria-label="Menos">-</button>
                <div class="qtyVal">${Number(it.qty || 0)}</div>
                <button class="qtyBtn" onclick="changeQty(${idx},1)" aria-label="Más">+</button>
              </div>
            </div>
            <div class="cRight">
              <div class="cPrice">${money(Number(it.price || 0) * Number(it.qty || 0))}</div>
              <div class="cart-remove" onclick="removeItem(${idx})">Eliminar</div>
            </div>
          </div>`
        )
        .join("");
    }

    const sub = calcSubtotal();
    if ($("subTotal")) $("subTotal").innerText = money(sub);

    if (shipping.mode === "pickup") {
      if ($("shipTotal")) $("shipTotal").innerText = "GRATIS";
      if ($("grandTotal")) $("grandTotal").innerText = money(sub);
    } else if (shipping.quoting) {
      if ($("shipTotal")) $("shipTotal").innerText = "Cotizando…";
      if ($("grandTotal")) $("grandTotal").innerText = money(sub);
    } else if (shipping.cost !== null && shipping.cost !== undefined) {
      if ($("shipTotal")) $("shipTotal").innerText = money(shipping.cost);
      if ($("grandTotal")) $("grandTotal").innerText = money(sub + Number(shipping.cost || 0));
    } else {
      if ($("shipTotal")) $("shipTotal").innerText = "—";
      if ($("grandTotal")) $("grandTotal").innerText = money(sub);
    }

    const btn = $("checkoutBtn");
    if (btn) {
      const needsShip = shipping.mode !== "pickup";
      btn.disabled = needsShip ? !shipping.cost || shipping.quoting : false;
    }
  }

  // === CART OPS ===
  window.changeQty = (idx, delta) => {
    const it = cart[idx];
    if (!it) return;
    it.qty = Number(it.qty || 0) + Number(delta || 0);
    if (it.qty <= 0) cart.splice(idx, 1);
    saveCart();
    updateCartUI();
    if (shipping.mode !== "pickup") quoteShipping();
  };

  window.removeItem = (idx) => {
    if (!cart[idx]) return;
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
    if (shipping.mode !== "pickup") quoteShipping();
  };

  window.emptyCart = () => {
    cart = [];
    saveCart();
    updateCartUI();
    toast("Carrito vaciado");
  };

  // === DRAWER/MODAL ===
  window.openDrawer = () => {
    $("drawer")?.classList.add("active");
    $("overlay")?.classList.add("active");
  };

  window.closeAll = () => {
    $("drawer")?.classList.remove("active");
    $("modalCatalog")?.classList.remove("active");
    $("overlay")?.classList.remove("active");
  };

  window.scrollToId = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth" });
  };

  // === CATALOG MODAL ===
  window.openCatalog = (sectionId, titleFallback) => {
    const section = (catalogData.sections || []).find((s) => s.id === sectionId);
    const title = section?.title || titleFallback || "PRODUCTOS";
    const logo = section?.logo;

    const t = $("catTitle");
    if (t) {
      // LOGO EN VEZ DE TEXTO "BAJA1000" ETC
      t.innerHTML = logo
        ? `<img class="editionLogo" src="${cleanUrl(logo)}" alt="${title}"><span>${title}</span>`
        : `<span>${title}</span>`;
    }

    const items = (catalogData.products || []).filter((p) => p.sectionId === sectionId);

    const container = $("catContent");
    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<p style="text-align:center;padding:40px;color:#ccc;">Agotado.</p>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "catGrid";

      items.forEach((p) => {
        const card = document.createElement("div");
        card.className = "prodCard";
        card.dataset.id = p.id;

        const images = Array.isArray(p.images) && p.images.length ? p.images : [p.img].filter(Boolean);
        const slidesHtml = images
          .map(
            (src) => `
            <div class="prod-slide" style="min-width:100%;display:flex;justify-content:center;">
              <img src="${cleanUrl(src)}" class="prodImg" loading="lazy" alt="${p.name || ""}">
            </div>`
          )
          .join("");

        const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
        const sell = Number(p.baseMXN || 0);
        const list = Math.round(sell * FAKE_MARKUP_FACTOR);

        const sizes = (p.sizes && p.sizes.length ? p.sizes : ["Unitalla"])
          .map((s, i) => `<button class="size-pill ${i === 0 ? "active" : ""}" data-size="${s}" onclick="selectSize(this)">${s}</button>`)
          .join("");

        card.dataset.selSize = defSize;

        card.innerHTML = `
          <div style="position:relative;overflow:hidden;border-radius:14px;margin-bottom:10px;">
            <div style="position:absolute;top:0;right:0;background:#E10600;color:#fff;padding:3px 10px;font-weight:900;font-size:12px;z-index:10;border-bottom-left-radius:12px;">-80%</div>
            <div class="prod-slider" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;">
              ${slidesHtml}
            </div>
          </div>

          <div class="prodName">${p.name || "Producto"}</div>

          <div class="prodPrice">
            <span style="text-decoration:line-through;color:rgba(255,255,255,.55);font-weight:900;">${money(list)}</span>
            <span style="color:#E10600;font-weight:1000;">${money(sell)}</span>
          </div>

          <div class="sizeRow">${sizes}</div>

          <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
        `;

        grid.appendChild(card);
      });

      container.innerHTML = "";
      container.appendChild(grid);
    }

    $("modalCatalog")?.classList.add("active");
    $("overlay")?.classList.add("active");
  };

  window.selectSize = (btn) => {
    const card = btn.closest(".prodCard");
    if (!card) return;
    card.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    card.dataset.selSize = btn.dataset.size || "Unitalla";
  };

  window.addToCart = (pid) => {
    const p = (catalogData.products || []).find((x) => x.id === pid);
    if (!p) return;

    const card = document.querySelector(`.prodCard[data-id="${pid}"]`);
    const size = card?.dataset.selSize || (p.sizes && p.sizes[0]) || "Unitalla";

    const price = Number(p.baseMXN || 0);
    const img = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.img || "");

    const existing = cart.find((x) => x.id === pid && x.size === size);
    if (existing) existing.qty += 1;
    else cart.push({ id: pid, name: p.name, img, size, qty: 1, price });

    saveCart();
    updateCartUI();
    openDrawer();
    toast("Agregado al carrito");
    if (shipping.mode !== "pickup") quoteShipping();
  };

  // === CHECKOUT ===
  window.checkout = async () => {
    if (!cart.length) return toast("Tu carrito está vacío");

    const needsShip = shipping.mode !== "pickup";
    const customer = {
      name: String($("name")?.value || "").trim(),
      address: String($("addr")?.value || "").trim(),
      postal_code: String($("cp")?.value || "").trim(),
    };

    if (needsShip) {
      if (!customer.name || !customer.address || customer.postal_code.length < 5) {
        return toast("Completa nombre, dirección y C.P.");
      }
      if (!shipping.cost || shipping.quoting) {
        return toast("Cotiza envío para continuar");
      }
    }

    const btn = $("checkoutBtn");
    const prev = btn ? btn.innerText : "";
    if (btn) {
      btn.innerText = "PROCESANDO…";
      btn.disabled = true;
    }

    try {
      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cart,
          shippingMode: shipping.mode,
          customer,
          promoCode: appliedPromo,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }
      toast(data?.error || "No se pudo iniciar el pago");
    } catch (e) {
      toast("Error de red. Intenta de nuevo.");
    } finally {
      if (btn) {
        btn.innerText = prev || "PAGAR AHORA";
        btn.disabled = false;
      }
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();