/**
 * SCORE STORE - main.js (FUSION: Desert PRO + Shared Logic)
 * Incluye: Cupones, Validaciones seguras, Renderizado blanco para legibilidad.
 */
const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; 
const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";
const API_BASE = (location.hostname.includes("netlify")) ? "/.netlify/functions" : "/api";

let catalog = null;
let promoState = safeJson(localStorage.getItem(LS_PROMO), null);
let cart = safeJson(localStorage.getItem(LS_CART), []);
let ship = { mode: "pickup", mxn: 0, label: "Pickup" };

const $ = (id) => document.getElementById(id);
const moneyMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

function safeJson(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2500);
}

function saveCart() { localStorage.setItem(LS_CART, JSON.stringify(cart)); }
function cartCount() { return cart.reduce((a, b) => a + Number(b.qty || 0), 0); }
function subtotal() { return cart.reduce((a, b) => a + (Number(b.price || 0) * Number(b.qty || 0)), 0); }

function promoDiscountAmount(sub) {
  if (!promoState) return 0;
  if (promoState.type === "pct") return Math.round(sub * (Number(promoState.value) / 100));
  if (promoState.type === "mxn") return Math.min(sub, Number(promoState.value));
  return 0;
}

/* UI UPDATES */
function renderCartBody() {
  const body = $("cartBody");
  if (!body) return;
  
  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center; padding:40px 20px; opacity:.6; color:#aaa;">Tu carrito está vacío</div>`;
    return;
  }

  // Usamos el estilo "tarjeta blanca" para garantizar legibilidad en modo oscuro
  body.innerHTML = cart.map((i, idx) => `
    <div class="cart-item-card">
      <img src="${i.img}" alt="" class="cart-thumb-img">
      <div style="flex:1;">
        <div class="cart-prod-name">${i.name}</div>
        <div class="cart-prod-meta">Talla: ${i.size}</div>
        <div class="cart-prod-price">${moneyMXN(i.price)}</div>
      </div>
      <div style="text-align:right;">
        <button type="button" onclick="removeFromCart(${idx})" class="btn-remove">&times;</button>
        <div style="font-weight:800; font-size:13px; color:#111;">x${i.qty}</div>
      </div>
    </div>
  `).join("");
}

window.removeFromCart = function(idx) {
  cart.splice(idx, 1);
  saveCart();
  updateCart({ recalcShip: true });
};

async function updateCart({ recalcShip } = { recalcShip: true }) {
  const radio = document.querySelector('input[name="shipMode"]:checked');
  const selected = radio ? radio.value : "pickup";
  
  ship.mode = selected;
  const form = $("shipForm");
  if (form) form.style.display = (selected === "mx" || selected === "tj") ? "block" : "none";

  if (selected === "pickup") { ship.mxn = 0; ship.label = "Pickup"; }
  else if (selected === "tj") { ship.mxn = 200; ship.label = "Local TJ"; }
  else if (selected === "mx") { ship.mxn = 250; ship.label = "Nacional"; }

  const sub = subtotal();
  const disc = promoDiscountAmount(sub);
  const total = Math.max(0, sub - disc) + Number(ship.mxn || 0);

  if ($("cartCount")) {
      const cnt = cartCount();
      $("cartCount").innerText = cnt;
      $("cartCount").style.display = cnt > 0 ? "flex" : "none";
  }
  
  if ($("lnSub")) $("lnSub").innerText = moneyMXN(sub);
  if ($("lnShip")) $("lnShip").innerText = moneyMXN(ship.mxn || 0);
  if ($("lnTotal")) $("lnTotal").innerText = moneyMXN(total);
  if ($("barTotal")) $("barTotal").innerText = moneyMXN(total);

  const rDisc = $("rowDiscount");
  if (rDisc) {
      if (disc > 0) {
          rDisc.style.display = "flex";
          if ($("lnDiscount")) $("lnDiscount").innerText = `- ${moneyMXN(disc)}`;
          if ($("promoTag")) $("promoTag").innerText = promoState.code;
      } else {
          rDisc.style.display = "none";
      }
  }

  renderCartBody();
  $("paybar")?.classList.toggle("visible", cart.length > 0);

  // Validación
  let valid = cart.length > 0;
  if (selected !== "pickup") {
    const cpVal = $("cp")?.value || "";
    const addrVal = $("addr")?.value || "";
    valid = valid && (cpVal.trim().length === 5) && (addrVal.trim().length > 3);
  }
  
  const btn = $("payBtn");
  if(btn) btn.disabled = !valid;
}

