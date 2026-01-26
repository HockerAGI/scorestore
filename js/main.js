/* =========================================================
   SCORE STORE · MAIN ENGINE v2026 (FINAL SECURITY PATCH)
   ========================================================= */

(function () {
  "use strict";

  // --- CONFIGURACIÓN CENTRAL ---
  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = "score-store";
  // Detectamos si estamos en local o producción para la ruta de la API
  const API_BASE = "/.netlify/functions"; 
  const CART_KEY = "score_cart_prod_vMASTER";
  const PROMO_KEY = "score_promo_code_v1";

  // --- CATÁLOGO LOCAL (FALLBACK DE SEGURIDAD) ---
  // Se mantiene aquí por si falla la carga del JSON o Supabase, para que la tienda nunca se vea vacía.
  let catalogData = {
    products: [
      { "id": "b1k-jacket", "name": "Chamarra Oficial Baja 1000", "baseMXN": 1890, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/chamarra-baja1000.webp", "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-hoodie-blk", "name": "Hoodie Clásica Negra", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
      { "id": "b1k-tee-black", "name": "Camiseta Negra Oficial", "baseMXN": 480, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camiseta-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
      { "id": "b500-tee-grey", "name": "Camiseta Oficial Baja 500", "baseMXN": 480, "sectionId": "BAJA_500", "img": "/assets/BAJA500/camiseta-gris-baja500.webp", "sizes": ["S","M","L"] },
      { "id": "sf250-tank", "name": "Tank Top San Felipe", "baseMXN": 440, "sectionId": "SF_250", "img": "/assets/SF250/camiseta-negra-sinmangas-SF250.webp", "sizes": ["S","M","L"] },
      // ... Agrega aquí el resto de tus productos si deseas que carguen offline ...
    ],
    sections: [
        { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp" },
        { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp" },
        { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp" },
        { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp" }
    ]
  };

  let cart = [];
  let promoCode = "";
  const shippingState = { mode: "pickup", cost: 0, label: "Recoger en Único (TJ)" };

  // --- UTILS ---
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  
  // --- AUDIO SFX ENGINE (MANTENIDO) ---
  const SFX = { enabled: true, click: null, add: null, open: null };
  function initSfx() {
    // Intentamos cargar los audios, si fallan no rompen la página
    const mk = (src) => { try { const a = new Audio(src); a.volume = 0.3; return a; } catch { return null; } };
    SFX.click = mk("/assets/sfx/click.mp3");
    SFX.add = mk("/assets/sfx/add.mp3");
    SFX.open = mk("/assets/sfx/open.mp3");
  }
  function playSfx(key) { 
      if (!SFX.enabled || !SFX[key]) return; 
      try { 
          SFX[key].currentTime = 0; 
          SFX[key].play().catch(() => {}); // Catch silent errors (user interaction policy)
      } catch(e){} 
  }

  // --- INTRO & SPLASH ENGINE (MANTENIDO) ---
  function runIntro() {
    const aguja = $('needle');
    const splash = $('splash-screen');
    const rev = $('rev-val');
    const status = $('status-text');

    // Secuencia de animación de tacómetro
    setTimeout(() => { if(aguja) aguja.style.transform = "rotate(85deg)"; }, 300);
    
    let r = 0;
    const itv = setInterval(() => { 
        r += 580; if(r > 8000) r = 7800 + Math.random() * 200; // Efecto de vibración en altas RPM
        if(rev) rev.innerHTML = String(Math.floor(r)).padStart(4, '0'); 
    }, 80);

    setTimeout(() => { 
        if(status) status.innerHTML = "SISTEMAS LISTOS... 🏁"; 
        if(aguja) aguja.style.transform = "rotate(10deg)"; 
    }, 1500);

    setTimeout(() => { 
      clearInterval(itv);
      killSplash();
    }, 2500);
  }

  function killSplash() {
    const splash = $("splash-screen");
    if (!splash || splash.classList.contains('hidden')) return;
    splash.style.transition = "opacity 0.5s ease";
    splash.style.opacity = "0";
    setTimeout(() => { 
        splash.style.display = "none"; 
        document.body.classList.remove("noScroll"); 
    }, 500);
  }

  // --- GEMINI AI LOGIC (SECURE PROXY) ---
  // YA NO HAY API KEY AQUÍ. Se llama a Netlify Functions.
  async function callGeminiBackend(prompt) {
      const box = $('aiMessages');
      const id = Date.now();
      
      // Indicador de escribiendo...
      box.innerHTML += `<div class="ai-bubble bot" id="ai-load-${id}">Analizando ruta... 🏎️</div>`;
      box.scrollTop = box.scrollHeight;

      try {
          const res = await fetch(`${API_BASE}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: prompt })
          });
          
          const data = await res.json();
          // Removemos loading
          const loader = $(`ai-load-${id}`);
          if(loader) loader.remove();

          return data.reply || "⚠️ Señal débil en el desierto. Intenta de nuevo.";
      } catch (err) { 
          console.error("AI Error", err);
          return "Error de conexión con el Estratega.";
      }
  }

  // --- CATALOG & SHOPPING LOGIC ---
  async function loadCatalog() {
      try {
          // Intentamos cargar el JSON actualizado primero
          const res = await fetch("/data/catalog.json");
          if(res.ok) {
              const data = await res.json();
              // Fusionamos con el fallback por seguridad
              if(data.products) catalogData.products = data.products;
              if(data.sections) catalogData.sections = data.sections;
          }
      } catch (e) { console.warn("Usando catálogo interno de respaldo"); }
  }

  function findProduct(id) { return catalogData.products.find(p => p.id === id); }
  function getSection(id) { return catalogData.sections.find(s => s.id === id); }

  // --- UI ACTIONS (MODALES) ---
  window.openCatalog = (sectionId) => {
      const section = getSection(sectionId) || { title: "COLECCIÓN SCORE", logo: "" };
      const items = catalogData.products.filter(p => p.sectionId === sectionId);
      const root = $("catContent");
      if (!root) return;

      const logoHTML = section.logo ? `<img class="catLogo" src="${section.logo}" style="height:60px; object-fit:contain; margin-bottom:10px;">` : "";
      
      // Renderizado dinámico pero con la estructura visual original
      root.innerHTML = `
        <div class="catHeaderBlock" style="width:100%; text-align:center; padding-bottom:20px; border-bottom:1px solid #ddd; margin-bottom:20px;">
            ${logoHTML}
            <div class="catTitleText" style="font-family:'Teko'; font-size:30px; line-height:1; color:#000;">${items.length} ARTÍCULOS DISPONIBLES</div>
        </div>
        <div class="grid catGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:20px;">
            ${items.map(p => renderProductCard(p)).join("")}
        </div>
      `;
      
      playSfx("open");
      $("modalCatalog").classList.add("active");
      $("overlay").classList.add("active");
      document.body.classList.add("noScroll");
  };

  function renderProductCard(p) {
      // Manejo seguro de imágenes y tallas
      const img = (p.images && p.images[0]) || p.img || "/assets/placeholder.webp";
      const sizes = p.sizes || ["Unitalla"];
      const sizeOpts = sizes.map(s => `<option value="${s}">${s}</option>`).join("");
      
      return `
      <div class="p-card">
          <div class="p-media">
              <img src="${img}" loading="lazy" alt="${p.name}">
          </div>
          <div class="p-body">
              <div class="p-name">${p.name}</div>
              <div class="p-price">${money(p.baseMXN)}</div>
              <select class="p-size-sel" id="size_${p.id}">${sizeOpts}</select>
              <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR AL EQUIPO</button>
          </div>
      </div>`;
  }

  // --- CART FUNCTIONS (CORE) ---
  window.addToCart = (pid) => {
      const p = findProduct(pid);
      if(!p) return toast("Error: Producto no encontrado");

      const sizeEl = $(`size_${pid}`);
      const size = sizeEl ? sizeEl.value : (p.sizes?.[0] || 'Unitalla');
      
      // Lógica de agrupación
      const ex = cart.find(i => i.id === pid && i.size === size);
      if(ex) ex.qty++; 
      else cart.push({ id: pid, name: p.name, baseMXN: p.baseMXN, img: p.img || p.images[0], qty: 1, size });
      
      saveCart(); updateCartUI(); 
      playSfx("add"); 
      toast("✅ Agregado correctamente");
      
      // Tracking Pixel (Facebook)
      if(window.fbq) fbq('track', 'AddToCart', { content_ids: [pid], content_name: p.name, value: p.baseMXN, currency: 'MXN' });
      
      window.toggleCart(); 
  };

  window.modQty = (idx, d) => {
      cart[idx].qty += d;
      if(cart[idx].qty <= 0) cart.splice(idx, 1);
      saveCart(); updateCartUI();
  };

  function updateCartUI() {
      const list = $("cartItems");
      if(!list) return;
      
      // Update Shipping UI Check
      const modeEls = document.getElementsByName('shipMode');
      let mode = 'pickup';
      for(let el of modeEls) { if(el.checked) mode = el.value; }
      
      shippingState.mode = mode;
      const shipForm = $("shipForm");
      if(shipForm) shipForm.style.display = mode === "pickup" ? "none" : "block";
      
      if(cart.length === 0) {
          list.innerHTML = ""; $("cartEmpty").style.display = "block";
          $("grandTotal").innerText = "$0.00"; $("cartCount").innerText = "0";
          return;
      }
      
      $("cartEmpty").style.display = "none";
      let total = 0;
      
      list.innerHTML = cart.map((item, i) => {
          const line = item.baseMXN * item.qty;
          total += line;
          return `
          <div class="cart-card">
              <img src="${item.img}" alt="${item.name}">
              <div class="cInfo" style="flex:1;">
                  <div class="cName">${item.name}</div>
                  <div class="cMeta">Talla: <b>${item.size}</b></div>
                  <div class="qty-ctrl">
                      <button class="qty-btn" onclick="window.modQty(${i},-1)">-</button>
                      <div class="qtyVal">${item.qty}</div>
                      <button class="qty-btn" onclick="window.modQty(${i},1)">+</button>
                  </div>
              </div>
              <div class="cPrice">${money(line)}</div>
          </div>`;
      }).join("");

      // Cálculo visual de envío (El real se hace en Stripe)
      let shipCost = 0;
      if(mode === 'mx') shipCost = 250;
      if(mode === 'us') shipCost = 800;
      
      $("grandTotal").innerText = money(total + shipCost);
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      
      // Restaurar promo visualmente
      if($("promo")) $("promo").value = promoCode || "";
  }

  window.savePromo = (val) => { 
      promoCode = val.trim().toUpperCase(); 
      localStorage.setItem(PROMO_KEY, promoCode); 
      toast("Cupón guardado (Se validará en el pago)"); 
  };
  
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { 
      cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; 
      promoCode = localStorage.getItem(PROMO_KEY) || ""; 
  }

  // --- CHECKOUT & STRIPE (SECURE) ---
  window.checkout = async () => {
      if(!cart.length) return toast("Tu carrito está vacío 🤷‍♂️");
      const btn = $("checkoutBtn");
      const cp = $("cp").value;
      
      // Validación simple de CP
      if(shippingState.mode !== 'pickup' && (cp.length < 5 || isNaN(cp))) {
          return toast("⚠️ Ingresa un Código Postal válido para calcular envío.");
      }

      btn.innerText = "CONECTANDO CON BANCO..."; 
      btn.disabled = true;
      
      try {
          const payload = { 
              cart, 
              shippingMode: shippingState.mode, 
              zip: cp, 
              promoCode 
          };
          
          // LLAMADA SEGURA AL BACKEND
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          
          if(data.url) {
              window.location.href = data.url; // Redirige a Stripe Checkout
          } else {
              throw new Error(data.error || "Error desconocido en pasarela");
          }
      } catch(e) {
          console.error(e);
          toast("❌ Error de conexión. Intenta de nuevo.");
          btn.innerText = "PAGAR AHORA"; 
          btn.disabled = false;
      }
  };

  // --- FOOTER DINÁMICO ---
  window.openFooterCard = (key = 'identidad') => {
      const contentMap = {
          identidad: "<h3>SCORE STORE</h3><p>Tienda Oficial operada por <b>Único Uniformes</b>.<br>Fabricamos la piel de los campeones.</p>",
          contacto: "<h3>CONTACTO</h3><p>WhatsApp: +52 664 236 8701<br>Email: ventas.unicotextil@gmail.com<br>Horario: L-V 9am - 6pm (Tijuana)</p>",
          envios: "<h3>ENVÍOS</h3><p>🇲🇽 Nacional: FedEx ($250 MXN)<br>🇺🇸 USA: FedEx Intl ($800 MXN)<br>📍 PickUp: Gratis en fábrica (Tijuana)</p>",
          terminos: "<h3>TÉRMINOS</h3><p>Ventas finales. Cambios solo por defecto de fabricación dentro de los primeros 5 días.</p>",
          privacidad: "<h3>PRIVACIDAD</h3><p>Tus datos son usados únicamente para el envío y facturación.</p>"
      };
      
      $("footerContent").innerHTML = contentMap[key] || contentMap.identidad;
      $("footerCard").classList.add("active");
      $("overlay").classList.add("active");
  };

  window.setupFooterLinks = () => {
      document.querySelectorAll("[data-footer]").forEach(el => {
          el.onclick = (e) => { e.preventDefault(); openFooterCard(el.dataset.footer); };
      });
  };

  // --- GLOBAL UI HANDLERS ---
  window.toggleCart = () => { $('cartDrawer').classList.toggle('active'); $('overlay').classList.toggle('active'); };
  
  window.closeAll = () => { 
      document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); 
      document.body.classList.remove('noScroll'); 
  };
  
  window.scrollToId = (id) => $(id)?.scrollIntoView({behavior:'smooth'});
  
  window.toast = (m) => { 
      const t=$("toast"); 
      t.innerText=m; 
      t.classList.add('show'); 
      setTimeout(()=>t.classList.remove('show'),3500); 
  };

  // PROMO BAR ROTATION
  function setupPromoBar() {
      const txt = $("promo-text");
      const msgs = [
          "⚠️ CÓDIGO <b>SCORE25</b> = 25% DESCUENTO", 
          "📦 ENVÍOS A TODO MÉXICO Y USA", 
          "🏁 MERCANCÍA OFICIAL FABRICADA POR ÚNICO"
      ];
      let i = 0;
      setInterval(() => {
          i = (i+1) % msgs.length;
          txt.style.opacity = 0;
          setTimeout(() => { txt.innerHTML = msgs[i]; txt.style.opacity = 1; }, 500);
      }, 5000);
  }

  // --- AI CHAT (FRONTEND) ---
  window.toggleAiAssistant = () => {
      const modal = $('aiChatModal');
      modal.classList.toggle('active');
      if (modal.classList.contains('active') && $('aiMessages').innerHTML === "") {
          $('aiMessages').innerHTML = '<div class="ai-bubble bot">¡Hola! Soy tu Estratega SCORE. Pregúntame sobre tallas o envíos. 🏁</div>';
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
      
      const reply = await callGeminiBackend(text);
      
      box.innerHTML += `<div class="ai-bubble bot">${reply}</div>`;
      box.scrollTop = box.scrollHeight;
  };

  // --- SOCIAL PROOF (SIMULADOR DE VENTAS) ---
  // Esto da sensación de urgencia y actividad en la tienda
  function initSocialProof() {
      setInterval(() => {
          const names = ["Carlos (Ensenada)", "Mike (San Diego)", "Ana (La Paz)", "Sarah (Phoenix)", "Beto (Tijuana)"];
          const items = ["Chamarra Baja 1000", "Gorra Oficial", "Hoodie SCORE"];
          const notif = $("sales-notification"); // Asegúrate de tener este div en el HTML si quieres usarlo
          if(notif) {
              const name = names[Math.floor(Math.random()*names.length)];
              const item = items[Math.floor(Math.random()*items.length)];
              // Usamos innerHTML para dar formato
              document.getElementById("notif-content").innerHTML = `<b>${name}</b> compró <b>${item}</b> hace un momento.`;
              notif.classList.add('active'); 
              setTimeout(()=>notif.classList.remove('active'), 5000);
          }
      }, 45000); // Cada 45 segundos
  }

  // --- INIT ---
  document.addEventListener('DOMContentLoaded', async () => {
      initSfx();
      loadCart();
      await loadCatalog();
      runIntro();
      setupPromoBar();
      setupFooterLinks();
      updateCartUI();
      // initSocialProof(); // Descomentar si agregas el div de notificación en el HTML
      
      // Cerrar al click afuera
      $("overlay")?.addEventListener("click", closeAll);
      document.addEventListener("keydown", (e) => { if(e.key==="Escape") closeAll(); });
  });

})();