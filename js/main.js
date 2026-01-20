/* SCORE STORE — HYBRID ENGINE v4.1 (STABLE + SUPABASE + UNICO OS) */

(function(){
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const ORG_SLUG = CFG.orgSlug || "score-store";

  const API_BASE =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "/api"
      : "/.netlify/functions";

  const CART_KEY = "score_cart_prod_v9";

  // Config / flags
  let PROMO_ACTIVE = true;
  let PROMO_TEXT = "OFERTAS ACTIVAS";
  let FAKE_MARKUP_FACTOR = 1.6;

  // State
  let cart = [];
  let catalogData = { products: [], sections: [] };
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
  let selectedSizeByProduct = {};
  let activeDiscount = 0;

  let db = null;
  let _splashInitialized = false;
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

    // Load local catalog first
    await loadCatalogLocal();
    loadCart();

    setupListeners();
    updateCartUI();

    initSplash();
    initScrollReveal();

    // Background: enrich with DB + config
    if (db) {
      await enrichWithDB();
      await loadSiteConfig();
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

      // match por sku o por name EXACTO (sin trim del name)
      const bySku = new Map();
      const byName = new Map();
      dbProducts.forEach(p => {
        if (p.sku) bySku.set(String(p.sku), p);
        if (p.name) byName.set(String(p.name), p);
      });

      catalogData.products = (catalogData.products || [])
        .map(localP => {
          const skuKey = localP.sku ? String(localP.sku) : null;
          const nameKey = localP.name ? String(localP.name) : null;

          const match =
            (skuKey && bySku.get(skuKey)) ||
            (nameKey && byName.get(nameKey)) ||
            null;

          if (match) {
            return {
              ...localP,
              baseMXN: Number(match.price),
              active: match.active,
              db_id: match.id,
              image_url: match.image_url || localP.image_url
            };
          }
          return localP;
        })
        .filter(p => p.active !== false);

    } catch (err) {
      console.warn("DB enrich failed:", err);
    }
  }

  async function loadSiteConfig() {
    try {
      // org
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

      // promo
      if (config.promo_active === false) {
        PROMO_ACTIVE = false;
        const pb = $("promo-bar");
        if (pb) pb.style.display = "none";
      }

      if (config.promo_text) {
        PROMO_TEXT = String(config.promo_text);
        const pt = $("promo-text");
        if (pt) pt.textContent = PROMO_TEXT;
      } else {
        const pt = $("promo-text");
        if (pt) pt.textContent = PROMO_TEXT;
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

  // UI: Catalog
  window.openCatalog = (sectionId, titleFallback) => {
    const items = (catalogData.products || []).filter(p =>
      p.sectionId === sectionId ||
      (p.sectionId == null && p.section === sectionId) // compat
    );

    if ($("catTitle")) $("catTitle").innerText = titleFallback || "COLECCIÓN";

    const container = $("catContent");
    if (!container) return;

    container.innerHTML = "";

    if (!items.length) {
      container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
      openModal("modalCatalog");
      return;
    }

    // render cards
    const cards = items.map((p) => renderProductCard(p)).join("");
    container.innerHTML = `<div class="productGrid">${cards}</div>`;
    openModal("modalCatalog");
  };

  function renderProductCard(p) {
    const id = String(p.db_id || p.id || p.sku || p.name);
    const name = String(p.name || "Producto");
    const img = cleanUrl(p.image_url || p.image || "/assets/logo-score.webp");
    const price = calcDisplayPrice(p);
    const sizes = Array.isArray(p.sizes) ? p.sizes : (Array.isArray(p.tallas) ? p.tallas : []);
    const defaultSize = sizes[0] || "Unitalla";

    if (!selectedSizeByProduct[id]) selectedSizeByProduct[id] = defaultSize;

    const sizeOptions = sizes.length
      ? sizes
          .map(
            (s) =>
              `<button class="sizePill ${selectedSizeByProduct[id] === s ? "active" : ""}" onclick="selectSize('${escapeJS(id)}','${escapeJS(s)}')">${safeText(
                s
              )}</button>`
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

          <div class="pSizes">
            ${sizeOptions}
          </div>

          <button class="btn primary full" onclick="addToCart('${escapeJS(id)}')">AGREGAR</button>
        </div>
      </article>
    `;
  }

  // OJO: aquí NO tocamos el name (ni trim, ni lower) para matching.
  function findProductById(anyId) {
    const key = String(anyId || "");
    return (catalogData.products || []).find((p) => String(p.db_id || p.id || p.sku || p.name) === key) || null;
  }

  window.selectSize = (pid, size) => {
    selectedSizeByProduct[String(pid)] = String(size);
    // re-render visible catalog quickly (cheap)
    const t = $("catTitle")?.innerText || "COLECCIÓN";
    // Intento inferir section desde primer item del modal actual
    // (si no hay, no pasa nada)
    const currentSection = (catalogData.products || []).find((p) => (p.sectionId || p.section) && t.includes(String(p.sectionId || p.section)))?.sectionId;
    // Mejor: solo reabrimos la misma colección si existe data-attr
    const modal = $("modalCatalog");
    if (modal?.dataset?.section) {
      window.openCatalog(modal.dataset.section, t);
      return;
    }
    // fallback: no re-render
  };

  function calcDisplayPrice(p) {
    const base = Number(p.baseMXN ?? p.price ?? 0);
    // si quieres “precio ancla” (tachado) aplica factor
    return base;
  }

  // Cart
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
    toast("Agregado al carrito ✅");
  };

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

    if ($("rowDiscount")) {
      $("rowDiscount").style.display = disc > 0 ? "flex" : "none";
    }
    if ($("discVal")) $("discVal").textContent = `-${money(disc)}`;

    if ($("shipTotal")) $("shipTotal").textContent = shippingState.cost > 0 ? money(shippingState.cost) : "Gratis";

    // ensure ship UI logic
    syncShipUI();
  }

  // Shipping UI
  function bindShippingRadios() {
    const radios = document.querySelectorAll('input[name="shipMode"]');
    radios.forEach((r) => {
      r.addEventListener("change", async () => {
        shippingState.mode = String(r.value || "pickup");
        activeDiscount = activeDiscount || 0;

        if (shippingState.mode === "pickup") {
          shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
          syncShipUI();
          updateCartUI();
          return;
        }

        // show form
        syncShipUI();

        // if we already have CP, quote shipping
        const cp = String($("cp")?.value || "");
        if (cp.trim().length >= 5) {
          await quoteShipping();
        } else {
          // fallback label only
          shippingState.cost = shippingState.mode === "us" ? 800 : 250;
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

  // Promo (simple factor)
  window.applyPromo = () => {
    const code = String($("promoCodeInput")?.value || "");
    if (!code) return toast("Escribe un cupón");

    // lógica simple (puedes conectarlo a DB después)
    const c = code.toUpperCase().replace(/\s+/g, "");
    const map = {
      SCORE10: 0.10,
      SCORE15: 0.15,
      VIP20: 0.20,
    };

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

  // Checkout
  window.checkout = async () => {
    if (!cart.length) return toast("Tu carrito está vacío");

    // shipping validation
    if (shippingState.mode !== "pickup") {
      const cp = String($("cp")?.value || "");
      const name = String($("name")?.value || "");
      const addr = String($("addr")?.value || "");
      if (cp.trim().length < 5) return toast("Falta CP/ZIP");
      if (!name.trim()) return toast("Falta nombre");
      if (!addr.trim()) return toast("Falta dirección/teléfono");
      await quoteShipping(); // ensure updated
    }

    // Build payload: use db_id if exists; else local id
    const items = cart.map((it) => {
      const p = findProductById(it.id);
      const useId = p?.db_id ? String(p.db_id) : String(it.id);
      return {
        id: useId,
        qty: Number(it.qty || 1),
        size: String(it.size || "Unitalla"),
      };
    });

    const discountFactor = Math.max(0, Math.min(0.9, Number(activeDiscount || 0)));

    const payload = {
      items,
      discountFactor,
      mode: shippingState.mode,
      shipping: {
        cost: shippingState.cost,
        label: shippingState.label,
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

  // Modal/drawer helpers
  window.openDrawer = () => {
    openModal("drawer");
  };

  window.openLegal = (block) => {
    const modal = $("legalModal");
    if (!modal) return;
    // hide all
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

  // Toast
  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = String(msg || "");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  }

  // Utils
  function escapeJS(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "");
  }

  function initSplash() {
    if (_splashInitialized) return;
    _splashInitialized = true;
    const splash = $("splash-screen");
    if (!splash) return;
    setTimeout(() => {
      splash.style.opacity = "0";
      setTimeout(() => (splash.style.display = "none"), 300);
    }, 900);
  }

  function initScrollReveal() {
    const els = document.querySelectorAll(".scroll-reveal");
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in");
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
  }

  function handleQueryActions() {
    const qs = new URLSearchParams(location.search);
    if (qs.get("openCart") === "1") openDrawer();

    const status = qs.get("status");
    if (status === "success") {
      toast("Pago confirmado ✅ Revisaremos tu pedido.");
      // clear cart
      cart = [];
      saveCart();
      updateCartUI();
      // clean URL
      history.replaceState({}, "", "/");
    } else if (status === "cancel") {
      toast("Pago cancelado");
      history.replaceState({}, "", "/");
    }
  }

  function setupListeners() {
    if (_listenersBound) return;
    _listenersBound = true;

    // shipping radios
    bindShippingRadios();

    // cp debounce quote
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

  // Boot
  document.addEventListener("DOMContentLoaded", init);
})();