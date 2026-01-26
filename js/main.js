(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const GEMINI_API_KEY = "AIzaSyAtFIytBGuc5Dc_ZmQb54cR1d6qsPBix2Y"; 
  const CART_KEY = "score_cart_master_v2026";
  
  let cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  
  let catalogData = {
    "products": [
      { "id": "b1k-jacket", "name": "Chamarra Oficial Baja 1000", "baseMXN": 1890, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/chamarra-baja1000.webp", "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-hoodie-blk", "name": "Hoodie Clásica Negra", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
      { "id": "b1k-tee-black", "name": "Camiseta Negra Oficial", "baseMXN": 480, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camiseta-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
      { "id": "b500-tee-grey", "name": "Camiseta Oficial Baja 500", "baseMXN": 480, "sectionId": "BAJA_500", "img": "/assets/BAJA500/camiseta-gris-baja500.webp", "sizes": ["S","M","L"] },
      { "id": "sf250-tank", "name": "Tank Top San Felipe", "baseMXN": 440, "sectionId": "SF_250", "img": "/assets/SF250/camiseta-negra-sinmangas-SF250.webp", "sizes": ["S","M","L"] }
    ]
  };

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  // --- INIT ---
  document.addEventListener('DOMContentLoaded', async () => {
      // Carga Híbrida: Intenta fetch, fallback a datos locales
      try {
          const res = await fetch("/data/catalog.json");
          const data = await res.json();
          if(data.products) catalogData = data;
      } catch(e) { console.log("Usando catálogo de respaldo"); }

      runIntro();
      updateCartUI();
      
      // Social Proof (Ventas Falsas Marketing)
      setInterval(() => {
          const names = ["Juan", "Mónica", "Roberto", "Arancha", "Carlos"];
          const notif = $("notif-content");
          const box = $("sales-notification");
          if(notif && box) {
              notif.innerHTML = `¡<b>${names[Math.floor(Math.random()*names.length)]}</b> adquirió Merch Oficial!`;
              box.classList.add('active');
              setTimeout(() => box.classList.remove('active'), 5000);
          }
      }, 45000);
  });

  // --- UI ACTIONS ---
  window.toggleCart = () => { 
      $('cartDrawer').classList.toggle('active');
      $('overlay').classList.toggle('active');
  };
  
  window.closeAll = () => { 
      document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); 
      document.body.classList.remove('noScroll'); 
  };

  window.scrollToId = (id) => { 
      const el = $(id); 
      if(el) el.scrollIntoView({behavior:'smooth'}); 
  };

  /* --- 1. INTRO ENGINE (RPM) --- */
  function runIntro() {
    const aguja = $('needle');
    const splash = $('splash-screen');
    const rev = $('rev-val');
    const status = $('status-text');

    // Failsafe 3s
    setTimeout(() => {
      if(splash && splash.style.display !== 'none') {
          splash.style.opacity = '0';
          setTimeout(() => { splash.style.display = 'none'; }, 600);
      }
    }, 3000);

    setTimeout(() => { if(aguja) aguja.style.width = "100%"; }, 300); // Llenado barra
    
    let r = 0;
    const itv = setInterval(() => { 
        r += 580; if(r > 8000) r = 8000; 
        if(rev) rev.innerHTML = String(r).padStart(4, '0'); 
    }, 80);

    setTimeout(() => { 
        if(status) status.innerHTML = "FUEL INJECTION... READY"; 
    }, 1500);

    setTimeout(() => { 
      clearInterval(itv);
      if(splash) {
        splash.style.opacity = '0';
        setTimeout(() => { splash.style.display = 'none'; }, 600);
      }
    }, 2800);
  }

  /* --- 2. CATÁLOGO & CARRITO --- */
  window.openCatalog = (sid) => {
      const items = catalogData.products.filter(p => p.sectionId === sid);
      const box = $('catContent');
      if(!box) return;
      box.innerHTML = '';

      items.forEach(p => {
          const card = document.createElement('div');
          card.className = "p-card"; // Clase CSS Master
          const img = (p.images && p.images[0]) ? p.images[0] : (p.img || "");
          const sizes = p.sizes || ["S", "M", "L", "XL"];
          
          card.innerHTML = `
              <div class="p-media">
                  <div class="p-slide"><img src="${img}" loading="lazy" alt="${p.name}"></div>
              </div>
              <div class="p-body">
                  <div class="p-name">${p.name}</div>
                  <div class="p-price">${money(p.baseMXN)}</div>
                  <select class="p-size-sel" id="size_${p.id}">${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                  <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR</button>
              </div>`;
          box.appendChild(card);
      });
      $('modalCatalog').classList.add('active');
      $('overlay').classList.add('active');
  };

  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      const sizeEl = $(`size_${pid}`);
      const size = sizeEl ? sizeEl.value : 'Unitalla';
      
      if(p) {
          const exist = cart.find(x => x.id === pid && x.size === size);
          if(exist) exist.qty++; 
          else cart.push({
              id: p.id,
              name: p.name,
              baseMXN: p.baseMXN,
              img: (p.images && p.images[0]) ? p.images[0] : (p.img || ""),
              qty: 1, 
              size: size
          });
          
          saveCart();
          updateCartUI(); 
          window.toggleCart();
          showToast("🏁 AGREGADO");
      }
  };

  function updateCartUI() {
      const box = $('cartItems'); 
      if(!box) return;
      
      const modeInput = document.querySelector('input[name="shipMode"]:checked');
      const mode = modeInput ? modeInput.value : 'pickup';
      const shipForm = $('shipForm');
      if(shipForm) shipForm.style.display = mode === 'pickup' ? 'none' : 'block';

      box.innerHTML = ''; 
      let total = 0;
      
      const emptyMsg = $('cartEmpty');
      if(cart.length === 0) { if(emptyMsg) emptyMsg.style.display = 'block'; } 
      else { if(emptyMsg) emptyMsg.style.display = 'none'; }

      cart.forEach((it, i) => {
          total += (it.baseMXN * it.qty);
          box.innerHTML += `
          <div class="cart-card">
            <img src="${it.img}" alt="${it.name}">
            <div style="flex:1">
               <div class="cName">${it.name}</div>
               <div class="cMeta">Talla: ${it.size}</div>
               <div class="qty-ctrl">
                  <button class="qty-btn" onclick="window.modQty(${i},-1)">-</button>
                  <div class="qtyVal">${it.qty}</div>
                  <button class="qty-btn" onclick="window.modQty(${i},1)">+</button>
               </div>
            </div>
            <div class="cPrice">${money(it.baseMXN * it.qty)}</div>
          </div>`;
      });
      
      let shipping = 0;
      if(mode === 'mx') shipping = 250;
      if(mode === 'us') shipping = 800;

      $('grandTotal').innerText = money(total + shipping);
      $('cartCount').innerText = cart.reduce((a,b)=>a+b.qty,0);
      
      if (cart.length > 0 && !document.querySelector('.cart-ai-box')) {
          const aiPanel = document.createElement('div');
          aiPanel.className = 'cart-ai-box';
          aiPanel.innerHTML = `<div class="ai-badge">IA ✨</div><button onclick="window.analyzeCart()" style="width:100%; border:2px solid #ddd; padding:12px; border-radius:12px; font-weight:800; font-size:12px; color:#111;">✨ ANALIZAR EQUIPO CON IA</button><div id="ai-res" style="display:none; font-size:12px; line-height:1.4; margin-top:10px; color:#444;"></div>`;
          box.appendChild(aiPanel);
      }
  }

  window.modQty = (i, d) => { 
      cart[i].qty += d; 
      if(cart[i].qty <= 0) cart.splice(i, 1); 
      saveCart(); 
      updateCartUI(); 
  };

  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

  window.checkout = async () => {
      if(!cart.length) return;
      const btn = $('checkoutBtn');
      const mode = document.querySelector('input[name="shipMode"]:checked').value;
      const cp = $('cp').value;
      const promo = $('promo').value;

      if(mode !== 'pickup' && !cp) return showToast("⚠️ Falta Código Postal");

      btn.innerText = "PROCESANDO..."; btn.disabled = true;
      showToast("🏁 INICIANDO MOTOR DE PAGOS...");

      try {
          const res = await fetch("/.netlify/functions/create_checkout", {
              method: "POST",
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ cart, shippingMode: mode, zip: cp, promoCode: promo })
          });
          const data = await res.json();
          if(data.url) window.location.href = data.url;
          else { alert("Error: " + (data.error || "Desconocido")); btn.innerText = "PAGAR AHORA"; btn.disabled = false; }
      } catch(e) {
          alert("Error de conexión"); btn.innerText = "PAGAR AHORA"; btn.disabled = false;
      }
  };

  /* --- 3. AI CHAT --- */
  window.toggleAiAssistant = () => {
      const modal = $('aiChatModal');
      modal.classList.toggle('active');
      if (modal.classList.contains('active') && $('aiMessages').innerHTML === "") {
          $('aiMessages').innerHTML = '<div class="ai-bubble bot">¡Hola! Soy tu Estratega del Desierto. 🏁</div>';
      }
  };

  window.sendAiMessage = async () => {
      const input = $('aiInput');
      const box = $('aiMessages');
      const text = input.value.trim();
      if (!text) return;
      
      input.value = '';
      box.innerHTML += `<div class="ai-bubble user">${text}</div>`;
      box.scrollTop = box.scrollHeight;
      
      const id = Date.now();
      box.innerHTML += `<div class="ai-bubble bot" id="ai-${id}">...</div>`;
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const payload = { contents: [{ role: "user", parts: [{ text: text }] }] };

      try {
          const r = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
          const d = await r.json();
          $(`ai-${id}`).innerText = d.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta.";
      } catch { $(`ai-${id}`).innerText = "Error satelital."; }
      
      box.scrollTop = box.scrollHeight;
  };

  /* --- 4. UTILS --- */
  window.openLegal = (type) => {
      const contents = {
          privacidad: "<h2>Privacidad</h2><p>Tus datos son seguros con <b>BAJATEX S. de R.L. de C.V.</b>. Solo para envíos.</p>",
          terminos: "<h2>Términos</h2><p>Cambios por defecto en 30 días.</p>",
          contacto: "<h2>Contacto</h2><p>ventas.unicotextil@gmail.com</p>"
      };
      $('legalContent').innerHTML = contents[type] || "Cargando...";
      $('modalLegal').classList.add('active');
      $('overlay').classList.add('active');
  };

  function showToast(m) { 
      const t=$("toast"); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); 
  }

})();
