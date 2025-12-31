/**
 * SCORE STORE - MAIN JS
 * Edition: Gold Ops (Real-Time Shipping + Button Sizes)
 */
const API_BASE = (location.hostname.includes("netlify")) ? "/.netlify/functions" : "/api";
const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; 

let catalog = null;
let cart = JSON.parse(localStorage.getItem("score_cart_v1") || "[]");
let promoState = JSON.parse(localStorage.getItem("score_promo_v1") || "null");
let ship = { mode: "pickup", mxn: 0, label: "Pickup", loading: false };

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n||0);

/* --- RENDER CARRITO --- */
function renderCart() {
  const body = $("cartBody");
  if(!body) return;
  if(!cart.length) { body.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.5">Carrito vacío</div>'; return; }
  
  body.innerHTML = cart.map((i,x) => `
    <div class="cartItem">
      <img src="${i.img}" class="cartThumb">
      <div style="flex:1">
        <div style="font-weight:700; font-size:14px; margin-bottom:4px">${i.name}</div>
        <div style="font-size:11px; color:#666; background:#f0f0f0; display:inline-block; padding:2px 6px; border-radius:4px;">Talla: ${i.size}</div>
        <div style="color:#E10600; font-weight:700; font-size:14px; margin-top:4px">${money(i.price)}</div>
      </div>
      <div style="text-align:right">
        <button onclick="remCart(${x})" style="color:#999; border:none; background:none; cursor:pointer; font-size:18px">&times;</button>
        <div style="font-weight:700; font-size:13px; color:#333">x${i.qty}</div>
      </div>
    </div>
  `).join("");
}

window.remCart = (idx) => { cart.splice(idx, 1); save(); update(); };
function save() { localStorage.setItem("score_cart_v1", JSON.stringify(cart)); }

/* --- UPDATE TOTALS & SHIPPING --- */
async function update() {
  const radio = document.querySelector('input[name="shipMode"]:checked');
  const mode = radio ? radio.value : "pickup";
  const cp = $("cp")?.value || "";

  if(mode !== ship.mode) {
    ship.mode = mode;
    if(mode === "mx") {
       ship.mxn = 250; ship.label = "Nacional"; 
       if(cp.length === 5) fetchShip(cp);
    } else {
       ship.mxn = 0; ship.label = "Pickup";
    }
  }
  
  $("shipForm").style.display = (mode === "mx") ? "block" : "none";
  
  let sub = cart.reduce((a,b)=>a+(b.price*b.qty),0);
  let disc = 0;
  if(promoState) {
      if(promoState.type==="pct") disc = Math.round(sub*(promoState.value/100));
      else if(promoState.type==="free_shipping") disc = 0;
  }
  let finalShip = (promoState?.type==="free_shipping") ? 0 : ship.mxn;
  let total = Math.max(0, sub - disc) + finalShip;

  // Actualizar UI
  if($("cartCount")) { 
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0); 
      $("cartCount").style.display = cart.length ? "flex" : "none"; 
  }
  
  $("lnSub").innerText = money(sub);
  const shipLbl = $("lnShip");
  if(ship.loading) { shipLbl.innerText = "Calculando..."; shipLbl.style.color = "orange"; }
  else { shipLbl.innerText = (finalShip===0) ? "Gratis" : money(finalShip); shipLbl.style.color = "inherit"; }
  
  $("lnTotal").innerText = money(total);
  if($("barTotal")) $("barTotal").innerText = money(total);
  
  if($("rowDiscount")) {
     $("rowDiscount").style.display = (disc>0 || promoState?.type==="free_shipping") ? "flex" : "none";
     if(disc>0) $("lnDiscount").innerText = `-${money(disc)}`;
  }

  // Validar Pago
  const addr = $("addr")?.value || "";
  const btn = $("payBtn");
  let valid = cart.length > 0;
  if(mode === "mx") valid = valid && cp.length===5 && addr.length>3;
  btn.disabled = !valid || ship.loading;

  renderCart();
  $("paybar")?.classList.toggle("visible", cart.length > 0);
}

/* --- COTIZADOR REAL --- */
async function fetchShip(cp) {
  ship.loading = true; update();
  try {
    const res = await fetch(`${API_BASE}/quote_shipping`, { 
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({postal_code:cp, items:cartCount()})
    });
    const d = await res.json();
    if(d.ok) { ship.mxn = d.mxn; ship.label = d.label; }
    else { ship.mxn = 250; } // Fallback
  } catch(e){ console.error(e); ship.mxn = 250; }
  ship.loading = false; update();
}

