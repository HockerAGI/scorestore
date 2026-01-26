/* SCORE STORE MASTER JS v2026 - PERFORMANCE TUNED */

const GEMINI_API_KEY = "AIzaSyAtFIytBGuc5Dc_ZmQb54cR1d6qsPBix2Y"; 

const CFG = window.__SCORE__ || {
    orgSlug: "score-store",
    supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE"
};

let cart = JSON.parse(localStorage.getItem('score_cart_master')) || [];
let catalogData = { products: [] };

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

document.addEventListener('DOMContentLoaded', async () => {
    // Carga paralela para no bloquear el hilo principal
    loadCatalog();
    runIntroFast(); // Versión optimizada para LCP
    updateCartUI();
    initServiceWorker(); // Registro PWA explícito
});

// --- 1. OPTIMIZED INTRO (LCP FIX) ---
function runIntroFast() {
  const aguja = $('needle');
  const splash = $('splash-screen');
  const rev = $('rev-val');
  
  // Animación acelerada (Total < 1.2s para pasar Core Web Vitals)
  if(aguja) setTimeout(() => aguja.style.transform = "rotate(85deg)", 100);
  
  let r = 0;
  const itv = setInterval(() => { 
      r += 800; // Subida más rápida
      if(r > 8000) r = 8000; 
      if(rev) rev.innerHTML = String(r).padStart(4, '0'); 
  }, 50);

  // Eliminar Splash rápidamente
  setTimeout(() => { 
    clearInterval(itv);
    if(splash) {
      splash.style.opacity = '0';
      // Remover del DOM para liberar memoria
      setTimeout(() => { 
          splash.style.display = 'none'; 
          document.body.classList.remove('noScroll'); 
      }, 500);
    }
  }, 1500); // Reducido de 3500ms a 1500ms
}

async function loadCatalog() {
    try {
        const res = await fetch("/data/catalog.json");
        const data = await res.json();
        catalogData = data;
    } catch (e) {
        // Fallback silencioso
        catalogData = { products: [] }; 
    }
}

function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log('SW Registered'))
            .catch(err => console.error('SW Fail:', err));
    }
}

// --- 2. CORE FUNCTIONS ---
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

window.scrollToId = (id) => { 
    const el = $(id); 
    if(el) el.scrollIntoView({behavior:'smooth'}); 
};

window.openCatalog = (sid) => {
    // Filtrado seguro
    const items = (catalogData.products || []).filter(p => p.sectionId === sid || sid === 'ALL');
    const box = $('catContent');
    if(!box) return;
    box.innerHTML = '';

    items.forEach(p => {
        const card = document.createElement('div');
        card.className = "p-card";
        const sizes = p.sizes || ["S", "M", "L", "XL"];
        // Usa imagen pequeña si existe para mejorar rendimiento
        const mainImg = (p.images && p.images[0]) ? p.images[0] : (p.img || "");
        
        card.innerHTML = `
            <div class="p-media">
                <div class="p-slide">
                    <img src="${mainImg}" loading="lazy" alt="${p.name}" width="200" height="200">
                </div>
            </div>
            <div class="p-body">
                <div class="p-name">${p.name}</div>
                <div class="p-price">${money(p.baseMXN || p.price_mxn)}</div>
                <select class="p-size-sel" id="size_${p.id}" aria-label="Talla">
                    ${sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
                <button class="p-btn-add" onclick="window.addToCart('${p.id}')">AGREGAR</button>
            </div>`;
        box.appendChild(card);
    });
    
    $('modalCatalog').classList.add('active');
    $('overlay').classList.add('active');
};

window.addToCart = (pid) => {
    const p = (catalogData.products || []).find(x => x.id === pid);
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
        showToast("🏁 AGREGADO");
    }
};

window.modQty = (i, d) => { 
    cart[i].qty += d; 
    if(cart[i].qty <= 0) cart.splice(i, 1); 
    saveCart(); 
    updateCartUI(); 
};

