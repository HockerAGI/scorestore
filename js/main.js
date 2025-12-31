/**
 * SCORE STORE - MAIN LOGIC
 */
const API_BASE = (location.hostname.includes("netlify")) ? "/.netlify/functions" : "/api";
const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; 

let catalog = null;
let cart = JSON.parse(localStorage.getItem("score_cart_v1") || "[]");
let promoState = JSON.parse(localStorage.getItem("score_promo_v1") || "null");
let ship = { mode: "pickup", mxn: 0, label: "Pickup", loading: false };

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n||0);

// --- CORE ---
function renderCart() {
  const body = $("cartBody");
  if(!body) return;
  if(!cart.length) { body.innerHTML = '<div style="text-align:center; padding:30px; opacity:0.5">Carrito vacío</div>'; return; }
  
  body.innerHTML = cart.map((i,x) => `
    <div class="cartItem">
      <img src="${i.img}" class="cartThumb">
      <div style="flex:1">
        <div style="font-weight:700; font-size:14px">${i.name}</div>
        <div style="font-size:12px; color:#666">Talla: ${i.size}</div>
        <div style="color:#D50000; font-weight:700; margin-top:2px">${money(i.price)}</div>
      </div>
      <div style="text-align:right">
        <button onclick="remCart(${x})" style="color:#999; border:none; background:none; cursor:pointer">&times;</button>
        <div style="font-weight:700; font-size:13px">x${i.qty}</div>
      </div>
    </div>
  `).join("");
}

window.remCart = (idx) => { cart.splice(idx, 1); save(); update(); };
function save() { localStorage.setItem("score_cart_v1", JSON.stringify(cart)); }

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

  // UI Texts
  if($("cartCount")) { $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0); $("cartCount").style.display = cart.length?"flex":"none"; }
  $("lnSub").innerText = money(sub);
  $("lnShip").innerText = ship.loading ? "..." : (finalShip===0 ? "Gratis" : money(finalShip));
  $("lnTotal").innerText = money(total);
  
  if($("rowDiscount")) {
     $("rowDiscount").style.display = (disc>0 || promoState?.type==="free_shipping") ? "flex" : "none";
     if(disc>0) $("lnDiscount").innerText = `-${money(disc)}`;
  }

  // Validar
  const addr = $("addr")?.value || "";
  const btn = $("payBtn");
  let valid = cart.length > 0;
  if(mode === "mx") valid = valid && cp.length===5 && addr.length>3;
  btn.disabled = !valid || ship.loading;

  renderCart();
}

async function fetchShip(cp) {
  ship.loading = true; update();
  try {
    const res = await fetch(`${API_BASE}/quote_shipping`, { method:"POST", body: JSON.stringify({postal_code:cp, items:1})});
    const d = await res.json();
    if(d.ok) { ship.mxn = d.mxn; ship.label = d.label; }
  } catch(e){ console.error(e); }
  ship.loading = false; update();
}

// LISTENERS
document.querySelectorAll('input').forEach(i => i.addEventListener('input', update));
document.querySelectorAll('input[type=radio]').forEach(i => i.addEventListener('change', update));
$("promoApplyBtn")?.addEventListener("click", ()=>{
   const c = $("promoInput").value.toUpperCase();
   if(c==="SCORE10") promoState={code:c, type:"pct", value:10};
   else if(c==="ENVIOFREE") promoState={code:c, type:"free_shipping", value:0};
   else promoState=null;
   localStorage.setItem("score_promo_v1", JSON.stringify(promoState));
   update();
});

// ACTIONS
window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); update(); };
window.closeAll = () => { $("drawer").classList.remove("active"); $("overlay").classList.remove("active"); $("modalCatalog").classList.remove("active"); };

window.openCatalog = async (secId, title) => {
    $("modalCatalog").classList.add("active"); $("overlay").classList.add("active");
    $("catTitle").innerText = title;
    $("catContent").innerHTML = "Cargando...";
    
    if(!catalog) catalog = await fetch("/data/catalog.json").then(r=>r.json()).catch(()=>null);
    const items = (catalog?.products||[]).filter(p=>p.sectionId===secId);
    
    $("catContent").innerHTML = `<div class="catGrid">` + items.map(p => `
      <div class="prodCard">
        <img src="${p.img}">
        <div style="font-weight:700; margin-bottom:5px">${p.name}</div>
        <div style="color:#E10600; font-weight:700">${money(p.baseMXN)}</div>
        <button class="btn primary full" style="margin-top:10px; font-size:14px; padding:10px" onclick="add('${p.id}')">AGREGAR</button>
      </div>
    `).join("") + `</div>`;
};

window.add = (id) => {
    const p = catalog.products.find(x=>x.id===id);
    const exist = cart.find(i=>i.id===id);
    if(exist) exist.qty++; else cart.push({id, name:p.name, price:p.baseMXN, img:p.img, size:"Unitalla", qty:1});
    save(); closeAll(); openDrawer();
};

window.checkout = async () => {
    $("payBtn").innerText = "...";
    const res = await fetch(`${API_BASE}/create_checkout`, { method:"POST", body: JSON.stringify({
        items: cart, mode: ship.mode, promoCode: promoState?.code,
        to: { postal_code: $("cp")?.value, address1: $("addr")?.value, name: $("name")?.value }
    })});
    const d = await res.json();
    if(d.url) location.href = d.url; else alert("Error");
    $("payBtn").innerText = "IR A PAGAR";
};

update();
