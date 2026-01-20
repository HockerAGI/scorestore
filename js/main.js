/* SCORE STORE - HYBRID ENGINE v3.0 (Design Integrity + DB Power) */

// CREDENCIALES
const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/api" : "/.netlify/functions";
const CART_KEY = "score_cart_prod_v7";

// CONFIGURACIÓN (Controlado por Admin en el futuro, fallback aquí)
let PROMO_ACTIVE = true;
let FAKE_MARKUP_FACTOR = 1.6;

// ESTADO GLOBAL
let cart = [];
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};
let activeDiscount = 0;
let db = null; 

// UTILS
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
const cleanUrl = (url) => url ? encodeURI(String(url).trim()) : "";
const safeText = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let _splashInitialized = false;
let _listenersBound = false;

// --- INICIO ---
async function init() {
  console.log("🚀 Iniciando Score Store...");

  // 1. Instanciar Supabase
  if (window.supabase) {
      try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } 
      catch (err) { console.error("Error DB:", err); }
  }

  // 2. Cargar datos locales (Prioridad Visual)
  await loadCatalogLocal(); // Carga catalog.json
  
  // 3. UI Inmediata
  setupListeners();
  updateCartUI();
  initScrollReveal();
  initSplash(); // Quita el splash

  // 4. Enriquecer con datos de DB (Segundo plano)
  if (db) {
      await enrichWithDB();
      await loadSiteConfig();
  }
  
  handleQueryActions();
}

// Carga el JSON local (Tu diseño original depende de esto para imágenes/sliders)
async function loadCatalogLocal() {
  try {
    const res = await fetch("/data/catalog.json");
    if (!res.ok) throw new Error("Fallo catalog.json");
    const json = await res.json();
    catalogData = json;
  } catch (e) { console.error(e); }
}

// Sobrescribe precios/stock con datos reales de Supabase
async function enrichWithDB() {
    try {
        const { data: dbProducts } = await db.from("products").select("id, sku, price, active, name, stock");
        if (dbProducts && dbProducts.length > 0) {
            catalogData.products = catalogData.products.map(localP => {
                // Match por SKU o Nombre
                const match = dbProducts.find(dbp => (dbp.sku && localP.sku && dbp.sku === localP.sku) || (dbp.name === localP.name));
                if (match) {
                    return {
                        ...localP, // Conserva imágenes del JSON
                        baseMXN: Number(match.price), // Precio Real DB
                        active: match.active,
                        db_id: match.id // ID Real DB
                    };
                }
                return localP;
            }).filter(p => p.active !== false); // Ocultar inactivos
            
            // Si el catálogo está abierto, refrescar precios
            if($("modalCatalog").classList.contains("active")) { /* Podríamos re-renderizar */ }
        }
    } catch (err) { console.warn("DB Sync Error:", err); }
}

// --- RENDERIZADO DEL CATÁLOGO (Respetando Sliders) ---
window.openCatalog = (sectionId, titleFallback) => {
  const items = (catalogData.products || []).filter(
    (p) => p.sectionId === sectionId || (p.name && String(p.name).toUpperCase().includes(sectionId.replace("_", " ")))
  );

  if($("catTitle")) $("catTitle").innerText = titleFallback;
  const container = $("catContent");
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "catGrid";

    items.forEach((p) => {
      // Tallas
      const sizes = p.sizes || ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];
      const sizesHtml = sizes.map((sz) => {
          const active = selectedSizeByProduct[p.id] === sz ? "active" : "";
          return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
      }).join("");

      // SLIDER: Usamos el array 'images' del JSON para que funcione el slider
      const imageList = (p.images && p.images.length > 0) ? p.images : [p.img];
      const slidesHtml = imageList.map(imgSrc => `
        <div class="prod-slide">
            <img src="${cleanUrl(imgSrc)}" class="prodImg" loading="lazy" alt="${safeText(p.name)}">
        </div>
      `).join("");

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
          <div class="prod-slider">${slidesHtml}</div>
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

// --- CARRITO Y CHECKOUT REAL ---
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
      items: cart.map(i => {
          const p = catalogData.products.find(x => x.id === i.id);
          return {
              id: p.db_id || p.id, // Preferir ID de DB
              sku: p.sku,
              qty: i.qty,
              size: i.size,
              price_data_fallback: p.baseMXN
          };
      }),
      mode,
      customer: { name, address: addr, postal_code: cp },
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

window.applyPromo = () => {
    const code = $("promoCodeInput")?.value.trim().toUpperCase();
    if (code === "SCORE25" || code === "BAJA25") { activeDiscount = 0.25; toast("¡25% OFF Aplicado!"); }
    else if (code === "SCORE10") { activeDiscount = 0.10; toast("¡10% OFF Aplicado!"); }
    else if (code === "") { activeDiscount = 0; toast("Cupón removido"); }
    else { activeDiscount = 0; toast("Código inválido"); }
    updateCartUI();
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
function loadCart() { const s = localStorage.getItem(CART_KEY); if (s) { try { cart = JSON.parse(s) || []; } catch { cart = []; } } }
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

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
    const img = (p.images && p.images.length) ? p.images[0] : p.img;
    return `<div class="cartItem">
        <img class="cartThumb" src="${cleanUrl(img)}" loading="lazy">
        <div class="cInfo"><div class="cName">${safeText(p.name)}</div><div class="cMeta">Talla: ${i.size}</div>
        <div class="cMeta">${PROMO_ACTIVE ? `<del>$${fake}</del> ` : ""}<b>${money(unit)}</b></div>
        <div class="qtyRow"><button class="qtyBtn" onclick="decQty(${idx})">-</button><div class="qtyVal">${i.qty}</div><button class="qtyBtn" onclick="incQty(${idx})">+</button></div></div>
        <div style="text-align:right;"><div class="cPrice">${money(line)}</div><button class="linkDanger" onclick="removeFromCart(${idx})">Quitar</button></div></div>`;
  }).join("");
  c.innerHTML = html;
  $("cartEmpty").style.display = q > 0 ? "none" : "block";
  if($("cartCount")) $("cartCount").innerText = q;

  const discountAmount = total * activeDiscount;
  const finalTotal = total - discountAmount + Number(shippingState.cost || 0);
  if($("subTotal")) $("subTotal").innerText = money(total);
  if($("shipTotal")) $("shipTotal").innerText = shippingState.label;
  if($("grandTotal")) $("grandTotal").innerText = money(finalTotal);
  
  const dr = $("rowDiscount");
  if(dr) { if(activeDiscount > 0) { dr.style.display="flex"; $("discVal").innerText = `-${money(discountAmount)}`; } else { dr.style.display="none"; } }
}

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
    const res = await fetch(`${API_BASE}/quote_shipping`, { method: "POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ zip, items: qty, country }) });
    const data = await res.json();
    if (data.ok) { shippingState.cost = data.cost; shippingState.label = data.label; }
    else { shippingState.cost = (country==="US"?800:250); shippingState.label = "Estándar"; }
  } catch { shippingState.cost = (country==="US"?800:250); shippingState.label = "Estándar"; }
  updateCartUI();
}

