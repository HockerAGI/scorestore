/* SCORE STORE MASTER JS v2026 - PRODUCTION READY */

// --- CREDENCIALES REALES INTEGRADAS ---
const GEMINI_API_KEY = "AIzaSyAtFIytBGuc5Dc_ZmQb54cR1d6qsPBix2Y"; 

// Configuración con Fallback de Seguridad (Tus datos de Supabase)
const CFG = window.__SCORE__ || {
    orgSlug: "score-store",
    supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE"
};

let cart = JSON.parse(localStorage.getItem('score_cart_master')) || [];
let catalogData = { products: [] };

// Helpers
const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

// --- 1. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Carga de catálogo híbrida (Intenta fetch, si falla usa hardcoded de respaldo)
    try {
        const res = await fetch("/data/catalog.json");
        const data = await res.json();
        catalogData = data;
    } catch (e) {
        console.warn("Usando catálogo de respaldo Master Design");
        catalogData = {
          "products": [
            { "id": "b1k-jacket", "name": "Chamarra Oficial Baja 1000", "baseMXN": 1890, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/chamarra-baja1000.webp", "sizes": ["S","M","L","XL","2XL"] },
            { "id": "b1k-hoodie-blk", "name": "Hoodie Clásica Negra", "baseMXN": 1100, "sectionId": "BAJA_1000", "img": "/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
            { "id": "b1k-tee-black", "name": "Camiseta Negra Oficial", "baseMXN": 480, "sectionId": "BAJA_1000", "img": "/assets/EDICION_2025/camiseta-negra-baja1000.webp", "sizes": ["S","M","L","XL"] },
            { "id": "b500-tee-grey", "name": "Camiseta Oficial Baja 500", "baseMXN": 480, "sectionId": "BAJA_500", "img": "/assets/BAJA500/camiseta-gris-baja500.webp", "sizes": ["S","M","L"] },
            { "id": "sf250-tank", "name": "Tank Top San Felipe", "baseMXN": 440, "sectionId": "SF_250", "img": "/assets/SF250/camiseta-negra-sinmangas-SF250.webp", "sizes": ["S","M","L"] }
          ]
        };
    }

    runIntro();
    updateCartUI();
    
    // Social Proof Loop (Marketing: Notificaciones de ventas recientes)
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

// --- 2. INTRO ENGINE (Física del Tacómetro) ---
function runIntro() {
  const aguja = $('needle');
  const splash = $('splash-screen');
  const rev = $('rev-val');
  const status = $('status-text');

  // Mover aguja inicial
  setTimeout(() => { if(aguja) aguja.style.transform = "rotate(85deg)"; }, 400);
  
  // Contador de RPM subiendo
  let r = 0;
  const itv = setInterval(() => { r += 580; if(r > 8000) r = 8000; if(rev) rev.innerHTML = String(r).padStart(4, '0'); }, 100);

  // Estado Listo
  setTimeout(() => { 
    if(status) status.innerHTML = "FUEL INJECTION... READY"; 
    if(aguja) aguja.style.transform = "rotate(10deg)";
  }, 1800);

  // Ocultar Splash
  setTimeout(() => { 
    clearInterval(itv);
    if(splash) {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; document.body.classList.remove('noScroll'); }, 800);
    }
  }, 3500);
}

// --- 3. CORE FUNCTIONS (Carrito y UI) ---
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

window.scrollToId = (id) => { const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'}); };

// Abrir Modal de Catálogo
window.openCatalog = (sid) => {
    const items = catalogData.products.filter(p => p.sectionId === sid || sid === 'ALL');
    const box = $('catContent');
    if(!box) return;
    box.innerHTML = '';

    items.forEach(p => {
        const card = document.createElement('div');
        card.className = "p-card";
        const sizes = p.sizes || ["S", "M", "L", "XL"];
        // Fallback de imagen inteligente
        const mainImg = (p.images && p.images[0]) ? p.images[0] : (p.img || p.image);
        
        card.innerHTML = `
            <div class="p-media">
                <div class="p-slide"><img src="${mainImg}" loading="lazy" alt="${p.name}"></div>
            </div>
            <div class="p-body">
                <div class="p-name">${p.name}</div>
                <div class="p-price">${money(p.baseMXN || p.price_mxn)}</div>
                <select class="p-size-sel" id="size_${p.id}">${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR</button>
            </div>`;
        box.appendChild(card);
    });
    
    const modal = $('modalCatalog');
    const overlay = $('overlay');
    if(modal) modal.classList.add('active');
    if(overlay) overlay.classList.add('active');
};

// Agregar al Carrito
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
            baseMXN: p.baseMXN || p.price_mxn,
            img: (p.images && p.images[0]) ? p.images[0] : (p.img || p.image),
            qty: 1, 
            size: size
        });
        
        saveCart();
        updateCartUI(); 
        window.toggleCart();
        showToast("🏁 AGREGADO AL EQUIPO");
    }
};

window.modQty = (i, d) => { 
    cart[i].qty += d; 
    if(cart[i].qty <= 0) cart.splice(i, 1); 
    saveCart(); 
    updateCartUI(); 
};

