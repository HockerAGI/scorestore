/* SCORE STORE LOGIC — ORIGINAL OPTIMIZED v2026 */

(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_final_v3";
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 5; 

  let cart = [];
  let catalogData = { products: [], sections: [] };
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hidden")) {
      s.classList.add("hidden");
      // Remover del DOM para liberar recursos (Performance)
      setTimeout(() => { try { s.remove(); } catch {} }, 800);
    }
  }

  async function init() {
    // FIX: Eliminado el retraso de 4500ms. Carga inmediata.
    
    await loadCatalog();
    loadCart();
    setupUI();
    updateCartUI();
    initScrollReveal();

    if(typeof fbq === 'function') fbq('track', 'ViewContent');
    
    // Ocultar pantalla de carga inmediatamente
    hideSplash();
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch {
      console.warn("Fallback");
      catalogData = { products: [] };
    }
  }

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
        grid.className = "catGrid"; 
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
        grid.style.gap = "20px";
        
        items.forEach(p => {
            const card = document.createElement("div");
            card.className = "prodCard"; 

            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            const sellPrice = Number(p.baseMXN);
            const listPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            
            const priceHtml = `
                <div class="prodPrice">
                     <span style="text-decoration:line-through; color:#666; font-size:16px; margin-right:5px;">${money(listPrice)}</span>
                     <span style="color:#E10600; font-weight:bold;">${money(sellPrice)}</span>
                </div>`;

            const images = p.images && p.images.length ? p.images : [p.img];
            const slidesHtml = images.map(src => 
                `<div class="prod-slide" style="min-width:100%; display:flex; justify-content:center;">
                    <img src="${cleanUrl(src)}" class="prodImg" loading="lazy" onerror="this.closest('.prod-slide').remove()">
                 </div>`
            ).join("");

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

  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      const allBtns = document.querySelectorAll(`button[onclick="addToCart('${pid}')"]`);
      let card = null;
      allBtns.forEach(b => { if(b.closest('#modalCatalog')) card = b.closest('.prodCard'); });
      const size = card ? card.dataset.selSize : "Unitalla";
      const exist = cart.find(x => x.id === pid && x.size === size);
      if(exist) exist.qty++;
      else cart.push({ id: p.id, name: p.name, price: Number(p.baseMXN), img: p.img, size: size, qty: 1 });
      saveCart(); updateCartUI(); showToast("Agregado al pedido");
      closeAll(); openDrawer();
      if(typeof fbq === 'function') fbq('track', 'AddToCart');
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar carrito?")) { cart=[]; saveCart(); updateCartUI(); } };

  function setupUI() {
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              const form = $("shipForm");
              if(r.value === 'pickup') {
                  shippingState.cost = 0; shippingState.label = "Gratis"; form.style.display = "none";
              } else {
                  shippingState.cost = (r.value === 'mx') ? 250 : 800;
                  shippingState.label = (r.value === 'mx') ? "Envío Nacional" : "Envío USA";
                  form.style.display = "block";
              }
              updateCartUI();
          });
      });
  }

  function updateCartUI() {
      const box = $("cartItems"); if(!box) return;
      box.innerHTML = "";
      if(!cart.length) $("cartEmpty").style.display = "block";
      else $("cartEmpty").style.display = "none";

      cart.forEach((it, idx) => {
          box.innerHTML += `
            <div class="cartItem">
                <img src="${cleanUrl(it.img)}" class="cartThumb">
                <div class="cInfo">
                    <div class="cName">${it.name}</div>
                    <div class="cMeta">${it.size}</div>
                    <div class="qtyRow">x${it.qty}</div>
                </div>
                <div class="cPrice">${money(it.price * it.qty)}</div>
                <div class="cart-remove" onclick="removeFromCart(${idx})">✕</div>
            </div>`;
      });
      
      const sub = cart.reduce((a,b)=>a+(b.price*b.qty),0);
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      $("subTotal").innerText = money(sub);
      $("shipTotal").innerText = shippingState.cost === 0 ? 'Gratis' : money(shippingState.cost);
      $("grandTotal").innerText = money(sub + shippingState.cost);
  }

  window.checkout = async () => {
      if(!cart.length) return;
      const btn = $("checkoutBtn");
      if(shippingState.mode !== 'pickup' && (!$("cp").value || !$("name").value)) { alert("Faltan datos"); return; }
      btn.disabled = true; btn.innerText = "PROCESANDO...";
      if(typeof fbq === 'function') fbq('track', 'InitiateCheckout');
      
      try {
          const payload = {
            items: cart, 
            mode: shippingState.mode, 
            customer: { 
                name: $("name")?.value, 
                address: $("addr")?.value, 
                postal_code: $("cp")?.value 
            }
          };

          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: 'POST', 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          const data = await res.json();
          if(data.url) location.href = data.url; else throw new Error(data.error);
      } catch(e) { alert("Error: " + e.message); btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
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

  // --- SERVICE WORKER (PWA) REGISTRO ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('SW ok:', reg.scope);
      }).catch(err => console.log('SW fail:', err));
    });
  }
})();