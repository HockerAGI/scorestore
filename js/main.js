/* SCORE STORE LOGIC — FINAL MASTER v2.2 (80% OFF + ARRANCANDO MOTORES) */

// CREDENCIALES REALES
const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_prod_v5";

// CONFIGURACIÓN OBLIGATORIA: 80% OFF
let PROMO_ACTIVE = true; // Default ON (solo se apaga si DB lo dice explícitamente)
let FAKE_MARKUP_FACTOR = 1.6; // Precio anterior “inflado” para UX de promo

let cart = [];
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};
let supabase = null;

const $ = (id) => document.getElementById(id);

const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

// --- SAMSUNG FIX & CLEAN URL ---
const cleanUrl = (url) => {
  if (!url) return "";
  return encodeURI(String(url).trim());
};

// --- SAFE TEXT (para evitar inyección en innerHTML en nombres/productos) ---
const safeText = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// --- FLAGS internos ---
let _splashInitialized = false;

// --- INIT ---
async function init() {
  // 1. Inicializar Supabase si está disponible
  if (window.supabase) supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // 2. Ejecutar Animación "Arrancando Motores" (BLINDADO)
  initSplash();

  loadCart();

  try {
    // 3. Cargar catálogo (DB o Local)
    await loadCatalogFromDB();
    // 4. Cargar configuraciones extra (Pixel, Textos)
    await loadSiteConfig();
  } catch (e) {
    console.warn("Offline mode / Fallback active:", e);
    await loadCatalogLocal();
  }

  setupListeners();
  updateCartUI();
  initScrollReveal();

  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago exitoso! Gracias por tu compra.");
    if (typeof fbq === "function") fbq("track", "Purchase", { currency: "MXN", value: 0.0 });

    // vaciar carrito silencioso
    emptyCart(true);

    // limpiar query
    window.history.replaceState({}, document.title, "/");
  }
}

// --- SPLASH SCREEN: ARRANCANDO MOTORES (REGLA #2) ---
function initSplash() {
  // blindaje por si se llama 2 veces (SW reload/Android)
  if (_splashInitialized) return;
  _splashInitialized = true;

  const splash = $("splash-screen");
  if (splash) {
    // Animación suave
    setTimeout(() => {
      splash.classList.add("hidden");
    }, 2200);
  }

  // FAIL-SAFE OBLIGATORIO: 4.5s (NO TOCAR)
  setTimeout(() => {
    if (splash && !splash.classList.contains("hidden")) {
      console.warn("⚠️ Splash forzado a cerrar por time-out (4.5s).");
      splash.classList.add("hidden");
    }
  }, 4500);
}

function initScrollReveal() {
  const els = document.querySelectorAll(".scroll-reveal");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  els.forEach((el) => observer.observe(el));
}

// --- DATA LAYER ---
async function loadSiteConfig() {
  if (!supabase) return;

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (orgErr || !org?.id) return;

  const { data: config } = await supabase
    .from("site_settings")
    .select("*")
    .eq("org_id", org.id)
    .single();

  if (!config) return;

  const h1 = $("hero-title");
  if (h1 && config.hero_title) h1.innerHTML = config.hero_title;

  // Si DB dice explícitamente que NO hay promo, la quitamos.
  if (config.promo_active === false) {
    PROMO_ACTIVE = false;
    const bar = $("promo-bar");
    if (bar) bar.style.display = "none";
  }

  // Inyección dinámica de Pixel (REGLA #4) — sin duplicar
  if (config.pixel_id && typeof window.fbq !== "function") {
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    fbq("init", config.pixel_id);
    fbq("track", "PageView");
  }
}