// Renderizar Carrito y Totales
window.updateCartUI = () => {
    const box = $('cartItems');
    if(!box) return;
    
    const modeInput = document.querySelector('input[name="shipMode"]:checked');
    const mode = modeInput ? modeInput.value : 'pickup';
    
    // Mostrar/Ocultar form envío según selección
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
          <div style="flex:1"><b>${it.name}</b><br><small>Talla: ${it.size}</small>
            <div class="qty-ctrl"><button class="qty-btn" onclick="window.modQty(${i},-1)">-</button><b>${it.qty}</b><button class="qty-btn" onclick="window.modQty(${i},1)">+</button></div>
          </div>
          <div style="font-weight:900; font-family:'Teko'; font-size:20px; color:var(--red);">${money(it.baseMXN * it.qty)}</div>
        </div>`;
    });

    // Calculo envio estimado visual (El real se calcula en el servidor)
    let shipping = 0;
    if(mode === 'mx') shipping = 250;
    if(mode === 'us') shipping = 800;
    
    const grandTotal = $('grandTotal');
    const cartCount = $('cartCount');
    if(grandTotal) grandTotal.innerText = money(total + shipping);
    if(cartCount) cartCount.innerText = cart.reduce((a,b)=>a+b.qty,0);
    
    // Inyectar botón de Análisis IA si hay items
    if (cart.length > 0) {
        const aiBox = document.createElement('div');
        aiBox.className = 'cart-ai-box';
        aiBox.innerHTML = `<button onclick="window.analyzeCart()" style="width:100%; border:1px dashed #E10600; background:rgba(225,6,0,0.05); padding:10px; border-radius:10px; font-weight:800; font-size:12px; color:#E10600; cursor:pointer;">✨ ANALIZAR EQUIPO CON IA</button><div id="ai-res" style="display:none; font-size:12px; line-height:1.4; margin-top:10px; color:#333;"></div>`;
        box.appendChild(aiBox);
    }
};

function saveCart() { localStorage.setItem('score_cart_master', JSON.stringify(cart)); }

// Checkout con Stripe (Netlify Function)
window.checkout = async () => {
    if(!cart.length) return;
    const btn = $('checkoutBtn');
    const modeInput = document.querySelector('input[name="shipMode"]:checked');
    const mode = modeInput ? modeInput.value : 'pickup';
    const cp = $('cp') ? $('cp').value : '';
    const promo = $('promo') ? $('promo').value : '';

    if(mode !== 'pickup' && !cp) return showToast("⚠️ Ingresa tu Código Postal");

    btn.innerText = "PROCESANDO..."; btn.disabled = true;
    showToast("🏁 INICIANDO CARRERA...");

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
        if(data.url) window.location.href = data.url;
        else alert("Error: " + (data.error || "Desconocido"));
    } catch(e) {
        alert("Error de conexión");
        btn.innerText = "PAGAR AHORA"; btn.disabled = false;
    }
};

// --- 4. GEMINI AI LOGIC (INTEGRADA) ---
async function callGemini(prompt, sys) {
    if(!GEMINI_API_KEY) return "⚠️ API Key no configurada.";
    
    // Endpoint para Gemini 1.5 Flash (Más rápido y eficiente para chat)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = { 
        contents: [{ role: "user", parts: [{ text: prompt }] }], 
        systemInstruction: { parts: [{ text: sys }] } 
    };

    try {
        const response = await fetch(url, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta del satélite.";
    } catch (err) { 
        console.error(err);
        return "Error de conexión satelital."; 
    }
}

// Función 1: Analizar Carrito
window.analyzeCart = async () => {
    const resBox = $('ai-res');
    if(!resBox) return;
    resBox.style.display = 'block';
    resBox.innerHTML = '<i>Consultando telemetría...</i>';
    
    const items = cart.map(i => `${i.name} (${i.size})`).join(', ');
    const prompt = `Analiza mi carrito para una carrera SCORE: ${items}. Dame un consejo rápido de experto sobre cómo me ayudará este equipo de Único Uniformes en el desierto.`;
    const sys = "Eres un estratega experto de SCORE International. Redacta consejos breves, técnicos y motivadores sobre ropa off-road.";
    
    const res = await callGemini(prompt, sys);
    resBox.innerHTML = `✨ <b>Copiloto:</b> ${res}`;
};

// Función 2: Chat Asistente
window.toggleAiAssistant = () => {
    const m = $('aiChatModal');
    if(m) {
        m.classList.toggle('active');
        if (m.classList.contains('active')) {
            const box = $('aiMessages');
            if(box && box.innerHTML === "") {
                box.innerHTML = '<div class="ai-bubble bot">¡Hola! Soy tu Estratega del Desierto. ¿Tienes dudas técnicas sobre la mercancía oficial o la Baja? ✨</div>';
            }
        }
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
    
    const res = await callGemini(text, "Eres el Estratega del Desierto de SCORE Store y Único Uniformes. Ayudas a los clientes con dudas sobre tallas, materiales de las playeras y sudaderas, envíos y consejos para la carrera Baja 1000.");
    const botBubble = $(`ai-${id}`);
    if(botBubble) botBubble.innerText = res;
    box.scrollTop = box.scrollHeight;
};

// --- 5. LEGAL & UTILS ---
window.openLegal = (type) => {
    const contents = {
        privacidad: "<h2>Aviso de Privacidad</h2><p>Tus datos son seguros con <b>BAJATEX S. de R.L. de C.V.</b>. Solo los usamos para procesar tu pedido, facturación y envío.</p><p>Derechos ARCO: ventas.unicotextil@gmail.com</p>",
        terminos: "<h2>Términos y Condiciones</h2><p>Ventas finales. Cambios solo por defectos de fábrica comprobables dentro de los 30 días naturales posteriores a la compra.</p>",
        contacto: "<h2>Contacto y Soporte</h2><p>📧 ventas.unicotextil@gmail.com<br>📱 WhatsApp: +52 664 236 8701<br>📍 Tijuana, B.C.</p>"
    };
    const contentBox = $('legalContent');
    if(contentBox) contentBox.innerHTML = contents[type] || "Cargando...";
    
    const modal = $('modalLegal');
    const overlay = $('overlay');
    if(modal) modal.classList.add('active');
    if(overlay) overlay.classList.add('active');
};

function showToast(m) { 
    const t=$("toast"); 
    if(t){ t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); } 
}
