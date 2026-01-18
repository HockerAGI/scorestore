/* SCORE STORE LOGIC — UNIFIED v2.0 (SAMSUNG FIX + ADMIN APP) */

// --- CREDENCIALES REALES ---
const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/api" : "/.netlify/functions";
const CART_KEY = "score_cart_prod_v4";
let PROMO_ACTIVE = false;
let FAKE_MARKUP_FACTOR = 1.0; 
let cart = [];
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};
let supabase = null;

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

// --- SAMSUNG FIX: LIMPIEZA DE URLS ---
const cleanUrl = (url) => {
  if (!url) return "";
  return encodeURI(url.trim());
};

async function init() {
  if (window.supabase) supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  
  initSplash();
  loadCart();
  
  try {
    await loadCatalogFromDB();
    await loadSiteConfig();
  } catch (e) {
    console.warn("Offline mode / Fallback", e);
    await loadCatalogLocal();
  }

  setupListeners();
  updateCartUI();
  initScrollReveal();

  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago exitoso! Gracias.");
    emptyCart(true);
    window.history.replaceState({}, document.title, "/");
  }
}

function initSplash() {
  const splash = $("splash-screen");
  if (splash) setTimeout(() => { splash.classList.add("hidden"); }, 2000);
}

function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); observer.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

// --- DATA LAYER ---
async function loadSiteConfig() {
  if (!supabase) return;
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
  if(!org) return;
  const { data: config } = await supabase.from('site_settings').select('*').eq('org_id', org.id).single();
  
  if (config) {
    const h1 = $("hero-title");
    if(h1 && config.hero_title) h1.innerHTML = config.hero_title;
    if (config.promo_active) {
      PROMO_ACTIVE = true; FAKE_MARKUP_FACTOR = 1.3;
      const bar = $("promo-bar");
      if(bar) { bar.style.display = "flex"; $("promo-text").innerHTML = config.promo_text || "🔥 OFERTA ACTIVA 🔥"; }
    }
  }
}

async function loadCatalogFromDB() {
  if (!supabase) throw new Error("No client");
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
  const { data: products } = await supabase.from('products').select('*').eq('org_id', org.id).eq('active', true);
  
  if(!products) throw new Error("No data");

  catalogData.products = products.map(p => ({
    id: p.id, name: p.name, baseMXN: p.price, sectionId: p.category || 'BAJA_1000',
    img: p.image_url || '/assets/logo-score.webp',
    images: [p.image_url || '/assets/logo-score.webp'],
    sizes: ["S","M","L","XL","2XL"], sku: p.sku
  }));
  
  catalogData.sections = [
    { "id": "BAJA_1000", "title": "BAJA 1000", "logo": "/assets/logo-baja1000.webp" },
    { "id": "BAJA_500", "title": "BAJA 500", "logo": "/assets/logo-baja500.webp" },
    { "id": "BAJA_400", "title": "BAJA 400", "logo": "/assets/logo-baja400.webp" },
    { "id": "SF_250", "title": "SAN FELIPE 250", "logo": "/assets/logo-sf250.webp" }
  ];
}

async function loadCatalogLocal() {
  const res = await fetch("/data/catalog.json");
  catalogData = await res.json();
}

// --- LOGIC ---
function loadCart() { const saved = localStorage.getItem(CART_KEY); if (saved) try { cart = JSON.parse(saved); } catch (e) {} }
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

