/* =========================================================
   SCORE STORE — PRODUCTION ENGINE v2026 (FINAL ROBUST)
   Integraciones: Stripe, Supabase, Envia.com, Gemini, SocialProof
   Correcciones: Catálogo visible, botones globales, hero logic.
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURACIÓN CENTRAL & KEYS
   --------------------------------------------------------- */
const CONFIG = {
  // Claves de Producción (Stripe Public Key)
  stripeKey: "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh",
  
  // Supabase (Base de datos productos/ordenes)
  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",
  
  // Endpoints (Netlify Functions)
  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    chat: "/.netlify/functions/chat"
  },
  
  // Recursos Locales
  catalogUrl: "/data/catalog.json", // Asegúrate que el JSON esté en esta ruta
  fallbackImg: "/assets/hero.webp", // Imagen por si falla la del producto
  storageKey: "score_store_cart_v2026", // Key para LocalStorage
  
  // Ajustes de UX
  imgProbeTimeout: 2500, // Tiempo máx para verificar si existe imagen
  socialProofInterval: 30000, // Cada cuánto sale la notificación de venta falsa
  useSound: true // Activar efectos de sonido
};

/* ---------------------------------------------------------
   2. ESTADO GLOBAL (STATE MANAGEMENT)
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
  // Caché para no verificar la misma imagen dos veces
  imgCache: new Map() 
};

// Referencias DOM rápidas (jQuery style)
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
  if (!audioCtx || audioCtx.state === 'suspended') {
    if(audioCtx) audioCtx.resume().catch(()=>{});
  }
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'click') {
    // Sonido corto "Ui click"
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'success') {
    // Sonido "Added to cart"
    osc.type = "triangle";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.2);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'error') {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  }
}

/* ---------------------------------------------------------
   4. INICIALIZACIÓN STRIPE
   --------------------------------------------------------- */
let stripeInstance = null;
function initStripe() {
  if (stripeInstance) return stripeInstance;
  if (window.Stripe && CONFIG.stripeKey) {
    stripeInstance = window.Stripe(CONFIG.stripeKey);
  }
  return stripeInstance;
}

/* ---------------------------------------------------------
   5. MOTOR DE CATÁLOGO (PROBING + FALLBACK)
   --------------------------------------------------------- */

// Verifica si una imagen existe antes de pintarla (evita cuadros rotos)
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

// Carga inteligente: Supabase -> JSON -> Error
async function loadCatalog() {
  const grid = $("#productsGrid");
  if(grid) grid.innerHTML = `
    <div style="grid-column:1/-1; text-align:center; padding:60px; opacity:0.6;">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px; color:var(--score-red);"></i><br><br>
        CARGANDO INVENTARIO...
    </div>`;

  // 1. Intentar Supabase (Base de datos real)
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
  } catch (e) { console.warn("Supabase offline, cambiando a modo local."); }

  // 2. Intentar JSON Local (Fallback seguro)
  try {
    const res = await fetch(CONFIG.catalogUrl);
    if (!res.ok) throw new Error("JSON local no encontrado");
    const data = await res.json();
    state.products = normalizeCatalog(data.products || []);
    renderGrid();
  } catch (e) {
    if(grid) grid.innerHTML = `<div style='text-align:center;width:100%'>Error crítico: No se pudo cargar el catálogo.<br>Refresca la página.</div>`;
    console.error(e);
  }
}

// Normaliza los datos para que siempre tengan el mismo formato
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
    images: (p.images && p.images.length) ? p.images : [p.img || CONFIG.fallbackImg],
    sizes: p.sizes || ["Unitalla"]
  }));
}