async function loadCatalogFromDB() {
  if (!supabase) throw new Error("No client");

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (orgErr || !org?.id) throw new Error("Org not found");

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", org.id)
    .eq("active", true);

  if (prodErr || !products || products.length === 0) throw new Error("No data");

  catalogData.products = products.map((p) => ({
    id: p.id,
    name: p.name,
    baseMXN: p.price,
    sectionId: p.category || "BAJA_1000",
    img: p.image_url || "/assets/logo-score.webp",
    images: [p.image_url || "/assets/logo-score.webp"],
    sizes: ["S", "M", "L", "XL", "2XL"],
    sku: p.sku,
  }));

  catalogData.sections = [
    { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp" },
    { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp" },
    { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp" },
    { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp" },
  ];
}

async function loadCatalogLocal() {
  try {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("catalog.json missing");
    catalogData = await res.json();
  } catch (e) {
    console.warn("No local catalog available:", e);
    catalogData = { products: [], sections: [] };
  }
}

// --- CART STORAGE ---
function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) {
    try {
      cart = JSON.parse(saved) || [];
    } catch {
      cart = [];
    }
  }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

// --- UI: OPEN CATALOG ---
window.openCatalog = (sectionId, titleFallback) => {
  const items = (catalogData.products || []).filter(
    (p) =>
      p.sectionId === sectionId ||
      (p.name && String(p.name).toUpperCase().includes(sectionId.replace("_", " ")))
  );

  const titleEl = $("catTitle");
  const sectionInfo = (catalogData.sections || []).find((s) => s.id === sectionId);

  if (titleEl) {
    if (sectionInfo && sectionInfo.logo) {
      titleEl.innerHTML = `<img src="${cleanUrl(sectionInfo.logo)}" style="height:80px;width:auto;" alt="${safeText(sectionInfo.title || "Colección")}">`;
    } else {
      titleEl.innerText = titleFallback || "COLECCIÓN";
    }
  }

  const container = $("catContent");
  if (!container) {
    // Si el modal todavía no está cargado, no reventamos.
    console.warn("catContent no existe (modal no cargado aún).");
    return;
  }

  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "catGrid";

    items.forEach((p) => {
      const sizes = p.sizes || ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];

      const sizesHtml = sizes
        .map((sz) => {
          const active = selectedSizeByProduct[p.id] === sz ? "active" : "";
          return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
        })
        .join("");

      const sellPrice = Number(p.baseMXN || 0);
      const fakeOldPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);

      const priceHtml = PROMO_ACTIVE
        ? `<div class="price-container"><span class="old-price">${money(fakeOldPrice)}</span><span class="new-price">${money(sellPrice)}</span></div>`
        : `<div class="prodPrice">${money(sellPrice)}</div>`;

      const safeImg = cleanUrl(p.img);

      const el = document.createElement("div");
      el.className = "prodCard";
      el.innerHTML = `
        <div class="metallic-frame">
          ${PROMO_ACTIVE ? '<div class="promo-badge">80% OFF</div>' : ""}
          <div class="prod-slider">
            <div class="prod-slide">
              <img src="${safeImg}" class="prodImg" loading="lazy" alt="${safeText(p.name || "Producto")}">
            </div>
          </div>
        </div>
        <div class="prodName">${safeText(p.name)}</div>
        ${priceHtml}
        <div class="sizeRow">${sizesHtml}</div>
        <button class="btn-add" data-add="${p.id}">AGREGAR</button>
      `;
      grid.appendChild(el);
    });

    container.appendChild(grid);
  }

  openModal("modalCatalog");
};

// --- LISTENERS ---
function setupListeners() {
  const catContent = $("catContent");
  if (catContent) {
    catContent.addEventListener("click", (e) => {
      const btnSize = e.target.closest("[data-size]");
      if (btnSize) {
        const pid = btnSize.dataset.pid;
        const size = btnSize.dataset.size;
        selectedSizeByProduct[pid] = size;

        const row = btnSize.parentElement;
        if (row) row.querySelectorAll(".size-pill").forEach((p) => p.classList.remove("active"));
        btnSize.classList.add("active");
        return;
      }

      const btnAdd = e.target.closest("[data-add]");
      if (btnAdd) {
        const pid = btnAdd.dataset.add;
        const size = selectedSizeByProduct[pid] || "Unitalla";
        addToCart(pid, size);
      }
    });
  }

  // radios: shipMode
  document.getElementsByName("shipMode").forEach((r) => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

  // INPUT CP LOGIC USA/MX
  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9-]/g, "").slice(0, 10);
      e.target.value = val;

      // No cotizamos si no hay items
      if (!cart.length) return;

      if (shippingState.mode === "mx" && val.length === 5) quoteShipping(val, "MX");
      else if (shippingState.mode === "us" && val.length >= 5) quoteShipping(val, "US");
    });
  }
}

