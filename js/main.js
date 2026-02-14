/* =========================================================
   SCORE STORE — MASTER JS PROD 2026
   ========================================================= */

const CONFIG = {
  stripeKey: "pk_live_51STepg1ExTx11WqTGdkk68CLhZHqnBkIAzE2EacmhSR336HvR9nQY5dskyPWotJ6AExFjstC7C7wUTsOIIzRGols00hFSwI8yp",
  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  // Esta llave es pública (Anon Key), es seguro tenerla aquí
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE", 
  supabaseCatalogView: "catalog_products",
  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    ai: "/.netlify/functions/chat"
  },
  storageKey: "score_cart_2026",
  catalogUrl: "/data/catalog.json"
};

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const STATE = {
  cart: JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]"),
  products: [],
  filter: "ALL",
  maintenanceMode: false
};

// --- CORE FUNCTIONS ---
function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(STATE.cart));
  const qty = STATE.cart.reduce((a, b) => a + b.qty, 0);
  $$(".cartCount").forEach(el => el.textContent = qty);
  updateDrawerUI();
}

function updateDrawerUI() {
  const container = $("#cartItems");
  if (!container) return;
  container.innerHTML = STATE.cart.length ? "" : "<p style='text-align:center;padding:20px;opacity:0.6;'>Tu carrito está vacío</p>";

  let subtotal = 0;
  STATE.cart.forEach((item, idx) => {
    subtotal += item.price * item.qty;
    const row = document.createElement("div");
    row.className = "cartRow";
    row.innerHTML = `
      <div class="cartThumb"><img src="${item.img}" alt=""></div>
      <div class="cartInfo">
        <div class="name">${item.name}</div>
        <div class="price">${fmtMXN(item.price)} x ${item.qty}</div>
        <div style="font-size:10px;opacity:0.6;">Talla: ${item.size}</div>
      </div>
      <button onclick="removeFromCart(${idx})" style="color:var(--score-red);font-weight:bold;padding:5px;">✕</button>
    `;
    container.appendChild(row);
  });

  $("#cartSubtotal").textContent = fmtMXN(subtotal);
  $("#cartTotal").textContent = fmtMXN(subtotal);
}

window.removeFromCart = (idx) => {
  STATE.cart.splice(idx, 1);
  saveCart();
};

function addToCart(id) {
  if (STATE.maintenanceMode) return alert("Tienda en mantenimiento.");
  const p = STATE.products.find(x => x.id === id);
  if (!p) return;

  const size = $(`#size-${p.id.replace(/[^a-z0-9]/gi,'')}`)?.value || "Unitalla";
  const key = `${id}-${size}`;
  const ex = STATE.cart.find(i => i.key === key);

  if (ex) {
    ex.qty++;
  } else {
    STATE.cart.push({
      key, id: p.id, name: p.name, price: p.baseMXN,
      img: p.img, size, qty: 1
    });
  }
  saveCart();
  openDrawer();
}

// --- UI RENDER ---
async function renderGrid() {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  
  const filtered = STATE.products.filter(p => 
    STATE.filter === "ALL" || p.sectionId === STATE.filter || 
    (STATE.filter === "HOODIES" && p.subSection === "Hoodies") ||
    (STATE.filter === "TEES" && p.subSection === "Camisetas") ||
    (STATE.filter === "CAPS" && p.subSection === "Gorras")
  );

  filtered.forEach(p => {
    const safeId = p.id.replace(/[^a-z0-9]/gi,'');
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="p-media"><img src="${p.img}" alt="${p.name}" loading="lazy"></div>
      <div class="p-body">
        <div class="p-top">
          <h3 class="p-name">${p.name}</h3>
          <span class="p-price">${fmtMXN(p.baseMXN)}</span>
        </div>
        <select id="size-${safeId}" class="p-size-sel">
          ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>
        <button class="p-btn-add" onclick="addToCart('${p.id}')">AGREGAR AL CARRITO</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// --- INIT & SPLASH REMOVAL ---
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Cargar datos
  try {
    const res = await fetch(CONFIG.catalogUrl);
    const data = await res.json();
    STATE.products = data.products.map(p => ({
      ...p,
      sectionId: p.sectionId.toUpperCase()
    }));
    renderGrid();
  } catch (e) { 
    console.error("Error loading catalog", e); 
  }

  // 2. Eventos de Filtros
  $$(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      STATE.filter = btn.dataset.filter;
      renderGrid();
    });
  });

  // 3. Restaurar carrito
  saveCart();

  // 4. ELIMINAR SPLASH SCREEN (ESTO FALTABA)
  const splash = document.getElementById("splash");
  if(splash) {
    // Le damos un pequeño delay para que se vea la marca
    setTimeout(() => {
      splash.style.transition = "opacity 0.5s ease";
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.style.display = "none";
      }, 500);
    }, 800);
  }
});

// --- GLOBAL EXPORTS ---
function openDrawer() {
  $("#cartDrawer").classList.add("open");
  $("#pageOverlay").classList.add("show");
  document.body.classList.add("no-scroll");
}
function closeDrawer() {
  $("#cartDrawer").classList.remove("open");
  $("#pageOverlay").classList.remove("show");
  document.body.classList.remove("no-scroll");
}

window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.addToCart = addToCart;

window.doCheckout = async () => {
  const btn = $("#checkoutBtn");
  btn.disabled = true;
  btn.textContent = "PROCESANDO...";
  try {
    const res = await fetch(CONFIG.endpoints.checkout, {
      method: "POST",
      body: JSON.stringify({ cart: STATE.cart })
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else alert("Error: No se recibió URL de pago.");
  } catch (e) { 
    console.error(e);
    alert("Error al conectar con Stripe. Revisa la consola."); 
  }
  btn.disabled = false;
  btn.textContent = "PAGAR AHORA";
};
