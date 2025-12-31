/**
 * SCORE STORE - main.js (v23.0 PROD FIXED)
 * Actualizado: Compatibilidad total con diseño Light/Dark
 */
const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; 
const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";
// Detecta automáticamente si está en local o en servidor
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
    body.innerHTML = `<div style="text-align:center; padding:40px 20px; opacity:.6; color:#888;">Tu carrito está vacío</div>`;
    return;
  }

  body.innerHTML = cart.map((i, idx) => `
    <div style="display:flex; gap:10px; margin-bottom:12px; background:#fff; color:#111; padding:10px; border-radius:8px; align-items:center; border:1px solid #eee;">
      <img src="${i.img}" alt="" style="width:50px; height:50px; object-fit:contain; mix-blend-mode:multiply;">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13px; line-height:1.2;">${i.name}</div>
        <div style="font-size:11px; color:#555;">Talla: ${i.size}</div>
        <div style="font-size:12px; font-weight:800; color:#D50000;">${moneyMXN(i.price)}</div>
      </div>
      <div style="text-align:right;">
        <button type="button" onclick="removeFromCart(${idx})" style="color:#D50000; border:none; background:none; font-weight:bold; font-size:18px; cursor:pointer; padding:0 5px;">&times;</button>
        <div style="font-weight:800; font-size:13px;">x${i.qty}</div>
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

  if ($("cartCount")) $("cartCount").innerText = String(cartCount());
  if ($("lnSub")) $("lnSub").innerText = moneyMXN(sub);
  if ($("lnShip")) $("lnShip").innerText = moneyMXN(ship.mxn || 0);
  if ($("lnTotal")) $("lnTotal").innerText = moneyMXN(total);
  if ($("barTotal")) $("barTotal").innerText = moneyMXN(total);

  const rDisc = $("rowDiscount");
  if (rDisc) {
      rDisc.style.display = disc > 0 ? "flex" : "none";
      if ($("lnDiscount")) $("lnDiscount").innerText = `- ${moneyMXN(disc)}`;
  }

  renderCartBody();
  $("paybar")?.classList.toggle("visible", cart.length > 0);

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
  content.innerHTML = '<div style="text-align:center; padding:20px;">Cargando...</div>';
  
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  if (!catalog) catalog = await fetch("/data/catalog.json").then(r=>r.json()).catch(()=>null);

  if (!catalog) { content.innerHTML = "Error cargando catálogo."; return; }

  const items = (catalog.products || []).filter(p => p.sectionId === sectionId);
  
  if (!items.length) { 
      content.innerHTML = '<div style="text-align:center; padding:40px;">Próximamente disponible.</div>'; 
      return; 
  }

  // Renderizado Grid con ajuste para tarjetas blancas
  content.innerHTML = `<div class="catGrid">` + items.map(p => `
    <div class="prodCard">
      <img src="${p.img}" loading="lazy" alt="${p.name}">
      <div style="font-weight:700; font-size:14px; line-height:1.2; margin-bottom:5px; color:#111;">${p.name}</div>
      <div style="color:#D50000; font-weight:800; font-size:15px;">${moneyMXN(p.baseMXN)}</div>
      
      <select id="size_${p.id}" style="margin:10px 0; padding:8px; width:100%; border:1px solid #ccc; border-radius:6px; background:#fff; color:#000;">
        ${(p.sizes || ["Unitalla"]).map(s => `<option value="${s}">${s}</option>`).join("")}
      </select>
      
      <button class="btn primary full" style="padding:10px; font-size:13px;" onclick="addToCart('${p.id}')">
        AGREGAR
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
  else { cart.push({ key, id: pid, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 }); }

  saveCart();
  toast("Agregado al carrito");
  closeAll();
  openDrawer();
};

window.checkout = async function() {
  const btn = $("payBtn");
  const originalText = btn.innerText;
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;

  try {
    const stripe = Stripe(STRIPE_PK);
    const mode = ship.mode;
    const payload = {
      items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
      mode,
      promoCode: promoState?.code || "",
      to: (mode === "pickup") ? {} : {
        postal_code: $("cp")?.value || "",
        address1: $("addr")?.value || "",
        city: $("city")?.value || "",
        state_code: $("state")?.value || "",
        name: $("name")?.value || "Cliente"
      }
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST", 
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.url) location.href = data.url;
    else throw new Error(data.error || "Error al iniciar pago");
  } catch (e) {
    console.error(e);
    toast("Error: " + (e.message || "Intenta de nuevo"));
    btn.innerText = originalText;
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

window.closeLegal = function() {
  $("legalModal")?.classList.remove("active");
  if (!$("drawer").classList.contains("active")) {
    $("overlay").classList.remove("active");
  }
};

// Event Listeners
document.querySelectorAll('input[name="shipMode"]').forEach(r => {
    r.addEventListener("change", () => updateCart());
});
["cp", "addr"].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener("input", () => updateCart({ recalcShip: false }));
});

updateCart();