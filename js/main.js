/* SCORE STORE LOGIC - FINAL MASTER */
const API_BASE = (location.hostname.includes('netlify')) ? '/.netlify/functions' : '/api';
const CART_KEY = "score_cart_final_v12";

let cart = [], catalog = [], shipQuote = null;
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(n||0);
function scrollToId(id){ const el=$(id); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); }
function toast(msg){ const t=$("toast"); t.innerText=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2500); }

async function init(){
    loadCart(); updateTotals(); renderCart();
    try {
        const res = await fetch("/data/catalog.json");
        const data = await res.json();
        catalog = data.products || [];
    } catch(e){ console.error("Error loading catalog", e); }
    
    document.querySelectorAll('input[name="shipMode"]').forEach(r => r.addEventListener("change", updateTotals));
    $("cp")?.addEventListener("input", (e)=>{
       if(e.target.value.length === 5) quoteShipping(e.target.value);
    });
}

window.openCatalog = (secId, title) => {
    $("modalCatalog").classList.add("active");
    $("overlay").classList.add("active");
    $("catTitle").innerText = title;
    $("catContent").innerHTML = "<div style='padding:40px; text-align:center; color:#555;'>Cargando inventario...</div>";

    const items = catalog.filter(p => p.sectionId === secId);
    if(!items.length) { $("catContent").innerHTML = "<div style='padding:40px; text-align:center;'>Agotado.</div>"; return; }

    $("catContent").innerHTML = `<div class="catGrid">` + items.map(p => {
        const sizes = p.sizes || ["Unitalla"];
        const sizeBtns = sizes.map(s => `<div class="size-pill" onclick="selectSize(this,'${s}')">${s}</div>`).join("");
        
        let statusBadge = "";
        if(p.status === "low_stock") statusBadge = `<div class="status-tag" style="background:#000;">ÚLTIMAS PIEZAS</div>`;
        if(p.tags && p.tags.includes("new")) statusBadge = `<div class="status-tag" style="background:var(--score-blue);">NUEVO</div>`;

        return `
          <div class="prodCard" id="card_${p.id}">
            ${statusBadge}
            <div class="prodImg">
                <img src="${p.img}" loading="lazy" alt="${p.name}">
            </div>
            <div style="font-weight:700; font-size:16px; margin-bottom:5px; height:42px; overflow:hidden; color:#333;">${p.name}</div>
            <div style="font-family:'Teko'; font-size:28px; color:var(--score-red); font-weight:600; margin-bottom:10px;">${money(p.baseMXN)}</div>
            <div style="margin-bottom:15px; display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">${sizeBtns}</div>
            <div id="sizes_${p.id}" data-selected="" style="display:none;"></div>
            <button class="btn-add" style="background:#fff; border:2px solid var(--score-red); color:var(--score-red); width:100%; padding:10px; font-weight:700; cursor:pointer; text-transform:uppercase; border-radius:6px;" onclick="add('${p.id}')">AGREGAR +</button>
          </div>
        `;
    }).join("") + `</div>`;
};

window.selectSize = (el, s) => {
    const parent = el.parentElement;
    const hiddenInput = parent.nextElementSibling;
    hiddenInput.setAttribute("data-selected", s);
    parent.querySelectorAll(".size-pill").forEach(b => { b.style.background="#f9f9f9"; b.style.color="#555"; });
    el.style.background="#000"; el.style.color="#fff";
};

window.add = (id) => {
    const sizeCont = document.getElementById(`sizes_${id}`);
    let s = sizeCont.getAttribute("data-selected");
    if(!s) {
       const btnContainer = sizeCont.previousElementSibling;
       if(btnContainer.children.length === 1) s = btnContainer.children[0].innerText;
    }

    if(!s) { toast("⚠️ Selecciona una talla"); return; }
    
    const p = catalog.find(x=>x.id===id);
    const key = `${id}_${s}`;
    const exist = cart.find(i=>i.key===key);
    if(exist) exist.qty++; else cart.push({key, id, name:p.name, variant:`Talla: ${s}`, price:p.baseMXN, qty:1, img:p.img});
    
    saveCart(); renderCart(); openDrawer(); toast("Agregado");
};

