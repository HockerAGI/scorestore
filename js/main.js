/* SCORE STORE LOGIC — FINAL MASTER v2.3 (PROMO CODES + CATALOG FIX) */

// CREDENCIALES REALES
const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_prod_v5";

// CONFIGURACIÓN OBLIGATORIA
let PROMO_ACTIVE = true;
let FAKE_MARKUP_FACTOR = 1.6;

// ESTADO GLOBAL
let cart = [];
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};
let activeDiscount = 0; // 0.0 a 1.0 (ej. 0.20 para 20%)

// VARIABLE BD (Renombrada para evitar conflictos)
let db = null; 

const $ = (id) => document.getElementById(id);

const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

const cleanUrl = (url) => {
  if (!url) return "";
  return encodeURI(String(url).trim());
};

const safeText = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

let _splashInitialized = false;
let _listenersBound = false;

// --- INIT ---
async function init() {
  console.log("🚀 Iniciando Score Store v2.3...");

  if (window.supabase) {
      try {
          db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } catch (err) {
          console.error("Error iniciando Supabase Client:", err);
      }
  }

  initSplash();
  loadCart();

  try {
    await loadCatalogFromDB();
    await loadSiteConfig();
  } catch (e) {
    console.warn("Offline mode / Fallback active:", e);
    await loadCatalogLocal();
  }

  setupListeners();
  updateCartUI();
  initScrollReveal();
  handleQueryActions();
}

function handleQueryActions() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("status") === "success") {
    toast("¡Pago exitoso! Gracias por tu compra.");
    if (typeof fbq === "function") fbq("track", "Purchase", { currency: "MXN", value: 0.0 });
    emptyCart(true);
    clearQueryPreservingPath();
    return;
  }

  if (params.get("openCart") === "1") {
    setTimeout(() => { if ($("drawer")) openDrawer(); }, 500);
    clearQueryPreservingPath();
    return;
  }
}

function clearQueryPreservingPath() {
  const path = window.location.pathname || "/";
  window.history.replaceState({}, document.title, path);
}

// --- SPLASH SCREEN ---
function initSplash() {
  if (_splashInitialized) return;
  _splashInitialized = true;

  const splash = $("splash-screen") || document.querySelector('.splash');
  if (splash) {
    setTimeout(() => splash.classList.add("hidden"), 2200);
  }
  // Safety timeout
  setTimeout(() => {
    if (splash && !splash.classList.contains("hidden")) {
      splash.classList.add("hidden");
    }
  }, 4500);
}

function initScrollReveal() {
  const els = document.querySelectorAll(".scroll-reveal");
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
  els.forEach((el) => observer.observe(el));
}

// --- DATA LAYER ---
async function loadSiteConfig() {
  if (!db) return;
  const { data: org } = await db.from("organizations").select("id").eq("slug", "score-store").single();
  if (!org?.id) return;
  const { data: config } = await db.from("site_settings").select("*").eq("org_id", org.id).single();
  if (!config) return;

  const h1 = $("hero-title");
  if (h1 && config.hero_title) h1.innerHTML = config.hero_title;

  if (config.promo_active === false) {
    PROMO_ACTIVE = false;
    const bar = $("promo-bar");
    if (bar) bar.style.display = "none";
  }

  if (config.pixel_id && typeof window.fbq !== "function") {
    // Pixel init code here if needed
    fbq("init", config.pixel_id);
    fbq("track", "PageView");
  }
}