window.updateCartUI = () => {
    const box = $('cartItems');
    if(!box) return;
    
    const modeInput = document.querySelector('input[name="shipMode"]:checked');
    const mode = modeInput ? modeInput.value : 'pickup';
    
    // Toggle ship form
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
          <img src="${it.img}" alt="${it.name}" width="60" height="60">
          <div style="flex:1"><b>${it.name}</b><br><small>Talla: ${it.size}</small>
            <div class="qty-ctrl">
                <button class="qty-btn" onclick="window.modQty(${i},-1)" aria-label="Menos">-</button>
                <b>${it.qty}</b>
                <button class="qty-btn" onclick="window.modQty(${i},1)" aria-label="Más">+</button>
            </div>
          </div>
          <div style="font-weight:900; color:#E10600;">${money(it.baseMXN * it.qty)}</div>
        </div>`;
    });

    let shipping = 0;
    if(mode === 'mx') shipping = 250;
    if(mode === 'us') shipping = 800;
    
    $('grandTotal').innerText = money(total + shipping);
    $('cartCount').innerText = cart.reduce((a,b)=>a+b.qty,0);
    
    // Botón IA solo si hay items y no está renderizado ya
    if (cart.length > 0 && !document.querySelector('.cart-ai-box')) {
        const aiBox = document.createElement('div');
        aiBox.className = 'cart-ai-box';
        aiBox.innerHTML = `<button onclick="window.analyzeCart()" style="width:100%; border:1px dashed #E10600; background:rgba(225,6,0,0.05); padding:10px; border-radius:10px; font-weight:800; font-size:12px; color:#E10600;">✨ ANALIZAR EQUIPO CON IA</button><div id="ai-res" style="display:none; font-size:12px; line-height:1.4; margin-top:10px; color:#333;"></div>`;
        box.appendChild(aiBox);
    }
};

function saveCart() { localStorage.setItem('score_cart_master', JSON.stringify(cart)); }

window.checkout = async () => {
    if(!cart.length) return;
    const btn = $('checkoutBtn');
    const mode = document.querySelector('input[name="shipMode"]:checked').value;
    const cp = $('cp').value;
    const promo = $('promo').value;

    if(mode !== 'pickup' && !cp) return showToast("⚠️ Falta Código Postal");

    btn.innerText = "PROCESANDO..."; btn.disabled = true;
    
    try {
        const res = await fetch("/.netlify/functions/create_checkout", {
            method: "POST",
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ cart, shippingMode: mode, zip: cp, promoCode: promo })
        });
        const data = await res.json();
        if(data.url) window.location.href = data.url;
        else alert("Error: " + (data.error || "Desconocido"));
    } catch(e) {
        alert("Error de conexión");
        btn.innerText = "PAGAR AHORA"; btn.disabled = false;
    }
};

// --- 3. AI & UTILS ---
async function callGemini(prompt, sys) {
    if(!GEMINI_API_KEY) return "⚠️ Configura la API Key.";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sys }] } };
    try {
        const r = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const d = await r.json();
        return d.candidates?.[0]?.content?.parts?.[0]?.text || "Sin señal.";
    } catch { return "Error satelital."; }
}

window.analyzeCart = async () => {
    const box = $('ai-res');
    box.style.display = 'block'; box.innerHTML = '<i>Analizando...</i>';
    const items = cart.map(i => `${i.name}`).join(', ');
    const res = await callGemini(`Recomienda algo breve para: ${items}`, "Eres experto en Off-Road.");
    box.innerHTML = `✨ ${res}`;
};

window.toggleAiAssistant = () => {
    const m = $('aiChatModal');
    m.classList.toggle('active');
    if (m.classList.contains('active') && $('aiMessages').innerHTML === "") {
        $('aiMessages').innerHTML = '<div class="ai-bubble bot">¡Hola! Soy tu Estratega del Desierto. 🏁</div>';
    }
};

window.sendAiMessage = async () => {
    const inp = $('aiInput');
    const box = $('aiMessages');
    const txt = inp.value.trim();
    if (!txt) return;
    inp.value = '';
    box.innerHTML += `<div class="ai-bubble user">${txt}</div>`;
    box.scrollTop = box.scrollHeight;
    const res = await callGemini(txt, "Eres experto de SCORE Store. Respuestas cortas y útiles.");
    box.innerHTML += `<div class="ai-bubble bot">${res}</div>`;
    box.scrollTop = box.scrollHeight;
};

window.openLegal = (type) => {
    const txt = {
        privacidad: "<h2>Privacidad</h2><p>Tus datos están seguros. Solo para envíos.</p>",
        terminos: "<h2>Términos</h2><p>Cambios por defecto en 30 días.</p>",
        contacto: "<h2>Contacto</h2><p>ventas.unicotextil@gmail.com</p>"
    };
    $('legalContent').innerHTML = txt[type] || "";
    $('modalLegal').classList.add('active');
    $('overlay').classList.add('active');
};

function showToast(m) { 
    const t=$("toast"); 
    t.innerText=m; t.classList.add('show'); 
    setTimeout(()=>t.classList.remove('show'), 3000); 
}
