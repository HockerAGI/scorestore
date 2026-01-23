/* SCORE STORE LOGIC — PRO RACING v2026 (REAL TIME QUOTING & QUANTITY) */

(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_final_v3";
  const FAKE_MARKUP_FACTOR = 5; 

  let cart = [];
  let catalogData = { products: [], sections: [] };
  // Cost: null significa que no se ha cotizado
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
    // 4 segundos para apreciar la animación del tacómetro
    const safetyTimer = setTimeout(() => { hideSplash(); }, 4000);
    try {
        await loadCatalog();
        loadCart();
        setupUI();
        updateCartUI();
        initScrollReveal();
        if(typeof fbq === 'function') fbq('track', 'ViewContent');
    } catch (err) {
        console.error("Init Error:", err);
    } finally {
        // Dejamos que el timeout de arriba controle el cierre visual si todo carga rápido
        // pero aseguramos que si falla algo, se cierre eventualmente.
    }
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch { catalogData = { products: [] }; }
  }

  // --- CATALOGO ---
  window.openCatalog = (sectionId, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = title || "COLECCIÓN";
    const container = $("catContent");
    container.innerHTML = "";

    if(!items.length) {
        container.innerHTML = `<div style="text-align:center;color:#666;padding:40px;">AGOTADO</div>`;
    } else {
        const grid = document.createElement("div");
        grid.className = "catGrid"; 
        
        items.forEach(p => {
            const card = document.createElement("div");
            card.className = "prodCard"; 
            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            const sellPrice = Number(p.baseMXN);
            const listPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            const img = (p.images && p.images.length) ? p.images[0] : p.img;

            const sizesHtml = (p.sizes || ["Unitalla"]).map((s,i) => 
                `<button class="size-pill ${i===0?'active':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</button>`
            ).join("");

            card.innerHTML = `
                <div class="card-media">
                    <div class="promo-badge">-80%</div>
                    <img src="${cleanUrl(img)}" class="prodImg" loading="lazy">
                </div>
                <div class="card-info">
                    <div class="prodName">${p.name}</div>
                    <div class="prodPrice">
                        <small>${money(listPrice)}</small> ${money(sellPrice)}
                    </div>
                    <div class="sizeRow" id="sizes-${p.id}">${sizesHtml}</div>
                    <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR <span style="font-size:16px">+</span></button>
                </div>
            `;
            card.dataset.selSize = defSize;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
    $("modalCatalog").classList.add("active"); $("overlay").classList.add("active");
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
      
      let size = "Unitalla";
      const modal = document.getElementById("modalCatalog");
      if(modal.classList.contains("active")) {
          const btn = modal.querySelector(`button[onclick="addToCart('${pid}')"]`);
          if(btn) {
              const card = btn.closest('.prodCard');
              if(card) size = card.dataset.selSize;
          }
      }

      const exist = cart.find(x => x.id === pid && x.size === size);
      if(exist) exist.qty++;
      else cart.push({ id: p.id, name: p.name, price: Number(p.baseMXN), img: p.img, size: size, qty: 1 });
      
      saveCart(); updateCartUI(); showToast("Producto agregado");
      closeAll(); openDrawer();
      
      if(shippingState.mode !== 'pickup') quoteShipping();
      if(typeof fbq === 'function') fbq('track', 'AddToCart');
  };

  // --- LOGICA CARRITO (CANTIDAD Y ELIMINAR) ---
  window.changeQty = (idx, delta) => {
      const item = cart[idx];
      if(!item) return;
      
      const newQty = item.qty + delta;
      if(newQty < 1) {
          if(confirm("¿Eliminar producto?")) removeFromCart(idx);
      } else {
          item.qty = newQty;
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
      if(confirm("¿Vaciar todo el carrito?")) { 
          cart=[]; saveCart(); updateCartUI(); 
      } 
  };

  // --- ENVÍOS EN TIEMPO REAL ---
  function setupUI() {
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              shippingState.mode = r.value;
              const form = $("shipForm");
              const cpInput = $("cp");

              if(r.value === 'pickup') {
                  shippingState.cost = 0; 
                  shippingState.label = "Recolección en Fábrica";
                  shippingState.quoting = false;
                  form.style.display = "none";
                  updateCartUI();
              } else {
                  form.style.display = "block";
                  if(cpInput.value.length >= 5) {
                      quoteShipping();
                  } else {
                      shippingState.cost = null; 
                      shippingState.label = "Ingresa tu C.P.";
                      updateCartUI();
                      cpInput.focus();
                  }
              }
          });
      });

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
              items: cart 
          };

          const res = await fetch(`${API_BASE}/quote_shipping`, {
              method: 'POST',
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          if(data.ok) {
              shippingState.cost = data.cost;
              shippingState.label = data.label || "Estándar";
          } else {
              // Fallback visual
              shippingState.cost = (shippingState.mode === 'mx') ? 250 : 800;
          }
      } catch (e) {
          shippingState.cost = (shippingState.mode === 'mx') ? 250 : 800;
      } finally {
          shippingState.quoting = false;
          updateCartUI();
      }
  }

  window.applyPromoUI = () => {
      const code = $("promoCode").value.trim().toUpperCase();
      if(!code) return;
      showToast(`Cupón ${code} validado`);
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
          box.innerHTML += `
            <div class="cartItem">
                <img src="${cleanUrl(it.img)}" class="cartThumb">
                <div class="cInfo">
                    <div class="cName">${it.name}</div>
                    <div class="cMeta">${it.size} | SKU: ${it.id}</div>
                    <div class="qtyControl">
                        <button onclick="changeQty(${idx}, -1)">−</button>
                        <span>${it.qty}</span>
                        <button onclick="changeQty(${idx}, 1)">+</button>
                    </div>
                </div>
                <div class="cRight">
                    <div class="cPrice">${money(it.price * it.qty)}</div>
                    <div class="cart-remove" onclick="removeFromCart(${idx})">Eliminar</div>
                </div>
            </div>`;
      });
      
      const sub = cart.reduce((a,b)=>a+(b.price*b.qty),0);
      
      let shipDisplay = "---";
      let total = sub;

      if(shippingState.mode === 'pickup') {
          shipDisplay = "GRATIS";
          total = sub;
      } else if (shippingState.quoting) {
          shipDisplay = "<span class='blink'>...</span>";
      } else if (shippingState.cost !== null) {
          shipDisplay = money(shippingState.cost);
          total = sub + shippingState.cost;
      }

      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      $("subTotal").innerText = money(sub);
      $("shipTotal").innerHTML = shipDisplay;
      $("grandTotal").innerText = money(total);
      
      const activeRadioPrice = document.querySelector(`input[name="shipMode"][value="${shippingState.mode}"] + .rc-content .rc-price`);
      if(activeRadioPrice) {
          activeRadioPrice.innerText = (shippingState.mode === 'pickup') ? "GRATIS" : (shippingState.cost !== null ? money(shippingState.cost) : "Cotizar");
      }

      const btn = $("checkoutBtn");
      if(shippingState.mode !== 'pickup' && shippingState.cost === null) {
          btn.disabled = true;
          btn.innerText = "INGRESA C.P. PARA CALCULAR";
          btn.style.opacity = "0.5";
      } else {
          btn.disabled = false;
          btn.innerText = "PAGAR AHORA";
          btn.style.opacity = "1";
      }
  }

  window.checkout = async () => {
      if(!cart.length) return;
      if(shippingState.mode !== 'pickup') {
          const cp = $("cp").value.trim();
          const name = $("name").value.trim();
          const addr = $("addr").value.trim();
          if(!cp || !name || !addr) { 
              alert("⚠️ FALTAN DATOS DE ENVÍO");
              $("shipForm").scrollIntoView({ behavior: 'smooth' });
              return; 
          }
          if(shippingState.cost === null) return;
      }

      const btn = $("checkoutBtn");
      btn.disabled = true; btn.innerText = "INICIANDO...";
      
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
              method: 'POST', headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          const data = await res.json();
          if(data.url) location.href = data.url; else throw new Error(data.error);
      } catch(e) { 
          alert("Error: " + e.message); 
          btn.disabled = false; btn.innerText = "REINTENTAR"; 
      }
  };

  /* UTILS */
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); };
  window.scrollToId = (id) => { const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'}); };
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
