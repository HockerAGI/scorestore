/* =========================================================
   SCORE STORE — PRODUCTION ENGINE v2026 (HEAVY DUTY ROBUST)
   ---------------------------------------------------------
   Arquitectura: Modular Monolith (Vanilla JS)
   Integraciones: Stripe, Supabase, Envia.com, Gemini AI.
   Características:
   - Splash Screen RPM Animado
   - Carga Híbrida de Catálogo (BD + Respaldo Local)
   - Sistema de Audio (Sound FX)
   - Validación de Imágenes (Probing)
   - Social Proof (Notificaciones de venta)
   - Carruseles Táctiles
   - Gestión de Estado (State Management)
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURACIÓN CENTRAL (PROD KEYS)
   --------------------------------------------------------- */
const CONFIG = {
  // Pasarela de Pagos
  stripeKey: "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh",
  
  // Base de Datos (Inventario y Ordenes)
  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",
  
  // Serverless Functions (Backend)
  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    chat: "/.netlify/functions/chat"
  },
  
  // Recursos Estáticos
  catalogUrl: "/data/catalog.json", // Respaldo crítico
  fallbackImg: "/assets/hero.webp",
  
  // Persistencia
  storageKey: "score_cart_2026_prod_v1",
  
  // UX / UI Settings
  imgProbeTimeout: 2000,     // 2s máx para validar img
  socialProofInterval: 45000, // 45s entre notificaciones
  useSound: true             // Efectos de sonido activados
};

/* ---------------------------------------------------------
   2. GESTIÓN DE ESTADO (STATE)
   --------------------------------------------------------- */
const state = {
  cart: JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]"),
  products: [],
  filter: "ALL",
  shipping: { 
    mode: "pickup", 
    cost: 0, 
    label: "Pickup Tijuana (Gratis)",
    zip: "",
    country: "MX"
  },
  // Caché de validación de imágenes para rendimiento
  imgCache: new Map() 
};

// Selectores DOM de alto rendimiento
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmtMoney = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

/* ---------------------------------------------------------
   3. SISTEMA DE AUDIO (AUDIO CONTEXT ROBUSTO)
   --------------------------------------------------------- */
let audioCtx = null;

function initAudio() {
  if (!CONFIG.useSound) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx && !audioCtx) audioCtx = new Ctx();
}

function playSound(type) {
  // Reactivar contexto si el navegador lo suspendió (política de autoplay)
  if (!audioCtx || audioCtx.state === 'suspended') {
    if(audioCtx) audioCtx.resume().catch(()=>{});
  }
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  // Diseño de sonido sintético
  if (type === 'click') {
    // Click mecánico corto
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'success') {
    // Campanada de éxito
    osc.type = "triangle";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.2);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'error') {
    // Error grave
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  }
}

/* ---------------------------------------------------------
   4. INICIALIZACIÓN DE SERVICIOS
   --------------------------------------------------------- */
let stripeInstance = null;
function initStripe() {
  if (stripeInstance) return stripeInstance;
  if (window.Stripe && CONFIG.stripeKey) {
    stripeInstance = window.Stripe(CONFIG.stripeKey);
  }
  return stripeInstance;
}

// Service Worker (Para PWA y Caché Offline)
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    // navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Registration failed', err));
  }
}

// Splash Screen RPM (Animación de carga inicial)
function initIntroSplash() {
  const splash = $("#splash-screen");
  if (!splash) return;
  
  const bar = $(".rpm-bar");
  const rpm = $("#revCounter");
  let p = 0;
  
  // Simulación de carga de motor
  const t = setInterval(() => {
    p += Math.random() * 10 + 2; 
    if (p > 100) p = 100;
    
    if (bar) bar.style.width = p + "%";
    if (rpm) rpm.textContent = Math.floor(p * 85) + " RPM";
    
    if (p >= 100) {
      clearInterval(t);
      splash.style.opacity = 0;
      setTimeout(() => splash.remove(), 600);
    }
  }, 90);
}

/* ---------------------------------------------------------
   5. MOTOR DE CATÁLOGO (DUAL SOURCE + IMAGE PROBING)
   --------------------------------------------------------- */

