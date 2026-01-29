/* =========================================================
   SCORE STORE — PRODUCTION ENGINE v2026 (FINAL ROBUST)
   Integraciones: Stripe, Supabase, Envia.com, Gemini, SocialProof
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURACIÓN CENTRAL
--------------------------------------------------------- */
const CONFIG = {
  // Claves de Producción
  stripeKey: "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh",
  
  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",
  
  // Endpoints Netlify
  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    chat: "/.netlify/functions/chat"
  },
  
  // Recursos
  catalogUrl: "/data/catalog.json",
  fallbackImg: "/assets/hero.webp",
  storageKey: "score_cart_2026_v2",
  
  // Ajustes UX
  imgProbeTimeout: 2000, // ms para validar imagen
  socialProofInterval: 45000 // ms entre notificaciones de venta
};

/* ---------------------------------------------------------
   2. ESTADO GLOBAL
--------------------------------------------------------- */
const state = {
  cart: JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]"),
  products: [],
  filter: "ALL",
  shipping: { 
    mode: "pickup", 
    cost: 0, 
    label: "Pickup Tijuana (Gratis)",
    zip: ""
  },
  imgCache: new Map() // Caché para validación de imágenes
};

// Referencias DOM rápidas
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmtMoney = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/* ---------------------------------------------------------
   3. INICIALIZACIÓN (Stripe & Audio)
--------------------------------------------------------- */
let stripeInstance = null;
function initStripe() {
  if (stripeInstance) return stripeInstance;
  if (window.Stripe && CONFIG.stripeKey) {
    stripeInstance = window.Stripe(CONFIG.stripeKey);
  }
  return stripeInstance;
}

// Sistema de Audio FX (Recuperado)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  if (type === 'click') {
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'success') {
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.2);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  }
}

/* ---------------------------------------------------------
   4. CATÁLOGO INTELIGENTE (Probing + Fallback)
--------------------------------------------------------- */
async function probeImage(url) {
  if (state.imgCache.has(url)) return state.imgCache.get(url);
  return new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), CONFIG.imgProbeTimeout);
    img.onload = () => { clearTimeout(t); state.imgCache.set(url, true); resolve(true); };
    img.onerror = () => { clearTimeout(t); state.imgCache.set(url, false); resolve(false); };
    img.src = url;
  });
}

async function loadCatalog() {
  const grid = $("#productsGrid");
  if(grid) grid.innerHTML = "<div style='grid-column:1/-1; text-align:center; padding:40px; opacity:0.6;'>Cargando motor de inventario...</div>";

  // Estrategia: Supabase -> JSON Local
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/products?select=*&active=eq.true`, {
      headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.length) {
        state.products = normalizeCatalog(data);
        renderGrid();
        return;
      }
    }
  } catch (e) { console.warn("Supabase offline, fallback local."); }

  // Fallback Local
  try {
    const res = await fetch(CONFIG.catalogUrl);
    const data = await res.json();
    state.products = normalizeCatalog(data.products || []);
    renderGrid();
  } catch (e) {
    if(grid) grid.innerHTML = "<div style='text-align:center;width:100%'>Error crítico cargando inventario.</div>";
  }
}

function normalizeCatalog(items) {
  return items.map(p => ({
    id: String(p.id || p.sku),
    name: p.name,
    price: Number(p.baseMXN || p.price || 0),
    section: p.sectionId || "ALL",
    sub: (p.subSection || "").toUpperCase(),
    img: p.img || CONFIG.fallbackImg,
    images: (p.images && p.images.length) ? p.images : [p.img || CONFIG.fallbackImg],
    sizes: p.sizes || ["Unitalla"]
  }));
}

/* ---------------------------------------------------------
   5. RENDERIZADO (Grid & Carrusel)
--------------------------------------------------------- */
async function renderGrid() {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = state.filter === "ALL" 
    ? state.products 
    : state.products.filter(p => p.section === state.filter || p.sub.includes(state.filter));

  if (!filtered.length) {
    grid.innerHTML = "<div style='grid-column:1/-1;text-align:center;padding:20px;'>No hay productos en esta categoría.</div>";
    return;
  }

  for (const p of filtered) {
    // Verificar imagen principal
    const imgOk = await probeImage(p.img);
    const mainImg = imgOk ? p.img : CONFIG.fallbackImg;
    
    const card = document.createElement("div");
    card.className = "card";
    
    // Lógica de Carrusel
    let mediaHtml = `<img src="${mainImg}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;">`;
    
    if (p.images.length > 1) {
      const slides = p.images.map(src => 
        `<div class="carousel-item"><img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>`
      ).join("");
      const dots = p.images.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join("");
      
      mediaHtml = `
        <div class="carousel" id="car-${p.id}" onscroll="window.onCarouselScroll('${p.id}')">
          ${slides}
        </div>
        <div class="carousel-dots" id="dots-${p.id}">
          ${dots}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="cardMedia">${mediaHtml}</div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMoney(p.price)}</div>
        <div class="cardControls">
          <select id="size-${p.id}">${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}</select>
          <button onclick="window.addToCart('${p.id}')"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

