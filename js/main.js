/* SCORE STORE LOGIC — FINAL UNIFIED v3 */

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api"
  : "/.netlify/functions";

const CART_KEY = "score_cart_final_v20";
let cart = [];
let catalog = [];
// Estado local de envío
let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

/* ================= INIT ================= */

async function init() {
  loadCart();
  await loadCatalog();
  updateCartUI();
  setupListeners();
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

function setupListeners() {
  // Radio Buttons de Envío
  const radios = document.getElementsByName("shipMode");
  radios.forEach(r => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

  // Input CP
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

/* ================= CATALOG & UI ACTIONS ================= */

// ESTA FUNCIÓN FALTABA Y ROMPÍA LOS BOTONES DE COLECCIÓN
window.openCatalog = (tag, title) => {
  if (!catalog || catalog.length === 0) return toast("Cargando catálogo...");
  
  const titleEl = $("catTitle");
  if (titleEl) titleEl.innerText = title || "PRODUCTOS";
  
  const container = $("catContent");
  if (container) {
    container.innerHTML = "";
    
    // Filtrar productos que coincidan con la etiqueta (en ID, categoría o nombre)
    const tagLower = tag.toLowerCase();
    const items = catalog.filter(p => {
      const idMatch = p.id && p.id.toLowerCase().includes(tagLower);
      const catMatch = p.category && p.category.toLowerCase() === tagLower;
      return idMatch || catMatch;
    });

    if (items.length === 0) {
      container.innerHTML = "<p style='text-align:center;padding:20px;'>Próximamente stock disponible.</p>";
    } else {
      // Renderizar Grid
      const grid = document.createElement("div");
      grid.className = "catGrid";
      
      items.forEach(p => {
        const el = document.createElement("div");
        el.className = "prodCard";
        el.innerHTML = `
          <div class="metallic-frame">
            <img src="${p.img}" class="prodImg" alt="${p.name}" loading="lazy">
          </div>
          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>
          <div class="sizeRow">
            <div class="size-pill active">Unitalla</div>
          </div>
          <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
        `;
        grid.appendChild(el);
      });
      container.appendChild(grid);
    }
  }

  openModal("modalCatalog");
};

// ESTA FUNCIÓN FALTABA Y ROMPÍA EL FOOTER
window.openLegal = (section) => {
  // Ocultar todos los bloques primero
  document.querySelectorAll(".legalBlock").forEach(b => b.style.display = "none");
  
  // Mostrar el seleccionado
  const block = document.querySelector(`.legalBlock[data-legal-block="${section}"]`);
  if (block) block.style.display = "block";
  
  openModal("legalModal");
};

function openModal(modalId) {
  const modal = $(modalId);
  const overlay = $("overlay"); // Busca el ID "overlay"
  
  if(modal) modal.classList.add("active");
  if(overlay) overlay.classList.add("active");
  
  document.body.classList.add("modalOpen");
}

/* ================= SHIPPING LOGIC ================= */

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  const form = $("shipForm");

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
  let size = "Unitalla";
  // Si hubiera selectores de talla en el futuro:
  const sizeSel = document.querySelector(`select[data-product-id="${id}"]`);
  if (sizeSel) size = sizeSel.value;
  if (sizeOverride) size = sizeOverride;

  const existing = cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado al carrito");
  window.openDrawer();
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
  const countBadge = $("cartCount");
  const cartEmpty = $("cartEmpty");
  const subTotalEl = $("subTotal");
  const shipTotalEl = $("shipTotal");
  const grandTotalEl = $("grandTotal");

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
        <div style="width:60px;height:60px;background:#f4f4f4;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            <img src="${p.img}" style="max-width:100%;max-height:100%;">
        </div>
        <div style="flex:1;">
          <h4 style="font-size:14px;margin:0 0 4px;color:#000;">${p.name}</h4>
          <p style="font-size:12px;color:#666;margin:0;">Cant: ${item.qty}</p>
          <div style="font-weight:bold;font-size:14px;color:#E10600;">${money(totalItem)}</div>
        </div>
        <button onclick="removeFromCart(${idx})" style="border:none;background:transparent;color:#999;font-size:24px;cursor:pointer;align-self:flex-start;">&times;</button>
      </div>
    `;
  });

  if(container) container.innerHTML = html;
  if(countBadge) countBadge.innerText = totalQty;
  
  if(subTotalEl) subTotalEl.innerText = money(subtotal);
  if(shipTotalEl) shipTotalEl.innerText = shippingState.label;
  if(grandTotalEl) grandTotalEl.innerText = money(subtotal + shippingState.cost);
}

/* ================= CHECKOUT ================= */

window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Tu carrito está vacío");

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
      mode: mode, 
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

/* ================= UTILS ================= */

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
  const d = $("drawer");
  const o = $("overlay"); // Busca el ID "overlay"
  
  if(d) d.classList.add("active");
  if(o) o.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

// Iniciar app
init();