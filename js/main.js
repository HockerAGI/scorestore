/**
 * SCORE STORE - main.js (FINAL FIX)
 * Compatible con: CSS Desert Pro + Real Time Shipping + Coupons
 */
const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; 
const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";
const API_BASE = (location.hostname.includes("netlify")) ? "/.netlify/functions" : "/api";

let catalog = null;
let promoState = safeJson(localStorage.getItem(LS_PROMO), null);
let cart = safeJson(localStorage.getItem(LS_CART), []);

// Estado de Envío
let ship = { mode: "pickup", mxn: 0, label: "Pickup", loading: false };

const $ = (id) => document.getElementById(id);
const moneyMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

function safeJson(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function saveCart() { localStorage.setItem(LS_CART, JSON.stringify(cart)); }
function cartCount() { return cart.reduce((a, b) => a + Number(b.qty || 0), 0); }
function subtotal() { return cart.reduce((a, b) => a + (Number(b.price || 0) * Number(b.qty || 0)), 0); }

/* --- SHIPPING CALCULATOR --- */
let _shipTimeout;
async function fetchShippingRate(cp) {
  ship.loading = true;
  updateTotalsUI(); // UI: "Calculando..."
  
  try {
    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: cp, items: cartCount() })
    });
    const data = await res.json();
    
    if (data.ok) {
      ship.mxn = data.mxn;
      ship.label = data.label;
    } else {
      ship.mxn = 250; // Fallback
      ship.label = "Envío Nacional";
    }
  } catch (e) {
    console.error("Error cotizando:", e);
    ship.mxn = 250; 
    ship.label = "Envío Nacional";
  } finally {
    ship.loading = false;
    updateTotalsUI();
  }
}