// Handler de scroll para los puntos del carrusel
window.onCarouselScroll = function(pid) {
  const car = document.getElementById(`car-${pid}`);
  const dotsBox = document.getElementById(`dots-${pid}`);
  if (!car || !dotsBox) return;
  
  const index = Math.round(car.scrollLeft / car.offsetWidth);
  const dots = dotsBox.querySelectorAll(".dot");
  dots.forEach((d, i) => {
    if (i === index) d.classList.add("active");
    else d.classList.remove("active");
  });
};

/* ---------------------------------------------------------
   6. CARRITO & STORAGE
--------------------------------------------------------- */
function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart));
  updateCartUI();
}

function updateCartUI() {
  const count = state.cart.reduce((acc, item) => acc + item.qty, 0);
  const badge = $("#cartCount");
  if(badge) badge.textContent = count;
  renderCartList();
}

function addToCart(pid) {
  const p = state.products.find(x => x.id === pid);
  if (!p) return;
  
  const sizeEl = document.getElementById(`size-${pid}`);
  const size = sizeEl ? sizeEl.value : "Unitalla";
  const key = `${pid}-${size}`;
  
  const existing = state.cart.find(i => i.key === key);
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push({
      key, id: pid, name: p.name, price: p.price, img: p.img, size, qty: 1
    });
  }
  
  playSound("success");
  saveCart();
  openDrawer();
  toast(`Agregado: ${p.name}`);
}

function modQty(index, delta) {
  const item = state.cart[index];
  if (!item) return;
  
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart.splice(index, 1);
  }
  
  playSound("click");
  saveCart();
}

function renderCartList() {
  const container = $("#cartItems");
  if (!container) return;
  container.innerHTML = "";
  
  let subtotal = 0;
  
  state.cart.forEach((item, idx) => {
    subtotal += item.price * item.qty;
    container.innerHTML += `
      <div class="cartRow" style="display:flex; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid rgba(0,0,0,0.05);">
        <img src="${item.img}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:13px;">${item.name}</div>
          <div style="font-size:12px; opacity:0.8;">Talla: ${item.size}</div>
          <div style="color:var(--score-red); font-weight:700;">${fmtMoney(item.price)}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button onclick="window.modQty(${idx}, -1)" style="width:24px; height:24px; background:#eee; border-radius:4px;">-</button>
          <span style="font-weight:700; font-size:13px;">${item.qty}</span>
          <button onclick="window.modQty(${idx}, 1)" style="width:24px; height:24px; background:#eee; border-radius:4px;">+</button>
        </div>
      </div>
    `;
  });
  
  const total = subtotal + state.shipping.cost;
  $("#cartTotal").textContent = fmtMoney(total);
  $("#cartShipLabel").textContent = state.shipping.label;
}

/* ---------------------------------------------------------
   7. CHECKOUT & SHIPPING (Backend)
--------------------------------------------------------- */
async function quoteShippingUI() {
  const zipInput = $("#shipZip");
  const countryInput = $("#shipCountry");
  const resultBox = $("#shipQuote");
  
  const zip = zipInput.value.replace(/\D/g, "");
  const country = countryInput.value;
  
  if (zip.length < 4) {
    resultBox.innerHTML = "<span style='color:red'>Ingresa un CP válido</span>";
    return;
  }
  
  resultBox.innerHTML = "<i>Cotizando con Envia.com...</i>";
  playSound("click");
  
  try {
    const res = await fetch(CONFIG.endpoints.quote, {
      method: "POST",
      body: JSON.stringify({ zip, country, items: [{qty: 1}] }) // Mock qty para landing
    });
    const data = await res.json();
    
    if (data.ok) {
      resultBox.innerHTML = `<b>${data.label}:</b> ${fmtMoney(data.cost)}`;
      // Actualizamos estado global si estuviera en carrito (opcional)
      state.shipping.zip = zip;
    } else {
      resultBox.innerHTML = "<span style='color:red'>Sin cobertura o error.</span>";
    }
  } catch (e) {
    resultBox.innerHTML = "<span style='color:red'>Error de conexión.</span>";
  }
}

