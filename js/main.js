/* SCORE STORE — HYBRID ENGINE v4.2 (LIGHT + RACING + STOREFRONT MODAL + PWA + SUPABASE + UNICO OS) */

(function () {
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const ORG_SLUG = CFG.orgSlug || "score-store";

  const API_BASE =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "/api"
      : "/.netlify/functions";

  const CART_KEY = "score_cart_prod_v10";

  // Config / flags
  let PROMO_ACTIVE = true;
  let PROMO_TEXT = "🔥 EDICIÓN LIMITADA · COMPRA HOY";
  let FAKE_MARKUP_FACTOR = 1.0;

  // State
  let cart = [];
  let catalogData = { products: [], sections: [] };
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
  let selectedSizeByProduct = {};
  let activeDiscount = 0;

  let db = null;
  let _listenersBound = false;

  const $ = (id) => document.getElementById(id);
  const money = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  const cleanUrl = (url) => (url ? encodeURI(String(url)) : "");
  const safeText = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  /* ---------------- Splash (FIX: always hides) ---------------- */
  function hideSplash() {
    const s = $("splash-screen");
    if (!s) return;
    s.classList.add("hidden");
    setTimeout(() => {
      try {
        s.remove();
      } catch {}
    }, 900);
  }
  window.addEventListener("load", () => setTimeout(hideSplash, 250));
  setTimeout(hideSplash, 2300);

  /* ---------------- App Nav helpers ---------------- */
  window.scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  window.scrollToCollections = () => {
    const el = $("collections");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  /* ---------------- PWA install prompt (real) ---------------- */
  let _deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e;

    const box = $("pwaPrompt");
    const btn = $("pwaInstallBtn");
    if (!box || !btn) return;

    box.style.display = "block";
    btn.onclick = async () => {
      try {
        box.style.display = "none";
        _deferredPrompt.prompt();
        await _deferredPrompt.userChoice;
        _deferredPrompt = null;
      } catch {}
    };
  });

  /* ---------------- Boot ---------------- */
  async function init() {
    // Supabase init (soft-fail)
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
      try {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } catch (err) {
        console.error("Error DB Init:", err);
      }
    } else {
      console.warn("Supabase SDK not loaded or missing config (window.__SCORE__).");
    }

    await loadCatalogLocal();
    loadCart();

    setupListeners();
    updateCartUI();

    initScrollReveal(); // FIX: uses 'revealed' class

    // Background: enrich with DB + config
    if (db) {
      await enrichWithDB();
      await loadSiteConfig();
      // if promo text came from DB, apply
      const pt = $("promo-text");
      if (pt) pt.textContent = PROMO_TEXT;
    } else {
      // apply default promo text
      const pt = $("promo-text");
      if (pt) pt.textContent = PROMO_TEXT;
    }

    // Hide promo bar if config says so (or if element missing)
    if (!PROMO_ACTIVE) {
      const pb = $("promo-bar");
      if (pb) pb.style.display = "none";
    }

    handleQueryActions();
  }

  async function loadCatalogLocal() {
    try {
      const res = await fetch("/data/catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog.json missing");
      const json = await res.json();
      catalogData = json || { products: [], sections: [] };
    } catch (e) {
      console.error("Error catalog:", e);
      catalogData = { products: [], sections: [] };
    }
  }

  async function enrichWithDB() {
    try {
      const { data: dbProducts, error } = await db
        .from("products")
        .select("id, sku, price, active, name, image_url");

      if (error) {
        console.warn("DB products fetch error:", error.message);
        return;
      }
      if (!dbProducts || !dbProducts.length) return;

      const bySku = new Map();
      const byName = new Map();
      dbProducts.forEach((p) => {
        if (p.sku) bySku.set(String(p.sku), p);
        if (p.name) byName.set(String(p.name), p);
      });

      catalogData.products = (catalogData.products || [])
        .map((localP) => {
          const skuKey = localP.sku ? String(localP.sku) : null;
          const nameKey = localP.name ? String(localP.name) : null;

          const match = (skuKey && bySku.get(skuKey)) || (nameKey && byName.get(nameKey)) || null;
          if (match) {
            return {
              ...localP,
              baseMXN: Number(match.price),
              active: match.active,
              db_id: match.id,
              image_url: match.image_url || localP.image_url,
            };
          }
          return localP;
        })
        .filter((p) => p.active !== false);
    } catch (err) {
      console.warn("DB enrich failed:", err);
    }
  }

  async function loadSiteConfig() {
    try {
      const { data: org, error: orgErr } = await db
        .from("organizations")
        .select("id")
        .eq("slug", ORG_SLUG)
        .single();

      if (orgErr || !org?.id) return;

      const { data: config } = await db
        .from("site_settings")
        .select("*")
        .eq("org_id", org.id)
        .single();

      if (!config) return;

      if (config.promo_active === false) {
        PROMO_ACTIVE = false;
      }
      if (config.promo_text) {
        PROMO_TEXT = String(config.promo_text);
      }

      if (config.fake_markup_factor && Number(config.fake_markup_factor) > 1) {
        FAKE_MARKUP_FACTOR = Number(config.fake_markup_factor);
      }

      if (config.hero_title && $("hero-title")) {
        $("hero-title").innerHTML = config.hero_title;
      }
    } catch (e) {
      console.warn("Site config load failed:", e);
    }
  }

  /* ---------------- Catalog: Storefront modal (grid + search + sort + skeleton) ---------------- */
  let _currentCatalogItems = [];
  let _currentCatalogTitle = "COLECCIÓN";
  let _currentCatalogSection = "";

  window.openCatalog = (sectionId, titleFallback) => {
    _currentCatalogSection = String(sectionId || "");
    _currentCatalogTitle = String(titleFallback || "COLECCIÓN");

    const items = (catalogData.products || []).filter(
      (p) => p.sectionId === sectionId || (p.sectionId == null && p.section === sectionId)
    );

    _currentCatalogItems = items.slice();

    if ($("catTitle")) $("catTitle").innerText = _currentCatalogTitle;

    const modal = $("modalCatalog");
    if (modal) modal.dataset.section = _currentCatalogSection;

    const container = $("catContent");
    if (!container) return;

    container.innerHTML = renderStorefrontSkeleton();
    openModal("modalCatalog");

    setTimeout(() => {
      if (!items.length) {
        container.innerHTML = `<div style="text-align:center;padding:50px;color:#555;">
          <div style="font-weight:900;margin-bottom:6px;">Próximamente…</div>
          <div style="opacity:.8">Esta colección se está preparando.</div>
        </div>`;
        return;
      }
      container.innerHTML = renderStorefront(items);
      bindStorefrontControls();
    }, 180);
  };

  function renderStorefrontSkeleton() {
    const sk = Array.from({ length: 6 })
      .map(
        () => `
        <div class="skeletonCard">
          <div class="skelTop"></div>
          <div class="skelBody">
            <div class="skelLine w60"></div>
            <div class="skelLine w40"></div>
            <div class="skelBtn"></div>
          </div>
        </div>`
      )
      .join("");

    return `
      <div class="storeFrontTop">
        <div class="storeHint">
          <strong style="color:rgba(0,0,0,.85)">Cargando catálogo…</strong><br>
          Tallas y disponibilidad al momento.
        </div>
        <div class="storeTools">
          <input class="searchInput" disabled placeholder="Buscar producto…">
          <select class="selectInput" disabled><option>Orden</option></select>
        </div>
      </div>
      <div class="productGrid">${sk}</div>
    `;
  }

  function renderStorefront(items) {
    return `
      <div class="storeFrontTop">
        <div class="storeHint">
          <strong style="color:rgba(0,0,0,.85)">Elige tu producto</strong><br>
          Tip: toca “Carrito” para pagar en 1 minuto.
        </div>

        <div class="storeTools">
          <input class="searchInput" id="sfSearch" placeholder="Buscar producto…">
          <select class="selectInput" id="sfSort">
            <option value="rel">Orden recomendado</option>
            <option value="az">Nombre A–Z</option>
            <option value="za">Nombre Z–A</option>
            <option value="plh">Precio menor → mayor</option>
            <option value="phl">Precio mayor → menor</option>
          </select>
        </div>
      </div>

      <div class="productGrid" id="sfGrid">
        ${items.map((p) => renderProductCard(p)).join("")}
      </div>
    `;
  }

  function bindStorefrontControls() {
    const search = $("sfSearch");
    const sort = $("sfSort");
    if (search) search.addEventListener("input", refreshStorefront);
    if (sort) sort.addEventListener("change", refreshStorefront);
  }

  function refreshStorefront() {
    const q = String($("sfSearch")?.value || "").toLowerCase();
    const mode = String($("sfSort")?.value || "rel");

    let items = _currentCatalogItems.slice();
    if (q) items = items.filter((p) => String(p.name || "").toLowerCase().includes(q));
    items = sortItems(items, mode);

    const grid = $("sfGrid");
    if (grid) grid.innerHTML = items.map((p) => renderProductCard(p)).join("");
  }

  function sortItems(items, mode) {
    const getPrice = (p) => Number(p.baseMXN ?? p.price ?? 0);
    const getName = (p) => String(p.name || "");

    if (mode === "az") return items.sort((a, b) => getName(a).localeCompare(getName(b), "es"));
    if (mode === "za") return items.sort((a, b) => getName(b).localeCompare(getName(a), "es"));
    if (mode === "plh") return items.sort((a, b) => getPrice(a) - getPrice(b));
    if (mode === "phl") return items.sort((a, b) => getPrice(b) - getPrice(a));
    return items;
  }

  function renderProductCard(p) {
    const id = String(p.db_id || p.id || p.sku || p.name);
    const name = String(p.name || "Producto");
    const img = cleanUrl(p.image_url || p.image || "/assets/logo-score.webp");
    const price = calcDisplayPrice(p);

    const sizes = Array.isArray(p.sizes) ? p.sizes : Array.isArray(p.tallas) ? p.tallas : [];
    const defaultSize = sizes[0] || "Unitalla";
    if (!selectedSizeByProduct[id]) selectedSizeByProduct[id] = defaultSize;

    const sizeOptions = sizes.length
      ? sizes
          .map(
            (s) =>
              `<button class="sizePill ${selectedSizeByProduct[id] === s ? "active" : ""}"
                onclick="selectSize('${escapeJS(id)}','${escapeJS(s)}')">${safeText(s)}</button>`
          )
          .join("")
      : `<span class="mutedSmall">Unitalla</span>`;

    return `
      <article class="pCard">
        <div class="pImgWrap">
          <img src="${img}" alt="${safeText(name)}" class="pImg" loading="lazy">
        </div>

        <div class="pMeta">
          <div class="pName">${safeText(name)}</div>
          <div class="pPrice">${money(price)}</div>

          <div class="pSizes">${sizeOptions}</div>

          <button class="btn primary full" onclick="addToCart('${escapeJS(id)}')">AGREGAR</button>
        </div>
      </article>
    `;
  }

  window.selectSize = (pid, size) => {
    selectedSizeByProduct[String(pid)] = String(size);
    refreshStorefront();
  };

  function calcDisplayPrice(p) {
    const base = Number(p.baseMXN ?? p.price ?? 0);
    return base;
  }

  function findProductById(anyId) {
    const key = String(anyId || "");
    return (
      (catalogData.products || []).find((p) => String(p.db_id || p.id || p.sku || p.name) === key) ||
      null
    );
  }

  /* ---------------- Cart ---------------- */
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

  window.addToCart = (pid) => {
    const p = findProductById(pid);
    if (!p) return toast("Producto no disponible");

    const id = String(pid);
    const size = selectedSizeByProduct[id] || "Unitalla";

    const existing = cart.find((x) => String(x.id) === id && String(x.size || "") === String(size));
    if (existing) existing.qty = Math.min(99, Number(existing.qty || 1) + 1);
    else cart.push({ id, qty: 1, size });

    saveCart();
    updateCartUI();

    showCartPop(p?.name || "Agregado");
  };

  function showCartPop(productName) {
    let pop = document.querySelector(".cartPop");
    if (!pop) {
      pop = document.createElement("div");
      pop.className = "cartPop";
      pop.innerHTML = `
        <div><strong id="cartPopName">Agregado</strong> · listo ✅</div>
        <button class="cartPopBtn" type="button">Ver carrito</button>
      `;
      document.body.appendChild(pop);
      pop.querySelector("button").onclick = () => openDrawer();
    }

    const name = pop.querySelector("#cartPopName");
    if (name) name.textContent = String(productName || "Agregado");

    pop.classList.add("show");
    clearTimeout(pop._t);
    pop._t = setTimeout(() => pop.classList.remove("show"), 1900);
  }

  window.removeFromCart = (pid, size) => {
    cart = cart.filter((x) => !(String(x.id) === String(pid) && String(x.size || "") === String(size || "")));
    saveCart();
    updateCartUI();
  };

  window.changeQty = (pid, size, delta) => {
    const it = cart.find((x) => String(x.id) === String(pid) && String(x.size || "") === String(size || ""));
    if (!it) return;
    it.qty = Math.max(1, Math.min(99, Number(it.qty || 1) + Number(delta || 0)));
    saveCart();
    updateCartUI();
  };

  function computeSubtotal() {
    let sum = 0;
    for (const item of cart) {
      const p = findProductById(item.id);
      if (!p) continue;
      const base = Number(p.baseMXN ?? p.price ?? 0);
      sum += base * Number(item.qty || 1);
    }
    return Math.max(0, sum);
  }

  function computeDiscount(subtotal) {
    const d = Number(activeDiscount || 0);
    if (!d || d <= 0) return 0;
    return Math.min(subtotal, subtotal * d);
  }

  function computeGrandTotal() {
    const sub = computeSubtotal();
    const disc = computeDiscount(sub);
    const ship = Number(shippingState.cost || 0);
    return Math.max(0, sub - disc + ship);
  }

  function updateCartUI() {
    const count = cart.reduce((a, x) => a + Number(x.qty || 0), 0);
    if ($("cartCount")) $("cartCount").textContent = String(count);

    const itemsWrap = $("cartItems");
    const empty = $("cartEmpty");
    const foot = $("cartFooter");

    if (!itemsWrap || !empty || !foot) return;

    if (!cart.length) {
      itemsWrap.innerHTML = "";
      empty.style.display = "block";
      foot.style.display = "none";
      return;
    }

    empty.style.display = "none";
    foot.style.display = "block";

    itemsWrap.innerHTML = cart
      .map((it) => {
        const p = findProductById(it.id);
        if (!p) return "";
        const name = String(p.name || "Producto");
        const img = cleanUrl(p.image_url || p.image || "/assets/logo-score.webp");
        const base = Number(p.baseMXN ?? p.price ?? 0);
        const qty = Number(it.qty || 1);
        const size = String(it.size || "Unitalla");
        return `
          <div class="cartRow">
            <img class="cartThumb" src="${img}" alt="${safeText(name)}">
            <div class="cartInfo">
              <div class="cartName">${safeText(name)}</div>
              <div class="cartMeta">Talla: <b>${safeText(size)}</b> · ${money(base)}</div>
              <div class="qtyRow">
                <button class="qtyBtn" onclick="changeQty('${escapeJS(it.id)}','${escapeJS(size)}',-1)">−</button>
                <span class="qtyVal">${qty}</span>
                <button class="qtyBtn" onclick="changeQty('${escapeJS(it.id)}','${escapeJS(size)}',1)">+</button>
                <button class="rmBtn" onclick="removeFromCart('${escapeJS(it.id)}','${escapeJS(size)}')">Quitar</button>
              </div>
            </div>
            <div class="cartLine">${money(base * qty)}</div>
          </div>
        `;
      })
      .join("");

    // totals
    const sub = computeSubtotal();
    const disc = computeDiscount(sub);
    const grand = computeGrandTotal();

    if ($("subTotal")) $("subTotal").textContent = money(sub);
    if ($("grandTotal")) $("grandTotal").textContent = money(grand);

    if ($("rowDiscount")) $("rowDiscount").style.display = disc > 0 ? "flex" : "none";
    if ($("discVal")) $("discVal").textContent = `-${money(disc)}`;

    if ($("shipTotal")) $("shipTotal").textContent = shippingState.cost > 0 ? money(shippingState.cost) : "Gratis";

    syncShipUI();
  }

  /* ---------------- Shipping UI ---------------- */
  function bindShippingRadios() {
    const radios = document.querySelectorAll('input[name="shipMode"]');
    radios.forEach((r) => {
      r.addEventListener("change", async () => {
        shippingState.mode = String(r.value || "pickup");

        if (shippingState.mode === "pickup") {
          shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
          syncShipUI();
          updateCartUI();
          return;
        }

        syncShipUI();

        const cp = String($("cp")?.value || "");
        if (cp.trim().length >= 5) {
          await quoteShipping();
        } else {
          shippingState.cost = shippingState.mode === "us" ? 800 : 250;
          shippingState.label = shippingState.mode === "us" ? "Envío USA" : "Envío MX";
          updateCartUI();
        }
      });
    });
  }

  function syncShipUI() {
    const mode = shippingState.mode;
    const form = $("shipForm");
    if (form) form.style.display = mode === "pickup" ? "none" : "block";
  }

  async function quoteShipping() {
    const mode = shippingState.mode;
    const cp = String($("cp")?.value || "");
    const qty = cart.reduce((a, x) => a + Number(x.qty || 0), 0) || 1;

    if (!cp || cp.trim().length < 5) {
      toast("Escribe un CP/ZIP válido");
      return;
    }

    const country = mode === "us" ? "US" : "MX";

    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: cp, country, items: qty }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "No quote");

      shippingState.cost = Number(data.cost || 0);
      shippingState.label = String(data.label || "Envío");
      updateCartUI();
      toast(`Envío calculado: ${money(shippingState.cost)}`);
    } catch (e) {
      shippingState.cost = mode === "us" ? 800 : 250;
      shippingState.label = mode === "us" ? "Envío USA" : "Envío MX";
      updateCartUI();
      toast("Envío estimado aplicado");
    }
  }

  /* ---------------- Promo ---------------- */
  window.applyPromo = () => {
    const code = String($("promoCodeInput")?.value || "");
    if (!code) return toast("Escribe un cupón");

    const c = code.toUpperCase().replace(/\s+/g, "");
    const map = { SCORE10: 0.1, SCORE15: 0.15, VIP20: 0.2 };

    if (!map[c]) {
      activeDiscount = 0;
      toast("Cupón inválido");
      updateCartUI();
      return;
    }
    activeDiscount = map[c];
    toast(`Cupón aplicado: -${Math.round(activeDiscount * 100)}% ✅`);
    updateCartUI();
  };

  /* ---------------- Checkout ---------------- */
  window.checkout = async () => {
    if (!cart.length) return toast("Tu carrito está vacío");

    if (shippingState.mode !== "pickup") {
      const cp = String($("cp")?.value || "");
      const name = String($("name")?.value || "");
      const addr = String($("addr")?.value || "");
      if (cp.trim().length < 5) return toast("Falta CP/ZIP");
      if (!name.trim()) return toast("Falta nombre");
      if (!addr.trim()) return toast("Falta dirección/teléfono");
      await quoteShipping();
    }

    const items = cart.map((it) => {
      const p = findProductById(it.id);
      const useId = p?.db_id ? String(p.db_id) : String(it.id);
      return { id: useId, qty: Number(it.qty || 1), size: String(it.size || "Unitalla") };
    });

    const discountFactor = Math.max(0, Math.min(0.9, Number(activeDiscount || 0)));

    const payload = {
      items,
      discountFactor,
      mode: shippingState.mode,
      shipping: { cost: shippingState.cost, label: shippingState.label },
      customer: shippingState.mode === "pickup"
        ? null
        : {
            zip: String($("cp")?.value || ""),
            name: String($("name")?.value || ""),
            address: String($("addr")?.value || ""),
          },
    };

    const btn = $("checkoutBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "PROCESANDO...";
    }

    try {
      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.url) throw new Error(data?.error || "Checkout error");
      location.href = data.url;
    } catch (e) {
      console.error(e);
      toast(e?.message || "No se pudo iniciar el pago");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "PAGAR AHORA";
      }
    }
  };

  /* ---------------- Modal/Drawer helpers ---------------- */
  window.openDrawer = () => openModal("drawer");

  window.openLegal = (block) => {
    const modal = $("legalModal");
    if (!modal) return;
    modal.querySelectorAll("[data-legal-block]").forEach((el) => (el.style.display = "none"));
    const t = modal.querySelector(`[data-legal-block="${block}"]`);
    if (t) t.style.display = "block";
    openModal("legalModal");
  };

  window.closeAll = () => {
    closeModal("drawer");
    closeModal("modalCatalog");
    closeModal("legalModal");
    const ov = $("overlay");
    if (ov) ov.classList.remove("show");
  };

  function openModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    const ov = $("overlay");
    if (ov) ov.classList.add("show");
    document.body.classList.add("noScroll");
  }

  function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("noScroll");
  }

  /* ---------------- Toast ---------------- */
  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = String(msg || "");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------------- Scroll reveal (FIXED: 'revealed') ---------------- */
  function initScrollReveal() {
    const els = document.querySelectorAll(".scroll-reveal");
    if (!els.length) return;

    // fallback: reveal all if IntersectionObserver unsupported
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("revealed"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("revealed");
        });
      },
      { threshold: 0.15 }
    );

    els.forEach((el) => io.observe(el));
  }

  /* ---------------- Query actions ---------------- */
  function handleQueryActions() {
    const qs = new URLSearchParams(location.search);
    if (qs.get("openCart") === "1") openDrawer();

    const status = qs.get("status");
    if (status === "success") {
      toast("Pago confirmado ✅ Revisaremos tu pedido.");
      cart = [];
      saveCart();
      updateCartUI();
      history.replaceState({}, "", "/");
    } else if (status === "cancel") {
      toast("Pago cancelado");
      history.replaceState({}, "", "/");
    }
  }

  /* ---------------- Listeners ---------------- */
  function setupListeners() {
    if (_listenersBound) return;
    _listenersBound = true;

    bindShippingRadios();

    // CP debounce quote
    const cp = $("cp");
    if (cp) {
      let t = null;
      cp.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (shippingState.mode !== "pickup") quoteShipping();
        }, 700);
      });
    }
  }

  /* ---------------- Utils ---------------- */
  function escapeJS(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "");
  }

  // Boot
  document.addEventListener("DOMContentLoaded", init);
})();