// Validador de imágenes (evita 404 visibles)
async function probeImage(url) {
  if (state.imgCache.has(url)) return state.imgCache.get(url);
  return new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => {
        state.imgCache.set(url, false);
        resolve(false); 
    }, CONFIG.imgProbeTimeout);
    
    img.onload = () => { clearTimeout(t); state.imgCache.set(url, true); resolve(true); };
    img.onerror = () => { clearTimeout(t); state.imgCache.set(url, false); resolve(false); };
    img.src = url;
  });
}

// Carga resiliente: Supabase -> JSON Local -> Error
async function loadCatalog() {
  const grid = $("#productsGrid");
  if(grid) grid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:60px; opacity:0.6;">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:#E10600;"></i><br><br>
        <span style="font-family:'Teko'; font-size:20px;">CARGANDO MOTOR...</span>
    </div>`;

  // ESTRATEGIA 1: Supabase (Datos en tiempo real)
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/products?select=*&active=eq.true`, {
      headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        console.log("Inventario cargado desde Supabase");
        state.products = normalizeCatalog(data);
        renderGrid();
        return;
      }
    }
  } catch (e) { 
    console.warn("Supabase offline/lento, cambiando a respaldo local..."); 
  }

  // ESTRATEGIA 2: JSON Local (Respaldo infalible)
  try {
    const res = await fetch(CONFIG.catalogUrl);
    if (!res.ok) throw new Error("JSON local no encontrado");
    const data = await res.json();
    // Soporta estructura { products: [] } o [ ... ]
    const items = data.products || data; 
    console.log("Inventario cargado desde Local JSON");
    state.products = normalizeCatalog(items);
    renderGrid();
  } catch (e) {
    if(grid) grid.innerHTML = `<div style='text-align:center;width:100%;padding:40px'>
      <i class="fa-solid fa-triangle-exclamation"></i> Error crítico de inventario.<br>Por favor recarga la página.
    </div>`;
    console.error(e);
  }
}

// Normalizador de datos (Estandariza Supabase y JSON)
function normalizeCatalog(items) {
  return items.map(p => ({
    id: String(p.id || p.sku),
    name: p.name,
    price: Number(p.baseMXN || p.price || 0),
    section: p.sectionId || "ALL",
    sub: (p.subSection || "").toUpperCase(),
    // Fallback de imagen si viene vacía
    img: p.img || CONFIG.fallbackImg,
    // Asegurar array de imágenes para carrusel
    images: (p.images && Array.isArray(p.images) && p.images.length) ? p.images : [p.img || CONFIG.fallbackImg],
    sizes: (p.sizes && Array.isArray(p.sizes)) ? p.sizes : ["Unitalla"]
  }));
}

/* ---------------------------------------------------------
   6. RENDERIZADO DEL GRID (CON CARRUSEL TÁCTIL)
   --------------------------------------------------------- */