async function doCheckout() {
  if (state.cart.length === 0) return toast("Tu carrito está vacío");
  
  const btn = $("#checkoutBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESANDO...';
  btn.disabled = true;
  
  try {
    initStripe();
    const res = await fetch(CONFIG.endpoints.checkout, {
      method: "POST",
      body: JSON.stringify({
        cart: state.cart,
        shipping: state.shipping,
        shippingMode: state.shipping.mode
      })
    });
    
    const data = await res.json();
    
    if (data.sessionId) {
      await stripeInstance.redirectToCheckout({ sessionId: data.sessionId });
    } else {
      throw new Error(data.error || "Error al iniciar sesión de pago");
    }
  } catch (e) {
    console.error(e);
    toast("Error en el checkout. Intenta de nuevo.");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------
   8. SOCIAL PROOF (Robusto)
   Simula ventas reales para incentivar compra.
--------------------------------------------------------- */
const FAKE_NAMES = ["Carlos de TJ", "Miguel de Ensenada", "Sarah de San Diego", "Jorge de La Paz", "Ana de Mexicali"];
const FAKE_ITEMS = ["Hoodie Oficial", "Gorra Baja 1000", "Camiseta Score", "Chamarra Oficial"];

function initSocialProof() {
  setInterval(() => {
    if (Math.random() > 0.7) return; // No siempre muestra
    const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
    const item = FAKE_ITEMS[Math.floor(Math.random() * FAKE_ITEMS.length)];
    toast(`🔥 ${name} compró ${item}`);
  }, CONFIG.socialProofInterval);
}

/* ---------------------------------------------------------
   9. UI HELPERS & EXPORTS (Globales)
--------------------------------------------------------- */
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

function openDrawer() { 
  $("#cartDrawer").classList.add("open"); 
  $("#pageOverlay").classList.add("show");
  document.body.classList.add("noScroll");
}

function closeDrawer() { 
  $("#cartDrawer").classList.remove("open"); 
  $("#pageOverlay").classList.remove("show");
  document.body.classList.remove("noScroll");
}

function toggleShipping(mode) {
  state.shipping.mode = mode;
  // Reset visual
  if (mode === 'pickup') {
    state.shipping.cost = 0;
    state.shipping.label = "Pickup Tijuana (Gratis)";
    $("#miniZip").style.display = "none";
  } else {
    state.shipping.label = "Cotización pendiente en Checkout";
    $("#miniZip").style.display = "block";
  }
  updateCartUI();
}

// AI CHAT
async function sendAiMessage() {
  const input = $("#aiInput");
  const box = $("#aiMessages");
  const text = input.value.trim();
  if (!text) return;

  // User msg
  const userDiv = document.createElement("div");
  userDiv.className = "ai-bubble user";
  userDiv.textContent = text;
  box.appendChild(userDiv);
  input.value = "";
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch(CONFIG.endpoints.chat, {
      method: "POST",
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    
    // Bot msg
    const botDiv = document.createElement("div");
    botDiv.className = "ai-bubble bot";
    botDiv.textContent = data.reply || "Estoy procesando tu solicitud...";
    box.appendChild(botDiv);
  } catch (e) {
    const errDiv = document.createElement("div");
    errDiv.className = "ai-bubble bot";
    errDiv.textContent = "Error de conexión con el asistente.";
    box.appendChild(errDiv);
  }
  box.scrollTop = box.scrollHeight;
}

/* ---------------------------------------------------------
   10. BINDINGS & INIT
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initStripe();
  loadCatalog();
  updateCartUI();
  initSocialProof();
  
  // Chips de filtro
  $$(".chip").forEach(c => c.addEventListener("click", () => {
    $$(".chip").forEach(ch => ch.classList.remove("active"));
    c.classList.add("active");
    state.filter = c.dataset.filter;
    playSound("click");
    renderGrid();
  }));

  // Drawer events
  $(".drawerClose").addEventListener("click", closeDrawer);
  $("#pageOverlay").addEventListener("click", closeDrawer);
  
  // Service Worker (Placeholder si lo tenías)
  if ('serviceWorker' in navigator) {
    // navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }

  // Quitar Splash al terminar carga
  setTimeout(() => {
    const s = $("#splash-screen");
    if(s) {
      s.style.opacity = 0;
      setTimeout(()=>s.remove(), 600);
    }
  }, 2200);
});

/* ---------------------------------------------------------
   11. EXPORTS (CRÍTICO PARA HTML)
   Hacemos las funciones accesibles desde window para onclick
--------------------------------------------------------- */
window.addToCart = addToCart;
window.modQty = modQty;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.quoteShippingUI = quoteShippingUI;
window.doCheckout = doCheckout;
window.toggleShipping = toggleShipping;
window.sendAiMessage = sendAiMessage;
window.toggleAiAssistant = () => $("#aiChatModal").classList.toggle("show");
window.openLegal = () => $("#legalModal").classList.add("show");
window.closeLegalCompat = () => $("#legalModal").classList.remove("show"); // nombre usado en HTML
window.acceptCookiesCompat = () => { $("#cookieBanner").style.display='none'; localStorage.setItem("score_cookies","1"); };