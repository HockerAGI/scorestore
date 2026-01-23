/* SCORE STORE - LOGIC PRO 2026 */

(function () {
  "use strict";

  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_final_v3";
  const FLOOR_MX = 250;
  const FLOOR_US = 800;

  let cart = [];
  let catalogData = { products: [] };
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  async function init() {
    // Mantener intro 4 segundos para el VFX
    setTimeout(() => { document.getElementById("splash-screen").style.opacity = "0"; setTimeout(()=>document.getElementById("splash-screen").remove(), 800); }, 4000);
    
    await loadCatalog();
    loadCart();
    setupUI();
    updateCartUI();
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch (e) { catalogData = { products: [] }; }
  }

  // AGREGAR CON CANTIDAD
  window.addToCart = (pid) => {
    const p = catalogData.products.find(x => x.id === pid);
    if(!p) return;
    
    // Obtener talla del card activo
    const modal = $("modalCatalog");
    let size = "Unitalla";
    if(modal.classList.contains("active")) {
        const card = modal.querySelector(`.prodCard`); // Simplificado
        size = card ? card.dataset.selSize || "Unitalla" : "Unitalla";
    }

    const exist = cart.find(x => x.id === pid && x.size === size);
    if(exist) exist.qty++;
    else cart.push({ id: p.id, name: p.name, price: Number(p.baseMXN), img: p.img, size: size, qty: 1 });
    
    saveCart(); updateCartUI(); openDrawer();
  };

  window.changeQty = (idx, delta) => {
      if(!cart[idx]) return;
      cart[idx].qty += delta;
      if(cart[idx].qty < 1) cart.splice(idx, 1);
      saveCart(); updateCartUI();
      if(shippingState.mode !== 'pickup') quoteShipping();
  };

  // LOGICA DE ENVIO CON PISO (FLOOR)
  async function quoteShipping() {
      const zip = $("cp").value.trim();
      if(zip.length < 5) return;

      $("shipTotal").innerText = "Cotizando...";
      
      try {
          const res = await fetch(`${API_BASE}/quote_shipping`, {
              method: 'POST',
              body: JSON.stringify({ zip, country: shippingState.mode === 'us' ? 'US' : 'MX', items: cart })
          });
          const data = await res.json();
          
          if(data.ok) {
              const floor = shippingState.mode === 'us' ? FLOOR_US : FLOOR_MX;
              // REGLA: Usar el mayor entre la API y nuestro costo base
              shippingState.cost = Math.max(data.cost, floor);
              shippingState.label = data.label;
          } else {
              shippingState.cost = shippingState.mode === 'us' ? FLOOR_US : FLOOR_MX;
          }
          updateCartUI();
      } catch (e) {
          shippingState.cost = shippingState.mode === 'us' ? FLOOR_US : FLOOR_MX;
          updateCartUI();
      }
  }

  function setupUI() {
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              shippingState.mode = r.value;
              if(r.value === 'pickup') {
                  shippingState.cost = 0;
                  $("shipForm").style.display = "none";
              } else {
                  $("shipForm").style.display = "block";
                  if($("cp").value.length === 5) quoteShipping();
                  else shippingState.cost = (r.value === 'mx') ? FLOOR_MX : FLOOR_US;
              }
              updateCartUI();
          });
      });

      $("cp").addEventListener("input", (e) => {
          if(e.target.value.length === 5) quoteShipping();
      });
  }

  function updateCartUI() {
    const box = $("cartItems");
    const empty = $("cartEmpty");
    const foot = $("cartFooter");
    
    if(!cart.length) { box.innerHTML = ""; empty.style.display="block"; foot.style.display="none"; $("cartCount").innerText="0"; return; }
    
    empty.style.display="none"; foot.style.display="block";
    box.innerHTML = cart.map((it, idx) => `
        <div class="cartItem">
            <img src="${it.img}" class="cartThumb">
            <div class="cInfo">
                <div class="cName">${it.name}</div>
                <div class="cMeta">${it.size}</div>
                <div class="qtyControl">
                    <button class="qtyBtn" onclick="changeQty(${idx}, -1)">-</button>
                    <span class="qtyVal">${it.qty}</span>
                    <button class="qtyBtn" onclick="changeQty(${idx}, 1)">+</button>
                </div>
            </div>
            <div class="cRight">
                <div class="cPrice">${money(it.price * it.qty)}</div>
                <div class="cart-remove" onclick="changeQty(${idx}, -999)">Eliminar</div>
            </div>
        </div>
    `).join("");

    const sub = cart.reduce((a,b)=>a+(b.price*b.qty),0);
    $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
    $("subTotal").innerText = money(sub);
    $("shipTotal").innerText = shippingState.cost === 0 ? "Gratis" : money(shippingState.cost);
    $("grandTotal").innerText = money(sub + shippingState.cost);
    
    // Actualizar etiquetas visuales de los radios
    if($("labelMx")) $("labelMx").innerText = money(Math.max(FLOOR_MX, shippingState.mode==='mx'?shippingState.cost:FLOOR_MX));
    if($("labelUs")) $("labelUs").innerText = money(Math.max(FLOOR_US, shippingState.mode==='us'?shippingState.cost:FLOOR_US));
  }

  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); $("overlay").classList.remove("active"); };
  
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) cart=JSON.parse(s); }

  document.addEventListener("DOMContentLoaded", init);
})();
