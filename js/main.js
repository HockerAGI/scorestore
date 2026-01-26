/* =========================================================
   SCORE STORE · MAIN ENGINE v2026 (FINAL FUSION)
   ========================================================= */

(function () {
  "use strict";

  const CFG = window.__SCORE__ || {};
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/api" : "/.netlify/functions";
  const GEMINI_API_KEY = "AIzaSyAtFIytBGuc5Dc_ZmQb54cR1d6qsPBix2Y"; 
  const CART_KEY = "score_cart_prod_vMASTER";
  const PROMO_KEY = "score_promo_code_v1";

  // Catálogo Fallback
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
  const shippingState = { mode: "pickup", cost: 0, label: "Recoger en fábrica" };
  const imgExistsCache = new Map();

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const escapeHtml = (str) => String(str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // --- AUDIO SFX ---
  const SFX = { enabled: true, click: null, add: null, open: null };
  function initSfx() {
    const mk = (src) => { try { const a = new Audio(src); a.volume = 0.2; return a; } catch { return null; } };
    SFX.click = mk("/assets/sfx/click.mp3");
    SFX.add = mk("/assets/sfx/add.mp3");
    SFX.open = mk("/assets/sfx/open.mp3");
  }
  function playSfx(key) { if (!SFX.enabled || !SFX[key]) return; try { SFX[key].currentTime = 0; SFX[key].play().catch(()=>{}); } catch{} }

  // --- INTRO & SPLASH ENGINE ---
  function runIntro() {
    const aguja = $('needle');
    const splash = $('splash-screen');
    const rev = $('rev-val');
    const status = $('status-text');

    setTimeout(() => killSplash(), 4000);
    setTimeout(() => { if(aguja) aguja.style.transform = "rotate(85deg)"; }, 300);
    
    let r = 0;
    const itv = setInterval(() => { 
        r += 580; if(r > 8000) r = 8000; 
        if(rev) rev.innerHTML = String(r).padStart(4, '0'); 
    }, 80);

    setTimeout(() => { 
        if(status) status.innerHTML = "FUEL INJECTION... READY"; 
        if(aguja) aguja.style.transform = "rotate(10deg)"; 
    }, 1500);

    setTimeout(() => { 
      clearInterval(itv);
      killSplash();
    }, 2800);
  }

  function killSplash() {
    const splash = $("splash-screen");
    if (!splash || splash.classList.contains('hidden')) return;
    splash.style.transition = "opacity 0.4s ease";
    splash.style.opacity = "0";
    setTimeout(() => { 
        splash.style.display = "none"; 
        document.body.classList.remove("noScroll"); 
    }, 400);
  }

  // --- GEMINI AI LOGIC ---
  async function callGemini(prompt, sys) {
      if(!GEMINI_API_KEY) return "⚠️ Error: API Key no configurada.";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sys }] } };

      for (let delay of [1000, 2000, 4000]) {
          try {
              const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              if (!r.ok) throw new Error();
              const d = await r.json();
              return d.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta.";
          } catch (err) { await new Promise(res => setTimeout(res, delay)); }
      }
      return "Conexión inestable. Intenta de nuevo.";
  }

  // --- CATALOG & SHOPPING LOGIC ---
  async function loadCatalog() {
      try {
          const res = await fetch("/data/catalog.json");
          if(res.ok) {
              const data = await res.json();
              if(data.products) catalogData = data;
          }
      } catch (e) { console.warn("Usando catálogo local de respaldo"); }
  }

  function findProduct(id) { return catalogData.products.find(p => p.id === id); }
  function getSection(id) { return catalogData.sections.find(s => s.id === id); }

  async function imageExists(url) {
      if(!url) return false;
      if(imgExistsCache.has(url)) return imgExistsCache.get(url);
      try {
          const res = await fetch(url, { method: "HEAD" });
          imgExistsCache.set(url, res.ok);
          return res.ok;
      } catch { return false; }
  }

  // --- UI ACTIONS ---
  window.openCatalog = async (sectionId) => {
      const section = getSection(sectionId) || { title: "COLECCIÓN" };
      const items = catalogData.products.filter(p => p.sectionId === sectionId);
      const root = $("catContent");
      if (!root) return;

      const logoHTML = section.logo ? `<img class="catLogo" src="${section.logo}" style="height:50px;">` : "";
      
      root.innerHTML = `
        <div class="catHeaderBlock" style="margin-bottom:20px; text-align:center;">
            ${logoHTML}
            <div class="catTitleText" style="font-family:Teko; font-size:24px;">${items.length} PRODUCTOS OFICIALES</div>
        </div>
        <div class="grid catGrid" style="gap:15px;">
            ${items.map(p => renderProductCard(p)).join("")}
        </div>
      `;
      
      playSfx("open");
      $("modalCatalog").classList.add("active");
      $("overlay").classList.add("active");
  };

  function renderProductCard(p) {
      const img = (p.images && p.images[0]) || p.img || "";
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
              <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR</button>
          </div>
      </div>`;
  }

  // --- CART FUNCTIONS ---
  window.addToCart = (pid) => {
      const p = findProduct(pid);
      const sizeEl = $(`size_${pid}`);
      const size = sizeEl ? sizeEl.value : (p.sizes?.[0] || 'Unitalla');
      
      const ex = cart.find(i => i.id === pid && i.size === size);
      if(ex) ex.qty++; 
      else cart.push({ id: pid, name: p.name, baseMXN: p.baseMXN, img: p.img, qty: 1, size });
      
      saveCart(); updateCartUI(); 
      playSfx("add"); 
      toast("Agregado al Equipo 🏁");
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
      
      // Update Shipping UI
      const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";
      shippingState.mode = mode;
      $("shipForm").style.display = mode === "pickup" ? "none" : "block";
      
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
                  <div class="cMeta">Talla: ${item.size}</div>
                  <div class="qty-ctrl">
                      <button class="qty-btn" onclick="window.modQty(${i},-1)">-</button>
                      <div class="qtyVal">${item.qty}</div>
                      <button class="qty-btn" onclick="window.modQty(${i},1)">+</button>
                  </div>
              </div>
              <div class="cPrice">${money(line)}</div>
          </div>`;
      }).join("");

      // Calcular Envío Visual
      let shipCost = 0;
      if(mode === 'mx') shipCost = 250;
      if(mode === 'us') shipCost = 800;
      
      $("grandTotal").innerText = money(total + shipCost);
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      
      // Recuperar Promo Code Guardado
      if($("promo")) $("promo").value = promoCode || "";
  }

  window.savePromo = (val) => { promoCode = val.trim(); localStorage.setItem(PROMO_KEY, promoCode); toast("Código Guardado"); };
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; promoCode = localStorage.getItem(PROMO_KEY) || ""; }

  // --- CHECKOUT & FOOTER ---
  window.checkout = async () => {
      if(!cart.length) return toast("Carrito Vacío");
      const btn = $("checkoutBtn");
      const cp = $("cp").value;
      
      if(shippingState.mode !== 'pickup' && cp.length < 5) return toast("Ingresa Código Postal válido");

      btn.innerText = "PROCESANDO..."; btn.disabled = true;
      
      try {
          const payload = { 
              orgSlug: ORG_SLUG, 
              cart, 
              shippingMode: shippingState.mode, 
              zip: cp, 
              promoCode 
          };
          
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          
          const data = await res.json();
          if(data.url) window.location.href = data.url;
          else throw new Error(data.error || "Error desconocido");
      } catch(e) {
          toast("Error de conexión");
          btn.innerText = "PAGAR AHORA"; btn.disabled = false;
      }
  };

  // Dynamic Footer Card
  window.openFooterCard = (key = 'identidad') => {
      const contentMap = {
          identidad: "<h3>SCORE STORE</h3><p>Tienda Oficial operada por Único Uniformes.</p>",
          contacto: "<h3>CONTACTO</h3><p>WhatsApp: +52 664 236 8701<br>Email: ventas.unicotextil@gmail.com</p>",
          envios: "<h3>ENVÍOS</h3><p>Envíos a todo México y USA vía FedEx/Envia.com.</p>",
          terminos: "<h3>TÉRMINOS</h3><p>Ventas finales. Cambios solo por defecto.</p>",
          privacidad: "<h3>PRIVACIDAD</h3><p>Tus datos están protegidos.</p>"
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

  // --- GLOBAL UTILS ---
  window.toggleCart = () => { $('cartDrawer').classList.toggle('active'); $('overlay').classList.toggle('active'); };
  window.closeAll = () => { document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); document.body.classList.remove('noScroll'); };
  window.scrollToId = (id) => $(id)?.scrollIntoView({behavior:'smooth'});
  window.toast = (m) => { const t=$("toast"); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); };
  window.openLegal = (t) => openFooterCard(t);

  // PROMO BAR SWAP
  function setupPromoBar() {
      const txt = $("promo-text");
      const msgs = ["ENVÍOS A TODO MX Y USA", "HASTA 80% OFF · TIEMPO LIMITADO", "MERCANCÍA OFICIAL SCORE 🏁"];
      let i = 0;
      setInterval(() => {
          i = (i+1) % msgs.length;
          txt.style.opacity = 0;
          setTimeout(() => { txt.innerText = msgs[i]; txt.style.opacity = 1; }, 500);
      }, 4000);
  }

  // --- AI CHAT ---
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
      
      const res = await callGemini(text, "Eres el Estratega de SCORE Store. Ayudas con dudas de ropa off-road y envíos.");
      $(`ai-${id}`).innerText = res;
      box.scrollTop = box.scrollHeight;
  };

  // INIT
  document.addEventListener('DOMContentLoaded', async () => {
      initSfx();
      loadCart();
      await loadCatalog();
      runIntro();
      setupPromoBar();
      setupFooterLinks();
      updateCartUI();
      
      $("overlay")?.addEventListener("click", closeAll);
      document.addEventListener("keydown", (e) => { if(e.key==="Escape") closeAll(); });
      
      // Social Proof
      setInterval(() => {
          const names = ["Carlos", "Ana", "Miguel", "Sarah"];
          const notif = $("sales-notification");
          if(notif) {
              notif.innerHTML = `🔥 <b>${names[Math.floor(Math.random()*names.length)]}</b> compró hace un momento.`;
              notif.classList.add('active'); setTimeout(()=>notif.classList.remove('active'), 5000);
          }
      }, 30000);
  });

})();
