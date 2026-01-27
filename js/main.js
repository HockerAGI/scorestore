/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD)
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

// ESTADO
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v5") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  promo: null
};

// TEXTOS LEGALES (Tu contenido exacto)
const LEGAL_CONTENT = {
  privacy: { title: "Aviso de Privacidad", html: "<p>BAJATEX, S. de R.L. de C.V. es responsable de tus datos...</p>" },
  terms: { title: "Términos y Condiciones", html: "<p>Cambios en 30 días naturales. No aplica personalizados...</p>" },
  legal: { title: "Información Legal", html: "<p>Razón Social: BAJATEX. Domicilio: Palermo 6106, Tijuana...</p>" },
  contact: { title: "Contacto", html: "<p>WhatsApp: +52 664 236 8701. Email: ventas.unicotexti@gmail.com</p>" }
};

// AUDIO
const playSound = (type) => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  if(type === 'pop') { osc.frequency.value = 800; g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+0.1); osc.start(); osc.stop(ctx.currentTime+0.1); }
  if(type === 'success') { osc.type = 'triangle'; osc.frequency.linearRampToValueAtTime(600, ctx.currentTime+0.2); g.gain.value=0.1; osc.start(); osc.stop(ctx.currentTime+0.3); }
};

// UI HELPERS
const toast = (msg) => {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  playSound('pop');
  setTimeout(()=>t.classList.remove("show"), 3000);
};

// CATALOGO
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json");
    const data = await r.json();
    state.products = data.products || [];
    renderGrid(state.products);
  } catch(e) { $("#productsGrid").innerHTML = "<p>Cargando...</p>"; }
}

