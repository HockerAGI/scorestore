/* =========================================================
   SCORE STORE — MAIN v2026_PROD_UNIFIED_361
   Mobile-first · Premium · Real-time shipping quote · Cart drawer · AI chat
   ========================================================= */
(() => {
  "use strict";

  const VERSION = "2026_PROD_UNIFIED_361";

  const CONFIG = {
    currency: "MXN",
    locale: "es-MX",
    catalogUrl: `/catalog.json?v=${VERSION}`,
    endpoints: {
      shippingQuote: "/.netlify/functions/quote_shipping",
      createCheckout: "/.netlify/functions/create_checkout",
      chat: "/.netlify/functions/chat"
    }
  };

  // -------------------- DOM --------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = {
    splash: $("#splash-screen"),
    rpmBar: $(".rpm-bar"),
    rpmCounter: $("#revCounter"),

    productsGrid: $("#productsGrid"),
    chips: $$(".chip"),

    cartBtn: $("#cartBtn"),
    cartCount: $("#cartCount"),
    cartDrawer: $("#cartDrawer"),
    cartItems: $("#cartItems"),
    cartSubtotal: $("#cartSubtotal"),
    cartShipping: $("#cartShipping"),
    cartTotal: $("#cartTotal"),
    cartShipLabel: $("#cartShipLabel"),
    checkoutBtn: $("#checkoutBtn"),

    pageOverlay: $("#pageOverlay"),
    backdrop: $("#backdrop"),

    shipCountry: $("#shipCountry"),
    shipZip: $("#shipZip"),
    shipQuote: $("#shipQuote"),

    shippingModeSelect: $("#shippingMode"),
    shipModeRadios: $$("input[name='shipMode']"),
    miniZip: $("#miniZip"),
    miniShipLabel: $("#miniShipLabel"),

    toast: $("#toast"),

    aiFloatBtn: $(".ai-btn-float"),
    aiModal: $("#aiChatModal"),
    aiMessages: $("#aiMessages"),
    aiInput: $("#aiInput"),
    aiSendBtn: $(".ai-send"),

    legalModal: $("#legalModal"),
    legalBackdrop: $("#legalBackdrop"),
    legalTitle: $("#legalTitle"),
    legalBody: $("#legalBody"),
    legalClose: $("#legalClose"),
    legalLinks: $$(".jsLegalLink"),

    cookieBanner: $("#cookieBanner")
  };

  // -------------------- STATE --------------------
  const state = {
    products: [],
    filter: "ALL",
    cart: [], // {id, name, price, size, qty, image}
    shipping: {
      mode: "pickup", // pickup | mx | us
      zip: "",
      quote: null // {cost, etaDays}
    },
    soundUnlocked: false,
    notifTimer: null,
    quoteTimer: null,
    lastQuoteKey: ""
  };

  // -------------------- HELPERS --------------------
  const money = (n) => {
    const v = Number(n || 0);
    try {
      return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(v);
    } catch {
      return `$${Math.round(v)}`;
    }
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const debounce = (fn, ms) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const safeText = (s) => String(s ?? "").replace(/[<>]/g, "");

  const toast = (msg, type = "info") => {
    if (!el.toast) return;
    el.toast.className = `toast ${type}`;
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    setTimeout(() => el.toast.classList.remove("show"), 2600);
  };

  const lockScroll = (lock) => {
    document.documentElement.classList.toggle("noScroll", !!lock);
    document.body.classList.toggle("noScroll", !!lock);
  };

  // Sound (no assets; WebAudio beep)
  let audioCtx = null;
  const beep = (freq = 440, dur = 0.06, gain = 0.04) => {
    try {
      if (!state.soundUnlocked) return;
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        o.disconnect();
        g.disconnect();
      }, dur * 1000);
    } catch {}
  };

  const unlockSound = () => {
    if (state.soundUnlocked) return;
    state.soundUnlocked = true;
    beep(880, 0.03, 0.02);
  };

  // -------------------- SPLASH --------------------
  const runSplash = () => {
    if (!el.splash) return;

    const start = performance.now();
    const tick = (t) => {
      const p = clamp((t - start) / 900, 0, 1);
      const rpm = Math.round(p * 9000);
      if (el.rpmBar) el.rpmBar.style.width = `${Math.round(p * 100)}%`;
      if (el.rpmCounter) el.rpmCounter.textContent = `${rpm.toLocaleString("es-MX")} RPM`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    window.addEventListener("load", () => {
      setTimeout(() => {
        el.splash.style.opacity = "0";
        el.splash.style.visibility = "hidden";
        el.splash.setAttribute("aria-hidden", "true");
      }, 950);
    });
  };

  // -------------------- CATALOG --------------------
  const normalizeProduct = (p) => {
    const images = Array.isArray(p.images) ? p.images.filter(Boolean) : (p.image ? [p.image] : []);
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL"];
    return {
      id: String(p.id ?? p.sku ?? p.slug ?? p.name),
      name: String(p.name ?? "Producto"),
      category: String((p.category ?? (p.subSection || p.subsection) ?? "ALL")),
      tags: Array.isArray(p.tags) ? p.tags : [],
      price: Number(p.price ?? p.mxn ?? p.baseMXN ?? 0),
      badge: String(p.badge ?? ""),
      images,
      sizes
    };
  };

  const productMatchesFilter = (p) => {
    if (state.filter === "ALL") return true;
    const f = state.filter;
    let cat = String(p.category || "").toUpperCase();
    // normalize common names
    if (cat.includes("TEE")) cat = "TEES";
    if (cat.includes("HOOD")) cat = "HOODIES";
    if (cat.includes("HAT") || cat.includes("CAP")) cat = "HATS";
    const tags = (p.tags || []).map(x => String(x).toUpperCase());
    return cat === f || tags.includes(f);
  };

  const renderProducts = () => {
    if (!el.productsGrid) return;
    const list = state.products.filter(productMatchesFilter);

    el.productsGrid.innerHTML = list.map((p) => {
      const imgHtml = (p.images.length > 1)
        ? `
          <div class="carousel" data-carousel="${p.id}">
            ${p.images.map((src, i) => `
              <div class="carousel-item">
                <img class="prodImg" src="${src}" alt="${safeText(p.name)}" loading="lazy" decoding="async" onerror="this.style.display='none'">
              </div>`).join("")}
          </div>
          <div class="carousel-dots" data-dots="${p.id}">
            ${p.images.map((_, i) => `<span class="dot ${i===0?'active':''}"></span>`).join("")}
          </div>
        `
        : `
          <img class="prodImg" src="${p.images[0] || "/assets/fallback.webp"}" alt="${safeText(p.name)}" loading="lazy" decoding="async" onerror="this.src='/assets/fallback.webp'">
        `;

      const sizeOptions = p.sizes.map(s => `<option value="${safeText(s)}">${safeText(s)}</option>`).join("");

      return `
        <article class="card" data-prod="${p.id}">
          <div class="card-texture" aria-hidden="true"></div>
          <div class="cardMedia" style="position:relative">
            ${imgHtml}
            ${p.badge ? `<div class="badge">${safeText(p.badge)}</div>` : ""}
          </div>

          <div class="cardBody">
            <div class="prodTitle">${safeText(p.name)}</div>
            <div class="prodMeta">Oficial · Off-Road · Único Uniformes</div>
            <div class="prodPrice">${money(p.price)}</div>

            <select class="size-selector" aria-label="Talla">
              ${sizeOptions}
            </select>
          </div>

          <button class="card-btn" type="button" data-add="${p.id}">
            <i class="fa-solid fa-plus"></i> AGREGAR AL CARRITO
          </button>
        </article>
      `;
    }).join("");

    bindCatalogInteractions();
  };

  const bindCatalogInteractions = () => {
    // add buttons
    $$("[data-add]").forEach(btn => {
      btn.addEventListener("click", () => {
        unlockSound();
        const id = btn.getAttribute("data-add");
        const card = btn.closest("[data-prod]");
        const p = state.products.find(x => x.id === id);
        if (!p) return;

        const sizeSel = card ? $(".size-selector", card) : null;
        const size = sizeSel ? sizeSel.value : (p.sizes[0] || "M");

        addToCart(p, size);
      }, { passive: true });
    });

    // carousels dots
    $$("[data-carousel]").forEach(car => {
      const id = car.getAttribute("data-carousel");
      const dotsWrap = $(`[data-dots="${CSS.escape(id)}"]`);
      if (!dotsWrap) return;

      const onScroll = debounce(() => {
        const w = car.clientWidth || 1;
        const idx = Math.round(car.scrollLeft / w);
        $$(".dot", dotsWrap).forEach((d, i) => d.classList.toggle("active", i === idx));
      }, 80);

      car.addEventListener("scroll", onScroll, { passive: true });
    });
  };

  // -------------------- FILTERS --------------------
  const bindFilters = () => {
    el.chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        unlockSound();
        el.chips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        state.filter = chip.getAttribute("data-filter") || "ALL";
        renderProducts();
        beep(680, 0.04, 0.03);
      }, { passive: true });
    });
  };

  // -------------------- CART --------------------
  const calcSubtotal = () => state.cart.reduce((sum, it) => sum + (Number(it.price) * Number(it.qty)), 0);

  const updateCartCount = () => {
    const count = state.cart.reduce((sum, it) => sum + it.qty, 0);
    if (el.cartCount) el.cartCount.textContent = String(count);
  };

  const addToCart = (p, size) => {
    const key = `${p.id}__${size}`;
    const existing = state.cart.find(x => x.key === key);
    if (existing) existing.qty += 1;
    else state.cart.push({
      key,
      id: p.id,
      name: p.name,
      price: p.price,
      size,
      qty: 1,
      image: p.images[0] || "/assets/fallback.webp"
    });

    updateCartUI();
    toast("Agregado al carrito.", "success");
    beep(920, 0.05, 0.04);
  };

  const changeQty = (key, delta) => {
    const it = state.cart.find(x => x.key === key);
    if (!it) return;
    it.qty = clamp(it.qty + delta, 0, 99);
    if (it.qty === 0) state.cart = state.cart.filter(x => x.key !== key);
    updateCartUI();
    beep(delta > 0 ? 820 : 420, 0.04, 0.03);
  };

  const openCart = () => {
    if (!el.cartDrawer) return;
    el.cartDrawer.classList.add("active", "open");
    if (el.pageOverlay) el.pageOverlay.classList.add("active", "show");
    if (el.backdrop) el.backdrop.classList.add("active", "show");
    lockScroll(true);
  };

  const closeCart = () => {
    if (!el.cartDrawer) return;
    el.cartDrawer.classList.remove("active", "open");
    if (el.pageOverlay) el.pageOverlay.classList.remove("active", "show");
    if (el.backdrop) el.backdrop.classList.remove("active", "show");
    lockScroll(false);
  };

  const updateShipUI = () => {
    const mode = state.shipping.mode;

    if (el.miniZip) el.miniZip.style.display = (mode === "mx" || mode === "us") ? "block" : "none";
    if (el.miniZip) el.miniZip.placeholder = mode === "us" ? "ZIP (USA)" : "Código Postal (MX)";

    const label = mode === "pickup"
      ? "Pickup Gratis"
      : mode === "mx"
        ? "Envío México"
        : "Envío USA";

    if (el.miniShipLabel) el.miniShipLabel.textContent = label;
    if (el.cartShipLabel) el.cartShipLabel.textContent = label;
  };

  const updateTotalsUI = () => {
    const subtotal = calcSubtotal();
    const shipCost = state.shipping.mode === "pickup" ? 0 : Number(state.shipping.quote?.cost || 0);
    const total = subtotal + shipCost;

    if (el.cartSubtotal) el.cartSubtotal.textContent = money(subtotal);

    if (el.cartShipping) {
      if (state.shipping.mode === "pickup") el.cartShipping.textContent = "Gratis";
      else el.cartShipping.textContent = shipCost ? money(shipCost) : "—";
    }

    if (el.cartTotal) el.cartTotal.textContent = money(total);

    if (el.checkoutBtn) el.checkoutBtn.disabled = state.cart.length === 0;
  };

  const renderCartItems = () => {
    if (!el.cartItems) return;

    if (state.cart.length === 0) {
      el.cartItems.innerHTML = `<div class="muted">Tu carrito está vacío. Elige una prenda y dale <b>AGREGAR</b>.</div>`;
      return;
    }

    el.cartItems.innerHTML = state.cart.map(it => `
      <div class="cart-card" data-key="${safeText(it.key)}">
        <img class="cart-thumb" src="${it.image}" alt="" loading="lazy" decoding="async" onerror="this.src='/assets/fallback.webp'">
        <div class="cart-info">
          <div class="cart-name">${safeText(it.name)}</div>
          <div class="cart-sub">Talla: <b>${safeText(it.size)}</b></div>
          <div class="cart-row">
            <div class="qty">
              <button class="qtyBtn" type="button" data-qty="-1">-</button>
              <div class="qtyNum">${it.qty}</div>
              <button class="qtyBtn" type="button" data-qty="1">+</button>
            </div>
            <div class="cartPrice">${money(Number(it.price) * it.qty)}</div>
          </div>
        </div>
      </div>
    `).join("");

    $$("[data-key]").forEach(card => {
      const key = card.getAttribute("data-key");
      const btns = $$("[data-qty]", card);
      btns.forEach(b => {
        b.addEventListener("click", () => {
          unlockSound();
          changeQty(key, Number(b.getAttribute("data-qty")));
        }, { passive: true });
      });
    });
  };

  const updateCartUI = () => {
    updateCartCount();
    renderCartItems();
    updateTotalsUI();

    // quote if needed
    if (state.shipping.mode !== "pickup") requestShippingQuote();
  };

  // -------------------- SHIPPING QUOTE --------------------
  const shipModeToCountry = (mode) => (mode === "us" ? "US" : "MX");

  const requestShippingQuote = debounce(async () => {
    if (state.shipping.mode === "pickup") {
      state.shipping.quote = { cost: 0, etaDays: null };
      updateTotalsUI();
      return;
    }

    const zip = String(state.shipping.zip || "").trim();
    const country = shipModeToCountry(state.shipping.mode);
    const minZip = country === "US" ? 5 : 4;

    if (zip.length < minZip) {
      state.shipping.quote = null;
      updateTotalsUI();
      return;
    }

    const items = state.cart.map(it => ({ id: it.id, qty: it.qty }));
    if (!items.length) return;

    const key = `${country}:${zip}:${items.map(i => `${i.id}x${i.qty}`).join(",")}`;
    if (key === state.lastQuoteKey) return;
    state.lastQuoteKey = key;

    try {
      const r = await fetch(CONFIG.endpoints.shippingQuote, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, zip, items })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "No se pudo cotizar");

      state.shipping.quote = { cost: Number(data.cost || 0), etaDays: data.etaDays ?? null };
      updateTotalsUI();

      // update "envios" section quick quote text
      if (el.shipQuote) {
        const eta = data.etaDays ? ` · ${data.etaDays} días` : "";
        el.shipQuote.textContent = `Envío estimado: ${money(data.cost)}${eta}`;
      }
      beep(740, 0.04, 0.02);
    } catch (e) {
      state.shipping.quote = null;
      updateTotalsUI();
      if (el.shipQuote) el.shipQuote.textContent = "No pude cotizar. Revisa tu CP/ZIP.";
    }
  }, 450);

  const bindShipping = () => {
    // section estimator (envios)
    if (el.shipCountry) {
      el.shipCountry.addEventListener("change", () => {
        unlockSound();
        // this estimator doesn't change cart mode, it's just a quick estimator
        if (el.shipQuote) el.shipQuote.textContent = "Escribe tu CP/ZIP para cotizar.";
      });
    }

    if (el.shipZip) {
      el.shipZip.addEventListener("input", debounce(async () => {
        const zip = String(el.shipZip.value || "").trim();
        const country = String(el.shipCountry?.value || "MX").toUpperCase();
        const minZip = country === "US" ? 5 : 4;

        if (zip.length < minZip) {
          if (el.shipQuote) el.shipQuote.textContent = "Escribe tu CP/ZIP para cotizar.";
          return;
        }

        try {
          const r = await fetch(CONFIG.endpoints.shippingQuote, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ country, zip, items: [{ id: "ESTIMATE", qty: 1 }] })
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok || !data?.ok) throw new Error();
          const eta = data.etaDays ? ` · ${data.etaDays} días` : "";
          if (el.shipQuote) el.shipQuote.textContent = `Envío estimado: ${money(data.cost)}${eta}`;
        } catch {
          if (el.shipQuote) el.shipQuote.textContent = "No pude cotizar. Revisa tu CP/ZIP.";
        }
      }, 480));
    }

    // cart drawer shipping mode
    const setMode = (mode) => {
      state.shipping.mode = mode;
      updateShipUI();
      updateTotalsUI();
      requestShippingQuote();
    };

    if (el.shippingModeSelect) {
      el.shippingModeSelect.addEventListener("change", () => {
        unlockSound();
        setMode(el.shippingModeSelect.value);
      });
    }

    el.shipModeRadios.forEach(r => {
      r.addEventListener("change", () => {
        if (!r.checked) return;
        unlockSound();
        setMode(r.value);
        if (el.shippingModeSelect) el.shippingModeSelect.value = r.value;
      });
    });

    if (el.miniZip) {
      el.miniZip.addEventListener("input", () => {
        state.shipping.zip = el.miniZip.value;
        requestShippingQuote();
      });
    }
  };

  // -------------------- CHECKOUT --------------------
  const createCheckout = async () => {
    if (state.cart.length === 0) return;

    const subtotal = calcSubtotal();
    const shipping = state.shipping.mode === "pickup"
      ? { mode: "pickup", cost: 0, zip: "" }
      : { mode: state.shipping.mode, cost: Number(state.shipping.quote?.cost || 0), zip: String(state.shipping.zip || "").trim() };

    try {
      const r = await fetch(CONFIG.endpoints.createCheckout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: CONFIG.currency,
          items: state.cart.map(it => ({
            id: it.id,
            name: it.name,
            price: it.price,
            qty: it.qty,
            size: it.size
          })),
          shipping
        })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.url) throw new Error(data?.error || "Checkout no disponible");
      beep(960, 0.06, 0.04);
      window.location.href = data.url;
    } catch (e) {
      toast("Checkout no disponible todavía (falta create_checkout).", "error");
    }
  };

  // -------------------- AI CHAT --------------------
  const openAi = () => {
    if (!el.aiModal) return;
    el.aiModal.classList.add("active", "show");
    el.aiModal.setAttribute("aria-hidden", "false");
    lockScroll(true);
    setTimeout(() => el.aiInput?.focus(), 50);
  };

  const closeAi = () => {
    if (!el.aiModal) return;
    el.aiModal.classList.remove("active", "show");
    el.aiModal.setAttribute("aria-hidden", "true");
    lockScroll(false);
  };

  const addAiBubble = (text, who = "bot") => {
    if (!el.aiMessages) return;
    const div = document.createElement("div");
    div.className = `ai-bubble ${who === "me" ? "ai-me" : "ai-bot"} ai-msg`;
    div.innerHTML = safeText(text).replace(/\n/g, "<br>");
    el.aiMessages.appendChild(div);
    el.aiMessages.scrollTop = el.aiMessages.scrollHeight;
  };

  const sendAi = async () => {
    const msg = String(el.aiInput?.value || "").trim();
    if (!msg) return;
    unlockSound();
    el.aiInput.value = "";
    addAiBubble(msg, "me");
    beep(620, 0.04, 0.02);

    try {
      const r = await fetch(CONFIG.endpoints.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          context: {
            cart: state.cart.map(it => ({ name: it.name, size: it.size, qty: it.qty, price: it.price })),
            shipping: state.shipping
          }
        })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.reply) throw new Error(data?.error || "AI falló");
      addAiBubble(data.reply, "bot");
    } catch {
      addAiBubble("Ahorita no pude responder. Intenta de nuevo en un momento.", "bot");
    }
  };

  // -------------------- LEGAL --------------------
  const LEGAL = {
    terms: `
      <b>Términos</b><br><br>
      Al comprar en SCORE STORE aceptas nuestras políticas de producción, cambios y envío.
      <br><br><b>Producción</b>: tiempos pueden variar por temporada.<br>
      <b>Envíos</b>: la cotización es estimada y puede ajustarse por paquetería.<br>
      <b>Devoluciones</b>: por ser merch con tallas, revisa antes de pagar.
    `,
    privacy: `
      <b>Privacidad</b><br><br>
      Usamos datos únicamente para procesar tu pedido y mejorar la experiencia.
      No vendemos tu información.
    `,
    contact: `
      <b>Contacto</b><br><br>
      Soporte: <b>contacto.hocker@gmail.com</b><br>
      Pickup: Tijuana, BC (coordinación por soporte).
    `
  };

  const openLegal = (key) => {
    if (!el.legalModal) return;
    el.legalTitle.textContent = (key || "INFO").toUpperCase();
    el.legalBody.innerHTML = LEGAL[key] || LEGAL.terms;
    el.legalModal.classList.add("active", "show");
    el.legalModal.setAttribute("aria-hidden", "false");
    lockScroll(true);
  };

  const closeLegal = () => {
    if (!el.legalModal) return;
    el.legalModal.classList.remove("active", "show");
    el.legalModal.setAttribute("aria-hidden", "true");
    lockScroll(false);
  };

  // -------------------- COOKIES --------------------
  window.acceptCookies = () => {
    try { localStorage.setItem("scorestore_cookies_ok", "1"); } catch {}
    if (el.cookieBanner) el.cookieBanner.style.display = "none";
    toast("Listo. Cookies activadas.", "success");
  };

  const initCookies = () => {
    let ok = false;
    try { ok = localStorage.getItem("scorestore_cookies_ok") === "1"; } catch {}
    if (el.cookieBanner) el.cookieBanner.style.display = ok ? "none" : "flex";
  };

  // -------------------- NOTIFICATIONS --------------------
  const startPurchaseToasts = () => {
    const names = ["Baja 1000 Tee", "SCORE Hoodie", "Desert Cap", "Baja 500 Tee", "San Felipe 250 Tee"];
    const cities = ["Tijuana", "Ensenada", "San Diego", "Mexicali", "CDMX", "LA"];
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const run = () => {
      const prod = pick(names);
      const city = pick(cities);
      const mins = Math.floor(Math.random() * 14) + 1;
      toast(`Compra reciente: ${prod} · ${city} · hace ${mins} min`, "info");
      beep(520, 0.04, 0.015);
      const next = Math.floor(Math.random() * 14000) + 16000; // 16–30s (sin saturar)
      state.notifTimer = setTimeout(run, next);
    };

    clearTimeout(state.notifTimer);
    state.notifTimer = setTimeout(run, 9000);
  };

  // -------------------- BIND UI --------------------
  const bindUI = () => {
    // cart open
    if (el.cartBtn) el.cartBtn.addEventListener("click", () => { unlockSound(); openCart(); beep(760, 0.05, 0.03); });
    // any "cartBtn" class elements
    $$(".cartBtn").forEach(b => b.addEventListener("click", () => { unlockSound(); openCart(); }));

    // close cart
    $$(".drawerClose, .closeBtn").forEach(b => b.addEventListener("click", () => { unlockSound(); closeCart(); beep(420, 0.04, 0.02); }));
    if (el.pageOverlay) el.pageOverlay.addEventListener("click", closeCart);
    if (el.backdrop) el.backdrop.addEventListener("click", closeCart);

    // checkout
    if (el.checkoutBtn) el.checkoutBtn.addEventListener("click", () => { unlockSound(); createCheckout(); });

    // AI
    if (el.aiFloatBtn) el.aiFloatBtn.addEventListener("click", () => { unlockSound(); openAi(); });
    if (el.aiSendBtn) el.aiSendBtn.addEventListener("click", sendAi);
    if (el.aiInput) el.aiInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendAi();
      if (e.key === "Escape") closeAi();
    });

    // close ai if click outside card
    if (el.aiModal) {
      el.aiModal.addEventListener("click", (e) => {
        const card = $(".ai-chat-card", el.aiModal);
        if (!card) return;
        if (!card.contains(e.target)) closeAi();
      });
    }

    // Legal
    el.legalLinks.forEach(b => b.addEventListener("click", () => openLegal(b.getAttribute("data-legal"))));
    if (el.legalClose) el.legalClose.addEventListener("click", closeLegal);
    if (el.legalBackdrop) el.legalBackdrop.addEventListener("click", closeLegal);

    // Escape to close modals
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closeCart();
      closeLegal();
      closeAi();
    }, { passive: true });

    // unlock sound on first interaction
    window.addEventListener("pointerdown", unlockSound, { once: true, passive: true });
  };

  // -------------------- INIT --------------------
  const loadCatalog = async () => {
    try {
      const r = await fetch(CONFIG.catalogUrl, { cache: "no-store" });
      const data = await r.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
      state.products = list.map(normalizeProduct).filter(p => p.id && p.name);
      renderProducts();
    } catch {
      if (el.productsGrid) el.productsGrid.innerHTML = `<div class="muted">No pude cargar el catálogo. Revisa <b>catalog.json</b>.</div>`;
    }
  };

  const init = async () => {
    runSplash();
    initCookies();
    bindFilters();
    bindShipping();
    bindUI();

    updateShipUI();
    updateCartUI();
    startPurchaseToasts();

    await loadCatalog();
  };

  init();
})();
