/* ======================================================
   SCORE STORE — MAIN JS (FINAL DEFINITIVO)
====================================================== */

let CATALOG = null;
let CART = [];

/* HELPERS */
const $ = id => document.getElementById(id);
const money = n => `$${Number(n).toLocaleString("es-MX")} MXN`;

function showToast(msg){
  const t = $("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2200);
}

/* LOAD CATALOG */
async function loadCatalog(){
  if(CATALOG) return CATALOG;
  const res = await fetch("/data/catalog.json",{cache:"no-store"});
  CATALOG = await res.json();
  return CATALOG;
}

/* MODAL CORE */
function openOverlay(){
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
}
function closeOverlay(){
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
}
function openModal(id){
  $(id)?.classList.add("active");
  openOverlay();
}
function closeAll(){
  document.querySelectorAll(".modal.active").forEach(m=>m.classList.remove("active"));
  closeOverlay();
}

/* CATALOG */
async function openCatalog(sectionId,title){
  const data = await loadCatalog();
  const wrap = $("catContent");
  wrap.innerHTML = "";
  $("catTitle").textContent = title;

  const products = data.products.filter(p=>p.sectionId===sectionId);

  if(products.length===0){
    wrap.innerHTML = "<p>No hay productos disponibles.</p>";
    openModal("modalCatalog");
    return;
  }

  const grouped = {};
  products.forEach(p=>{
    grouped[p.subSection] ||= [];
    grouped[p.subSection].push(p);
  });

  Object.keys(grouped).forEach(sub=>{
    const h = document.createElement("h4");
    h.className="catSectionTitle";
    h.textContent=sub;
    wrap.appendChild(h);

    const grid = document.createElement("div");
    grid.className="catGrid";

    grouped[sub].forEach(p=>{
      const card = document.createElement("div");
      card.className="prodCard";
      card.innerHTML=`
        <img src="${p.img}" alt="${p.name}">
        <strong>${p.name}</strong>
        <span class="ux-note">${money(p.baseMXN)}</span>
        <select>${p.sizes.map(s=>`<option>${s}</option>`).join("")}</select>
        <button class="btn-sm">AGREGAR</button>
      `;
      card.querySelector("button").onclick=()=>{
        addToCart(p, card.querySelector("select").value);
      };
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  });

  openModal("modalCatalog");
}

/* CART */
function addToCart(prod,size){
  CART.push({id:prod.id,name:prod.name,price:prod.baseMXN,size});
  updateCart();
  showToast("Producto agregado");
}

function updateCart(){
  let total = CART.reduce((a,b)=>a+b.price,0);
  $("cartCount").textContent = CART.length;
  $("barTotal").textContent = money(total);

  if(CART.length>0){
    $("paybar")?.classList.add("visible");
  }else{
    $("paybar")?.classList.remove("visible");
  }
}

/* EVENTS */
document.addEventListener("keydown",e=>{
  if(e.key==="Escape") closeAll();
});
$("overlay")?.addEventListener("click",closeAll);

/* PERF */
window.addEventListener("load",()=>{
  document.body.classList.add("loaded");
});