async function loadCatalogFromDB() {
  if (!db) throw new Error("No client");
  const { data: org } = await db.from("organizations").select("id").eq("slug", "score-store").single();
  if (!org?.id) throw new Error("Org not found");
  
  const { data: products } = await db.from("products").select("*").eq("org_id", org.id).eq("active", true);
  if (!products || products.length === 0) throw new Error("No data");

  catalogData.products = products.map((p) => ({
    id: p.id,
    name: p.name,
    baseMXN: p.price,
    sectionId: p.category || "BAJA_1000",
    img: p.image_url || "/assets/logo-score.webp",
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
    const res = await fetch("/data/catalog.json");
    if (!res.ok) throw new Error("catalog.json missing");
    catalogData = await res.json();
  } catch (e) {
    catalogData = { products: [], sections: [] };
  }
}

function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) { try { cart = JSON.parse(saved) || []; } catch { cart = []; } }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

// --- CATALOG OPENER (CORREGIDO) ---
window.openCatalog = (sectionId, titleFallback) => {
  const items = (catalogData.products || []).filter(
    (p) => p.sectionId === sectionId || (p.name && String(p.name).toUpperCase().includes(sectionId.replace("_", " ")))
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
    console.error("ERROR CRÍTICO: No se encontró el elemento 'catContent'. Revisa tu index.html.");
    return;
  }

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "catGrid";

    items.forEach((p) => {
      const sizes = p.sizes || ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];

      const sizesHtml = sizes.map((sz) => {
          const active = selectedSizeByProduct[p.id] === sz ? "active" : "";
          return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
        }).join("");

      const sellPrice = Number(p.baseMXN || 0);
      const fakeOldPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
      const priceHtml = PROMO_ACTIVE
        ? `<div class="price-container"><span class="old-price">${money(fakeOldPrice)}</span><span class="new-price">${money(sellPrice)}</span></div>`
        : `<div class="prodPrice">${money(sellPrice)}</div>`;

      const el = document.createElement("div");
      el.className = "prodCard";
      el.innerHTML = `
        <div class="metallic-frame">
          ${PROMO_ACTIVE ? '<div class="promo-badge">80% OFF</div>' : ""}
          <div class="prod-slider">
            <div class="prod-slide">
              <img src="${cleanUrl(p.img)}" class="prodImg" loading="lazy" alt="${safeText(p.name)}">
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

// --- PROMO LOGIC (NUEVO) ---
window.applyPromo = () => {
  const input = $("promoCodeInput");
  if(!input) return;
  
  const code = input.value.trim().toUpperCase();
  
  if (code === "SCORE25" || code === "BAJA25") {
    activeDiscount = 0.25;
    toast("¡Cupón del 25% aplicado!");
  } else if (code === "SCORE10") {
    activeDiscount = 0.10;
    toast("¡Cupón del 10% aplicado!");
  } else if (code === "") {
    activeDiscount = 0;
    toast("Cupón removido");
  } else {
    activeDiscount = 0;
    toast("Código inválido o expirado");
  }
  
  updateCartUI();
};

function setupListeners() {
  if (_listenersBound) return;
  _listenersBound = true;

  document.addEventListener("click", (e) => {
    // Size selector
    const btnSize = e.target.closest && e.target.closest("[data-size]");
    if (btnSize) {
      const pid = btnSize.dataset.pid;
      const size = btnSize.dataset.size;
      selectedSizeByProduct[pid] = size;
      const row = btnSize.parentElement;
      if (row) row.querySelectorAll(".size-pill").forEach((p) => p.classList.remove("active"));
      btnSize.classList.add("active");
      return;
    }
    // Add to cart
    const btnAdd = e.target.closest && e.target.closest("[data-add]");
    if (btnAdd) {
      const pid = btnAdd.dataset.add;
      const size = selectedSizeByProduct[pid] || "Unitalla";
      addToCart(pid, size);
      return;
    }
  });

  const bindShipMode = () => {
    const radios = document.getElementsByName("shipMode");
    if (!radios) return;
    Array.from(radios).forEach((r) => {
      r.addEventListener("change", (ev) => handleShipModeChange(ev.target.value));
    });
  };

  const bindCp = () => {
    const cpInput = $("cp");
    if (!cpInput || cpInput._bound) return;
    cpInput._bound = true;
    cpInput.addEventListener("input", (ev) => {
      const val = ev.target.value.replace(/[^0-9-]/g, "").slice(0, 10);
      ev.target.value = val;
      if (!cart.length) return;
      if (shippingState.mode === "mx" && val.length === 5) quoteShipping(val, "MX");
      else if (shippingState.mode === "us" && val.length >= 5) quoteShipping(val, "US");
    });
  };

  bindShipMode();
  bindCp();
  setTimeout(() => { bindShipMode(); bindCp(); updateCartUI(); }, 500);
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

  if (btn) { btn.disabled = true; btn.innerText = "Procesando..."; }

  try {
    const payload = {
      items: cart,
      mode,
      customer: { name, address: addr, postal_code: cp },
      promo: PROMO_ACTIVE,
      shipping: { cost: shippingState.cost, label: shippingState.label },
      discountFactor: activeDiscount // Enviar descuento al backend si se soporta
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
    if (btn) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
  }
};

/* UTILS */
window.openModal = (id) => {
  const el = $(id);
  if (!el) return;
  el.classList.add("active");
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

window.openLegal = (key) => {
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
  const existing = cart.find((i) => String(i.id) === String(id) && i.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });
  saveCart();
  updateCartUI();
  toast("Agregado");
  openDrawer();
};

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  saveCart();
  updateCartUI();
};

window.emptyCart = (silent) => {
  if (silent || confirm("¿Vaciar?")) {
    cart = [];
    activeDiscount = 0; // Reset descuento
    if($("promoCodeInput")) $("promoCodeInput").value = "";
    saveCart();
    updateCartUI();
  }
};

window.toast = (m) => {
  const t = $("toast");
  if (!t) return;
  t.innerText = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
};

window.incQty = (idx) => {
  const item = cart[idx];
  if (!item) return;
  item.qty = Math.min(99, Number(item.qty || 1) + 1);
  saveCart();
  updateCartUI();
};

window.decQty = (idx) => {
  const item = cart[idx];
  if (!item) return;
  const next = Number(item.qty || 1) - 1;
  if (next <= 0) cart.splice(idx, 1);
  else item.qty = next;
  saveCart();
  updateCartUI();
};

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  const form = $("shipForm");
  if (form) form.style.display = mode === "pickup" ? "none" : "block";

  if (mode === "pickup") { shippingState.cost = 0; shippingState.label = "Gratis"; }
  else if (mode === "tj") { shippingState.cost = 200; shippingState.label = "$200 Local"; }
  else { shippingState.cost = 0; shippingState.label = "Ingresa CP..."; }
  
  updateCartUI();
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
  } catch {
    shippingState.cost = country === "US" ? 800 : 250;
    shippingState.label = "Estándar";
  }
  updateCartUI();
}

function updateCartUI() {
  const c = $("cartItems");
  if (!c) return;

  let total = 0;
  let q = 0;

  const html = cart.map((i, idx) => {
      const p = (catalogData.products || []).find((x) => String(x.id) === String(i.id));
      if (!p) return "";
      const unit = Number(p.baseMXN || 0);
      const qty = Math.max(1, Number(i.qty || 1));
      const line = unit * qty;
      total += line;
      q += qty;
      const img = cleanUrl(p.img);
      const name = safeText(p.name);
      
      const fakeOldUnit = Math.round(unit * FAKE_MARKUP_FACTOR);
      const discountRow = PROMO_ACTIVE
        ? `<div class="cMeta"><span style="text-decoration:line-through;color:#999;">${money(fakeOldUnit)}</span> <b style="color:#111;">${money(unit)}</b></div>`
        : `<div class="cMeta">Unit: ${money(unit)}</div>`;

      return `
        <div class="cartItem">
          <img class="cartThumb" src="${img}" alt="${name}" loading="lazy">
          <div class="cInfo">
            <div class="cName">${name}</div>
            <div class="cMeta">Talla: <b>${i.size}</b></div>
            ${discountRow}
            <div class="qtyRow">
              <button class="qtyBtn" onclick="decQty(${idx})">−</button>
              <div class="qtyVal">${qty}</div>
              <button class="qtyBtn" onclick="incQty(${idx})">+</button>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="cPrice">${money(line)}</div>
            <button class="linkDanger" onclick="removeFromCart(${idx})">Quitar</button>
          </div>
        </div>`;
    }).join("");

  c.innerHTML = html;

  const emptyEl = $("cartEmpty");
  if (emptyEl) emptyEl.style.display = q > 0 ? "none" : "block";
  if ($("cartCount")) $("cartCount").innerText = String(q);

  // CALCULOS CON PROMO
  const discountAmount = total * activeDiscount;
  const finalTotal = total - discountAmount + Number(shippingState.cost || 0);

  if ($("subTotal")) $("subTotal").innerText = money(total);
  if ($("shipTotal")) $("shipTotal").innerText = shippingState.label || "—";
  if ($("grandTotal")) $("grandTotal").innerText = money(finalTotal);

  const discRow = $("rowDiscount");
  const discVal = $("discVal");
  if (discRow && discVal) {
    if (activeDiscount > 0) {
      discRow.style.display = "flex";
      discVal.innerText = `-${money(discountAmount)}`;
    } else {
      discRow.style.display = "none";
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
    try { await init(); } catch (err) { console.error(err); }
    finally {
        const splash = $("splash-screen");
        if(splash) { splash.classList.add("hidden"); setTimeout(()=>splash.remove(), 1000); }
    }
});

setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash && !splash.classList.contains("hidden")) {
        splash.style.opacity = "0";
        setTimeout(() => splash.remove(), 500);
    }
}, 5000);