/* SCORE STORE LOGIC — PRO RACING v2026 */
(function () {
  "use strict";

  const CART_KEY = "score_cart_v2026_prod";
  const API_BASE = "/.netlify/functions";

  let cart = [];
  let catalogData = { products: [], editions: [] };
  let shipping = { mode: "pickup", cost: 0, quoting: false };
  let promo = { code: null, discountMXN: 0, type: null, label: null };

  const CFG = window.__SCORE__ || {};

  const $ = (id) => document.getElementById(id);
  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 2400);
  }

  function hideSplash() {
    const s = document.getElementById("splash-screen");
    if (!s) return;
    s.classList.add("hidden");
    setTimeout(() => {
      try {
        s.remove();
      } catch (_) {}
    }, 800);
  }

  async function init() {
    await loadCatalog();
    loadCart();
    setupEvents();
    setupScrollReveal();
    await setupPromoBar(); // opcional, no rompe Lighthouse
    updateCartUI();

    setTimeout(hideSplash, 4000);
    const skipBtn = document.getElementById("skipIntro");
    if (skipBtn) skipBtn.addEventListener("click", hideSplash);
  }

  function setupScrollReveal() {
    const els = document.querySelectorAll(".scroll-reveal");
    if (!els.length) return;

    // Lighthouse-friendly: IntersectionObserver nativo, sin libs pesadas
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

  async function setupPromoBar() {
    const bar = $("promo-bar");
    const text = $("promo-text");
    if (!bar || !text) return;

    try {
      // El repo trae promos.json en raíz. Si lo sirves en /promos.json, esto funciona directo.
      const r = await fetch("/promos.json", { cache: "no-cache" });
      if (!r.ok) return;
      const data = await r.json();
      const rules = Array.isArray(data.rules) ? data.rules : [];

      const active = rules.find((x) => x && x.active);
      if (!active) return;

      // Mensaje corto, no invasivo
      text.textContent = `🔥 ${String(active.description || active.code || "PROMO ACTIVA")}`.trim();
      bar.style.display = "block";
    } catch (_) {
      // si falla, no pasa nada
    }
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json", { cache: "no-cache" });
      const data = await res.json();

      const sections = Array.isArray(data.sections) ? data.sections : [];
      const products = Array.isArray(data.products) ? data.products : [];

      catalogData = {
        editions: sections.map((s) => ({
          id: String(s.id || ""),
          title: String(s.title || ""),
          badge: String(s.badge || ""),
          logo: String(s.logo || ""),
        })),
        products: products.map((p) => ({
          id: String(p.id || ""),
          sku: String(p.sku || ""),
          name: String(p.name || ""),
          baseMXN: Number(p.baseMXN || 0),
          sectionId: String(p.sectionId || ""),
          subSection: String(p.subSection || ""),
          img: String(p.img || ""),
          images: Array.isArray(p.images) ? p.images.map(String) : [],
          sizes: Array.isArray(p.sizes) ? p.sizes.map(String) : ["Unitalla"],
        })),
      };
    } catch (e) {
      console.error("Catalog Fail", e);
      catalogData = { products: [], editions: [] };
    }
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

  function setupEvents() {
    // Shipping mode change
    document.querySelectorAll('input[name="shipMode"]').forEach((r) => {
      r.addEventListener("change", (e) => {
        shipping.mode = String(e.target.value || "pickup");

        const shipForm = $("shipForm");
        if (shipForm) {
          if (shipping.mode === "pickup") {
            shipForm.style.display = "none";
          } else {
            shipForm.style.display = "block";
          }
        }

        if (shipping.mode === "pickup") {
          shipping.cost = 0;
          shipping.quoting = false;
        } else {
          shipping.cost = null;
          if (String($("cp")?.value || "").trim().length >= 5) quoteShipping();
        }

        updateCartUI();
      });
    });

    // ZIP input
    $("cp")?.addEventListener("input", (e) => {
      const v = String(e.target.value || "").trim();
      if (v.length >= 5 && shipping.mode !== "pickup") quoteShipping();
    });

    // Cerrar modales con ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });
  }

  async function quoteShipping() {
    const zip = String($("cp")?.value || "").trim();
    if (!zip || zip.length < 5 || shipping.mode === "pickup") return;

    shipping.quoting = true;
    updateCartUI();

    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip,
          country: shipping.mode === "us" ? "US" : "MX",
          items: cart.map((it) => ({ id: it.id, qty: Number(it.qty || 1) })),
        }),
      });

      const data = await res.json();

      const floor = shipping.mode === "mx" ? 250 : 800;
      const got = data && data.ok ? Number(data.cost || 0) : 0;
      shipping.cost = data && data.ok ? Math.max(got, floor) : floor;
    } catch (e) {
      shipping.cost = shipping.mode === "mx" ? 250 : 800;
    } finally {
      shipping.quoting = false;
      updateCartUI();
    }
  }

  function calcSubtotal() {
    return cart.reduce((acc, it) => acc + Number(it.price || 0) * Number(it.qty || 0), 0);
  }

  function calcDiscount(subtotal) {
    if (!promo.code) return 0;

    const type = promo.type;
    if (!type) return 0;

    if (type === "percent") {
      const pct = Math.min(0.9, Math.max(0, Number(promo.discountMXN || 0)));
      // aquí guardamos percent en discountMXN (por compat), pero en applyPromoUI lo seteo bien
      return Math.round(subtotal * pct);
    }

    if (type === "fixed_mxn") {
      return Math.min(subtotal, Math.max(0, Number(promo.discountMXN || 0)));
    }

    return 0;
  }

  function effectiveShippingCost() {
    if (shipping.mode === "pickup") return 0;
    if (shipping.quoting) return null;
    if (promo.type === "free_shipping") return 0;
    return shipping.cost;
  }

  function updateShippingLabelsUI() {
    // En tu HTML las .rc-price no tienen id, así que actualizamos por value
    const radios = document.querySelectorAll('input[name="shipMode"]');
    radios.forEach((r) => {
      const wrap = r.closest(".radio-card");
      const priceEl = wrap ? wrap.querySelector(".rc-price") : null;
      if (!priceEl) return;

      const val = String(r.value || "");
      if (val === "pickup") {
        priceEl.textContent = "GRATIS";
        return;
      }

      if (promo.type === "free_shipping") {
        priceEl.textContent = "GRATIS";
        return;
      }

      if (shipping.quoting && shipping.mode === val) {
        priceEl.textContent = "Cotizando...";
        return;
      }

      if (shipping.cost != null && shipping.mode === val) {
        priceEl.textContent = money(shipping.cost);
        return;
      }

      // fallback visual
      priceEl.textContent = val === "us" ? "$800 MXN" : "$250 MXN";
    });
  }

  function updateCartUI() {
    const box = $("cartItems");
    const empty = $("cartEmpty");
    const footer = $("cartFooter");

    if (!box || !empty || !footer) return;

    if (!cart.length) {
      box.innerHTML = "";
      empty.style.display = "block";
      footer.style.display = "none";
      if ($("cartCount")) $("cartCount").innerText = "0";
      return;
    }

    empty.style.display = "none";
    footer.style.display = "block";

    box.innerHTML = cart
      .map((it, idx) => {
        const editionLogo = getEditionLogo(it.sectionId);
        const lineTotal = Number(it.price || 0) * Number(it.qty || 0);

        return `
          <div class="cartItem">
            <img src="${safeUrl(it.img)}" class="cartThumb" alt="${escapeHtml(it.name)}">
            <div class="cInfo">
              <div class="cTopRow">
                ${
                  editionLogo
                    ? `<img class="cEdition" src="${safeUrl(editionLogo)}" alt="Edición" loading="lazy">`
                    : ""
                }
                <div class="cName">${escapeHtml(it.name)}</div>
              </div>
              <div class="cMeta">${escapeHtml(it.sku || "")} · Talla ${escapeHtml(it.size)}</div>

              <div class="qtyControl" aria-label="Cantidad">
                <button class="qtyBtn" onclick="changeQty(${idx}, -1)" aria-label="Menos">−</button>
                <span class="qtyVal">${Number(it.qty || 1)}</span>
                <button class="qtyBtn" onclick="changeQty(${idx}, 1)" aria-label="Más">+</button>
              </div>
            </div>

            <div class="cRight">
              <div class="cPrice">${money(lineTotal)}</div>
              <div class="cart-remove" onclick="removeLine(${idx})">Eliminar</div>
            </div>
          </div>
        `;
      })
      .join("");

    const subtotal = calcSubtotal();
    const discount = calcDiscount(subtotal);

    const shipCost = effectiveShippingCost();
    const shipText =
      shipping.mode === "pickup"
        ? "GRATIS"
        : shipCost == null
        ? "Cotizando..."
        : money(shipCost);

    const total =
      shipping.mode === "pickup"
        ? Math.max(0, subtotal - discount)
        : shipCost == null
        ? null
        : Math.max(0, subtotal - discount + shipCost);

    if ($("subTotal")) $("subTotal").innerText = money(subtotal);

    // Si tienes un renglón de descuento opcional, lo inyectamos sin romper layout
    injectDiscountRow(discount);

    if ($("shipTotal")) $("shipTotal").innerText = shipText;
    if ($("grandTotal")) $("grandTotal").innerText = total == null ? "---" : money(total);

    if ($("cartCount")) $("cartCount").innerText = String(cart.reduce((a, b) => a + Number(b.qty || 0), 0));

    const btn = $("checkoutBtn");
    if (btn) {
      const needsShip = shipping.mode !== "pickup";
      const shipOk = !needsShip || (shipCost != null && shipCost >= 0);
      btn.disabled = !shipOk || !cart.length;
    }

    updateShippingLabelsUI();
  }

  function injectDiscountRow(discount) {
    // Si no hay descuento, elimina el row si existe
    const summary = document.querySelector(".cost-summary");
    if (!summary) return;

    let row = document.getElementById("discountRow");
    if (!discount || discount <= 0) {
      if (row) row.remove();
      return;
    }

    if (!row) {
      row = document.createElement("div");
      row.className = "sumRow discount";
      row.id = "discountRow";
      row.innerHTML = `<span>Descuento</span><strong id="discountTotal">-$0.00</strong>`;
      // Insertar después del subtotal
      const first = summary.querySelector(".sumRow");
      if (first && first.nextSibling) {
        summary.insertBefore(row, first.nextSibling);
      } else {
        summary.appendChild(row);
      }
    }

    const val = document.getElementById("discountTotal");
    if (val) val.textContent = `-${money(discount)}`;
  }

  function getEditionLogo(sectionId) {
    const sec = catalogData.editions.find((x) => String(x.id) === String(sectionId));
    return sec ? sec.logo : "";
  }

  function safeUrl(u) {
    const s = String(u || "").trim();
    return s ? encodeURI(s) : "";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ====== API UI ======
  window.openDrawer = () => {
    $("drawer")?.classList.add("active");
    $("overlay")?.classList.add("active");
    $("overlay")?.setAttribute("aria-hidden", "false");
  };

  window.closeAll = () => {
    document.querySelectorAll(".active").forEach((el) => el.classList.remove("active"));
    $("overlay")?.classList.remove("active");
    $("overlay")?.setAttribute("aria-hidden", "true");
  };

  window.emptyCart = () => {
    cart = [];
    promo = { code: null, discountMXN: 0, type: null, label: null };
    const promoInput = $("promoCode");
    if (promoInput) promoInput.value = "";
    saveCart();
    updateCartUI();
    toast("Carrito vaciado");
  };

  window.removeLine = (idx) => {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
    if (shipping.mode !== "pickup" && cart.length) quoteShipping();
  };

  window.changeQty = (idx, delta) => {
    if (!cart[idx]) return;

    const next = Number(cart[idx].qty || 1) + Number(delta || 0);
    if (next <= 0) {
      cart.splice(idx, 1);
    } else {
      cart[idx].qty = next;
    }

    saveCart();
    updateCartUI();

    if (shipping.mode !== "pickup" && cart.length) quoteShipping();
  };

  window.scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  // ====== CATALOGO (Modal) ======
  window.openCatalog = (sectionId) => {
    const modal = $("modalCatalog");
    const content = $("catContent");
    const titleEl = $("catTitle");
    if (!modal || !content || !titleEl) return;

    const sec = catalogData.editions.find((x) => String(x.id) === String(sectionId));
    const title = sec ? sec.title : "PRODUCTOS";
    const logo = sec ? sec.logo : "";

    titleEl.innerHTML = `
      <div class="logo-header">
        ${logo ? `<img src="${safeUrl(logo)}" class="editionLogo" alt="${escapeHtml(title)}" loading="lazy">` : ""}
        <span>${escapeHtml(title)}</span>
      </div>
    `;

    const prods = catalogData.products.filter((p) => String(p.sectionId) === String(sectionId));

    if (!prods.length) {
      content.innerHTML = `<div class="empty-state"><div class="empty-flag">🏁</div><p>No hay productos en esta edición.</p></div>`;
    } else {
      content.innerHTML = `
        <div class="catGrid">
          ${prods
            .map((p) => {
              const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
              const first = sizes[0];

              return `
                <div class="prodCard" data-id="${escapeHtml(p.id)}" data-selsize="${escapeHtml(first)}">
                  <div class="prodEditionStamp">
                    ${logo ? `<img src="${safeUrl(logo)}" class="prodEditionLogo" alt="Edición" loading="lazy">` : ""}
                  </div>

                  <img src="${safeUrl(p.img)}" class="prodImg" alt="${escapeHtml(p.name)}" loading="lazy">

                  <div class="prodName">${escapeHtml(p.name)}</div>
                  <div class="prodSku">${escapeHtml(p.sku || "")}</div>

                  <div class="prodPrice">
                    <strong>${money(p.baseMXN)}</strong>
                    <span class="muted">MXN</span>
                  </div>

                  <div class="sizeRow" role="list">
                    ${sizes
                      .map((s) => {
                        const isA = s === first ? "active" : "";
                        return `<button type="button" class="size-pill ${isA}" onclick="selectSize('${escapeJs(p.id)}','${escapeJs(s)}')">${escapeHtml(
                          s
                        )}</button>`;
                      })
                      .join("")}
                  </div>

                  <button class="btn-add" onclick="addToCart('${escapeJs(p.id)}')">AGREGAR AL CARRITO</button>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    modal.classList.add("active");
    $("overlay")?.classList.add("active");
    $("overlay")?.setAttribute("aria-hidden", "false");
  };

  window.selectSize = (pid, size) => {
    const card = document.querySelector(`.prodCard[data-id="${cssEscape(pid)}"]`);
    if (!card) return;

    card.dataset.selsize = String(size);

    // Toggle pills
    const pills = card.querySelectorAll(".size-pill");
    pills.forEach((b) => {
      const t = b.textContent || "";
      if (t.trim() === String(size).trim()) b.classList.add("active");
      else b.classList.remove("active");
    });
  };

  window.addToCart = (pid) => {
    const p = catalogData.products.find((x) => String(x.id) === String(pid));
    if (!p) return;

    const card = document.querySelector(`.prodCard[data-id="${cssEscape(pid)}"]`);
    const sel = card?.dataset.selsize || (Array.isArray(p.sizes) && p.sizes[0]) || "Unitalla";

    const exist = cart.find((x) => String(x.id) === String(pid) && String(x.size) === String(sel));
    if (exist) {
      exist.qty = Number(exist.qty || 1) + 1;
    } else {
      cart.push({
        id: p.id,
        sku: p.sku,
        name: p.name,
        img: p.img,
        sectionId: p.sectionId,
        size: String(sel),
        qty: 1,
        price: Number(p.baseMXN || 0),
      });
    }

    saveCart();
    updateCartUI();
    openDrawer();

    if (shipping.mode !== "pickup") quoteShipping();
    toast("Agregado al carrito");
  };

  // ====== PROMO ======
  const PROMO_RULES = {
    SCORE25: { type: "percent", value: 0.25, label: "25% OFF" },
    BAJA25: { type: "percent", value: 0.25, label: "25% OFF" },
    SCORE10: { type: "percent", value: 0.10, label: "10% OFF" },
    BAJA200: { type: "fixed_mxn", value: 200, label: "$200 MXN OFF" },
    ENVIOFREE: { type: "free_shipping", value: 0, label: "ENVÍO GRATIS" },
  };

  window.applyPromoUI = () => {
    const raw = String($("promoCode")?.value || "").trim().toUpperCase();
    if (!raw) {
      promo = { code: null, discountMXN: 0, type: null, label: null };
      updateCartUI();
      toast("Código removido");
      return;
    }

    const rule = PROMO_RULES[raw];
    if (!rule) {
      promo = { code: null, discountMXN: 0, type: null, label: null };
      updateCartUI();
      toast("Código inválido");
      return;
    }

    promo.code = raw;
    promo.type = rule.type;
    promo.label = rule.label || raw;

    // Guardamos distinto según tipo
    if (rule.type === "percent") {
      promo.discountMXN = Number(rule.value || 0); // aquí es percent
    } else if (rule.type === "fixed_mxn") {
      promo.discountMXN = Number(rule.value || 0);
    } else {
      promo.discountMXN = 0;
    }

    updateCartUI();
    toast(`Promo aplicada: ${promo.label}`);
  };

  // ====== CHECKOUT ======
  window.checkout = async () => {
    const btn = $("checkoutBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "PROCESANDO...";
    }

    try {
      if (!cart.length) throw new Error("Carrito vacío");

      if (shipping.mode !== "pickup") {
        const zip = String($("cp")?.value || "").trim();
        const name = String($("name")?.value || "").trim();
        const addr = String($("addr")?.value || "").trim();

        if (zip.length < 5 || !name || !addr) {
          throw new Error("Completa dirección (C.P., nombre y dirección)");
        }

        // Si aún no cotizó, fuerza cotización
        if (shipping.cost == null || shipping.quoting) {
          await quoteShipping();
        }
      }

      const customer = {
        name: String($("name")?.value || "").trim(),
        address: String($("addr")?.value || "").trim(),
        postal_code: String($("cp")?.value || "").trim(),
      };

      const payload = {
        orgSlug: String(CFG.orgSlug || "score-store"),
        items: cart.map((it) => ({
          id: it.id,
          sku: it.sku,
          name: it.name,
          img: it.img,
          size: it.size,
          qty: Number(it.qty || 1),
          price: Number(it.price || 0),
        })),
        mode: shipping.mode,
        shippingMode: shipping.mode,
        customer,
        promoCode: promo.code || "",
      };

      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(String(data?.error || "Checkout falló"));

      if (data && data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("No se generó URL de pago");
    } catch (e) {
      toast(String(e?.message || "Error en checkout"));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "PAGAR AHORA";
      }
    }
  };

  // ===== Utils =====
  function escapeJs(s) {
    return String(s || "").replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll('"', '\\"');
  }

  function cssEscape(s) {
    // mini escape para querySelector, sin depender de CSS.escape (Android viejo)
    return String(s || "").replaceAll('"', '\\"').replaceAll("\\", "\\\\");
  }

  document.addEventListener("DOMContentLoaded", init);
})();