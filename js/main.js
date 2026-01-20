/* SCORE STORE ENGINE v5.0 (MOBILE OPTIMIZED) */

const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/api" : "/.netlify/functions";
const CART_KEY = "score_cart_v5";

let cart = [];
let catalogData = { products: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };
let selectedSizeByProduct = {};
let activeDiscount = 0;
let db = null;

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

async function init() {
  if (window.supabase) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  
  await loadCatalogLocal();
  loadCart();
  setupListeners();
  
  // Animación de entrada
  setTimeout(() => {
    const splash = $("splash-screen");
    if(splash) { splash.style.opacity = 0; setTimeout(() => splash.remove(), 500); }
    document.querySelectorAll(".scroll-reveal").forEach(el => el.style.opacity = 1);
  }, 1500);

  if (db) enrichWithDB();
}

async function loadCatalogLocal() {
  try {
    const res = await fetch("/data/catalog.json");
    catalogData = await res.json();
  } catch (e) { console.error(e); }
}

async function enrichWithDB() {
  try {
    const { data } = await db.from("products").select("id, sku, price, active, name");
    if (data) {
      catalogData.products = catalogData.products.map(local => {
        const match = data.find(r => r.sku === local.sku);
        return match ? { ...local, baseMXN: match.price, db_id: match.id } : local;
      });
    }
  } catch (e) { console.warn(e); }
}

// UI LOGIC
window.openCatalog = (sectionId, title) => {
  const items = catalogData.products.filter(p => p.sectionId === sectionId);
  $("catTitle").innerText = title;
  const container = $("catContent");
  container.innerHTML = "";
  
  if (!items.length) {
    container.innerHTML = "<div style='text-align:center;padding:40px;color:#999'>Próximamente</div>";
  } else {
    const grid = document.createElement("div"); grid.className = "catGrid";
    items.forEach(p => {
      // Talla por defecto
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = (p.sizes||["UNITALLA"])[0];
      
      const price = p.baseMXN || 0;
      const el = document.createElement("div"); el.className = "prodCard";
      
      // Construir tallas
      const sizesHtml = (p.sizes||["UNITALLA"]).map(s => 
        `<div class="size-pill ${selectedSizeByProduct[p.id]===s?'active':''}" 
              onclick="selectSize('${p.id}','${s}', this)">${s}</div>`
      ).join("");

      el.innerHTML = `
        <div class="metallic-frame"><img src="${p.img}" class="prodImg" loading="lazy"></div>
        <div class="prodName">${p.name}</div>
        <div class="prodPrice">${money(price)}</div>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;margin:5px 0;">${sizesHtml}</div>
        <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
      `;
      grid.appendChild(el);
    });
    container.appendChild(grid);
  }
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
};

window.selectSize = (pid, size, el) => {
  selectedSizeByProduct[pid] = size;
  // Visual update logic simple
  el.parentElement.querySelectorAll(".size-pill").forEach(x => x.classList.remove("active"));
  el.classList.add("active");
};

window.addToCart = (id) => {
  const size = selectedSizeByProduct[id] || "UNITALLA";
  const existing = cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });
  saveCart();
  updateCartUI();
  // Feedback visual rápido
  const btn = event.target;
  const originalText = btn.innerText;
  btn.innerText = "¡LISTO!";
  btn.style.background = "#000";
  setTimeout(() => { btn.innerText = originalText; btn.style.background = "var(--score-red)"; }, 1000);
};

function updateCartUI() {
  const count = cart.reduce((acc, i) => acc + i.qty, 0);
  
  // Actualizar ambos contadores (Desktop y Mobile)
  if($("cartCountDesktop")) $("cartCountDesktop").innerText = count;
  if($("cartCountMobile")) {
    $("cartCountMobile").innerText = count;
    $("cartCountMobile").style.display = count > 0 ? "flex" : "none";
  }

  // Render items cart
  const container = $("cartItems");
  if(!container) return;
  
  if (cart.length === 0) {
    $("cartEmpty").style.display = "block";
    container.innerHTML = "";
    $("grandTotal").innerText = "$0.00";
    return;
  }
  
  $("cartEmpty").style.display = "none";
  let total = 0;
  
  container.innerHTML = cart.map((item, idx) => {
    const p = catalogData.products.find(x => x.id === item.id);
    if (!p) return "";
    const lineTotal = p.baseMXN * item.qty;
    total += lineTotal;
    return `
      <div style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
        <img src="${p.img}" style="width:60px; height:60px; object-fit:contain; border:1px solid #eee; border-radius:8px;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:13px;">${p.name}</div>
          <div style="font-size:12px; color:#666;">Talla: ${item.size}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
            <div style="font-weight:700;">${money(p.baseMXN)}</div>
            <div style="display:flex; align-items:center; gap:8px;">
               <button onclick="modQty(${idx}, -1)" style="width:24px;height:24px;border:1px solid #ddd;background:#fff;border-radius:4px;">-</button>
               <span style="font-size:13px;font-weight:700;">${item.qty}</span>
               <button onclick="modQty(${idx}, 1)" style="width:24px;height:24px;border:1px solid #ddd;background:#fff;border-radius:4px;">+</button>
            </div>
          </div>
        </div>
        <button onclick="remItem(${idx})" style="border:none;background:none;color:red;font-size:18px;">&times;</button>
      </div>
    `;
  }).join("");

  const finalTotal = (total * (1 - activeDiscount)) + (shippingState.cost || 0);
  $("grandTotal").innerText = money(finalTotal);
}

window.modQty = (idx, delta) => {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  saveCart();
  updateCartUI();
};
window.remItem = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };

window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(el => el.classList.remove("active"));
};

window.checkout = async () => {
  const btn = $("checkoutBtn");
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;
  
  try {
    const payload = {
      items: cart.map(i => {
        const p = catalogData.products.find(x => x.id === i.id);
        return { id: p.db_id || p.id, sku: p.sku, qty: i.qty, size: i.size };
      }),
      mode: shippingState.mode,
      customer: { 
        name: $("name")?.value || "Cliente", 
        postal_code: $("cp")?.value || "00000" 
      },
      discountFactor: activeDiscount
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)
    });
    const json = await res.json();
    if(json.url) window.location.href = json.url;
    else throw new Error("Error iniciando pago");
    
  } catch(e) {
    alert("Error: " + e.message);
    btn.innerText = "PAGAR AHORA";
    btn.disabled = false;
  }
};

// Utils
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) cart = JSON.parse(s); }
function setupListeners() {
  const radios = document.getElementsByName("shipMode");
  radios.forEach(r => r.addEventListener("change", (e) => {
    shippingState.mode = e.target.value;
    $("shipForm").style.display = e.target.value === "pickup" ? "none" : "block";
    updateCartUI(); 
  }));
}

document.addEventListener("DOMContentLoaded", init);
