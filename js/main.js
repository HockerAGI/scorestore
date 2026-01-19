/* SCORE STORE LOGIC — FINAL MASTER v2.4 (Unified + Promo + Fallback) */

// CREDENCIALES
const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/api" : "/.netlify/functions";
const CART_KEY = "score_cart_prod_v5";

// CONFIGURACIÓN OBLIGATORIA
let PROMO_ACTIVE = true;
let FAKE_MARKUP_FACTOR = 1.6;

// ESTADO GLOBAL
let cart = [];
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};
let activeDiscount = 0; // 0.0 a 1.0

// VARIABLE BD (Evita conflicto con window.supabase)
let db = null; 

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
const cleanUrl = (url) => url ? encodeURI(String(url).trim()) : "";
const safeText = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let _splashInitialized = false;
let _listenersBound = false;

// --- INIT ---
async function init() {
  console.log("🚀 Iniciando Score Store v2.4...");

  if (window.supabase) {
      try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } 
      catch (err) { console.error("Error Supabase Client:", err); }
  }

  initSplash();
  loadCart();

  try {
    // Intentar cargar de Supabase
    await loadCatalogFromDB();
    await loadSiteConfig();
  } catch (e) {
    console.warn("⚠️ Offline/Fallback mode active:", e);
    // Fallback al JSON local original
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
  if (splash) setTimeout(() => splash.classList.add("hidden"), 2200);
}

function initScrollReveal() {
  const els = document.querySelectorAll(".scroll-reveal");
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("visible"); observer.unobserve(e.target); }
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
     fbq("init", config.pixel_id); fbq("track", "PageView");
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
    sku: p.sku
  }));

  // Secciones estáticas (no cambian)
  catalogData.sections = [
    { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp" },
    { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp" },
    { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp" },
    { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp" },
  ];
}

async function loadCatalogLocal() {
  // Fallback al JSON original si no hay DB
  const res = await fetch("/data/catalog.json");
  if (!res.ok) throw new Error("Local catalog missing");
  const json = await res.json();
  // Normalizar estructura local a la estructura de la App
  catalogData.products = (json.products || []).map(p => ({
     id: p.id,
     name: p.name,
     baseMXN: p.baseMXN,
     sectionId: p.sectionId,
     img: p.images ? p.images[0] : p.img, // Usar la primera imagen del array
     sizes: p.sizes,
     sku: p.sku
  }));
  catalogData.sections = json.sections || [];
}

// --- CART ---
function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) { try { cart = JSON.parse(saved) || []; } catch { cart = []; } }
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

// --- CATALOG UI ---
window.openCatalog = (sectionId, titleFallback) => {
  // Filtrar productos
  const items = (catalogData.products || []).filter(
    (p) => p.sectionId === sectionId || (p.name && String(p.name).toUpperCase().includes(sectionId.replace("_", " ")))
  );

  const titleEl = $("catTitle");
  const sectionInfo = (catalogData.sections || []).find((s) => s.id === sectionId);

  if (titleEl) {
    if (sectionInfo && sectionInfo.logo) {
      titleEl.innerHTML = `<img src="${cleanUrl(sectionInfo.logo)}" style="height:80px;width:auto;" alt="${safeText(sectionInfo.title)}">`;
    } else {
      titleEl.innerText = titleFallback || "COLECCIÓN";
    }
  }

  const container = $("catContent");
  if (!container) return console.error("Falta #catContent en HTML");

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
            <div class="prod-slide"><img src="${cleanUrl(p.img)}" class="prodImg" loading="lazy" alt="${safeText(p.name)}"></div>
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

// --- PROMO LOGIC ---
window.applyPromo = () => {
  const input = $("promoCodeInput");
  if(!input) return;
  const code = input.value.trim().toUpperCase();
  
  if (code === "SCORE25" || code === "BAJA25") {
    activeDiscount = 0.25; toast("¡Cupón del 25% aplicado!");
  } else if (code === "SCORE10") {
    activeDiscount = 0.10; toast("¡Cupón del 10% aplicado!");
  } else if (code === "") {
    activeDiscount = 0; toast("Cupón removido");
  } else {
    activeDiscount = 0; toast("Código inválido");
  }
  updateCartUI();
};

function setupListeners() {
  if (_listenersBound) return;
  _listenersBound = true;

  document.addEventListener("click", (e) => {
    // Select Size
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
    // Add Cart
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
    Array.from(radios).forEach(r => r.addEventListener("change", (ev) => handleShipModeChange(ev.target.value)));
  };
  const bindCp = () => {
    const cpInput = $("cp");
    if (!cpInput || cpInput._bound) return;
    cpInput._bound = true;
    cpInput.addEventListener("input", (ev) => {
      const val = ev.target.value.replace(/[^0-9-]/g, "").slice(0, 10);
      ev.target.value = val;
      if (cart.length && ((shippingState.mode === "mx" && val.length === 5) || (shippingState.mode === "us" && val.length >= 5))) {
        quoteShipping(val, shippingState.mode.toUpperCase());
      }
    });
  };

  bindShipMode();
  bindCp();
  setTimeout(() => { bindShipMode(); bindCp(); updateCartUI(); }, 500);
}

// --- CHECKOUT & UI HELPER ---
window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Carrito vacío");
  const mode = shippingState.mode;
  const name = $("name")?.value.trim() || "";
  const addr = $("addr")?.value.trim() || "";
  const cp = $("cp")?.value.trim() || "";

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Faltan datos de envío");
  }
  if (btn) { btn.disabled = true; btn.innerText = "Procesando..."; }

  try {
    const payload = {
      items: cart, mode, customer: { name, address: addr, postal_code: cp },
      promo: PROMO_ACTIVE,
      shipping: { cost: shippingState.cost, label: shippingState.label },
      discountFactor: activeDiscount
    };
    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    throw new Error(data.error || "Error al iniciar pago");
  } catch (err) {
    toast("Error: " + (err.message));
    if (btn) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
  }
};

window.addToCart = (id, size) => {
  const existing = cart.find(i => String(i.id) === String(id) && i.size === size);
  if (existing) existing.qty++; else cart.push({ id, size, qty: 1 });
  saveCart(); updateCartUI(); toast("Agregado"); openDrawer();
};
window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
window.emptyCart = (silent) => { if (silent || confirm("¿Vaciar?")) { cart = []; activeDiscount = 0; if($("promoCodeInput")) $("promoCodeInput").value=""; saveCart(); updateCartUI(); } };
window.incQty = (idx) => { cart[idx].qty = Math.min(99, cart[idx].qty + 1); saveCart(); updateCartUI(); };
window.decQty = (idx) => { cart[idx].qty--; if(cart[idx].qty <= 0) cart.splice(idx,1); saveCart(); updateCartUI(); };

window.toast = (m) => {
  const t = $("toast"); if (!t) return;
  t.innerText = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000);
};
window.openModal = (id) => { $(id)?.classList.add("active"); $("overlay")?.classList.add("active"); document.body.classList.add("modalOpen"); };
window.openDrawer = () => { $("drawer")?.classList.add("active"); $("overlay")?.classList.add("active"); document.body.classList.add("modalOpen"); };
window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); document.body.classList.remove("modalOpen"); };
window.openLegal = (key) => {
  const m = $("legalModal"); if(!m) return;
  m.classList.add("active"); $("overlay")?.classList.add("active"); document.body.classList.add("modalOpen");
  m.querySelectorAll(".legalBlock").forEach(b => b.style.display = "none");
  const blk = m.querySelector(`[data-legal-block="${key}"]`);
  if(blk) blk.style.display = "block";
};

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  $("shipForm").style.display = mode === "pickup" ? "none" : "block";
  if (mode === "pickup") { shippingState.cost = 0; shippingState.label = "Gratis"; }
  else if (mode === "tj") { shippingState.cost = 200; shippingState.label = "Local Express"; }
  else { shippingState.cost = 0; shippingState.label = "Cotizar..."; }
  updateCartUI();
}

