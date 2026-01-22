/* SCORE STORE LOGIC — DARK RACING ORIGINAL v20.0 */

(function () {
  "use strict";

  // --- CONFIGURACIÓN ---
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl;
  const SUPABASE_KEY = CFG.supabaseAnonKey;
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_prod_v10";

  // --- FLAGS COMERCIALES ---
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 5; // Factor para simular 80% descuento visual

  // --- ESTADO ---
  let cart = [];
  let catalogData = { products: [], sections: [] };
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
  let supabase = null;

  // --- HELPERS ---
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  // --- 1. SPLASH SCREEN BLINDADO ---
  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hidden")) {
      s.classList.add("hidden");
      setTimeout(() => { try { s.remove(); } catch {} }, 800);
    }
  }

  async function init() {
    // Seguridad: Si falla algo, abre la tienda a los 4.5s
    setTimeout(hideSplash, 4500);

    // Cargar Cliente Supabase
    if (window.supabase) supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    await loadCatalog();
    loadCart();
    setupUI();
    updateCartUI();
    initScrollReveal();

    // Notificar visita al Pixel
    if(typeof fbq === 'function') fbq('track', 'ViewContent');

    hideSplash();
  }

  // --- 2. GESTIÓN DE DATOS ---
  async function loadCatalog() {
    try {
      // Intentar cargar JSON local para velocidad máxima
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch {
      console.warn("Fallback catalog empty");
      catalogData = { products: [] };
    }
  }

  // --- 3. CATÁLOGO & SLIDER ---
  window.openCatalog = (sectionId, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = title || "PRODUCTOS";
    
    const container = $("catContent");
    if(!container) return;
    container.innerHTML = "";

    if(!items.length) {
        container.innerHTML = `<p style="text-align:center;padding:40px;color:#ccc;">Agotado.</p>`;
    } else {
        const grid = document.createElement("div");
        grid.className = "catGrid"; // Clase del diseño original
        
        items.forEach(p => {
            const card = document.createElement("div");
            card.className = "prodCard"; // Clase del diseño original

            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            
            // Precios
            const sellPrice = Number(p.baseMXN);
            const listPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            
            // HTML Precios
            const priceHtml = `
                <div class="prodPrice">
                     <span style="text-decoration:line-through; color:#666; font-size:16px; margin-right:5px;">${money(listPrice)}</span>
                     <span style="color:#E10600; font-weight:bold;">${money(sellPrice)}</span>
                </div>`;

            // SLIDER DE IMÁGENES (Integración Nueva en Diseño Viejo)
            const images = p.images && p.images.length ? p.images : [p.img];
            const slidesHtml = images.map(src => 
                `<div class="prod-slide" style="min-width:100%; display:flex; justify-content:center;"><img src="${cleanUrl(src)}" class="prodImg" loading="lazy"></div>`
            ).join("");

            // Tallas
            const sizesHtml = (p.sizes || ["Unitalla"]).map((s,i) => 
                `<button class="size-pill ${i===0?'active':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</button>`
            ).join("");

            card.innerHTML = `
                <div class="metallic-frame" style="position:relative; overflow:hidden; border-radius:12px; margin-bottom:10px;">
                    <div class="promo-badge" style="position:absolute; top:0; right:0; background:#E10600; color:white; padding:2px 8px; font-weight:bold; font-size:12px; z-index:10;">-80%</div>
                    <div class="prod-slider" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;">
                        ${slidesHtml}
                    </div>
                </div>
                <div class="prodName">${p.name}</div>
                ${priceHtml}
                <div class="sizeRow" id="sizes-${p.id}">
                    ${sizesHtml}
                </div>
                <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
            `;
            card.dataset.selSize = defSize;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
    
    // Abrir Modal
    const modal = $("modalCatalog");
    const overlay = $("overlay");
    if(modal) modal.classList.add("active");
    if(overlay) overlay.classList.add("active");
  };

  window.selectSize = (btn, pid, size) => {
      const container = btn.closest('.sizeRow');
      container.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.closest('.prodCard').dataset.selSize = size;
  };

  /* --- CART & CHECKOUT --- */
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      
      const allBtns = document.querySelectorAll(`button[onclick="addToCart('${pid}')"]`);
      let card = null;
      allBtns.forEach(b => { if(b.closest('#modalCatalog')) card = b.closest('.prodCard'); });
      
      const size = card ? card.dataset.selSize : "Unitalla";
      const cartId = `${pid}-${size}`;
      
      const exist = cart.find(x => x.cartItemId === cartId);
      if(exist) exist.qty++;
      else cart.push({
          id: p.id, name: p.name, price: Number(p.baseMXN), 
          img: p.img, size: size, qty: 1, cartItemId: cartId
      });
      
      saveCart(); updateCartUI(); showToast("Agregado al pedido");
      closeAll(); openDrawer();
      if(typeof fbq === 'function') fbq('track', 'AddToCart');
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar carrito?")) { cart=[]; saveCart(); updateCartUI(); } };

  function setupUI() {
      // Envios
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              const form = $("shipForm");
              if(r.value === 'pickup') {
                  shippingState.cost = 0; shippingState.label = "Gratis"; form.style.display = "none";
              } else {
                  // Tarifas Fijas de Seguridad
                  shippingState.cost = (r.value === 'mx') ? 250 : 800;
                  shippingState.label = (r.value === 'mx') ? "Envío Nacional" : "Envío USA";
                  form.style.display = "block";
              }
              updateCartUI();
          });
      });
  }

  function updateCartUI() {
      const box = $("cartItems");
      if(!box) return;
      box.innerHTML = "";
      let sub = 0;

      if(!cart.length) $("cartEmpty").style.display = "block";
      else $("cartEmpty").style.display = "none";

      cart.forEach((it, idx) => {
          sub += it.price * it.qty;
          box.innerHTML += `
            <div class="cartItem">
                <div class="cName"><b>${it.name}</b><br><small>${it.size}</small></div>
                <div class="cPrice">${money(it.price * it.qty)} <button onclick="removeFromCart(${idx})" style="color:red;border:none;background:none;cursor:pointer;">x</button></div>
            </div>`;
      });
      
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      $("subTotal").innerText = money(sub);
      $("shipTotal").innerText = shippingState.cost === 0 ? 'Gratis' : money(shippingState.cost);
      $("grandTotal").innerText = money(sub + shippingState.cost);
  }

  window.checkout = async () => {
      if(!cart.length) return;
      const btn = $("checkoutBtn");
      
      if(shippingState.mode !== 'pickup') {
          if(!$("cp").value || !$("name").value || !$("addr").value) {
              alert("Por favor completa los datos de envío."); return;
          }
      }

      btn.disabled = true; btn.innerText = "PROCESANDO...";
      if(typeof fbq === 'function') fbq('track', 'InitiateCheckout');

      try {
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: 'POST', 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  items: cart, 
                  mode: shippingState.mode,
                  promoCode: "LANZAMIENTO80",
                  customer: { name: $("name")?.value, address: $("addr")?.value, postal_code: $("cp")?.value }
              })
          });
          const data = await res.json();
          if(data.url) location.href = data.url;
          else throw new Error(data.error);
      } catch(e) {
          showToast("Error de conexión");
          btn.disabled = false; btn.innerText = "PAGAR AHORA";
      }
  };

  /* UTILS */
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); };
  window.scrollToId = (id) => { const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'}); };
  window.openLegal = (type) => {
      document.querySelectorAll('.legalBlock').forEach(b => b.style.display='none');
      const blk = document.querySelector(`[data-legal-block="${type}"]`);
      if(blk) blk.style.display='block';
      $("legalModal").classList.add("active"); $("overlay").classList.add("active");
  };
  window.showToast = (msg) => {
      const t = $("toast"); t.innerText = msg; t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 3000);
  };
  window.toast = window.showToast; // Alias
  
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      const observer = new IntersectionObserver(entries => {
          entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("visible"); });
      }, { threshold: 0.1 });
      els.forEach(el => observer.observe(el));
  }
  function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) try{cart=JSON.parse(s)}catch{} }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  document.addEventListener("DOMContentLoaded", init);
})();