/* ---------------------------------------------------------
   6. RENDERIZADO DEL GRID & CARRUSEL
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

  // Renderizado asíncrono para verificar imágenes
  for (const p of filtered) {
    // Validar imagen principal
    const imgOk = await probeImage(p.img);
    const mainImg = imgOk ? p.img : CONFIG.fallbackImg;
    
    const card = document.createElement("div");
    card.className = "card";
    
    // Lógica Avanzada de Carrusel (Si tiene más de 1 imagen)
    let mediaHtml = "";
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
        // Imagen estática
        mediaHtml = `<div class="cardMedia"><img src="${mainImg}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;"></div>`;
    }

    card.innerHTML = `
      <div class="cardMediaWrapper" style="position:relative; aspect-ratio:4/5; overflow:hidden;">${mediaHtml}</div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMoney(p.price)}</div>
        <div class="cardControls">
          <select id="size-${p.id}" class="sizeSelector">${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}</select>
          <button class="addBtn" onclick="window.addToCart('${p.id}')"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

// Función global para manejar los puntos del carrusel al hacer scroll
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
   7. LÓGICA DEL CARRITO (Add, Remove, Save)
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
      // Animación de rebote
      badge.classList.remove("pop");
      void badge.offsetWidth; // trigger reflow
      badge.classList.add("pop");
  }
  renderCartList();
}

function addToCart(pid) {
  initAudio(); // Inicializar audio en primera interacción
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
      container.innerHTML = "<div style='text-align:center; padding:20px; opacity:0.6;'>Tu carrito está vacío.<br>¡Equípate para la carrera!</div>";
      $("#cartTotal").textContent = "$0.00";
      return;
  }
  
  let subtotal = 0;
  
  state.cart.forEach((item, idx) => {
    subtotal += item.price * item.qty;
    container.innerHTML += `
      <div class="cartRow" style="display:flex; gap:12px; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1);">
        <img src="${item.img}" style="width:64px; height:64px; object-fit:cover; border-radius:8px; background:#fff;">
        <div style="flex:1;">
          <div style="font-weight:900; font-size:13px; margin-bottom:4px;">${item.name}</div>
          <div style="font-size:11px; opacity:0.8; margin-bottom:4px;">Talla: ${item.size}</div>
          <div style="color:var(--score-red); font-weight:900;">${fmtMoney(item.price)}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;">
           <div class="qty-ctrl" style="display:flex; align-items:center; gap:8px;">
              <button onclick="window.modQty(${idx}, -1)" style="width:24px; height:24px; background:rgba(255,255,255,0.2); color:#fff; border-radius:4px;">-</button>
              <span style="font-weight:900; font-size:13px;">${item.qty}</span>
              <button onclick="window.modQty(${idx}, 1)" style="width:24px; height:24px; background:rgba(255,255,255,0.2); color:#fff; border-radius:4px;">+</button>
           </div>
        </div>
      </div>
    `;
  });
  
  const total = subtotal + state.shipping.cost;
  $("#cartTotal").textContent = fmtMoney(total);
  $("#cartShipLabel").textContent = state.shipping.label;
}

/* ---------------------------------------------------------
   8. CHECKOUT & ENVÍOS (API CALLS)
   --------------------------------------------------------- */