/* --- UI UPDATES --- */
function renderCartBody() {
  const body = $("cartBody");
  if (!body) return;
  
  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center; padding:40px 20px; opacity:.6; color:#aaa;">Tu carrito está vacío</div>`;
    return;
  }

  // Estructura .cartItem coincide con styles.css
  body.innerHTML = cart.map((i, idx) => `
    <div class="cartItem">
      <img src="${i.img}" alt="" class="cartThumb">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13px; line-height:1.2; margin-bottom:2px;">${i.name}</div>
        <div style="font-size:11px; color:#666;">Talla: ${i.size}</div>
        <div style="color:#D50000; font-weight:800; font-size:14px; margin-top:4px;">${moneyMXN(i.price)}</div>
      </div>
      <div style="text-align:right;">
        <button type="button" onclick="removeFromCart(${idx})" style="color:#D50000; background:none; border:none; font-size:20px; font-weight:700; cursor:pointer;">&times;</button>
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
  const cpVal = $("cp")?.value || "";

  // Cambio de modo
  if (selected !== ship.mode) {
    ship.mode = selected;
    if (selected === "mx" && cpVal.length === 5) {
      clearTimeout(_shipTimeout);
      fetchShippingRate(cpVal);
    } else if (selected === "mx") {
      ship.mxn = 250; // Precio visual temporal
      ship.label = "Envío Nacional";
    }
  }

  // UI Form
  const form = $("shipForm");
  if (form) form.style.display = (selected === "mx" || selected === "tj") ? "block" : "none";

  // Precios Fijos
  if (selected === "pickup") { ship.mxn = 0; ship.label = "Pickup"; }
  else if (selected === "tj") { ship.mxn = 200; ship.label = "Local TJ"; }
  
  renderCartBody();
  updateTotalsUI();
  
  // Validación Checkout
  const addrVal = $("addr")?.value || "";
  let valid = cart.length > 0;
  if (selected !== "pickup") {
    valid = valid && (cpVal.trim().length === 5) && (addrVal.trim().length > 3);
  }
  const btn = $("payBtn");
  if(btn) btn.disabled = !valid || ship.loading;
}

function updateTotalsUI() {
  const sub = subtotal();
  let disc = 0;

  if (promoState) {
    if (promoState.type === "pct") disc = Math.round(sub * (promoState.value / 100));
    else if (promoState.type === "free_shipping") disc = 0; 
  }

  let finalShip = ship.mxn;
  if (promoState?.type === "free_shipping") finalShip = 0;
  
  const total = Math.max(0, sub - disc) + finalShip;

  // Actualizar Textos
  if ($("cartCount")) {
      const cnt = cartCount();
      $("cartCount").innerText = cnt;
      $("cartCount").style.display = cnt > 0 ? "flex" : "block"; // block para que no se deforme
      if(cnt===0) $("cartCount").style.display = "none";
  }
  
  if ($("lnSub")) $("lnSub").innerText = moneyMXN(sub);
  
  const lnShip = $("lnShip");
  if (lnShip) {
    if (ship.loading) lnShip.innerText = "Calculando...";
    else if (promoState?.type === "free_shipping") lnShip.innerText = "GRATIS";
    else lnShip.innerText = (finalShip === 0 && ship.mode === "pickup") ? "Gratis" : moneyMXN(finalShip);
  }

  if ($("lnTotal")) $("lnTotal").innerText = moneyMXN(total);
  if ($("barTotal")) $("barTotal").innerText = moneyMXN(total);

  const rDisc = $("rowDiscount");
  if (rDisc) {
      if (disc > 0 || promoState?.type === "free_shipping") {
          rDisc.style.display = "flex";
          if($("promoTag")) $("promoTag").innerText = promoState.code;
          if($("lnDiscount")) $("lnDiscount").innerText = disc > 0 ? `- ${moneyMXN(disc)}` : "Envío Gratis";
      } else {
          rDisc.style.display = "none";
      }
  }
  
  $("paybar")?.classList.toggle("visible", cart.length > 0);
}

/* INPUT LISTENERS */
const cpInput = $("cp");
if (cpInput) {
  cpInput.addEventListener("input", (e) => {
    const val = e.target.value.replace(/\D/g, "");
    e.target.value = val;
    if (ship.mode === "mx" && val.length === 5) {
      clearTimeout(_shipTimeout);
      _shipTimeout = setTimeout(() => fetchShippingRate(val), 800);
    }
    updateCart({ recalcShip: false });
  });
}

document.querySelectorAll('input[name="shipMode"]').forEach(r => r.addEventListener("change", () => updateCart()));
["addr", "name"].forEach(id => $(id)?.addEventListener("input", () => updateCart({ recalcShip: false })));

/* PROMO CODE */
const promoBtn = $("promoApplyBtn");
if(promoBtn) {
    promoBtn.addEventListener("click", () => {
       const code = $("promoInput")?.value.trim().toUpperCase();
       if(code === "SCORE10") { promoState = { code, type:"pct", value:10 }; toast("Cupón aplicado"); }
       else if(code === "ENVIOFREE") { promoState = { code, type:"free_shipping", value:0 }; toast("Envío gratis"); }
       else { promoState = null; toast("Cupón no válido"); }
       localStorage.setItem(LS_PROMO, JSON.stringify(promoState));
       updateCart();
    });
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
  content.innerHTML = '<div style="text-align:center; padding:40px; color:#ccc;">Cargando...</div>';
  
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  if (!catalog) catalog = await fetch("/data/catalog.json").then(r=>r.json()).catch(()=>null);
  
  const items = (catalog?.products || []).filter(p => p.sectionId === sectionId);
  if (!items.length) { content.innerHTML = '<div style="text-align:center; padding:40px;">Próximamente.</div>'; return; }

  // Estructura .prodCard coincide con CSS
  content.innerHTML = `<div class="catGrid">` + items.map(p => `
    <div class="prodCard">
      <img src="${p.img}" loading="lazy" alt="${p.name}">
      <div style="font-weight:700; font-size:14px; margin-bottom:5px; color:#111;">${p.name}</div>
      <div style="color:#D50000; font-weight:800; font-size:15px;">${moneyMXN(p.baseMXN)}</div>
      <select id="size_${p.id}" style="margin:10px 0; padding:8px; width:100%; border:1px solid #ccc; border-radius:6px; background:#fff; color:#000;">
        ${(p.sizes || ["Unitalla"]).map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>
      <button class="btn primary full" style="padding:10px; font-size:13px;" onclick="addToCart('${p.id}')">AGREGAR +</button>
    </div>
  `).join("") + `</div>`;
};

window.addToCart = function(pid) {
  if (!catalog) return;
  const p = catalog.products.find(x => x.id === pid);
  if (!p) return;
  const size = $(`size_${pid}`)?.value || "Unitalla";
  const key = `${pid}_${size}`;
  const exist = cart.find(i => i.key === key);
  
  if (exist) exist.qty++; 
  else cart.push({ key, id: pid, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });

  saveCart();
  toast("Agregado");
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
updateCart();