function loadCart(){ try{cart=JSON.parse(localStorage.getItem(CART_KEY)||"[]")}catch{cart=[]} }
function saveCart(){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
function emptyCart(){ cart=[]; saveCart(); renderCart(); }

function renderCart(){
    const wrap = $("cartItems");
    const count = cart.reduce((a,b)=>a+b.qty,0);
    $("cartCount").innerText = count;
    $("cartCount").style.display = count>0?"flex":"none";
    
    if(!cart.length){ wrap.innerHTML=""; $("cartEmpty").style.display="block"; updateTotals(); return; }
    $("cartEmpty").style.display="none";
    
    wrap.innerHTML = cart.map((i,x) => `
        <div class="cartItem">
            <img src="${i.img}" class="cartThumb">
            <div class="cInfo">
                <div class="cName">${i.name}</div>
                <div class="cMeta">${i.variant}</div>
                <div class="cPrice">${money(i.price)}</div>
            </div>
            <button onclick="delCart(${x})" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;">&times;</button>
        </div>
    `).join("");
    updateTotals();
}
window.delCart = (x)=>{ cart.splice(x,1); saveCart(); renderCart(); };

async function quoteShipping(zip) {
    $("shipTotal").innerText = "Calculando...";
    try {
        const r = await fetch(`${API_BASE}/quote_shipping`, {method:"POST", body:JSON.stringify({postal_code:zip, items:1})});
        const d = await r.json();
        if(d.ok) { shipQuote=d; $("shipTotal").innerText = money(d.mxn); } 
        else { shipQuote={mxn:250}; $("shipTotal").innerText = "$250.00 (Estándar)"; }
        updateTotals();
    } catch(e) { console.error(e); }
}

function updateTotals(){
    const sub = cart.reduce((a,b)=>a+(b.price*b.qty),0);
    $("subTotal").innerText = money(sub);
    
    const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";
    $("shipForm").style.display = (mode !== "pickup") ? "block" : "none";
    
    let shipCost = 0;
    let shipLabel = "Gratis";
    
    if(mode === "tj") { shipCost = 200; shipLabel = "$200.00"; }
    else if(mode === "mx") {
        if(shipQuote) { shipCost = shipQuote.mxn; shipLabel = money(shipCost); }
        else { shipLabel = "Cotizar"; }
    }
    
    $("shipTotal").innerText = shipLabel;
    $("grandTotal").innerText = money(sub + shipCost);
}

window.checkout = async () => {
    if(!cart.length) return;
    const btn = $("checkoutBtn"); btn.disabled=true; btn.innerText="PROCESANDO...";
    const mode = document.querySelector('input[name="shipMode"]:checked')?.value;
    const to = {
        postal_code: $("cp")?.value,
        address1: $("addr")?.value,
        city: $("city")?.value,
        name: $("name")?.value
    };
    
    try {
        const r = await fetch(`${API_BASE}/create_checkout`, {method:"POST", body:JSON.stringify({items:cart, mode, to})});
        const d = await r.json();
        if(d.url) location.href=d.url; else throw new Error();
    } catch(e) { toast("Error checkout"); btn.disabled=false; btn.innerText="PAGAR AHORA"; }
};

window.openDrawer=()=>{ $("drawer").classList.add("active"); $("overlay").classList.add("active"); document.body.classList.add("modalOpen"); };
window.closeAll=()=>{ document.querySelectorAll(".active").forEach(e=>e.classList.remove("active")); document.body.classList.remove("modalOpen"); };
window.openLegal=(t)=>{ $("legalModal").classList.add("active"); $("overlay").classList.add("active"); document.querySelectorAll(".legalBlock").forEach(b=>b.style.display=(b.dataset.legalBlock===t)?"block":"none"); };

init();
if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
