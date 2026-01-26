(function () {
  "use strict";

  // --- CONFIGURACIÓN GLOBAL ---
  const CFG = window.__SCORE__ || {};
  // API Key de Gemini inyectada directamente para asegurar funcionamiento
  const GEMINI_API_KEY = "AIzaSyAtFIytBGuc5Dc_ZmQb54cR1d6qsPBix2Y"; 
  
  const CART_KEY = "score_cart_master_v2026";
  let cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  
  // CATÁLOGO OFICIAL INTEGRADO (Respaldo robusto por si falla la red)
  let catalogData = {
    "products": [
      { "id": "b1k-jacket", "sku": "B1K-JKT-25", "name": "Chamarra Oficial Baja 1000", "baseMXN": 1890, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/chamarra-baja1000.webp", "images": ["/assets/EDICION_2025/chamarra-baja1000.webp", "/assets/EDICION_2025/chamarra-baja1000-detalle.webp", "/assets/EDICION_2025/chamarra-baja1000-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-hoodie-ng", "sku": "B1K-HOOD-NG", "name": "Hoodie Oficial Negro / Gris", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/hoodie-negro-gris-baja1000.webp", "images": ["/assets/EDICION_2025/hoodie-negro-gris-baja1000.webp", "/assets/EDICION_2025/hoodie-negro-gris-baja1000-detalle.webp", "/assets/EDICION_2025/hoodie-negro-gris-baja1000-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-hoodie-blk", "sku": "B1K-HOOD-BLK", "name": "Hoodie Clásica Negra", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp", "images": ["/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp", "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000-detalle.webp", "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-hoodie-red-blk", "sku": "B1K-HOOD-RB", "name": "Hoodie Contrast Rojo / Negro", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/OTRAS_EDICIONES/hoodie-negra-roja-baja1000.webp", "images": ["/assets/OTRAS_EDICIONES/hoodie-negra-roja-baja1000.webp", "/assets/OTRAS_EDICIONES/hoodie-negra-roja-baja1000-detalle.webp", "/assets/OTRAS_EDICIONES/hoodie-negra-roja-baja1000-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-tee-black", "sku": "B1K-TEE-BLK", "name": "Camiseta Negra Oficial Baja 1000", "baseMXN": 480, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camiseta-negra-baja1000.webp", "images": ["/assets/EDICION_2025/camiseta-negra-baja1000.webp", "/assets/EDICION_2025/camiseta-negra-baja1000-detalles.jpg.webp", "/assets/EDICION_2025/camiseta-negra-baja1000-atras.jpg.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-tee-brown", "sku": "B1K-TEE-BRN", "name": "Camiseta Café Baja 1000", "baseMXN": 480, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camiseta-cafe-baja1000.jpg.webp", "images": ["/assets/EDICION_2025/camiseta-cafe-baja1000.jpg.webp", "/assets/EDICION_2025/camiseta-cafe-baja1000-detalles.jpg.webp", "/assets/EDICION_2025/camiseta-cafe-baja1000-atras.jpg.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-shirt-pits-grey", "sku": "B1K-SHIRT-GRY", "name": "Camisa Pits Gris Baja 1000", "baseMXN": 690, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camisa-gris-pits-baja1000.jpg.webp", "images": ["/assets/EDICION_2025/camisa-gris-pits-baja1000.jpg.webp", "/assets/EDICION_2025/camisa-gris-pits-baja1000-detalles.jpg.webp", "/assets/EDICION_2025/camisa-gris-pits-baja1000-atras.jpg.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-shirt-pits-black", "sku": "B1K-SHIRT-BLK", "name": "Camisa Pits Negra Baja 1000", "baseMXN": 690, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camisa-negra-pits-baja1000.webp", "images": ["/assets/EDICION_2025/camisa-negra-pits-baja1000.webp", "/assets/EDICION_2025/camisa-negra-pits-baja1000-detalle.webp", "/assets/EDICION_2025/camisa-negra-pits-baja1000-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-cap", "sku": "B1K-CAP-RG", "name": "Gorra Oficial Roja / Gris", "baseMXN": 650, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/gorras-roja-gris.webp", "images": ["/assets/EDICION_2025/gorras-roja-gris.webp", "/assets/EDICION_2025/gorras-roja-gris-detalle.webp", "/assets/EDICION_2025/gorras-roja-gris-atras.webp"], "sizes": ["Unitalla"] },
      { "id": "b500-tee-grey", "sku": "B500-TEE-GRY", "name": "Camiseta Oficial Baja 500", "baseMXN": 480, "sectionId": "BAJA_500", "img": "/assets/BAJA500/camiseta-gris-baja500.webp", "images": ["/assets/BAJA500/camiseta-gris-baja500.webp", "/assets/BAJA500/camiseta-gris-baja500-detalle.webp", "/assets/BAJA500/camiseta-gris-baja500-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b400-tee-brown", "sku": "B400-TEE-BRN", "name": "Camiseta Café Baja 400", "baseMXN": 480, "sectionId": "BAJA_400", "img": "/assets/BAJA400/camiseta-cafe-oscuro-baja400.webp", "images": ["/assets/BAJA400/camiseta-cafe-oscuro-baja400.webp", "/assets/BAJA400/camiseta-cafe-oscuro-baja400-detalle.webp", "/assets/BAJA400/camiseta-cafe-oscuro-baja400-atras.webp"], "sizes": ["S","M","L","XL","2XL"] },
      { "id": "sf250-tank", "sku": "SF250-TNK-BLK", "name": "Tank Top San Felipe 250", "baseMXN": 440, "sectionId": "SF_250", "img": "/assets/SF250/camiseta-negra-sinmangas-SF250.webp", "images": ["/assets/SF250/camiseta-negra-sinmangas-SF250.webp", "/assets/SF250/camiseta-negra-sinmangas-S250-detalles.webp", "/assets/SF250/camiseta-negra-sinmangas-S250-atras.webp"], "sizes": ["S","M","L","XL","2XL"] }
    ]
  };

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const playSFX = (id) => { 
      // Opcional: Sonido si existe el archivo
      // const a = new Audio('/assets/sfx/click.mp3'); a.volume=0.2; a.play().catch(()=>{});
  };

  // --- EXPOSICIÓN GLOBAL PARA HTML ---
  window.scrollToId = (id) => { const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'}); };
  window.toggleCart = () => { 
      const d = $('cartDrawer');
      const o = $('overlay');
      if(d) d.classList.toggle('active');
      if(o) o.classList.toggle('active');
  };
  
  window.closeAll = () => { 
      document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); 
      document.body.classList.remove('noScroll'); 
  };

  /* --- 1. INTRO ENGINE (Tacómetro & Carga) --- */
  function runIntro() {
    const aguja = $('needle');
    const splash = $('splash-screen');
    const rev = $('rev-val');
    const status = $('status-text');

    // Failsafe: Si algo falla, desbloquear pantalla en 3s
    setTimeout(() => {
      if(splash && splash.style.display !== 'none') {
          splash.style.opacity = '0';
          setTimeout(() => { splash.style.display = 'none'; document.body.classList.remove('noScroll'); }, 600);
      }
    }, 3000);

    // Animación Aguja
    setTimeout(() => { if(aguja) aguja.style.transform = "rotate(85deg)"; }, 300);
    
    // Contador RPM
    let r = 0;
    const itv = setInterval(() => { 
        r += 580; 
        if(r > 8000) r = 8000; 
        if(rev) rev.innerHTML = String(r).padStart(4, '0'); 
    }, 80);

    setTimeout(() => { 
        if(status) status.innerHTML = "FUEL INJECTION... READY"; 
        if(aguja) aguja.style.transform = "rotate(10deg)"; 
    }, 1500);

    // Finalizar Intro
    setTimeout(() => { 
      clearInterval(itv);
      if(splash) {
        splash.style.opacity = '0';
        setTimeout(() => { splash.style.display = 'none'; document.body.classList.remove('noScroll'); }, 600);
      }
    }, 2800);
  }

  /* --- 2. GEMINI AI (Chatbot Inteligente) --- */
  async function callGemini(prompt, sys) {
      if(!GEMINI_API_KEY) return "⚠️ Error de configuración IA.";
      
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const payload = { 
          contents: [{ role: "user", parts: [{ text: prompt }] }], 
          systemInstruction: { parts: [{ text: sys }] } 
      };

      // Reintentos automáticos
      for (let delay of [1000, 2000, 4000]) {
          try {
              const response = await fetch(url, { 
                  method: 'POST', 
                  headers: { 'Content-Type': 'application/json' }, 
                  body: JSON.stringify(payload) 
              });
              if (!response.ok) throw new Error();
              const data = await response.json();
              return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta.";
          } catch (err) { await new Promise(r => setTimeout(r, delay)); }
      }
      return "Conexión satelital inestable. Intenta de nuevo.";
  }

  /* --- 3. FUNCIONES DE IA PARA UI --- */
  window.analyzeCart = async () => {
      const resBox = $('ai-res');
      if(!resBox) return;
      resBox.style.display = 'block';
      resBox.innerHTML = '<div style="font-size:12px; color:var(--red); font-family:Teko;">ANALIZANDO TELEMETRÍA...</div>';
      
      const items = cart.map(i => `${i.name} (${i.size})`).join(', ');
      if(!items) { resBox.innerHTML = "Carrito vacío. Agrega equipo primero."; return; }

      const prompt = `Analiza mi carrito: ${items}. Dame un consejo experto y breve para la carrera Baja 1000 con este equipo.`;
      const sys = "Eres un estratega experto de SCORE International. Sé breve, técnico y motivador.";
      
      const res = await callGemini(prompt, sys);
      resBox.innerHTML = `✨ <b>Copiloto:</b> ${res}`;
  };

  window.toggleAiAssistant = () => {
      const modal = $('aiChatModal');
      modal.classList.toggle('active');
      if (modal.classList.contains('active') && $('aiMessages').innerHTML === "") {
          $('aiMessages').innerHTML = '<div class="ai-bubble bot">¡Hola! Soy tu Estratega del Desierto. ¿Tienes dudas sobre tallas, envíos o la carrera? 🏁</div>';
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
      
      const res = await callGemini(text, "Eres el Estratega de SCORE Store y Único Uniformes. Ayudas con dudas de ropa off-road, envíos a MX/USA y consejos de carrera.");
      $(`ai-${id}`).innerText = res;
      box.scrollTop = box.scrollHeight;
  };

  /* --- 4. TIENDA & CARRITO --- */
  window.openCatalog = async (sid) => {
      const items = catalogData.products.filter(p => p.sectionId === sid);
      const box = $('catContent');
      if(!box) return;
      box.innerHTML = '';

      items.forEach(p => {
          const card = document.createElement('div');
          card.className = "p-card";
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
      
      if(cart.length === 0) { $('cartEmpty').style.display = 'block'; } 
      else { $('cartEmpty').style.display = 'none'; }

      cart.forEach((it, i) => {
          total += (it.baseMXN * it.qty);
          box.innerHTML += `
          <div class="cart-card">
            <img src="${it.img}" alt="${it.name}">
            <div style="flex:1"><b>${it.name}</b><br><small>Talla: ${it.size}</small>
              <div class="qty-ctrl">
                  <button class="qty-btn" onclick="window.modQty(${i},-1)">-</button>
                  <b>${it.qty}</b>
                  <button class="qty-btn" onclick="window.modQty(${i},1)">+</button>
              </div>
            </div>
            <div style="font-weight:900; font-family:'Teko'; font-size:20px; color:var(--red);">${money(it.baseMXN * it.qty)}</div>
          </div>`;
      });
      
      // Estimado visual de envío (El real es en Stripe)
      let shipping = 0;
      if(mode === 'mx') shipping = 250;
      if(mode === 'us') shipping = 800;

      $('grandTotal').innerText = money(total + shipping);
      $('cartCount').innerText = cart.reduce((a,b)=>a+b.qty,0);
      
      // Botón IA en carrito
      if (cart.length > 0 && !document.querySelector('.cart-ai-box')) {
          const aiPanel = document.createElement('div');
          aiPanel.className = 'cart-ai-box';
          aiPanel.innerHTML = `<div class="ai-badge">IA ✨</div><button onclick="window.analyzeCart()" style="width:100%; border:2px solid #ddd; padding:12px; border-radius:12px; font-weight:800; font-size:12px; color:#111;">✨ ANALIZAR EQUIPO</button><div id="ai-res" style="display:none; font-size:12px; line-height:1.4; margin-top:10px; color:#444;"></div>`;
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

      btn.innerText = "PROCESANDO..."; 
      btn.disabled = true;
      showToast("🏁 INICIANDO MOTOR DE PAGOS...");

      try {
          const res = await fetch("/.netlify/functions/create_checkout", {
              method: "POST",
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ 
                  cart, 
                  shippingMode: mode, 
                  zip: cp, 
                  promoCode: promo 
              })
          });
          
          const data = await res.json();
          
          if(data.url) {
              window.location.href = data.url;
          } else {
              alert("Error: " + (data.error || "Desconocido"));
              btn.innerText = "PAGAR AHORA"; 
              btn.disabled = false;
          }
      } catch(e) {
          alert("Error de conexión");
          btn.innerText = "PAGAR AHORA"; 
          btn.disabled = false;
      }
  };

  /* --- 5. LEGAL & UTILS --- */
  window.openLegal = (type) => {
      const contents = {
          privacidad: "<h2>Privacidad</h2><p>Tus datos son seguros con <b>BAJATEX S. de R.L. de C.V.</b>.</p><p>Solo usamos tu información para envíos y facturación.</p>",
          terminos: "<h2>Términos</h2><p>Ventas finales. Cambios por defecto de fábrica en 30 días.</p>",
          contacto: "<h2>Contacto</h2><p>📧 ventas.unicotextil@gmail.com<br>📱 WhatsApp: +52 664 236 8701</p>"
      };
      $('legalContent').innerHTML = contents[type] || "Cargando...";
      $('modalLegal').classList.add('active');
      $('overlay').classList.add('active');
  };

  function showToast(m) { 
      const t=$("toast"); 
      if(t){ t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); } 
  }

  // --- INIT ---
  document.addEventListener('DOMContentLoaded', async () => {
      // Intentar cargar catálogo externo, si no, usar el interno
      try {
          const res = await fetch("/data/catalog.json");
          const data = await res.json();
          if(data.products) catalogData = data;
      } catch(e) { console.log("Usando catálogo de respaldo"); }

      runIntro();
      updateCartUI();
      
      // Social Proof Loop
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

})();