/* ACTIONS */
window.openDrawer = function() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
  updateCart();
};

window.closeAll = function() {
  $("drawer").classList.remove("active");
  $("modalCatalog").classList.remove("active");
  $("legalModal")?.classList.remove("active"); 
  $("overlay").classList.remove("active");
  document.body.classList.remove("modalOpen");
};

window.openCatalog = async function(sectionId, title) {
  const tEl = $("catTitle");
  if(tEl) tEl.innerText = title;
  
  const content = $("catContent");
  content.innerHTML = '<div style="text-align:center; padding:40px; color:#ccc;">Cargando productos...</div>';
  
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  if (!catalog) catalog = await fetch("/data/catalog.json").then(r=>r.json()).catch(()=>null);

  if (!catalog) { content.innerHTML = "Error cargando catálogo."; return; }

  const items = (catalog.products || []).filter(p => p.sectionId === sectionId);
  
  if (!items.length) { 
      content.innerHTML = '<div style="text-align:center; padding:40px; color:#ccc;">Próximamente disponible.</div>'; 
      return; 
  }

  content.innerHTML = `<div class="catGrid">` + items.map(p => `
    <div class="prodCard">
      <img src="${p.img}" loading="lazy" alt="${p.name}">
      <div style="font-weight:700; font-size:14px; line-height:1.2; margin-bottom:5px; color:#111;">${p.name}</div>
      <div style="color:#D50000; font-weight:800; font-size:15px;">${moneyMXN(p.baseMXN)}</div>
      
      <select id="size_${p.id}" style="margin:10px 0; padding:8px; width:100%; border:1px solid #ccc; border-radius:6px; background:#fff; color:#000;">
        ${(p.sizes || ["Unitalla"]).map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>
      
      <button class="btn primary full" style="padding:10px; font-size:13px;" onclick="addToCart('${p.id}')">
        AGREGAR +
      </button>
    </div>
  `).join("") + `</div>`;
};

window.addToCart = function(pid) {
  if (!catalog) return;
  const p = catalog.products.find(x => x.id === pid);
  if (!p) return;
  
  const sizeSelect = $(`size_${pid}`);
  const size = sizeSelect ? sizeSelect.value : "Unitalla";
  const key = `${pid}_${size}`;
  
  const exist = cart.find(i => i.key === key);
  if (exist) { exist.qty++; } 
  else { 
      cart.push({ key, id: pid, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });
  }

  saveCart();
  toast("Producto agregado");
  closeAll();
  openDrawer();
};

window.checkout = async function() {
  const btn = $("payBtn");
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;

  try {
    const payload = {
      items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
      mode: ship.mode,
      promoCode: promoState?.code || "",
      to: (ship.mode === "pickup") ? {} : {
        postal_code: $("cp")?.value || "",
        address1: $("addr")?.value || "",
        city: $("city")?.value || "",
        state_code: $("state")?.value || "",
        name: $("name")?.value || "Cliente"
      }
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.url) location.href = data.url;
    else throw new Error(data.error || "Error al iniciar pago");
    
  } catch (e) {
    console.error(e);
    alert("Error: " + (e.message || "Intenta de nuevo"));
    btn.innerText = "IR A PAGAR";
    btn.disabled = false;
  }
};

window.openLegal = function(type) {
  const modal = $("legalModal");
  if(modal) {
      modal.classList.add("active");
      $("overlay").classList.add("active");
      document.querySelectorAll(".legalBlock").forEach(b => {
          b.style.display = (b.dataset.legalBlock === type) ? "block" : "none";
      });
  }
};
window.closeLegal = closeAll;

/* INIT */
document.querySelectorAll('input[name="shipMode"]').forEach(r => {
    r.addEventListener("change", () => updateCart());
});
["cp", "addr", "name"].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener("input", () => updateCart({ recalcShip: false }));
});

// Promo Logic
const promoBtn = $("promoApplyBtn");
if(promoBtn) {
    promoBtn.addEventListener("click", () => {
       const input = $("promoInput");
       if(!input) return;
       const code = input.value.trim().toUpperCase();
       
       if(code === "SCORE10") { promoState = { code, type:"pct", value:10 }; toast("Cupón aplicado: 10%"); }
       else if(code === "ENVIOFREE") { promoState = { code, type:"free_shipping", value:0 }; toast("Envío gratis aplicado"); }
       else { promoState = null; toast("Cupón no válido"); }
       
       localStorage.setItem(LS_PROMO, JSON.stringify(promoState));
       updateCart();
    });
}

// PWA Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

updateCart();
