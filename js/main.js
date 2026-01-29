/* =========================================================
   SCORE STORE — PRODUCTION ENGINE v2026 (FINAL FIX)
   Integraciones: Stripe, Supabase, Envia.com, Gemini
   ========================================================= */

// 1. CONFIGURACIÓN
const CONFIG = {
  stripeKey: "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh",
  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",
  
  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    chat: "/.netlify/functions/chat"
  },
  
  catalogUrl: "/data/catalog.json", // IMPORTANTE: El archivo JSON debe existir
  fallbackImg: "/assets/hero.webp",
  storageKey: "score_cart_2026_final"
};

// 2. ESTADO
const state = {
  cart: JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]"),
  products: [],
  filter: "ALL",
  shipping: { mode: "pickup", cost: 0, label: "Pickup Tijuana (Gratis)" }
};

// 3. HELPERS
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmtMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

// 4. STRIPE
let stripe = null;
if (window.Stripe) stripe = window.Stripe(CONFIG.stripeKey);

// =========================================================
//  CORE: CATÁLOGO
// =========================================================

async function loadCatalog() {
  const grid = $("#productsGrid");
  if(grid) grid.innerHTML = "<div style='text-align:center;width:100%;padding:40px;'>Cargando inventario...</div>";

  // 1. Intentar JSON Local (Más rápido y seguro con tu estructura actual)
  try {
    const res = await fetch(CONFIG.catalogUrl);
    if(res.ok) {
        const data = await res.json();
        // Detectar si el JSON tiene la estructura { products: [] } o es un array directo
        const items = data.products || data; 
        state.products = normalizeProducts(items);
        renderGrid();
        return;
    }
  } catch (e) { console.warn("Fallo carga local, intentando Supabase..."); }

  // 2. Fallback Supabase
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/products?select=*&active=eq.true`, {
      headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.length) {
        state.products = normalizeProducts(data);
        renderGrid();
        return;
      }
    }
  } catch (e) { 
      if(grid) grid.innerHTML = "<p>Error cargando catálogo. Recarga la página.</p>";
  }
}

function normalizeProducts(list) {
  return list.map(p => ({
    id: p.id || p.sku,
    name: p.name,
    price: Number(p.baseMXN || p.price || 0),
    section: p.sectionId || "ALL",
    sub: (p.subSection || "").toUpperCase(),
    img: p.img || CONFIG.fallbackImg,
    images: p.images || [p.img],
    sizes: p.sizes || ["Unitalla"]
  }));
}

function renderGrid() {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = state.filter === "ALL" 
    ? state.products 
    : state.products.filter(p => p.section === state.filter || p.sub.includes(state.filter));

  if (!filtered.length) {
    grid.innerHTML = "<div style='grid-column:1/-1;text-align:center'>No hay productos en esta categoría.</div>";
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="cardMedia">
        <img src="${p.img}" loading="lazy" alt="${p.name}">
      </div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMXN(p.price)}</div>
        <div class="cardControls">
          <select id="size-${p.id}">${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}</select>
          <button onclick="window.addToCart('${p.id}')"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// =========================================================
//  CART ACTIONS (Exportadas)
// =========================================================

function addToCart(pid) {
  const p = state.products.find(x => x.id === pid);
  if (!p) return;
  const size = $(`#size-${pid}`)?.value || "Unitalla";
  const key = `${pid}-${size}`;
  
  const existing = state.cart.find(i => i.key === key);
  if (existing) existing.qty++;
  else state.cart.push({ key, id: pid, name: p.name, price: p.price, img: p.img, size, qty: 1 });

  saveCart();
  toast("Agregado al carrito");
  openDrawer();
}

function modQty(idx, delta) {
  const item = state.cart[idx];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart.splice(idx, 1);
  saveCart();
}

function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart));
  $("#cartCount").textContent = state.cart.reduce((a, b) => a + b.qty, 0);
  renderCart();
}

function renderCart() {
  const box = $("#cartItems");
  if (!box) return;
  box.innerHTML = "";
  
  let subtotal = 0;
  state.cart.forEach((item, i) => {
    subtotal += item.price * item.qty;
    box.innerHTML += `
      <div class="cartItemRow">
        <img src="${item.img}">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:13px;">${item.name}</div>
          <div style="font-size:12px;">Talla: ${item.size}</div>
          <div style="color:var(--score-red);font-weight:700;">${fmtMXN(item.price)}</div>
        </div>
        <div class="qtyBox">
          <button onclick="window.modQty(${i},-1)">-</button>
          <span>${item.qty}</span>
          <button onclick="window.modQty(${i},1)">+</button>
        </div>
      </div>
    `;
  });

  const total = subtotal + (state.shipping.cost || 0);
  $("#cartTotal").textContent = fmtMXN(total);
  $("#cartShipLabel").textContent = state.shipping.label;
}

// =========================================================
//  COTIZADOR & CHECKOUT
// =========================================================

async function quoteShippingUI() {
  const zip = $("#shipZip").value.replace(/\D/g, "");
  const country = $("#shipCountry").value;
  const out = $("#shipQuote");
  
  if (zip.length < 4) return out.textContent = "Ingresa un CP válido.";
  out.textContent = "Cotizando con Envia.com...";

  try {
    const res = await fetch(CONFIG.endpoints.quote, {
      method: "POST",
      body: JSON.stringify({ zip, country, items: [{qty:1}] })
    });
    const data = await res.json();
    
    if (data.ok) {
      out.innerHTML = `<b>${data.label}:</b> ${fmtMXN(data.cost)}`;
    } else {
      out.textContent = "Sin cobertura o error CP.";
    }
  } catch (e) {
    out.textContent = "Error de conexión.";
  }
}

async function doCheckout() {
  if (!state.cart.length) return toast("Carrito vacío");
  
  const btn = $("#checkoutBtn");
  btn.textContent = "Procesando...";
  btn.disabled = true;

  try {
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
      stripe.redirectToCheckout({ sessionId: data.sessionId });
    } else {
      throw new Error(data.error || "Error iniciando pago");
    }
  } catch (e) {
    toast("Error: " + e.message);
    btn.textContent = "PAGAR AHORA";
    btn.disabled = false;
  }
}

// =========================================================
//  UI UTILS
// =========================================================

function openDrawer() { $("#cartDrawer").classList.add("open"); $("#pageOverlay").classList.add("show"); }
function closeDrawer() { $("#cartDrawer").classList.remove("open"); $("#pageOverlay").classList.remove("show"); }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

$$(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.filter;
    renderGrid();
  });
});

// =========================================================
//  EXPORTS TO WINDOW (SOLUCION A BOTONES NO FUNCIONAN)
// =========================================================
window.addToCart = addToCart;
window.modQty = modQty;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.quoteShippingUI = quoteShippingUI;
window.doCheckout = doCheckout;
window.toggleShipping = (mode) => {
  state.shipping.mode = mode;
  state.shipping.label = mode === 'pickup' ? "Pickup Gratis" : "Cotización pendiente";
  state.shipping.cost = 0;
  $("#miniZip").style.display = mode === 'pickup' ? 'none' : 'block';
  renderCart();
};
window.toggleAiAssistant = () => $("#aiChatModal").classList.toggle("show");
window.sendAiMessage = async () => { /* Logic AI Placeholder */ };
window.openLegal = (type) => $("#legalModal").style.display = "flex";

// INIT
document.addEventListener("DOMContentLoaded", () => {
  loadCatalog();
  saveCart(); 
  setTimeout(() => { $("#splash-screen")?.remove(); }, 2000);
});