async function quoteShipping(zip, country) {
  $("shipTotal").innerText = "Cotizando...";
  try {
    const qty = cart.reduce((acc, i) => acc + i.qty, 0);
    const res = await fetch(`${API_BASE}/quote_shipping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zip, items: qty, country }) });
    const data = await res.json();
    if (data.ok) { shippingState.cost = data.cost; shippingState.label = data.label; }
    else { shippingState.cost = (country==="US"?800:250); shippingState.label = "Estándar"; }
  } catch { shippingState.cost = (country==="US"?800:250); shippingState.label = "Estándar"; }
  updateCartUI();
}

function updateCartUI() {
  const c = $("cartItems"); if (!c) return;
  let total = 0, q = 0;
  const html = cart.map((i, idx) => {
    const p = catalogData.products.find(x => String(x.id) === String(i.id));
    if (!p) return "";
    const unit = Number(p.baseMXN || 0);
    const line = unit * i.qty;
    total += line; q += i.qty;
    const fake = Math.round(unit * FAKE_MARKUP_FACTOR);
    return `
      <div class="cartItem">
        <img class="cartThumb" src="${cleanUrl(p.img)}" loading="lazy">
        <div class="cInfo">
          <div class="cName">${safeText(p.name)}</div>
          <div class="cMeta">Talla: ${i.size}</div>
          <div class="cMeta">${PROMO_ACTIVE ? `<del>$${fake}</del> ` : ""}<b>${money(unit)}</b></div>
          <div class="qtyRow">
            <button class="qtyBtn" onclick="decQty(${idx})">-</button>
            <div class="qtyVal">${i.qty}</div>
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
  $("cartEmpty").style.display = q > 0 ? "none" : "block";
  if($("cartCount")) $("cartCount").innerText = q;

  const discountAmount = total * activeDiscount;
  const finalTotal = total - discountAmount + Number(shippingState.cost || 0);

  if($("subTotal")) $("subTotal").innerText = money(total);
  if($("shipTotal")) $("shipTotal").innerText = shippingState.label || "—";
  if($("grandTotal")) $("grandTotal").innerText = money(finalTotal);
  
  const dr = $("rowDiscount");
  if(dr) {
      if(activeDiscount > 0) { dr.style.display="flex"; $("discVal").innerText = `-${money(discountAmount)}`; }
      else { dr.style.display="none"; }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
    try { await init(); } catch (err) { console.error(err); }
    finally { const s = $("splash-screen"); if(s) { s.classList.add("hidden"); setTimeout(()=>s.remove(), 1000); } }
});
setTimeout(() => { const s = document.getElementById("splash-screen"); if(s && !s.classList.contains("hidden")) { s.style.opacity="0"; setTimeout(()=>s.remove(), 500); } }, 5000);