function renderGrid(list) {
  const grid = $("#productsGrid"); grid.innerHTML = "";
  list.forEach(p => {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `
      <div class="cardImg"><img src="${p.img}" loading="lazy" alt="${p.name}"></div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMXN(p.baseMXN)}</div>
        <div class="cardControls">
          <select id="size-${p.id}">${(p.sizes||["Unitalla"]).map(s=>`<option value="${s}">${s}</option>`).join("")}</select>
          <button onclick="addToCart('${p.id}')"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// CART
window.addToCart = (id) => {
  const p = state.products.find(x => x.id === id);
  const size = $(`#size-${id}`).value;
  const key = `${id}-${size}`;
  const ex = state.cart.find(i => i.key === key);
  if(ex) ex.qty++; else state.cart.push({ key, id: p.id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });
  saveCart(); openCart(); toast("Agregado al equipo");
};

function saveCart() {
  localStorage.setItem("score_cart_v5", JSON.stringify(state.cart));
  const cnt = state.cart.reduce((a,b)=>a+b.qty,0);
  $("#cartCount").textContent = cnt;
  
  const box = $("#cartItems"); box.innerHTML = "";
  let sub = 0;
  state.cart.forEach((i, idx) => {
    sub += i.price * i.qty;
    box.innerHTML += `
      <div class="cartRow">
        <div class="cartThumb"><img src="${i.img}"></div>
        <div class="cartInfo"><div class="name">${i.name}</div><div class="price">${i.size} | ${fmtMXN(i.price)}</div></div>
        <div style="display:flex;align-items:center;gap:5px;">
          <button class="qtyBtn" onclick="modQty(${idx},-1)">-</button><span>${i.qty}</span><button class="qtyBtn" onclick="modQty(${idx},1)">+</button>
        </div>
      </div>`;
  });
  
  const ship = state.shipping.quote || 0;
  $("#cartSubtotal").textContent = fmtMXN(sub);
  $("#cartShipping").textContent = ship===0 ? "Gratis / Pendiente" : fmtMXN(ship);
  $("#cartTotal").textContent = fmtMXN(sub + ship);
  $("#miniShipLabel").textContent = state.shipping.label;
}

window.modQty = (i,d) => { state.cart[i].qty+=d; if(state.cart[i].qty<=0) state.cart.splice(i,1); saveCart(); };
window.openCart = () => { $("#cartDrawer").classList.add("open"); $("#backdrop").classList.add("show"); saveCart(); };
window.closeCart = () => { $("#cartDrawer").classList.remove("open"); $("#backdrop").classList.remove("show"); };

// COTIZADOR (Fix para Carrito Glass)
$("#shippingMode").addEventListener("change", (e)=>{
  const m = e.target.value;
  $("#miniZip").style.display = m==='pickup' ? 'none' : 'block';
  if(m==='pickup') state.shipping={mode:'pickup', quote:0, label:"Pickup Gratis"};
  saveCart();
});

window.quoteShippingMini = async () => {
  const zip = $("#miniZip").value;
  const mode = $("#shippingMode").value;
  if(mode!=='pickup' && (!zip || zip.length<4)) return toast("Ingresa tu CP");
  
  $("#miniShipLabel").textContent = "Cotizando...";
  try {
    const res = await fetch("/api/quote", { method:"POST", body:JSON.stringify({mode, zip, items:state.cart}) });
    const d = await res.json();
    if(!d.ok) throw new Error(d.error);
    state.shipping = { mode, quote: d.amount, label: `${d.carrier} ($${d.amount})` };
    saveCart(); toast("Envío actualizado"); playSound('success');
  } catch(e) { toast("Error cotizando"); state.shipping.quote=0; saveCart(); }
};

window.checkout = async () => {
  if(!state.cart.length) return toast("Carrito vacío");
  if(state.shipping.mode!=='pickup' && !state.shipping.quote) return toast("Cotiza el envío primero");
  
  const btn = $("#checkoutBtn"); btn.innerHTML = "PROCESANDO...";
  try {
    const res = await fetch("/api/checkout", { method:"POST", body:JSON.stringify({ cart:state.cart, shippingMode:state.shipping.mode, zip:$("#miniZip").value }) });
    const d = await res.json();
    if(d.ok && d.url) window.location.href = d.url; else throw new Error(d.error);
  } catch(e) { toast("Error checkout"); btn.innerHTML = "PAGAR SEGURO"; }
};

// LEGAL MODAL
$$(".jsLegalLink").forEach(b => b.addEventListener("click", () => {
  const type = b.dataset.legal;
  if(LEGAL_CONTENT[type]) {
    $("#legalTitle").textContent = LEGAL_CONTENT[type].title;
    $("#legalBody").innerHTML = LEGAL_CONTENT[type].html;
    $("#legalModal").classList.add("show");
  }
}));
$("#legalClose").addEventListener("click", ()=>$("#legalModal").classList.remove("show"));
$("#legalBackdrop").addEventListener("click", ()=>$("#legalModal").classList.remove("show"));

// MARKETING NOTIFICATIONS (Cambio 8)
const MOCKS = ["Gorra vendida en CDMX", "Hoodie enviada a Tijuana", "Camiseta vendida en La Paz"];
setInterval(() => {
  if(Math.random()>0.7 && !document.hidden) toast("🛍️ " + MOCKS[Math.floor(Math.random()*MOCKS.length)]);
}, 30000);

// AI CHAT
window.toggleAiAssistant = () => $("#aiChatModal").classList.toggle("show");
window.sendAiMessage = async () => {
  const i = $("#aiInput"); const txt = i.value; if(!txt) return;
  $("#aiMessages").innerHTML += `<div class="ai-msg ai-me">${txt}</div>`; i.value="";
  try {
    const r = await fetch("/api/chat", { method:"POST", body:JSON.stringify({message:txt}) });
    const d = await r.json();
    $("#aiMessages").innerHTML += `<div class="ai-msg ai-bot">${d.reply || "Error"}</div>`;
  } catch(e) { $("#aiMessages").innerHTML += `<div class="ai-msg ai-bot">Error de conexión.</div>`; }
};

document.addEventListener("DOMContentLoaded", () => {
  loadCatalog();
  setTimeout(()=>$("#intro").style.display='none', 2500);
  $("#introSkip").addEventListener("click", ()=>$("#intro").style.display='none');
});