/* --- CATALOGO INTERACTIVO (BOTONES TALLA) --- */
window.openCatalog = async (secId, title) => {
    $("modalCatalog").classList.add("active"); $("overlay").classList.add("active");
    $("catTitle").innerText = title;
    $("catContent").innerHTML = "<div style='padding:50px; text-align:center; color:#999;'>Cargando inventario...</div>";
    
    if(!catalog) catalog = await fetch("/data/catalog.json").then(r=>r.json()).catch(()=>null);
    const items = (catalog?.products||[]).filter(p=>p.sectionId===secId);
    
    if(!items.length) { $("catContent").innerHTML = "<div style='padding:40px; text-align:center;'>Agotado.</div>"; return; }

    $("catContent").innerHTML = `<div class="catGrid">` + items.map(p => {
        const sizes = p.sizes || ["Unitalla"];
        // Generar botones de talla
        const sizeBtns = sizes.map(s => 
            `<button class="size-btn" onclick="selectSize(this, '${s}')">${s}</button>`
        ).join("");
        
        return `
          <div class="prodCard" id="card_${p.id}">
            <img src="${p.img}" loading="lazy">
            <div style="font-weight:700; font-size:14px; margin-bottom:5px; height:35px; overflow:hidden;">${p.name}</div>
            <div style="color:#E10600; font-weight:800; font-size:16px;">${money(p.baseMXN)}</div>
            
            <div class="size-selector" id="sizes_${p.id}" data-selected="">
                ${sizeBtns}
            </div>
            
            <button class="btn primary full" style="font-size:13px; padding:10px; width:100%; margin-top:5px;" onclick="add('${p.id}')">
              AGREGAR +
            </button>
          </div>
        `;
    }).join("") + `</div>`;
};

// Helper Selección Talla UI
window.selectSize = (btn, size) => {
    const parent = btn.parentElement;
    parent.setAttribute("data-selected", size);
    parent.querySelectorAll(".size-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
};

window.add = (id) => {
    const sizeContainer = $(`sizes_${id}`);
    let s = sizeContainer.getAttribute("data-selected");
    
    // Auto-select si es unitalla o solo hay una opción
    if(!s && sizeContainer.children.length === 1) {
        s = sizeContainer.children[0].innerText;
    }
    
    if(!s) { toast("⚠️ SELECCIONA UNA TALLA"); return; }

    const p = catalog.products.find(x=>x.id===id);
    const key = `${id}_${s}`;
    const exist = cart.find(i=>i.key===key);
    
    if(exist) exist.qty++; 
    else cart.push({key, id, name:p.name, price:p.baseMXN, img:p.img, size:s, qty:1});
    
    save(); closeAll(); openDrawer(); toast("✅ AGREGADO AL CARRITO");
};

/* --- GENERAL & CHECKOUT --- */
document.querySelectorAll('input').forEach(i => i.addEventListener('input', update));
document.querySelectorAll('input[type=radio]').forEach(i => i.addEventListener('change', update));
const cpInput = $("cp");
if(cpInput) cpInput.addEventListener("input", (e) => {
    const val = e.target.value.replace(/\D/g,"");
    e.target.value = val;
    if(ship.mode === "mx" && val.length===5) { clearTimeout(_shipTimeout); _shipTimeout = setTimeout(()=>fetchShip(val),800); }
});

$("promoApplyBtn")?.addEventListener("click", ()=>{
   const c = $("promoInput").value.toUpperCase();
   if(c==="SCORE10") { promoState={code:c, type:"pct", value:10}; toast("CUPÓN APLICADO"); }
   else if(c==="ENVIOFREE") { promoState={code:c, type:"free_shipping", value:0}; toast("ENVÍO GRATIS"); }
   else { promoState=null; toast("CUPÓN INVÁLIDO"); }
   localStorage.setItem("score_promo_v1", JSON.stringify(promoState));
   update();
});

window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); document.body.classList.add("modalOpen"); update(); };
window.closeAll = () => { 
    document.querySelectorAll(".active").forEach(el=>el.classList.remove("active")); 
    document.body.classList.remove("modalOpen");
};
window.openLegal = (type) => {
    $("legalModal").classList.add("active"); $("overlay").classList.add("active");
    document.querySelectorAll(".legalBlock").forEach(b => b.style.display = (b.dataset.legalBlock === type) ? "block" : "none");
};
window.closeLegal = closeAll;

window.checkout = async () => {
    const btn = $("payBtn");
    btn.innerText = "PROCESANDO..."; btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/create_checkout`, { method:"POST", body: JSON.stringify({
            items: cart, mode: ship.mode, promoCode: promoState?.code,
            to: { postal_code: $("cp")?.value, address1: $("addr")?.value, name: $("name")?.value }
        })});
        const d = await res.json();
        if(d.url) location.href = d.url; else throw new Error("Error iniciando pago");
    } catch(e) {
        alert("Error de conexión. Intenta de nuevo.");
        btn.innerText = "IR A PAGAR"; btn.disabled = false;
    }
};

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
update();