window.openCatalog = (sectionId, titleFallback) => {
  const items = catalogData.products.filter(p => (p.sectionId === sectionId) || (p.name.toUpperCase().includes(sectionId.replace('_',' '))));
  const titleEl = $("catTitle");
  const sectionInfo = catalogData.sections.find(s => s.id === sectionId);
  
  if (sectionInfo && sectionInfo.logo) titleEl.innerHTML = `<img src="${cleanUrl(sectionInfo.logo)}" style="height:80px;width:auto;">`;
  else titleEl.innerText = titleFallback || "COLECCIÓN";
  
  const container = $("catContent");
  container.innerHTML = "";

  if (items.length === 0) container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
  else {
    const grid = document.createElement("div"); grid.className = "catGrid";
    items.forEach(p => {
      const sizes = p.sizes || ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];
      const sizesHtml = sizes.map(sz => {
        const active = (selectedSizeByProduct[p.id] === sz) ? "active" : "";
        return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
      }).join("");

      const sellPrice = p.baseMXN;
      const fakeOldPrice = Math.round(sellPrice * (PROMO_ACTIVE ? FAKE_MARKUP_FACTOR : 1));
      const priceHtml = PROMO_ACTIVE 
        ? `<div class="price-container"><span class="old-price">${money(fakeOldPrice)}</span><span class="new-price">${money(sellPrice)}</span></div>`
        : `<div class="prodPrice">${money(sellPrice)}</div>`;

      // USO DE cleanUrl PARA IMÁGENES
      const safeImg = cleanUrl(p.img);

      const el = document.createElement("div"); el.className = "prodCard";
      el.innerHTML = `
        <div class="metallic-frame">
          ${PROMO_ACTIVE ? '<div class="promo-badge">OFERTA</div>' : ''}
          <div class="prod-slider"><div class="prod-slide"><img src="${safeImg}" class="prodImg" loading="lazy"></div></div>
        </div>
        <div class="prodName">${p.name}</div>
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

function setupListeners() {
  const catContent = $("catContent");
  if (catContent) {
    catContent.addEventListener("click", (e) => {
      const btnSize = e.target.closest("[data-size]");
      if (btnSize) {
        const pid = btnSize.dataset.pid;
        const size = btnSize.dataset.size;
        selectedSizeByProduct[pid] = size;
        btnSize.parentElement.querySelectorAll(".size-pill").forEach(p => p.classList.remove("active"));
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
  document.getElementsByName("shipMode").forEach(r => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });
  
  // INPUT CP LOGIC USA/MX
  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9-]/g, "").slice(0, 10);
      e.target.value = val;
      if (shippingState.mode === "mx" && val.length === 5) quoteShipping(val, "MX");
      else if (shippingState.mode === "us" && val.length >= 5) quoteShipping(val, "US");
    });
  }
}

// ... CHECKOUT ...
window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Carrito vacío");
  const mode = shippingState.mode;
  const name = $("name")?.value.trim();
  const addr = $("addr")?.value.trim();
  const cp = $("cp")?.value.trim();

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Faltan datos de envío");
  }

  btn.disabled = true; btn.innerText = "Procesando...";

  try {
    const payload = { items: cart, mode, customer: { name, address: addr, postal_code: cp }, promo: PROMO_ACTIVE };
    const res = await fetch(`${API_BASE}/create_checkout`, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error);
  } catch (err) {
    toast("Error: " + err.message);
    btn.disabled = false; btn.innerText = "PAGAR AHORA";
  }
};

/* UTILS */
window.openModal = (id) => { $(id)?.classList.add("active"); $("overlay")?.classList.add("active"); };
window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); };
window.addToCart = (id, size) => {
  const existing = cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty++; else cart.push({ id, size, qty: 1 });
  saveCart(); updateCartUI(); toast("Agregado"); window.openDrawer();
  if(typeof fbq === 'function') fbq('track', 'AddToCart', { content_ids: [id], content_type: 'product' });
};
window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
window.emptyCart = (silent) => { if(silent || confirm("¿Vaciar?")) { cart=[]; saveCart(); updateCartUI(); }};
window.toast = (m) => { const t=$("toast"); t.innerText=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),3000); };
window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  $("shipForm").style.display = (mode === "pickup") ? "none" : "block";
  if (mode === "pickup") { shippingState.cost = 0; shippingState.label = "Gratis"; }
  else if (mode === "tj") { shippingState.cost = 200; shippingState.label = "$200 Local"; }
  else if (mode === "mx") { shippingState.cost = 0; shippingState.label = "Ingresa CP..."; }
  else if (mode === "us") { shippingState.cost = 0; shippingState.label = "Ingresa ZIP..."; }
  updateCartUI();
}

async function quoteShipping(zip, country) {
  $("shipTotal").innerText = "Cotizando...";
  try {
    const qty = cart.reduce((acc, i) => acc + i.qty, 0);
    const res = await fetch(`${API_BASE}/quote_shipping`, { method: "POST", body: JSON.stringify({ zip, items: qty, country }) });
    const data = await res.json();
    if (data.ok && data.cost) { shippingState.cost = data.cost; shippingState.label = data.label; }
    else { shippingState.cost = (country==="US")?800:250; shippingState.label = "Estándar"; }
  } catch (e) { shippingState.cost = (country==="US")?800:250; shippingState.label = "Estándar"; }
  updateCartUI();
}

function updateCartUI() {
    const c = $("cartItems");
    let total = 0, q = 0;
    c.innerHTML = cart.map((i, idx) => {
        const p = catalogData.products.find(x => x.id == i.id); 
        if(!p) return ""; 
        const st = p.baseMXN * i.qty; total+=st; q+=i.qty;
        return `<div class="cartItem"><div><b>${p.name}</b><br>${i.size}</div><div>${money(st)} <button onclick="removeFromCart(${idx})">x</button></div></div>`;
    }).join("");
    $("cartCount").innerText = q;
    $("subTotal").innerText = money(total);
    $("grandTotal").innerText = money(total + shippingState.cost);
    if($("shipTotal")) $("shipTotal").innerText = shippingState.label;
}

document.addEventListener('DOMContentLoaded', init);