// Config y Listeners
async function loadSiteConfig() {
  if (!db) return;
  const { data: org } = await db.from("organizations").select("id").eq("slug", "score-store").single();
  if (org?.id) {
      const { data: config } = await db.from("site_settings").select("*").eq("org_id", org.id).single();
      if (config) {
          if (config.hero_title) $("hero-title").innerHTML = config.hero_title;
          if (config.promo_active === false) { PROMO_ACTIVE = false; $("promo-bar").style.display = "none"; }
          if (config.pixel_id && typeof window.fbq !== "function") { fbq("init", config.pixel_id); fbq("track", "PageView"); }
      }
  }
}
function setupListeners() {
  if (_listenersBound) return; _listenersBound = true;
  document.addEventListener("click", (e) => {
    const btnSize = e.target.closest && e.target.closest("[data-size]");
    if (btnSize) {
      const pid = btnSize.dataset.pid;
      selectedSizeByProduct[pid] = btnSize.dataset.size;
      btnSize.parentElement.querySelectorAll(".size-pill").forEach(p=>p.classList.remove("active"));
      btnSize.classList.add("active");
    }
    const btnAdd = e.target.closest && e.target.closest("[data-add]");
    if (btnAdd) addToCart(btnAdd.dataset.add, selectedSizeByProduct[btnAdd.dataset.add] || "Unitalla");
  });
  const radios = document.getElementsByName("shipMode");
  if (radios) Array.from(radios).forEach(r => r.addEventListener("change", (ev) => handleShipModeChange(ev.target.value)));
  const cpInput = $("cp");
  if (cpInput && !cpInput._bound) {
    cpInput._bound = true;
    cpInput.addEventListener("input", (ev) => {
      const val = ev.target.value.replace(/[^0-9-]/g, "").slice(0, 10); ev.target.value = val;
      if (cart.length && ((shippingState.mode === "mx" && val.length === 5) || (shippingState.mode === "us" && val.length >= 5))) quoteShipping(val, shippingState.mode.toUpperCase());
    });
  }
}
function handleQueryActions() { const p = new URLSearchParams(window.location.search); if (p.get("status")==="success") { toast("Pago exitoso"); emptyCart(true); window.history.replaceState({},"",window.location.pathname); } if (p.get("openCart")==="1") { setTimeout(()=>openDrawer(),500); window.history.replaceState({},"",window.location.pathname); } }
function initSplash() { if(_splashInitialized)return; _splashInitialized=true; const s=$("splash-screen"); if(s) setTimeout(()=>s.classList.add("hidden"),2200); }
function initScrollReveal() { const els = document.querySelectorAll(".scroll-reveal"); if (!els.length) return; els.forEach(el => el.classList.add("visible")); }

document.addEventListener("DOMContentLoaded", init);
setTimeout(() => { const s=document.getElementById("splash-screen"); if(s&&!s.classList.contains("hidden")){ s.style.opacity="0"; setTimeout(()=>s.remove(),500); }}, 5000);
window.toast = (m) => { const t = $("toast"); if (!t) return; t.innerText = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); };
window.openModal = (id) => { $(id)?.classList.add("active"); $("overlay")?.classList.add("active"); document.body.classList.add("modalOpen"); };
window.openDrawer = () => { $("drawer")?.classList.add("active"); $("overlay")?.classList.add("active"); document.body.classList.add("modalOpen"); };
window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); document.body.classList.remove("modalOpen"); };
window.openLegal = (key) => { const m = $("legalModal"); if(!m)return; m.classList.add("active"); $("overlay")?.classList.add("active"); document.body.classList.add("modalOpen"); m.querySelectorAll(".legalBlock").forEach(b => b.style.display = "none"); const k = m.querySelector(`[data-legal-block="${key}"]`); if(k) k.style.display="block"; };