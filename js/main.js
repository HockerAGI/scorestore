/* SCORE STORE LOGIC — FINAL PRODUCTION v2026 (Original Design + Smart Cart) */

(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_final_v3";
  const FAKE_MARKUP_FACTOR = 5; 

  let cart = [];
  let catalogData = { products: [], sections: [] };
  
  // Estado de envío: cost null indica que falta cotizar
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis en Fábrica", quoting: false };
  let appliedPromo = null;

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  // --- INTRO / SPLASH ---
  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hidden")) {
      s.classList.add("hidden");
      setTimeout(() => { try { s.remove(); } catch {} }, 800);
    }
  }

  async function init() {
    // Safety timer
    const safetyTimer = setTimeout(() => { hideSplash(); }, 3500); 
    try {
        await loadCatalog();
        loadCart();
        setupUI();
        updateCartUI();
        initScrollReveal();
        if(typeof fbq === 'function') fbq('track', 'ViewContent');
    } catch (err) {
        console.error("Critical Init Error:", err);
    } finally {
        clearTimeout(safetyTimer);
        hideSplash(); 
    }
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      if (!res.ok) throw new Error("Catalog fetch failed");
      catalogData = await res.json();
    } catch (e) {
      catalogData = { products: [] };
    }
  }

  // --- CATALOGO ---
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
      
      // Si ya hay CP, recotizar
      if(shippingState.mode !== 'pickup') quoteShipping();
      
      if(typeof fbq === 'function') fbq('track', 'AddToCart');
  };

  // --- NUEVA FUNCIONALIDAD: CANTIDADES ---
  window.changeQty = (idx, delta) => {
      if(!cart[idx]) return;
      const newQty = cart[idx].qty + delta;
      if(newQty < 1) {
          if(confirm("¿Eliminar este producto?")) removeFromCart(idx);
      } else {
          cart[idx].qty = newQty;
          saveCart();
          updateCartUI();
          if(shippingState.mode !== 'pickup') quoteShipping();
      }
  };

  window.removeFromCart = (idx) => { 
      cart.splice(idx, 1); saveCart(); updateCartUI(); 
      if(shippingState.mode !== 'pickup') quoteShipping();
  };
  
  window.emptyCart = () => { 
      if(confirm("¿Vaciar carrito?")) { cart=[]; saveCart(); updateCartUI(); } 
  };

  // --- LOGICA DE ENVÍOS REALES ---
  function setupUI() {
      // Radio buttons
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              const form = $("shipForm");
              const cpInput = $("cp");
              shippingState.mode = r.value;
              
              if(r.value === 'pickup') {
                  shippingState.cost = 0; 
                  shippingState.label = "Recolección Gratis"; 
                  shippingState.quoting = false;
                  form.style.display = "none";
                  updateCartUI();
              } else {
                  form.style.display = "block";
                  // Si ya tiene 5 digitos, cotizar
                  if(cpInput.value.length >= 5) {
                      quoteShipping();
                  } else {
                      shippingState.cost = null; // null = falta cotizar
                      shippingState.label = "Ingresa CP";
                      updateCartUI();
                      cpInput.focus();
                  }
              }
          });
      });

      // Listener CP para cotización automática
      const cpInput = $("cp");
      let typeTimer;
      cpInput.addEventListener('input', () => {
          clearTimeout(typeTimer);
          const zip = cpInput.value.replace(/[^0-9]/g, '');
          if (zip.length === 5) {
              typeTimer = setTimeout(() => quoteShipping(), 800);
          } else {
              if(shippingState.mode !== 'pickup') {
                  shippingState.cost = null;
                  updateCartUI();
              }
          }
      });
  }

  async function quoteShipping() {
      if(!cart.length || shippingState.mode === 'pickup') return;
      const zip = $("cp").value.trim();
      if(zip.length < 5) return;

      shippingState.quoting = true;
      updateCartUI();

      try {
          const payload = {
              zip: zip,
              country: shippingState.mode === 'us' ? 'US' : 'MX',
              items: cart // Enviar items para peso
          };

          const res = await fetch(`${API_BASE}/quote_shipping`, {
              method: 'POST', 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          if(data.ok) {
              shippingState.cost = data.cost;
              shippingState.label = data.label;
          } else {
              // Fallback si falla API (costos fijos)
              shippingState.cost = (shippingState.mode === 'mx') ? 250 : 800;
              shippingState.label = "Envío Estándar";
          }
      } catch (e) {
          console.error("Quote Error", e);
          shippingState.cost = (shippingState.mode === 'mx') ? 250 : 800;
      } finally {
          shippingState.quoting = false;
          updateCartUI();
      }
  }

  window.applyPromoUI = () => {
      const code = $("promoCode").value.trim().toUpperCase();
      if(!code) return;
      showToast(`Código ${code} validado`);
      appliedPromo = code;
  };

  function updateCartUI() {
      const box = $("cartItems");
      const footer = $("cartFooter");
      const emptyState = $("cartEmpty");

      if (!cart.length) {
          box.innerHTML = "";
          emptyState.style.display = "flex"; 
          footer.style.display = "none";     
          $("cartCount").innerText = "0";
          return;
      }

      emptyState.style.display = "none";
      footer.style.display = "block";
      box.innerHTML = "";

      cart.forEach((it, idx) => {
          // Tarjeta rediseñada con controles de cantidad
          box.innerHTML += `
            <div class="cartItem">
                <img src="${cleanUrl(it.img)}" class="cartThumb">
                <div class="cInfo">
                    <div class="cName">${it.name}</div>
                    <div class="cMeta">Talla: ${it.size} | SKU: ${it.id}</div>
                    <div class="qtyControl">
                        <button class="qtyBtn" onclick="changeQty(${idx}, -1)">−</button>
                        <span class="qtyVal">${it.qty}</span>
                        <button class="qtyBtn" onclick="changeQty(${idx}, 1)">+</button>
                    </div>
                </div>
                <div class="cRight">
                    <div class="cPrice">${money(it.price * it.qty)}</div>
                    <div class="cart-remove" onclick="removeFromCart(${idx})">Eliminar</div>
                </div>
            </div>`;
      });
      
      const sub = cart.reduce((a,b)=>a+(b.price*b.qty),0);
      
      // Lógica visual costo envío
      let shipDisplay = "---";
      let total = sub;

      if(shippingState.mode === 'pickup') {
          shipDisplay = "GRATIS";
          total = sub;
      } else if (shippingState.quoting) {
          shipDisplay = "Cotizando...";
      } else if (shippingState.cost !== null) {
          shipDisplay = money(shippingState.cost);
          total = sub + shippingState.cost;
      }

      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      $("subTotal").innerText = money(sub);
      $("shipTotal").innerText = shipDisplay;
      $("grandTotal").innerText = money(total);

      // Bloquear botón si falta cotización
      const btn = $("checkoutBtn");
      if(shippingState.mode !== 'pickup' && shippingState.cost === null) {
          btn.disabled = true;
          btn.innerText = "INGRESA C.P. PARA CALCULAR";
          btn.style.opacity = "0.6";
      } else {
          btn.disabled = false;
          btn.innerText = "PAGAR AHORA";
          btn.style.opacity = "1";
      }
  }

  window.checkout = async () => {
      if(!cart.length) return;
      
      // Validación estricta
      if(shippingState.mode !== 'pickup') {
          const cp = $("cp").value.trim();
          const name = $("name").value.trim();
          const addr = $("addr").value.trim();
          
          if(!cp || !name || !addr) { 
              alert("Por favor completa Nombre, Dirección y C.P. para el envío.");
              $("shipForm").scrollIntoView({ behavior: 'smooth' });
              return; 
          }
          if(shippingState.cost === null) {
              alert("Esperando cotización de envío...");
              return;
          }
      }

      const btn = $("checkoutBtn");
      btn.disabled = true; btn.innerText = "PROCESANDO...";
      if(typeof fbq === 'function') fbq('track', 'InitiateCheckout');
      
      try {
          const payload = {
            items: cart, 
            mode: shippingState.mode, 
            promoCode: appliedPromo || $("promoCode")?.value || "",
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
      } catch(e) { 
          alert("Error: " + e.message); 
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
  window.showToast = (msg) => { const t = $("toast"); t.innerText = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); };
  
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      const observer = new IntersectionObserver(entries => {
          entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("visible"); });
      }, { threshold: 0.1 });
      els.forEach(el => observer.observe(el));
  }
  function loadCart() { try { const s = localStorage.getItem(CART_KEY); if(s) cart=JSON.parse(s); } catch {} }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} }

  document.addEventListener("DOMContentLoaded", init);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW fail:', err));
    });
  }
})();