async function renderGrid() {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = state.filter === "ALL" 
    ? state.products 
    : state.products.filter(p => p.section === state.filter || p.sub.includes(state.filter));

  if (!filtered.length) {
    grid.innerHTML = "<div style='grid-column:1/-1;text-align:center;padding:40px;font-weight:700;'>No hay productos en esta categoría.</div>";
    return;
  }

  // Renderizado optimizado
  for (const p of filtered) {
    // Validar existencia de imagen principal
    const imgOk = await probeImage(p.img);
    const mainImg = imgOk ? p.img : CONFIG.fallbackImg;
    
    const card = document.createElement("div");
    card.className = "card";
    
    // Lógica del Carrusel
    let mediaHtml;
    if (p.images.length > 1) {
      const slides = p.images.map(src => 
        `<div class="carousel-item"><img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"></div>`
      ).join("");
      const dots = p.images.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join("");
      
      mediaHtml = `
        <div class="carousel" id="car-${p.id}" onscroll="window.handleScroll('${p.id}')">
          ${slides}
        </div>
        <div class="carousel-dots" id="dots-${p.id}">
          ${dots}
        </div>
      `;
    } else {
      mediaHtml = `<div class="cardMedia"><img src="${mainImg}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"></div>`;
    }

    card.innerHTML = `
      <div style="position:relative; aspect-ratio:4/5; overflow:hidden;">${mediaHtml}</div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMoney(p.price)}</div>
        <div class="cardControls">
          <select id="size-${p.id}" class="sizeSelector" aria-label="Talla">
            ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>
          <button class="addBtn" onclick="window.addToCart('${p.id}')" aria-label="Agregar al carrito">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

// Handler global para scroll del carrusel (puntos de navegación)
window.handleScroll = function(pid) {
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
   7. LÓGICA DEL CARRITO (CORE)
   --------------------------------------------------------- */
function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart));
  updateCartUI();
}

function updateCartUI() {
  const count = state.cart.reduce((acc, item) => acc + item.qty, 0);
  const badge = $("#cartCount");
  if(badge) {
    badge.textContent = count;
    // Animación "Pop"
    badge.classList.remove("pop");
    void badge.offsetWidth; // Trigger reflow
    badge.classList.add("pop");
  }
  renderCartList();
}

function addToCart(pid) {
  initAudio();
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
  initAudio();
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
  
  if (state.cart.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:30px; opacity:0.6;'>Tu carrito está vacío.<br>¡Equípate para la carrera!</div>";
    $("#cartTotal").textContent = "$0.00";
    return;
  }
  
  let subtotal = 0;
  state.cart.forEach((item, idx) => {
    subtotal += item.price * item.qty;
    container.innerHTML += `
      <div class="cartRow">
        <img src="${item.img}" alt="${item.name}">
        <div style="flex:1;">
          <div style="font-weight:800; font-size:13px; margin-bottom:4px;">${item.name}</div>
          <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">Talla: ${item.size}</div>
          <div style="color:#E10600; font-weight:900;">${fmtMoney(item.price)}</div>
        </div>
        <div class="qty-ctrl">
           <button onclick="window.modQty(${idx}, -1)">-</button>
           <span>${item.qty}</span>
           <button onclick="window.modQty(${idx}, 1)">+</button>
        </div>
      </div>
    `;
  });
  
  // Calcular total con envío si aplica
  const total = subtotal + (state.shipping.cost || 0);
  $("#cartTotal").textContent = fmtMoney(total);
  $("#cartShipLabel").textContent = state.shipping.label;
}

/* ---------------------------------------------------------
   8. CHECKOUT & SHIPPING (API CALLS ROBUSTAS)
   --------------------------------------------------------- */
async function quoteShippingUI() {
  const zipInput = $("#shipZip");
  const countryInput = $("#shipCountry");
  const resultBox = $("#shipQuote");
  
  const zip = zipInput.value.replace(/\D/g, "");
  const country = countryInput.value;
  
  if (zip.length < 4) {
    resultBox.innerHTML = "<span style='color:red'>Ingresa un CP válido (5 dígitos).</span>";
    playSound("error");
    return;
  }
  
  resultBox.innerHTML = "<i><i class='fa-solid fa-spinner fa-spin'></i> Cotizando con Envia.com...</i>";
  playSound("click");
  
  try {
    const res = await fetch(CONFIG.endpoints.quote, {
      method: "POST",
      body: JSON.stringify({ zip, country, items: [{qty: 1}] }) 
    });
    const data = await res.json();
    
    if (data.ok) {
      resultBox.innerHTML = `<b>${data.label}:</b> <span style="color:#003087; font-weight:800;">${fmtMoney(data.cost)}</span>`;
      state.shipping.zip = zip; // Guardar contexto
      playSound("success");
    } else {
      resultBox.innerHTML = "<span style='color:red'>Sin cobertura o error. Intenta otro CP.</span>";
      playSound("error");
    }
  } catch (e) {
    resultBox.innerHTML = "<span style='color:red'>Error de conexión.</span>";
  }
}

async function doCheckout() {
  initAudio();
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
    playSound("error");
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------
   9. SOCIAL PROOF (NOTIFICACIONES DE VENTA)
   --------------------------------------------------------- */
const FAKE_NAMES = ["Carlos de TJ", "Miguel de Ensenada", "Sarah de San Diego", "Jorge de La Paz", "Ana de Mexicali", "Roberto de AZ", "Mike de CA", "Luis de BCS"];
const FAKE_ITEMS = ["Hoodie Oficial", "Gorra Baja 1000", "Camiseta Score", "Chamarra Oficial", "Jersey Baja 500", "Tank Top San Felipe"];

function initSocialProof() {
  // Retraso inicial de 10s para no molestar al entrar
  setTimeout(() => {
    setInterval(() => {
      // 40% de probabilidad de mostrar
      if (Math.random() > 0.6) return; 
      
      const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
      const item = FAKE_ITEMS[Math.floor(Math.random() * FAKE_ITEMS.length)];
      toast(`🔥 ${name} acaba de comprar ${item}`);
    }, CONFIG.socialProofInterval);
  }, 10000);
}

/* ---------------------------------------------------------
   10. INTERFAZ DE USUARIO (DRAWER, TOAST, AI)
   --------------------------------------------------------- */
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.innerHTML = msg;
  t.classList.add("show");
  playSound("click");
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
  playSound("click");
  // Lógica visual del drawer
  if (mode === 'pickup') {
    state.shipping.cost = 0;
    state.shipping.label = "Pickup Tijuana (Gratis)";
    $("#miniZip").style.display = "none";
  } else {
    state.shipping.label = "Se cotizará en el Checkout";
    state.shipping.cost = 0; 
    $("#miniZip").style.display = "block";
  }
  updateCartUI();
}

// Chatbot IA (Gemini Integration)
async function sendAiMessage() {
  const input = $("#aiInput");
  const box = $("#aiMessages");
  const text = input.value.trim();
  if (!text) return;

  // Mensaje Usuario
  const userDiv = document.createElement("div");
  userDiv.className = "ai-bubble user";
  userDiv.textContent = text;
  box.appendChild(userDiv);
  input.value = "";
  box.scrollTop = box.scrollHeight;

  // Loader Bot
  const botDiv = document.createElement("div");
  botDiv.className = "ai-bubble bot";
  botDiv.innerHTML = '<i class="fa-solid fa-ellipsis fa-bounce"></i>';
  box.appendChild(botDiv);
  box.scrollTop = box.scrollHeight;

  try {
    const res = await fetch(CONFIG.endpoints.chat, {
      method: "POST",
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    
    // Reemplazar loader con respuesta
    botDiv.textContent = data.reply || "Soy Score AI, ¿en qué te ayudo?";
    playSound("click");
  } catch (e) {
    botDiv.textContent = "Error de conexión con el asistente.";
  }
}

/* ---------------------------------------------------------
   11. BINDINGS & ARRANQUE
   --------------------------------------------------------- */
function bindUI() {
  // Chips de filtro
  $$(".chip").forEach(c => c.addEventListener("click", () => {
    $$(".chip").forEach(ch => ch.classList.remove("active"));
    c.classList.add("active");
    state.filter = c.dataset.filter;
    playSound("click");
    renderGrid();
  }));

  // Cierres de modales
  $(".drawerClose").addEventListener("click", closeDrawer);
  $("#pageOverlay").addEventListener("click", closeDrawer);
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Iniciar servicios críticos
  initStripe();
  initIntroSplash();
  initServiceWorker();
  
  // 2. Carga asíncrona del catálogo
  await loadCatalog();
  
  // 3. UI y Eventos
  bindUI();
  updateCartUI();
  initSocialProof();
  
  // 4. Manejo de URL Params (Stripe Return)
  const params = new URLSearchParams(window.location.search);
  if (params.get("success")) {
    toast("✅ ¡Pago Exitoso! Gracias por tu compra.");
    state.cart = [];
    saveCart();
    window.history.replaceState({}, document.title, "/");
  } else if (params.get("cancel")) {
    toast("⚠️ Pago cancelado. Intenta de nuevo.");
    window.history.replaceState({}, document.title, "/");
  }
});

/* ---------------------------------------------------------
   12. EXPORTACIONES GLOBALES (CRÍTICO PARA HTML ONCLICK)
   --------------------------------------------------------- */
// Estas asignaciones son obligatorias para que los botones en index.html funcionen
window.addToCart = addToCart;
window.modQty = modQty;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.quoteShippingUI = quoteShippingUI;
window.doCheckout = doCheckout;
window.toggleShipping = toggleShipping;
window.sendAiMessage = sendAiMessage;
window.handleScroll = window.handleScroll; // Carrusel handler

// Helpers UI
window.toggleAiAssistant = () => { 
    $("#aiChatModal").classList.toggle("show"); 
    playSound("click"); 
};
window.openLegal = (type) => {
    $("#legalModal").classList.add("show");
    const title = type === 'privacy' ? 'AVISO DE PRIVACIDAD' : 'TÉRMINOS Y CONDICIONES';
    $("#legalTitle").textContent = title;
};
window.closeLegal = () => $("#legalModal").classList.remove("show");
window.acceptCookies = () => { 
    $("#cookieBanner").style.display='none'; 
    localStorage.setItem("score_cookies","1"); 
};