async function quoteShippingUI() {
  const zipInput = $("#shipZip");
  const countryInput = $("#shipCountry");
  const resultBox = $("#shipQuote");
  
  const zip = zipInput.value.replace(/\D/g, "");
  const country = countryInput.value;
  
  if (zip.length < 4) {
    resultBox.innerHTML = "<span style='color:var(--score-red)'>Ingresa un CP válido (5 dígitos)</span>";
    playSound("error");
    return;
  }
  
  resultBox.innerHTML = "<i><i class='fa-solid fa-spinner fa-spin'></i> Cotizando con Envia.com...</i>";
  playSound("click");
  
  try {
    // Llamada al Backend
    const res = await fetch(CONFIG.endpoints.quote, {
      method: "POST",
      body: JSON.stringify({ zip, country, items: [{qty: 1}] }) 
    });
    const data = await res.json();
    
    if (data.ok) {
      resultBox.innerHTML = `<b>${data.label}:</b> <span style="color:var(--score-blue)">${fmtMoney(data.cost)}</span>`;
      // Actualizamos estado si el usuario quisiera proceder con este costo
      state.shipping.zip = zip;
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
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CONECTANDO CON STRIPE...';
  btn.disabled = true;
  
  try {
    initStripe(); // Asegurar carga
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
      // Redirección segura a Stripe
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
   9. SOCIAL PROOF (VENTAS FALSAS)
   --------------------------------------------------------- */
const FAKE_NAMES = ["Carlos de TJ", "Miguel de Ensenada", "Sarah de San Diego", "Jorge de La Paz", "Ana de Mexicali", "Roberto de AZ", "Mike de CA"];
const FAKE_ITEMS = ["Hoodie Oficial", "Gorra Baja 1000", "Camiseta Score", "Chamarra Oficial", "Jersey Baja 500"];

function initSocialProof() {
  // Solo inicia si el usuario lleva tiempo en la página
  setTimeout(() => {
      setInterval(() => {
        if (Math.random() > 0.6) return; // 40% de probabilidad
        const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
        const item = FAKE_ITEMS[Math.floor(Math.random() * FAKE_ITEMS.length)];
        toast(`🔥 ${name} acaba de comprar ${item}`);
      }, CONFIG.socialProofInterval);
  }, 5000);
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
  // Auto ocultar
  setTimeout(() => t.classList.remove("show"), 3500);
}

function openDrawer() { 
  $("#cartDrawer").classList.add("open"); 
  $("#pageOverlay").classList.add("show");
  document.body.classList.add("noScroll"); // Bloquear scroll del fondo
}

function closeDrawer() { 
  $("#cartDrawer").classList.remove("open"); 
  $("#pageOverlay").classList.remove("show");
  document.body.classList.remove("noScroll");
}

function toggleShipping(mode) {
  state.shipping.mode = mode;
  playSound("click");
  // Reset visual
  if (mode === 'pickup') {
    state.shipping.cost = 0;
    state.shipping.label = "Pickup Tijuana (Gratis)";
    $("#miniZip").style.display = "none";
  } else {
    state.shipping.label = "Se cotizará en el Checkout";
    state.shipping.cost = 0; // Se calcula al final
    $("#miniZip").style.display = "block";
  }
  updateCartUI();
}

// CHATBOT IA (Gemini)
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
document.addEventListener("DOMContentLoaded", () => {
  // 1. Iniciar servicios
  initStripe();
  initAudio();
  loadCatalog();
  updateCartUI();
  
  // 2. Filtros
  $$(".chip").forEach(c => c.addEventListener("click", () => {
    $$(".chip").forEach(ch => ch.classList.remove("active"));
    c.classList.add("active");
    state.filter = c.dataset.filter;
    playSound("click");
    renderGrid();
  }));

  // 3. Eventos Globales
  $(".drawerClose").addEventListener("click", closeDrawer);
  $("#pageOverlay").addEventListener("click", closeDrawer);
  
  // 4. Iniciar Social Proof
  initSocialProof();

  // 5. Quitar Splash Screen (Intro)
  setTimeout(() => {
    const s = $("#splash-screen");
    if(s) {
      s.style.opacity = 0;
      setTimeout(()=>s.remove(), 600);
    }
  }, 2200);
  
  // 6. Verificar URL params (Pago exitoso/cancelado)
  const params = new URLSearchParams(window.location.search);
  if (params.get("success")) {
      toast("✅ ¡Pago Exitoso! Gracias por tu compra.");
      state.cart = [];
      saveCart();
  }
});

/* ---------------------------------------------------------
   12. EXPORTACIONES GLOBALES (CRÍTICO PARA HTML ONCLICK)
   --------------------------------------------------------- */
// Sin esto, los botones del HTML dicen "function undefined"
window.addToCart = addToCart;
window.modQty = modQty;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.quoteShippingUI = quoteShippingUI;
window.doCheckout = doCheckout;
window.toggleShipping = toggleShipping;
window.sendAiMessage = sendAiMessage;
window.handleScroll = window.handleScroll; // Exportar handler del carrusel
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
window.acceptCookies = () => { $("#cookieBanner").style.display='none'; localStorage.setItem("score_cookies","1"); };
