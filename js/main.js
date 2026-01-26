/* =========================================================
   SCORE STORE · MAIN ENGINE v2026
   URL OFICIAL: scorestore.netlify.app
   ========================================================= */

(function () {
  "use strict";

  // --- CONFIGURACIÓN ---
  const API_BASE = "/.netlify/functions"; 
  const CART_KEY = "score_cart_prod_vMASTER";
  const PROMO_KEY = "score_promo_code_v1";
  
  // Catálogo Fallback (Copia exacta de tu JSON para funcionamiento offline)
  let catalogData = {
    products: [
      { "id": "b1k-jacket", "name": "Chamarra Oficial Baja 1000", "baseMXN": 1890, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/chamarra-baja1000.webp", "sizes": ["S","M","L","XL","2XL"] },
      { "id": "b1k-hoodie-blk", "name": "Hoodie Clásica Negra", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
      { "id": "b1k-tee-black", "name": "Camiseta Negra Oficial", "baseMXN": 480, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camiseta-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
      { "id": "b500-tee-grey", "name": "Camiseta Oficial Baja 500", "baseMXN": 480, "sectionId": "BAJA_500", "img": "/assets/BAJA500/camiseta-gris-baja500.webp", "sizes": ["S","M","L"] },
      { "id": "sf250-tank", "name": "Tank Top San Felipe", "baseMXN": 440, "sectionId": "SF_250", "img": "/assets/SF250/camiseta-negra-sinmangas-SF250.webp", "sizes": ["S","M","L"] }
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
  const shippingState = { mode: "pickup", cost: 0 };

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  // --- AUDIO SFX ---
  const SFX = { enabled: true, click: null, add: null, open: null, success: null };
  function initSfx() {
    const mk = (src) => { try { const a = new Audio(src); a.volume = 0.4; return a; } catch { return null; } };
    SFX.click = mk("/assets/sfx/click.mp3");
    SFX.add = mk("/assets/sfx/add.mp3");
    SFX.open = mk("/assets/sfx/open.mp3");
    SFX.success = mk("/assets/sfx/success.mp3"); // Sonido nuevo de victoria
  }
  function playSfx(key) { 
      if (!SFX.enabled || !SFX[key]) return; 
      try { SFX[key].currentTime = 0; SFX[key].play().catch(()=>{}); } catch(e){} 
  }

  // --- INTRO & SPLASH ---
  function runIntro() {
    const aguja = $('needle');
    const splash = $('splash-screen');
    const rev = $('rev-val');
    
    setTimeout(() => { if(aguja) aguja.style.transform = "rotate(85deg)"; }, 300);
    
    let r = 0;
    const itv = setInterval(() => { 
        r += 580; if(r > 8000) r = 7800 + Math.random() * 200;
        if(rev) rev.innerHTML = String(Math.floor(r)).padStart(4, '0'); 
    }, 80);

    setTimeout(() => { 
        if($('status-text')) $('status-text').innerHTML = "SISTEMAS LISTOS... 🏁"; 
        if(aguja) aguja.style.transform = "rotate(10deg)"; 
    }, 1500);

    setTimeout(() => { 
      clearInterval(itv);
      if(splash) {
        splash.style.transition = "opacity 0.5s ease";
        splash.style.opacity = "0";
        setTimeout(() => { splash.style.display = "none"; document.body.classList.remove("noScroll"); }, 500);
      }
    }, 2500);
  }

  // --- CHECK URL STATUS (POST-VENTA) ---
  function checkPaymentStatus() {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("status");
      
      if (status === "success") {
          playSfx("success");
          toast("🏆 ¡PAGO EXITOSO! GRACIAS POR TU COMPRA");
          localStorage.removeItem(CART_KEY); // Limpiar carrito
          cart = [];
          updateCartUI();
          // Limpiar URL
          window.history.replaceState({}, document.title, "/");
      } else if (status === "cancel") {
          toast("⚠️ El pago fue cancelado.");
          window.history.replaceState({}, document.title, "/");
      }
  }

  // --- API HANDLERS (SECURE) ---
  async function callBackend(endpoint, body) {
      try {
          const res = await fetch(`${API_BASE}/${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
          });
          return await res.json();
      } catch (err) { return { error: "Error de conexión" }; }
  }

  // --- CATALOG LOGIC ---
  async function loadCatalog() {
      try {
          const res = await fetch("/data/catalog.json");
          if(res.ok) {
              const data = await res.json();
              if(data.products) catalogData.products = data.products;
              if(data.sections) catalogData.sections = data.sections;
          }
      } catch (e) { console.warn("Usando catálogo offline"); }
  }

  function getSection(id) { return catalogData.sections.find(s => s.id === id); }

  window.openCatalog = (sectionId) => {
      const section = getSection(sectionId) || { title: "COLECCIÓN", logo: "" };
      const items = catalogData.products.filter(p => p.sectionId === sectionId);
      const root = $("catContent");
      
      root.innerHTML = `
        <div class="catHeaderBlock" style="text-align:center; padding-bottom:15px; border-bottom:1px solid #eee; margin-bottom:20px;">
            ${section.logo ? `<img src="${section.logo}" style="height:50px; margin-bottom:10px;">` : ''}
            <h2 style="font-family:Teko; margin:0; font-size:2rem;">${items.length} PRODUCTOS</h2>
        </div>
        <div class="grid catGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:15px;">
            ${items.map(p => `
              <div class="p-card">
                  <div class="p-media"><img src="${p.img}" loading="lazy" alt="${p.name}"></div>
                  <div class="p-body">
                      <div class="p-name">${p.name}</div>
                      <div class="p-price">${money(p.baseMXN)}</div>
                      <select class="p-size-sel" id="size_${p.id}">
                        ${(p.sizes||['Unitalla']).map(s=>`<option value="${s}">${s}</option>`).join('')}
                      </select>
                      <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR</button>
                  </div>
              </div>`).join("")}
        </div>`;
      
      playSfx("open");
      $("modalCatalog").classList.add("active");
      $("overlay").classList.add("active");
  };

  // --- CART SYSTEM ---
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      const size = $(`size_${pid}`)?.value || "Unitalla";
      
      const ex = cart.find(i => i.id === pid && i.size === size);
      if(ex) ex.qty++;
      else cart.push({ id: pid, name: p.name, baseMXN: p.baseMXN, img: p.img, qty: 1, size });
      
      saveCart(); updateCartUI(); playSfx("add"); toast("🏁 ¡Agregado al equipo!");
      if(window.fbq) fbq('track', 'AddToCart', { content_ids: [pid], value: p.baseMXN, currency: 'MXN' });
  };

  window.modQty = (idx, d) => {
      cart[idx].qty += d;
      if(cart[idx].qty <= 0) cart.splice(idx, 1);
      saveCart(); updateCartUI();
  };

  function updateCartUI() {
      const list = $("cartItems");
      
      // Check Radio Buttons
      const radios = document.getElementsByName('shipMode');
      let mode = 'pickup';
      for(let r of radios) { if(r.checked) mode = r.value; }
      shippingState.mode = mode;
      
      $("shipForm").style.display = mode === "pickup" ? "none" : "block";

      if(!cart.length) {
          list.innerHTML = ""; $("cartEmpty").style.display = "block";
          $("grandTotal").innerText = "$0.00"; $("cartCount").innerText = "0";
          return;
      }
      
      $("cartEmpty").style.display = "none";
      let total = 0;
      
      list.innerHTML = cart.map((item, i) => {
          total += item.baseMXN * item.qty;
          return `
          <div class="cart-card">
              <img src="${item.img}" width="50">
              <div style="flex:1; padding-left:10px;">
                  <div class="cName">${item.name}</div>
                  <small>Talla: ${item.size}</small>
                  <div class="qty-ctrl">
                      <button onclick="window.modQty(${i},-1)">-</button>
                      <span>${item.qty}</span>
                      <button onclick="window.modQty(${i},1)">+</button>
                  </div>
              </div>
              <div style="font-weight:bold;">${money(item.baseMXN * item.qty)}</div>
          </div>`;
      }).join("");

      // Cálculo Visual
      let shipCost = mode === 'mx' ? 250 : (mode === 'us' ? 800 : 0);
      $("grandTotal").innerText = money(total + shipCost);
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      if($("promo")) $("promo").value = promoCode;
  }

  window.savePromo = (val) => { promoCode = val.toUpperCase().trim(); localStorage.setItem(PROMO_KEY, promoCode); updateCartUI(); };
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; promoCode = localStorage.getItem(PROMO_KEY) || ""; }

  // --- CHECKOUT ---
  window.checkout = async () => {
      if(!cart.length) return toast("Carrito vacío");
      const cp = $("cp").value;
      if(shippingState.mode !== 'pickup' && cp.length < 5) return toast("Ingresa Código Postal válido");
      
      const btn = $("checkoutBtn");
      btn.innerText = "PROCESANDO..."; btn.disabled = true;

      const res = await callBackend("create_checkout", {
          cart, shippingMode: shippingState.mode, zip: cp, promoCode
      });

      if(res.url) window.location.href = res.url;
      else {
          toast(res.error || "Error en el servidor");
          btn.innerText = "PAGAR AHORA"; btn.disabled = false;
      }
  };

  // --- AI CHAT ---
  window.toggleAiAssistant = () => {
      const m = $("aiChatModal");
      m.classList.toggle("active");
      if(m.classList.contains("active") && $("aiMessages").innerHTML === "") {
          $("aiMessages").innerHTML = `<div class="ai-bubble bot">¡Hola! Soy tu Estratega SCORE. ¿Dudas de tallas o envíos? 🏁</div>`;
      }
  };

  window.sendAiMessage = async () => {
      const inp = $("aiInput");
      const box = $("aiMessages");
      const txt = inp.value.trim();
      if(!txt) return;

      box.innerHTML += `<div class="ai-bubble user">${txt}</div>`;
      inp.value = "";
      box.scrollTop = box.scrollHeight;

      const res = await callBackend("chat", { message: txt });
      const reply = res.reply || "Error de comunicación en el desierto.";
      
      box.innerHTML += `<div class="ai-bubble bot">${reply}</div>`;
      box.scrollTop = box.scrollHeight;
  };

  // --- UTILS ---
  window.toggleCart = () => { $('cartDrawer').classList.toggle('active'); $('overlay').classList.toggle('active'); };
  window.closeAll = () => { document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); };
  window.scrollToId = (id) => $(id)?.scrollIntoView({behavior:'smooth'});
  window.toast = (m) => { const t=$("toast"); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); };

  // Init
  document.addEventListener('DOMContentLoaded', async () => {
      initSfx();
      loadCart();
      await loadCatalog();
      runIntro();
      updateCartUI();
      checkPaymentStatus();
      
      // Promo Bar Cycle
      const txt = $("promo-text");
      const msgs = ["⚠️ CÓDIGO <b>SCORE25</b> = 25% OFF", "📦 ENVÍOS A TODO MÉXICO Y USA", "🏁 OPERADO POR ÚNICO UNIFORMES"];
      let i=0;
      setInterval(()=>{ i=(i+1)%msgs.length; txt.style.opacity=0; setTimeout(()=>{txt.innerHTML=msgs[i]; txt.style.opacity=1;},500); }, 4000);
  });
})();