// --- CHECKOUT ---
window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Carrito vacío");

  const mode = shippingState.mode;
  const name = $("name")?.value.trim() || "";
  const addr = $("addr")?.value.trim() || "";
  const cp = $("cp")?.value.trim() || "";

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Faltan datos de envío");
    if (mode === "mx" && cp.length < 5) return toast("CP inválido");
    if (mode === "us" && cp.length < 5) return toast("ZIP inválido");
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = "Procesando...";
  }

  if (typeof fbq === "function") {
    fbq("track", "InitiateCheckout", { num_items: cart.length, currency: "MXN", value: 0 });
  }

  try {
    const payload = {
      items: cart,
      mode,
      customer: { name, address: addr, postal_code: cp },
      promo: PROMO_ACTIVE,
      shipping: { cost: shippingState.cost, label: shippingState.label },
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error(data.error || "Error al iniciar pago");
  } catch (err) {
    toast("Error: " + (err?.message || "Error desconocido"));
    if (btn) {
      btn.disabled = false;
      btn.innerText = "PAGAR AHORA";
    }
  }
};

/* UTILS */
window.openModal = (id) => {
  $(id)?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.openDrawer = () => {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach((e) => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

// Legal modal helper (si existe)
window.openLegal = window.openLegal || function (key) {
  const modal = $("legalModal");
  if (!modal) return;
  modal.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");

  modal.querySelectorAll("[data-legal-block]").forEach((b) => (b.style.display = "none"));
  const block = modal.querySelector(`[data-legal-block="${key}"]`);
  if (block) block.style.display = "block";
};

window.addToCart = (id, size) => {
  const existing = cart.find((i) => i.id === id && i.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado");
  openDrawer();

  if (typeof fbq === "function") {
    fbq("track", "AddToCart", { content_ids: [id], content_type: "product" });
  }
};

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  saveCart();
  updateCartUI();
  recalcShippingIfNeeded();
};

window.emptyCart = (silent) => {
  if (silent || confirm("¿Vaciar?")) {
    cart = [];
    saveCart();
    updateCartUI();
    recalcShippingIfNeeded();
  }
};

window.toast = (m) => {
  const t = $("toast");
  if (!t) return;
  t.innerText = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
};

// Qty controls (definidas una sola vez)
window.incQty = (idx) => {
  const item = cart[idx];
  if (!item) return;
  item.qty = Math.min(99, Number(item.qty || 1) + 1);
  saveCart();
  updateCartUI();
  recalcShippingIfNeeded();
};

window.decQty = (idx) => {
  const item = cart[idx];
  if (!item) return;
  const next = Number(item.qty || 1) - 1;
  if (next <= 0) cart.splice(idx, 1);
  else item.qty = next;

  saveCart();
  updateCartUI();
  recalcShippingIfNeeded();
};

// --- SHIPPING ---
function handleShipModeChange(mode) {
  shippingState.mode = mode;

  const form = $("shipForm");
  if (form) form.style.display = mode === "pickup" ? "none" : "block";

  if (mode === "pickup") {
    shippingState.cost = 0;
    shippingState.label = "Gratis";
  } else if (mode === "tj") {
    shippingState.cost = 200;
    shippingState.label = "$200 Local";
  } else if (mode === "mx") {
    shippingState.cost = 0;
    shippingState.label = "Ingresa CP...";
  } else if (mode === "us") {
    shippingState.cost = 0;
    shippingState.label = "Ingresa ZIP...";
  }

  updateCartUI();
  recalcShippingIfNeeded();
}

function recalcShippingIfNeeded() {
  // No cotizamos sin items
  if (!cart.length) return;

  const cp = $("cp")?.value?.trim() || "";
  if (shippingState.mode === "mx" && cp.length === 5) quoteShipping(cp, "MX");
  if (shippingState.mode === "us" && cp.length >= 5) quoteShipping(cp, "US");
}

async function quoteShipping(zip, country) {
  const shipTotal = $("shipTotal");
  if (shipTotal) shipTotal.innerText = "Cotizando...";

  try {
    const qty = cart.reduce((acc, i) => acc + Number(i.qty || 0), 0) || 1;

    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, items: qty, country }),
    });

    const data = await res.json().catch(() => ({}));

    if (data.ok && data.cost) {
      shippingState.cost = Number(data.cost) || 0;
      shippingState.label = data.label || "Cotización";
    } else {
      shippingState.cost = country === "US" ? 800 : 250;
      shippingState.label = "Estándar";
    }
  } catch (e) {
    shippingState.cost = country === "US" ? 800 : 250;
    shippingState.label = "Estándar";
  }

  updateCartUI();
}

