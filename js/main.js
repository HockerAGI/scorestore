/* =========================================================
   SCORE STORE · ENGINE v2026 PROD (WHITE BAR EDITION)
   ========================================================= */

(function () {
  "use strict";
  
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_GOLD_2026";
  const COOKIE_KEY = "score_cookie_consent";
  
  let catalogData = { products: [], sections: [] };
  let cart = [];
  let promoCode = "";
  const shippingState = { mode: "pickup" };
  
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  // DATOS REALES (EXTRAÍDOS DE TUS ARCHIVOS)
  const INFO_DATA = {
      contacto: `
        <h3>CONTACTO Y FÁBRICA</h3>
        <p><strong>Operador:</strong> BAJATEX S. DE R.L. DE C.V.</p>
        <p><strong>Dirección:</strong> Palermo 6106 Interior JK, Col. Anexa Roma, 22614 Tijuana, B.C.</p>
        <p><strong>WhatsApp:</strong> +52 664 236 8701</p>
        <p><strong>Email:</strong> ventas.unicotextil@gmail.com</p>
        <p><em>Horario: Lunes a Viernes 8:00 AM - 5:00 PM (PST)</em></p>
      `,
      envios: `
        <h3>POLÍTICA DE ENVÍOS</h3>
        <p>Todos los pedidos se procesan desde Tijuana, B.C.</p>
        <ul>
            <li><strong>🇲🇽 MX Nacional:</strong> $250 MXN (FedEx Standard). Tiempo: 3-5 días hábiles.</li>
            <li><strong>🇺🇸 USA Internacional:</strong> $800 MXN (FedEx Intl). Tiempo: 5-7 días hábiles.</li>
            <li><strong>📍 PickUp Factory:</strong> Gratis. Se notifica vía Email/WhatsApp cuando está listo.</li>
        </ul>
      `,
      privacidad: `
        <h3>LEGAL Y PRIVACIDAD</h3>
        <p><strong>Facturación:</strong> Solicitar dentro del mes fiscal enviando Constancia de Situación Fiscal al correo.</p>
        <p><strong>Cambios:</strong> Solo por defecto de fábrica dentro de los primeros 5 días.</p>
        <p><strong>Datos:</strong> Tu información se procesa vía Stripe (Pagos) y Envia.com (Guías).</p>
      `
  };

  // --- 1. SPLASH SCREEN (RPM) ---
  function runIntro() {
      const aguja = $('needle');
      const splash = $('splash-screen');
      const rev = $('rev-val');
      const status = $('status-text');
      
      // Safety Timer
      setTimeout(() => { if(splash) splash.remove(); }, 4000);

      let r = 0;
      const itv = setInterval(() => { 
          r += 450; 
          if(r > 8000) r = 7800 + Math.random() * 200; 
          if(rev) rev.innerText = String(Math.floor(r)).padStart(4, '0');
          if(aguja) aguja.style.left = Math.min((r/8000)*100, 100) + '%';
      }, 50);

      setTimeout(() => { 
          if(status) status.innerText = "SISTEMAS ONLINE 🏁"; 
      }, 1500);

      setTimeout(() => { 
          clearInterval(itv);
          if(splash) {
             splash.style.opacity = '0';
             setTimeout(() => splash.remove(), 500);
          }
      }, 2500);
  }

  // --- 2. COOKIES ---
  function checkCookies() {
      const banner = $("cookieBanner");
      if (!localStorage.getItem(COOKIE_KEY)) {
          banner.style.display = "flex";
      }
      $("cookieAccept").onclick = () => {
          localStorage.setItem(COOKIE_KEY, "accepted");
          banner.style.display = "none";
      };
      $("cookieReject").onclick = () => {
          localStorage.setItem(COOKIE_KEY, "rejected");
          banner.style.display = "none";
      };
  }

  // --- 3. CATALOGO (SLIDER) ---
  async function loadCatalog() {
      try {
          const res = await fetch("/data/catalog.json");
          if(res.ok) catalogData = await res.json();
      } catch (e) { console.warn("Offline"); }
  }

  window.openCatalog = (sectionId) => {
      const section = catalogData.sections.find(s => s.id === sectionId);
      const items = catalogData.products.filter(p => p.sectionId === sectionId);
      const modal = $("modalCatalog");
      const content = $("catContent");
      const headerLogo = $("catLogo");

      if (!section || !items.length) return toast("Mantenimiento");

      if (headerLogo) headerLogo.src = section.logo;
      
      content.innerHTML = items.map(p => {
          const imgUrl = (p.images && p.images[0]) ? p.images[0] : p.img;
          return `
          <div class="p-card">
              <div class="p-media"><img src="${imgUrl}" loading="lazy" alt="${p.name}"></div>
              <div class="p-body">
                  <div class="p-name">${p.name}</div>
                  <div class="p-price">${money(p.baseMXN)}</div>
                  <div class="p-actions">
                      <select class="p-size-sel" id="size_${p.id}">${(p.sizes||['Uni']).map(s=>`<option value="${s}">${s}</option>`).join('')}</select>
                      <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR</button>
                  </div>
              </div>
          </div>`;
      }).join("");
      
      modal.classList.add("active");
  };

  // --- 4. CARRITO ---
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      const size = $(`size_${pid}`)?.value || "Uni";
      const ex = cart.find(i => i.id === pid && i.size === size);
      
      if(ex) ex.qty++; else cart.push({ ...p, qty: 1, size });
      
      saveCart(); updateCartUI(); toast("AGREGADO AL EQUIPO 🏁");
      window.toggleCart();
  };

  window.modQty = (idx, d) => {
      cart[idx].qty += d;
      if(cart[idx].qty <= 0) cart.splice(idx, 1);
      saveCart(); updateCartUI();
  };

  window.updateCartUI = () => {
      const list = $("cartItems");
      if(!list) return;
      const radios = document.getElementsByName("shipMode");
      radios.forEach(r => { if(r.checked) shippingState.mode = r.value; });

      if(!cart.length) {
          list.innerHTML = `<div style="text-align:center; padding:40px; color:#666;">Carrito vacío</div>`;
          $("grandTotal").innerText = "$0.00"; $("cartCount").innerText = 0;
          return;
      }

      let subtotal = 0;
      list.innerHTML = cart.map((item, i) => {
          subtotal += item.baseMXN * item.qty;
          return `
          <div class="cart-card">
              <img src="${item.img}" style="width:60px;height:60px;object-fit:contain;background:#fff;border-radius:5px;">
              <div style="flex:1;">
                  <div style="color:#fff;font-weight:bold;">${item.name}</div>
                  <div style="color:#888;font-size:12px;">Talla: ${item.size}</div>
                  <div class="qty-ctrl" style="margin-top:5px;">
                      <button class="qty-btn" onclick="window.modQty(${i},-1)">-</button>
                      <span style="color:#fff;">${item.qty}</span>
                      <button class="qty-btn" onclick="window.modQty(${i},1)">+</button>
                  </div>
              </div>
              <div style="color:var(--score-red);font-weight:bold;">${money(item.baseMXN * item.qty)}</div>
          </div>`;
      }).join("");

      let shipCost = shippingState.mode === 'mx' ? 250 : (shippingState.mode === 'us' ? 800 : 0);
      $("grandTotal").innerText = money(subtotal + shipCost);
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      if($("promo")) $("promo").value = promoCode;
  };

  window.savePromo = (val) => { promoCode = val.toUpperCase().trim(); saveCart(); updateCartUI(); };
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify({ cart, promoCode })); }
  function loadCart() { const r = JSON.parse(localStorage.getItem(CART_KEY)||"{}"); cart=r.cart||[]; promoCode=r.promoCode||""; }

  // --- 5. CHECKOUT ---
  window.checkout = async () => {
      if(!cart.length) return;
      const btn = $("checkoutBtn");
      btn.innerHTML = `PROCESANDO...`; btn.disabled = true;

      try {
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cart: cart.map(i=>({id:i.id, qty:i.qty, size:i.size})), shippingMode: shippingState.mode, promoCode })
          });
          const data = await res.json();
          if(data.url) window.location.href = data.url; else throw new Error(data.error);
      } catch(e) { 
          toast("Error: " + e.message);
          btn.innerHTML = "PAGAR AHORA"; btn.disabled = false; 
      }
  };

  // --- 6. SCORE IA ---
  window.toggleAiAssistant = () => {
      const m = $("aiChatModal");
      m.classList.toggle("active");
      if(m.classList.contains("active") && $("aiMessages").innerHTML === "") {
          $("aiMessages").innerHTML = `<div class="ai-bubble bot" style="padding:10px;background:#eee;border-radius:10px;margin-bottom:10px;color:#000;">¡Hola! Soy SCORE IA 🏎️. ¿Dudas con envíos a USA o México?</div>`;
      }
  };
  window.sendAiMessage = async () => {
      const inp = $("aiInput");
      const box = $("aiMessages");
      const txt = inp.value.trim();
      if(!txt) return;

      box.innerHTML += `<div style="text-align:right;margin:5px;"><span style="background:#ddd;padding:8px;border-radius:10px;color:#000;display:inline-block;">${txt}</span></div>`;
      inp.value = "";
      box.scrollTop = box.scrollHeight;

      const res = await fetch(`${API_BASE}/chat`, { method: "POST", body: JSON.stringify({ message: txt }) });
      const data = await res.json();
      box.innerHTML += `<div style="text-align:left;margin:5px;"><span style="background:#fff;border:1px solid #eee;padding:8px;border-radius:10px;color:#000;display:inline-block;">${data.reply}</span></div>`;
      box.scrollTop = box.scrollHeight;
  };

  // --- UTILS ---
  window.toggleCart = () => { $('cartDrawer').classList.toggle('active'); $("overlay").classList.toggle('active'); };
  window.openInfo = (k) => { $("infoContent").innerHTML = INFO_DATA[k]; $("infoModal").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); };
  window.scrollToId = (id) => $(id)?.scrollIntoView({behavior:'smooth'});
  window.toast = (m) => { const t=$("toast"); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); };
  
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      const observer = new IntersectionObserver(entries => { entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("visible"); }); });
      els.forEach(el => observer.observe(el));
  }

  document.addEventListener('DOMContentLoaded', async () => {
      await loadCatalog(); loadCart(); updateCartUI(); 
      runIntro(); 
      initScrollReveal();
      checkCookies();
      
      const params = new URLSearchParams(window.location.search);
      if(params.get("status") === "success") {
          toast("🏆 ¡PAGO EXITOSO! GRACIAS.");
          localStorage.removeItem(CART_KEY); cart=[]; updateCartUI();
          window.history.replaceState({}, document.title, "/");
      }
      document.addEventListener("keydown", (e) => { if(e.key==="Escape") window.closeAll(); });
  });
})();
