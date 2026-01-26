/* SCORE STORE - MAIN ENGINE v4.0 (Unified) */
(function () {
  /* --- CONFIGURACIÓN --- */
  const CART_KEY = "score_cart_v2026_pro";
  const FAKE_MARKUP = 1.4; // 40% más caro el precio "anterior" para marketing
  let cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  let catalog = [];

  // --- INICIALIZACIÓN ---
  document.addEventListener("DOMContentLoaded", async () => {
    // 1. Cargar Catálogo (Con Fallback de seguridad)
    try {
      const res = await fetch("/data/catalog.json");
      const data = await res.json();
      catalog = data.products || [];
    } catch (e) {
      console.error("Error cargando catálogo, usando respaldo...", e);
      // Fallback mínimo para que la tienda no se vea vacía si falla el JSON
      catalog = [
         {id:'b1k-jacket', sectionId:'BAJA_1000', name:'Chamarra Oficial Baja 1000', baseMXN:1890, img:'/assets/EDICION_2025/chamarra-baja1000.webp', sizes:['S','M','L','XL']},
         {id:'b1k-tee', sectionId:'BAJA_1000', name:'Jersey Racing', baseMXN:650, img:'/assets/EDICION_2025/camiseta-negra-baja1000.webp', sizes:['S','M','L']}
      ];
    }

    // 2. Iniciar UI
    updateCartUI();
    runIntro();     // Del Script A (Animación)
    initChat();     // Del Script B (IA Gemini)
    
    // 3. Marketing Loop
    setInterval(showSocialProof, 25000); // Del Script A (Ventas falsas para urgencia)
  });

  /* --- LOGICA VISUAL (INTRO & MARKETING) --- */
  function runIntro() {
    const aguja = document.querySelector('.rpm-bar'); // Adaptado a tu CSS nuevo
    const splash = document.getElementById("splash-screen");
    
    // Simula carga de RPM
    if(aguja) setTimeout(() => { aguja.style.width = '100%'; }, 500);
    
    // Ocultar Splash
    setTimeout(() => {
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.classList.add("hidden"), 600);
        }
    }, 2200);
  }

  function showSocialProof() {
    const names = ["Carlos R.", "Miguel A.", "Sarah J.", "Roberto M.", "Alex T."];
    const items = ["una Chamarra Baja 1000", "una Gorra Oficial", "un Jersey Racing"];
    const locs = ["Tijuana", "San Diego", "La Paz", "Ensenada"];
    
    // Solo mostrar si no hay modales abiertos
    if(document.querySelector('.active')) return;

    const name = names[Math.floor(Math.random() * names.length)];
    const item = items[Math.floor(Math.random() * items.length)];
    const loc = locs[Math.floor(Math.random() * locs.length)];
    
    showToast(`🔥 ${name} de ${loc} acaba de comprar ${item}`);
  }

  /* --- CATÁLOGO (FUSIONADO: Visual A + Lógica B) --- */
  window.openCatalog = (category, title) => {
    const items = catalog.filter(p => p.category === category || p.sectionId === category || category === 'ALL');
    document.getElementById("catTitle").innerText = title;
    const content = document.getElementById("catContent");
    
    content.innerHTML = items.map(p => {
        // Lógica de precio oferta (Script A)
        const listPrice = Math.round(p.baseMXN || p.price_mxn * FAKE_MARKUP);
        const realPrice = p.baseMXN || p.price_mxn;
        const image = p.img || p.image;
        const sizes = p.sizes || ['UNITALLA'];

        return `
        <div class="prodCard">
            <div class="metallic-frame">
                <div class="promo-badge">OFERTA</div>
                <img src="${image}" class="prodImg" loading="lazy">
            </div>
            <div class="prodName">${p.name}</div>
            
            <div style="display:flex; gap:10px; justify-content:center; align-items:center; margin: 5px 0;">
                <span style="text-decoration:line-through; color:#666; font-size:14px;">$${listPrice}</span>
                <span class="new-price" style="font-size:24px;">$${realPrice}</span>
            </div>

            <div class="sizeRow" data-pid="${p.id}">
                ${sizes.map(s => `<div class="size-pill" onclick="selectSize(this, '${s}')">${s}</div>`).join('')}
            </div>
            
            <button class="btn-add" onclick="addToCart('${p.id}', this)">AGREGAR AL PEDIDO</button>
        </div>`;
    }).join('');

    document.getElementById("modalCatalog").classList.add("active");
    document.getElementById("overlay").classList.add("active");
  };

  /* --- LÓGICA DE TIENDA (Script B - Robusta) --- */
  window.selectSize = (el, size) => {
    const row = el.parentElement;
    row.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    row.setAttribute('data-sel', size);
  };

  window.addToCart = (id, btn) => {
    const row = btn.parentElement.querySelector('.sizeRow');
    const size = row.getAttribute('data-sel');
    
    // Validación estricta de talla
    if(!size) return showToast("⚠️ Por favor selecciona una talla");

    // Buscar producto (Soporta ambos formatos de JSON)
    const p = catalog.find(x => x.id === id);
    const price = p.baseMXN || p.price_mxn;
    const img = p.img || p.image;

    const exists = cart.find(i => i.id === id && i.selectedSize === size);
    if(exists) exists.quantity++; 
    else cart.push({
        id: p.id,
        name: p.name,
        price_mxn: price,
        image: img,
        selectedSize: size,
        quantity: 1
    });

    saveCart();
    showToast("✅ Producto agregado al carrito");
    closeAll();
    openDrawer();
  };

  /* --- CHECKOUT & CARRITO --- */
  window.renderCart = () => {
    const container = document.getElementById("cartItems");
    // Detectar input shipMode (Script B) o ship (Script A) - Usaremos shipMode
    const modeInput = document.querySelector('input[name="shipMode"]:checked');
    const mode = modeInput ? modeInput.value : 'pickup';
    
    // Mostrar formulario si no es pickup
    const shipForm = document.getElementById("shipForm");
    if(shipForm) shipForm.style.display = mode === 'pickup' ? 'none' : 'block';

    if (cart.length === 0) {
      container.innerHTML = "";
      document.getElementById("cartEmpty").style.display = "block";
      document.getElementById("grandTotal").innerText = "$0.00";
      return;
    }

    document.getElementById("cartEmpty").style.display = "none";
    let subtotal = 0;

    container.innerHTML = cart.map((item, idx) => {
      subtotal += item.price_mxn * item.quantity;
      return `
        <div class="cartItem">
          <img src="${item.image}" class="cartThumb">
          <div>
             <div class="cName">${item.name}</div>
             <div class="cMeta">Talla: ${item.selectedSize}</div>
             <div class="qtyRow">
                <button class="qtyBtn" onclick="modQty(${idx},-1)">-</button>
                <div class="qtyVal">${item.quantity}</div>
                <button class="qtyBtn" onclick="modQty(${idx},1)">+</button>
             </div>
          </div>
          <div class="cPrice">$${item.price_mxn * item.quantity}</div>
        </div>`;
    }).join('');

    // Estimación visual de envío (El real se calcula en Stripe)
    let shipCost = 0;
    if (mode === 'mx') shipCost = 250;
    if (mode === 'us') shipCost = 800;
    
    document.getElementById("grandTotal").innerText = `$${subtotal + shipCost} MXN*`;
  };

  window.checkout = async () => {
    const modeInput = document.querySelector('input[name="shipMode"]:checked');
    const mode = modeInput ? modeInput.value : 'pickup';
    const cp = document.getElementById("cp")?.value;
    const promo = document.getElementById("promo")?.value;
    const btn = document.getElementById("checkoutBtn");

    if (cart.length === 0) return showToast("El carrito está vacío");
    if (mode !== 'pickup' && !cp) {
       return showToast("⚠️ Ingresa tu Código Postal para el envío");
    }

    btn.innerText = "PROCESANDO...";
    btn.disabled = true;

    try {
      const res = await fetch("/api/create_checkout", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            cart, 
            shippingMode: mode, 
            zip: cp, 
            promoCode: promo 
        })
      });
      
      const data = await res.json();
      
      if (data.url) {
          window.location.href = data.url;
      } else {
          throw new Error(data.error || "Error desconocido");
      }
    } catch (e) {
      console.error(e);
      showToast("❌ Error al conectar con pagos. Intenta de nuevo.");
      btn.innerText = "PAGAR AHORA";
      btn.disabled = false;
    }
  };

  /* --- UTILIDADES --- */
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartUI(); }
  function updateCartUI() { 
      const count = document.getElementById("cartCount");
      if(count) count.innerText = cart.reduce((a, b) => a + b.quantity, 0);
      // Si el drawer está abierto, refrescar render
      if(document.getElementById("drawer").classList.contains("active")) renderCart();
  }

  window.modQty = (idx, delta) => {
    cart[idx].quantity += delta;
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    saveCart();
  };

  window.openDrawer = () => {
    document.getElementById("drawer").classList.add("active");
    document.getElementById("overlay").classList.add("active");
    renderCart();
  };

  window.closeAll = () => {
    document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  };
  
  // Soporte para abrir modal legal desde footer
  window.openLegal = (type) => {
      // Si tienes un modal legal genérico o redirección
      window.location.href = `/legal.html#${type}`;
  };

  window.showToast = (msg) => {
    const t = document.getElementById("toast");
    t.innerText = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  };
  
  window.scrollToId = (id) => { const el = document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth'}); };

  /* --- CHATBOT IA (Script B) --- */
  function initChat() {
    const w = document.getElementById("chat-widget");
    const inp = document.getElementById("chat-input");
    const box = document.getElementById("chat-messages");
    const toggle = document.getElementById("chat-toggle");
    
    if(!w || !toggle) return; // Prevenir errores si no existe el HTML

    toggle.onclick = () => { 
        w.style.display = w.style.display === 'flex' ? 'none' : 'flex';
        if(w.style.display === 'flex' && inp) inp.focus();
    };
    
    const closeBtn = document.getElementById("close-chat");
    if(closeBtn) closeBtn.onclick = () => w.style.display = 'none';
    
    const sendBtn = document.getElementById("send-chat");
    
    async function send() {
        const txt = inp.value.trim(); 
        if(!txt) return;
        
        appendMsg(txt, 'user');
        inp.value = ''; 
        inp.disabled = true;
        
        try {
            const res = await fetch("/api/chat", { 
                method: "POST", 
                body: JSON.stringify({ message: txt }) 
            });
            const d = await res.json(); 
            appendMsg(d.reply || "Lo siento, hubo un error de conexión.", 'bot');
        } catch(e) { 
            appendMsg("Error conectando con el servidor.", 'bot'); 
        } finally {
            inp.disabled = false;
            inp.focus();
        }
    }

    if(sendBtn) sendBtn.onclick = send;
    if(inp) inp.onkeypress = (e) => { if(e.key === 'Enter') send(); };

    function appendMsg(t, type) {
        const d = document.createElement("div");
        d.className = `msg ${type}`;
        d.innerHTML = t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
    }
  }

})();
