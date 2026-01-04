/* SCORE STORE LOGIC — FINAL UNIFIED v2 */

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api"
  : "/.netlify/functions";

const CART_KEY = "score_cart_final_v20";
let cart = [];
let catalog = [];
// Estado local de envío para la UI
let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

/* ================= INIT ================= */

async function init() {
  // 1. Cargar Carrito y Catálogo
  loadCart();
  await loadCatalog();
  
  // 2. Restaurar UI
  updateCartUI();
  
  // 3. Listeners para tus inputs de envío
  setupShippingListeners();
}

function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) {
    try { cart = JSON.parse(saved); } catch (e) { console.error(e); }
  }
}

async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json");
    const data = await res.json();
    catalog = data.products || [];
  } catch (e) {
    console.error("Error cargando catálogo", e);
    toast("Error de conexión con el catálogo");
  }
}

/* ================= LOGIC & LISTENERS ================= */

function setupShippingListeners() {
  // Radio Buttons (name="shipMode")
  const radios = document.getElementsByName("shipMode");
  radios.forEach(r => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

  // Input CP (para cotizar en tiempo real)
  const cpInput = $("cp");
  if(cpInput) {
    cpInput.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g,'');
      e.target.value = val;
      if (val.length === 5 && shippingState.mode === "mx") {
        quoteShipping(val);
      }
    });
  }
}

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  const form = $("shipForm");
  const shipTotalEl = $("shipTotal");

  // Mostrar/Ocultar formulario según tu diseño
  if (mode === "pickup") {
    if(form) form.style.display = "none";
    shippingState.cost = 0;
    shippingState.label = "Gratis (Fábrica)";
  } 
  else if (mode === "tj") {
    if(form) form.style.display = "block";
    shippingState.cost = 200;
    shippingState.label = "$200.00 (Local)";
  } 
  else if (mode === "mx") {
    if(form) form.style.display = "block";
    // Si ya hay CP, recotizar, si no, poner pendiente
    const currentCP = $("cp")?.value;
    if (currentCP && currentCP.length === 5) {
      quoteShipping(currentCP);
    } else {
      shippingState.cost = 0;
      shippingState.label = "Ingresa CP...";
    }
  }
  updateCartUI();
}

async function quoteShipping(zip) {
  const shipTotalEl = $("shipTotal");
  if(shipTotalEl) shipTotalEl.innerText = "Calculando...";

  try {
    const qty = cart.reduce((acc, i) => acc + i.qty, 0);
    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      body: JSON.stringify({ zip, items: qty })
    });
    const data = await res.json();
    
    if (data.cost) {
      shippingState.cost = data.cost;
      shippingState.label = `${money(data.cost)} (${data.carrier || 'Nacional'})`;
    } else {
      // Fallback
      shippingState.cost = 250;
      shippingState.label = "$250.00 (Estándar)";
    }
  } catch (e) {
    console.error(e);
    shippingState.cost = 250;
    shippingState.label = "$250.00 (Estándar)";
  }
  updateCartUI();
}

/* ================= CART ACTIONS ================= */

window.addToCart = (id, sizeOverride) => {
  // Lógica para detectar talla seleccionada en tu UI (si existe un select específico)
  // Asumimos que si viene del modal usa un select dentro del modal, si viene de la card usa uno genérico.
  // Ajusta esto según cómo tengas tus selects en el HTML generado.
  let size = "Unitalla";
  const sizeSel = document.querySelector(`select[data-product-id="${id}"]`) || document.getElementById(`size-${id}`);
  if (sizeSel) size = sizeSel.value;
  if (sizeOverride) size = sizeOverride;

  const existing = cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado al carrito");
  window.openDrawer(); // Tu función existente
};

window.emptyCart = () => {
  if(!confirm("¿Vaciar carrito?")) return;
  cart = [];
  saveCart();
  updateCartUI();
};

window.removeFromCart = (index) => {
  cart.splice(index, 1);
  saveCart();
  updateCartUI();
};

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function updateCartUI() {
  const container = $("cartItems");
  const countBadge = $("cartCount"); // En el header
  const cartEmpty = $("cartEmpty");
  const subTotalEl = $("subTotal");
  const shipTotalEl = $("shipTotal");
  const grandTotalEl = $("grandTotal");

  // 1. Render Items
  if (cart.length === 0) {
    if(container) container.innerHTML = "";
    if(cartEmpty) cartEmpty.style.display = "block";
    if(countBadge) countBadge.innerText = "0";
    if(subTotalEl) subTotalEl.innerText = "$0.00";
    if(grandTotalEl) grandTotalEl.innerText = "$0.00";
    return;
  }
  
  if(cartEmpty) cartEmpty.style.display = "none";
  let html = "";
  let subtotal = 0;
  let totalQty = 0;

  cart.forEach((item, idx) => {
    const p = catalog.find(x => x.id === item.id);
    if (!p) return;
    const totalItem = p.baseMXN * item.qty;
    subtotal += totalItem;
    totalQty += item.qty;

    html += `
      <div class="cartItem" style="display:flex;gap:10px;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
        <img src="${p.img}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">
        <div style="flex:1;">
          <h4 style="font-size:14px;margin:0 0 4px;color:#000;">${p.name}</h4>
          <p style="font-size:12px;color:#666;margin:0;">Talla: ${item.size} | x${item.qty}</p>
          <div style="font-weight:bold;font-size:14px;color:#000;">${money(totalItem)}</div>
        </div>
        <button onclick="removeFromCart(${idx})" style="border:none;background:transparent;color:#999;font-size:20px;cursor:pointer;">&times;</button>
      </div>
    `;
  });

  if(container) container.innerHTML = html;
  if(countBadge) countBadge.innerText = totalQty;
  
  // 2. Totales
  if(subTotalEl) subTotalEl.innerText = money(subtotal);
  if(shipTotalEl) shipTotalEl.innerText = shippingState.label;
  if(grandTotalEl) grandTotalEl.innerText = money(subtotal + shippingState.cost);
}

/* ================= CHECKOUT ================= */

window.checkout = async () => {
  const btn = $("checkoutBtn");
  
  if (cart.length === 0) return toast("Tu carrito está vacío");

  // Validaciones usando tus IDs
  const mode = shippingState.mode;
  const name = $("name")?.value.trim();
  const addr = $("addr")?.value.trim();
  const cp = $("cp")?.value.trim();

  if (mode === "tj" || mode === "mx") {
    if (!name || !addr || !cp) {
      return toast("Faltan datos de envío (Nombre, Calle, CP)");
    }
    if (mode === "mx" && cp.length < 5) {
      return toast("El Código Postal debe ser de 5 dígitos");
    }
  }

  btn.disabled = true;
  btn.innerText = "Procesando...";

  try {
    const payload = {
      items: cart,
      mode: mode, // 'pickup', 'tj', 'mx'
      customer: {
        name: name || "Cliente Mostrador",
        address: addr || "Tienda",
        postal_code: cp || "22000"
      }
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error al iniciar pago");
    }

  } catch (err) {
    console.error(err);
    toast("Error: " + err.message);
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA";
  }
};

// UI Helpers (Manteniendo los tuyos)
window.scrollToId = (id) => {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.toast = (msg) => {
  const t = $("toast");
  if(t) {
    t.innerText = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  } else {
    alert(msg);
  }
};

window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

// Iniciar
init();
