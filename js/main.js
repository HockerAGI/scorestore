// /js/main.js
// SCORE Store — FrontEnd Maestro (Producción)
// Sin dependencias externas. PWA-friendly.

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = "cart_v1";

  const state = {
    catalog: null,
    promos: null,
    activeSectionId: null,

    cart: [],
    shipping: {
      mode: "", // pickup | tj | mx
      mxn: 0,
      carrier: "",
      service: "",
      note: "",
    },
    promo: {
      code: "",
      discountMXN: 0,
      shippingMXN: 0,
      totalMXN: 0,
      note: "",
    },
  };

  /* ================== UTIL ================== */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const toStr = (v) => (v ?? "").toString().trim();
  const upper = (v) => toStr(v).toUpperCase();

  function formatMXN(v) {
    const n = Number(v || 0);
    return `$${n.toLocaleString("es-MX")} MXN`;
  }

  let toastT = null;
  function toast(msg, type = "") {
    const el = $("toast");
    if (!el) return;

    el.textContent = msg;
    el.classList.remove("ok", "bad");
    if (type) el.classList.add(type);
    el.classList.add("show");

    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      state.cart = Array.isArray(parsed) ? parsed : [];
    } catch {
      state.cart = [];
    }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  }

  function cartCount() {
    return state.cart.reduce((a, b) => a + Number(b.qty || 0), 0);
  }

  function cartSubtotalMXN() {
    return state.cart.reduce((a, it) => a + Number(it.price || 0) * Number(it.qty || 0), 0);
  }

  /* ================== PROMOS (CLIENT-SIDE, PARA PREVIEW) ================== */
  function applyPromoLocal({ promoCode, subtotalMXN, shippingMXN }) {
    const code = upper(promoCode).replace(/\s+/g, "");
    if (!code) {
      return { code: "", discountMXN: 0, shippingMXN, totalMXN: subtotalMXN + shippingMXN };
    }

    const rule = (state.promos?.rules || []).find((r) => upper(r.code).replace(/\s+/g, "") === code);

    if (!rule || !rule.active) {
      return {
        code,
        discountMXN: 0,
        shippingMXN,
        totalMXN: subtotalMXN + shippingMXN,
        note: "Cupón inválido o desactivado.",
      };
    }

    let discountMXN = 0;
    let newShipping = shippingMXN;

    if (rule.type === "percent") {
      discountMXN = Math.round(subtotalMXN * Number(rule.value || 0));
    } else if (rule.type === "fixed_mxn") {
      discountMXN = Math.round(Number(rule.value || 0));
    } else if (rule.type === "free_shipping") {
      newShipping = 0;
    } else if (rule.type === "free_total") {
      // Stripe no cobra $0. Dejamos vista previa, pero checkout lo bloqueará.
      discountMXN = subtotalMXN;
      newShipping = 0;
    }

    discountMXN = clamp(discountMXN, 0, subtotalMXN);
    const totalMXN = Math.max(0, Math.round(subtotalMXN - discountMXN + newShipping));
    return { code, discountMXN, shippingMXN: newShipping, totalMXN };
  }

  /* ================== UI: DRAWER ================== */
  function openDrawer() {
    $("drawer")?.classList.add("active");
    $("overlay")?.classList.add("active");
    document.body.style.overflow = "hidden";
    renderCart();
    updateTotals();
  }

  function closeAll() {
    $("drawer")?.classList.remove("active");
    $("overlay")?.classList.remove("active");
    document.body.style.overflow = "";
  }

  /* ================== CATALOGO ================== */
  function sectionsSorted() {
    const secs = Array.isArray(state.catalog?.sections) ? state.catalog.sections.slice() : [];
    return secs.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  function renderSectionNav() {
    const nav = $("sectionNav");
    if (!nav) return;

    const secs = sectionsSorted();
    const allBtn = `<button class="nav-pill ${!state.activeSectionId ? "active" : ""}" data-sec="">TODO</button>`;
    const rest = secs
      .map(
        (s) =>
          `<button class="nav-pill ${state.activeSectionId === s.id ? "active" : ""}" data-sec="${s.id}">${s.title}</button>`
      )
      .join("");

    nav.innerHTML = allBtn + rest;
  }

  function productsForActiveSection() {
    const prods = Array.isArray(state.catalog?.products) ? state.catalog.products.slice() : [];
    if (!state.activeSectionId) return prods;
    return prods.filter((p) => p.sectionId === state.activeSectionId);
  }

  function renderCatalog() {
    const grid = $("catGrid");
    if (!grid) return;
    if (!state.catalog) {
      grid.innerHTML = `<div style="opacity:.6">Cargando catálogo…</div>`;
      return;
    }

    const prods = productsForActiveSection();

    grid.innerHTML = prods
      .map((p) => {
        const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Única"];
        return `
          <div class="prodCard">
            <img class="prodImg" src="${p.img}" alt="${p.name}" loading="lazy" />
            <div class="prodInfo">
              <div class="prodMeta">${toStr(p.subSection || "")}</div>
              <div class="prodTitle">${p.name}</div>
              <select id="size_${p.id}" class="prodSelect" aria-label="Talla">
                ${sizes.map((s) => `<option value="${s}">${s}</option>`).join("")}
              </select>
              <div class="prodPrice">${formatMXN(p.baseMXN)}</div>
              <button class="btn-add" type="button" data-add="${p.id}">AGREGAR</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  /* ================== CART ================== */
  function addToCart(productId) {
    const p = state.catalog?.products?.find((x) => x.id === productId);
    if (!p) return;

    const size = toStr($(`size_${productId}`)?.value) || "Única";
    const key = `${productId}__${size}`;

    const existing = state.cart.find((i) => i.key === key);
    if (existing) existing.qty = clamp(Number(existing.qty || 1) + 1, 1, 20);
    else
      state.cart.push({
        key,
        id: p.id,
        name: p.name,
        img: p.img,
        price: Number(p.baseMXN || 0),
        size,
        qty: 1,
      });

    saveCart();
    updateBadge();
    toast("Agregado al carrito ✅", "ok");
    openDrawer();
  }

  function removeAt(idx) {
    state.cart.splice(idx, 1);
    saveCart();
    updateBadge();
    renderCart();
    updateTotals();
  }

  function renderCart() {
    const box = $("cartBody");
    if (!box) return;

    if (!state.cart.length) {
      box.innerHTML = `<div style="text-align:center;opacity:.5;padding:20px 0">Carrito vacío</div>`;
      return;
    }

    box.innerHTML = state.cart
      .map(
        (i, x) => `
        <div class="cart-item">
          <img src="${i.img}" alt="${i.name}" loading="lazy" />
          <div class="cart-item-details">
            <div class="cart-item-title">${i.name}</div>
            <div>Talla: ${toStr(i.size) || "Única"}</div>
            <div>${formatMXN(Number(i.price || 0))} × ${Number(i.qty || 1)}</div>
          </div>
          <div>
            <div>x${Number(i.qty || 1)}</div>
            <div class="cart-remove" data-rm="${x}">Eliminar</div>
          </div>
        </div>
      `
      )
      .join("");
  }

  function updateBadge() {
    const n = cartCount();
    const el = $("cartCount");
    if (el) el.textContent = String(n);
  }

  /* ================== SHIPPING + TOTALS ================== */
  function getShipMode() {
    return toStr($("shipMethod")?.value);
  }

  function getToPayload() {
    return {
      postal_code: toStr($("cp")?.value),
      state_code: upper($("state")?.value),
      city: toStr($("city")?.value),
      address1: toStr($("addr")?.value),
      name: toStr($("name")?.value),
      email: toStr($("email")?.value),
      phone: toStr($("phone")?.value),
    };
  }

  function ensureTijuanaPrefill() {
    if (getShipMode() !== "tj") return;
    if (!$("state")?.value) $("state").value = "BC";
    if (!$("city")?.value) $("city").value = "Tijuana";
  }

  function showShipForm(show) {
    const el = $("shipForm");
    if (el) el.style.display = show ? "block" : "none";
  }

  function setQuoteResult(text, type = "") {
    const el = $("quoteResult");
    if (!el) return;
    el.classList.remove("ok", "bad");
    if (type) el.classList.add(type);
    el.textContent = text || "";
  }

  function setPromoNote(text, type = "") {
    const el = $("promoNote");
    if (!el) return;
    el.classList.remove("ok", "bad");
    if (type) el.classList.add(type);
    el.textContent = text || "";
  }

  function validateForQuote() {
    const mode = getShipMode();
    const to = getToPayload();

    if (mode === "pickup") return false;
    if (to.postal_code.length !== 5) return false;

    if (mode === "tj") return true;

    if (to.state_code.length < 2) return false;
    if (to.city.length < 2) return false;
    if (to.address1.length < 6) return false;
    return true;
  }

  function validateForPay() {
    const mode = getShipMode();
    const to = getToPayload();

    if (!state.cart.length) return false;
    if (!mode) return false;

    if (to.name.length < 3) return false;
    if (to.email.length < 5 || !to.email.includes("@")) return false;
    if (to.phone.length < 7) return false;

    if (mode === "pickup") return true;

    if (to.postal_code.length !== 5) return false;
    if (to.address1.length < 6) return false;

    if (mode === "tj") return state.shipping.mxn > 0 || validateForQuote();

    if (to.state_code.length < 2) return false;
    if (to.city.length < 2) return false;
    return state.shipping.mxn > 0 || validateForQuote();
  }

  function updateTotals() {
    const sub = cartSubtotalMXN();
    const ship = Number(state.shipping.mxn || 0);

    const promoCode = toStr($("promo")?.value);
    state.promo = applyPromoLocal({ promoCode, subtotalMXN: sub, shippingMXN: ship });

    $("lnSub").textContent = formatMXN(sub);
    $("lnShip").textContent = formatMXN(state.promo.shippingMXN ?? ship);
    $("lnTotal").textContent = formatMXN(state.promo.totalMXN ?? sub + ship);

    const discountRow = $("discountRow");
    if (discountRow) {
      const d = Number(state.promo.discountMXN || 0);
      discountRow.style.display = d > 0 ? "flex" : "none";
      const ln = $("lnDiscount");
      if (ln) ln.textContent = `-${formatMXN(d).replace(" MXN", "")} MXN`;
    }

    if (state.promo?.code && state.promo?.note) setPromoNote(state.promo.note, "bad");
    else if (state.promo?.code && (state.promo.discountMXN > 0 || ship !== state.promo.shippingMXN))
      setPromoNote(`Cupón aplicado: ${state.promo.code}`, "ok");
    else setPromoNote("");

    const btn = $("payBtn");
    if (btn) btn.disabled = !validateForPay();
  }

  function renderShipSummary() {
    const mode = getShipMode();

    if (mode === "pickup") {
      state.shipping = { mode, mxn: 0, carrier: "TIJUANA", service: "Recolección en fábrica", note: "Gratis" };
      setQuoteResult("Recolección en fábrica: GRATIS ✅", "ok");
      updateTotals();
      return;
    }

    if (!state.shipping?.mxn) {
      setQuoteResult("Cotiza tu envío para ver el total.", "");
      updateTotals();
      return;
    }

    const msgParts = [];
    if (state.shipping.carrier || state.shipping.service) {
      msgParts.push(`${state.shipping.carrier} ${state.shipping.service}`.trim());
    }
    msgParts.push(`Envío: ${formatMXN(state.shipping.mxn)}`);
    if (state.shipping.note) msgParts.push(state.shipping.note);

    setQuoteResult(msgParts.join(" · "), "ok");
    updateTotals();
  }

  let quoteTimer = null;
  function debounceQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => quoteShipping().catch(() => {}), 550);
  }

  async function quoteShipping() {
    if (!state.cart.length) {
      state.shipping.mxn = 0;
      renderShipSummary();
      return;
    }

    const mode = getShipMode();
    ensureTijuanaPrefill();

    if (!validateForQuote()) {
      state.shipping.mxn = 0;
      setQuoteResult("Completa tu dirección para cotizar.", "");
      updateTotals();
      return;
    }

    setQuoteResult("Cotizando envío…", "");

    const to = getToPayload();

    const payload = {
      mode,
      items: state.cart.map((it) => ({ id: it.id, size: it.size, qty: it.qty })),
      to: {
        postal_code: to.postal_code,
        state_code: to.state_code,
        city: to.city,
        address1: to.address1,
      },
    };

    const res = await fetch("/.netlify/functions/quote_shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      state.shipping.mxn = 0;
      setQuoteResult(data?.error || "No se pudo cotizar envío.", "bad");
      updateTotals();
      return;
    }

    state.shipping = {
      mode,
      mxn: Number(data.mxn || 0),
      carrier: toStr(data.carrier || ""),
      service: toStr(data.service || ""),
      note: toStr(data.note || ""),
    };

    renderShipSummary();
  }

  /* ================== CHECKOUT ================== */
  async function checkout() {
    if (!validateForPay()) {
      toast("Falta completar envío/cliente para pagar.", "bad");
      return;
    }

    if (Number(state.promo?.totalMXN || 0) <= 0) {
      toast("Ese cupón deja el total en $0. No se puede cobrar por Stripe.", "bad");
      return;
    }

    const btn = $("payBtn");
    if (btn) btn.disabled = true;

    const mode = getShipMode();
    ensureTijuanaPrefill();
    const to = getToPayload();

    const payload = {
      items: state.cart.map((it) => ({ id: it.id, size: it.size, qty: it.qty })),
      mode,
      promoCode: toStr($("promo")?.value),
      to: {
        postal_code: to.postal_code,
        state_code: to.state_code,
        city: to.city,
        address1: to.address1,
        name: to.name,
        email: to.email,
        phone: to.phone,
      },
    };

    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok || !data?.url) {
      toast(data?.error || "Error creando checkout.", "bad");
      updateTotals();
      return;
    }

    window.location.href = data.url;
  }

  /* ================== EVENTS ================== */
  function bindEvents() {
    $("cartBtn")?.addEventListener("click", openDrawer);
    $("closeDrawerBtn")?.addEventListener("click", closeAll);
    $("overlay")?.addEventListener("click", closeAll);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });

    $("heroCtaBtn")?.addEventListener("click", () => {
      $("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    $("sectionNav")?.addEventListener("click", (e) => {
      const btn = e.target?.closest("[data-sec]");
      if (!btn) return;
      state.activeSectionId = toStr(btn.getAttribute("data-sec")) || null;
      renderSectionNav();
      renderCatalog();
    });

    $("catGrid")?.addEventListener("click", (e) => {
      const btn = e.target?.closest("[data-add]");
      if (!btn) return;
      addToCart(toStr(btn.getAttribute("data-add")));
    });

    $("cartBody")?.addEventListener("click", (e) => {
      const rm = e.target?.closest("[data-rm]");
      if (!rm) return;
      const idx = Number(rm.getAttribute("data-rm"));
      if (Number.isFinite(idx)) removeAt(idx);
    });

    $("shipMethod")?.addEventListener("change", () => {
      const mode = getShipMode();
      showShipForm(!!mode);

      state.shipping = { mode, mxn: 0, carrier: "", service: "", note: "" };

      if (mode === "pickup") {
        renderShipSummary();
        updateTotals();
        return;
      }

      if (mode === "tj") ensureTijuanaPrefill();
      debounceQuote();
      updateTotals();
    });

    ["cp", "state", "city", "addr", "name", "email", "phone"].forEach((id) => {
      $(id)?.addEventListener("input", () => {
        if (id === "cp" || id === "state" || id === "city" || id === "addr") debounceQuote();
        updateTotals();
      });
    });

    $("promoBtn")?.addEventListener("click", () => updateTotals());
    $("promo")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        updateTotals();
      }
    });

    $("payBtn")?.addEventListener("click", checkout);

    window.addEventListener("offline", () => toast("Sin internet. Algunas funciones pueden fallar.", "bad"));
    window.addEventListener("online", () => toast("De vuelta en línea ✅", "ok"));
  }

  /* ================== INIT ================== */
  async function init() {
    loadCart();
    updateBadge();
    bindEvents();

    const qs = new URLSearchParams(window.location.search);
    const status = qs.get("status");
    if (status === "success") {
      toast("Pago confirmado ✅ Te contactamos por WhatsApp/Email.", "ok");
      state.cart = [];
      saveCart();
      updateBadge();
      renderCart();
      updateTotals();
      history.replaceState({}, "", window.location.pathname);
    } else if (status === "cancel") {
      toast("Pago cancelado. Tu carrito sigue aquí.", "bad");
      history.replaceState({}, "", window.location.pathname);
    }

    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("/sw.js"); } catch {}
    }

    try {
      const [catalogRes, promosRes] = await Promise.all([
        fetch("/data/catalog.json", { cache: "no-store" }),
        fetch("/data/promos.json", { cache: "no-store" }),
      ]);
      state.catalog = await catalogRes.json();
      state.promos = await promosRes.json();

      renderSectionNav();
      renderCatalog();
      renderCart();
      updateTotals();
    } catch (e) {
      console.error(e);
      toast("No se pudo cargar el catálogo.", "bad");
    }
  }

  init();
})();