// --- RENDER CART ---
function updateCartUI() {
  const c = $("cartItems");
  if (!c) {
    // Si el drawer HTML se carga desde otro archivo y aún no está, no tronamos.
    return;
  }

  let total = 0;
  let q = 0;

  const html = cart
    .map((i, idx) => {
      const p = (catalogData.products || []).find((x) => String(x.id) === String(i.id));
      if (!p) return "";

      const unit = Number(p.baseMXN || 0);
      const qty = Math.max(1, Number(i.qty || 1));
      const line = unit * qty;

      total += line;
      q += qty;

      const img = cleanUrl(p.img || (p.images && p.images[0]) || "/assets/logo-score.webp");
      const name = safeText(p.name || "Producto");
      const size = safeText(i.size || "Unitalla");

      const fakeOldUnit = Math.round(unit * FAKE_MARKUP_FACTOR);
      const discountRow = PROMO_ACTIVE
        ? `<div class="cMeta"><span style="text-decoration:line-through;color:#999;">${money(fakeOldUnit)}</span> <b style="color:#111;">${money(unit)}</b> · 80% OFF</div>`
        : `<div class="cMeta">Unit: ${money(unit)}</div>`;

      return `
        <div class="cartItem">
          <img class="cartThumb" src="${img}" alt="${name}" loading="lazy">
          <div class="cInfo">
            <div class="cName">${name}</div>
            <div class="cMeta">Talla: <b>${size}</b></div>
            ${discountRow}
            <div class="qtyRow">
              <button type="button" class="qtyBtn" onclick="decQty(${idx})" aria-label="Menos">−</button>
              <div class="qtyVal">${qty}</div>
              <button type="button" class="qtyBtn" onclick="incQty(${idx})" aria-label="Más">+</button>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="cPrice">${money(line)}</div>
            <button type="button" class="linkDanger" onclick="removeFromCart(${idx})">Quitar</button>
          </div>
        </div>
      `;
    })
    .join("");

  c.innerHTML = html;

  const emptyEl = $("cartEmpty");
  if (emptyEl) emptyEl.style.display = q > 0 ? "none" : "block";

  const cartCount = $("cartCount");
  if (cartCount) cartCount.innerText = String(q);

  const subTotal = $("subTotal");
  if (subTotal) subTotal.innerText = money(total);

  const grandTotal = $("grandTotal");
  if (grandTotal) grandTotal.innerText = money(total + Number(shippingState.cost || 0));

  const shipTotal = $("shipTotal");
  if (shipTotal) shipTotal.innerText = shippingState.label || "—";
}

document.addEventListener("DOMContentLoaded", init);