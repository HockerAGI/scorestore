/* SCORE STORE LOGIC — FINAL PRODUCTION v4 */

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api" // Proxy local
  : "/.netlify/functions"; // Producción

const CART_KEY = "score_cart_prod_v1";
let cart = [];
let catalog = [];
let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

/* ================= INIT ================= */

async function init() {
  loadCart();
  await loadCatalog();
  updateCartUI();
  setupListeners();
  
  // Check URL params for success/cancel toast
  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago exitoso! Gracias por tu compra.");
    emptyCart(true); // Vaciar carrito silenciosamente
    window.history.replaceState({}, document.title, "/");
  } else if (params.get("status") === "cancel") {
    toast("Pago cancelado.");
  }
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
    if(!res.ok) throw new Error("404");
    const data = await res.json();
    catalog = data.products || [];
  } catch (e) {
    console.error("Error cargando catálogo", e);
    toast("Error conectando con el servidor");
  }
}

function setupListeners() {
  const radios = document.getElementsByName("shipMode");
  radios.forEach(r => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

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

/* ================= UI ACTIONS (FIXED) ================= */

// Función corregida y robusta para coincidencia de etiquetas
window.openCatalog = (tag, title) => {
  if (!catalog || catalog.length === 0) return toast("Cargando productos...");
  
  const titleEl = $("catTitle");
  if (titleEl) titleEl.innerText = title || "COLECCIÓN";
  
  const container = $("catContent");
  if (!container) return;
  container.innerHTML = "";
  
  // Normalizar strings para mejor búsqueda (quitar _ y -)
  const cleanTag = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  const items = catalog.filter(p => {
    const pId = (p.id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const pCat = (p.category || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    
    // Coincidencia laxa
    return pId.includes(cleanTag) || pCat === cleanTag;
  });

  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;width:100%;">
      <p style="color:#666;">No se encontraron productos disponibles en esta colección por el momento.</p>
    </div>`;
  } else {
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
        <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR AL CARRITO</button>
      `;
      grid.appendChild(el);
    });
    container.appendChild(grid);
  }

  openModal("modalCatalog");
};

window.openLegal = (section) => {
  document.querySelectorAll(".legalBlock").forEach(b => b.style.display = "none");
  const block = document.querySelector(`.legalBlock[data-legal-block="${section}"]`);
  if (block) block.style.display = "block";
  openModal("legalModal");
};

function openModal(id) {
  const m = $(id);
  const o = $("overlay");
  if(m) m.classList.add("active");
  if(o) o.classList.add("active");
  document.body.classList.add("modalOpen");
}

/* ================= CART & SHIPPING ================= */

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  const form = $("shipForm");
  
  if (form) form.style.display = (mode === "pickup") ? "none" : "block";

  if (mode === "pickup") {
    shippingState.cost = 0;
    shippingState.label = "Gratis (Fábrica)";
  } else if (mode === "tj") {
    shippingState.cost = 200;
    shippingState.label = "$200.00 (Local)";
  } else if (mode === "mx") {
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
  const labelEl = $("shipTotal");
  if(labelEl) labelEl.innerText = "Calculando...";

  try {
    const qty = cart.reduce((acc, i) => acc + i.qty, 0);
    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      body: JSON.stringify({ zip, items: qty })
    });
    const data = await res.json();
    
    if (data.cost) {
      shippingState.cost = data.cost;
      shippingState.label = data.label || money(data.cost);
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

window.addToCart = (id) => {
  const size = "Unitalla"; // Simplificado por ahora
  const existing = cart.find(i => i.id === id && i.size === size);
  
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado al carrito");
  window.openDrawer();
};

window.emptyCart = (silent) => {
  if(!silent && !confirm("¿Vaciar carrito?")) return;
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

  // Calcular totales
  let subtotal = 0;
  let totalQty = 0;
  
  // Render
  if (container) {
    let html = "";
    if (cart.length === 0) {
      container.innerHTML = "";
      if(cartEmpty) cartEmpty.style.display = "block";
    } else {
      if(cartEmpty) cartEmpty.style.display = "none";
      cart.forEach((item, idx) => {
        const p = catalog.find(x => x.id === item.id);
        if (!p) return; // Si el producto ya no existe en catalogo, ignorarlo
        const totalItem = p.baseMXN * item.qty;
        subtotal += totalItem;
        totalQty += item.qty;

        html += `
          <div class="cartItem">
            <img src="${p.img}" class="cartThumb">
            <div class="cInfo">
              <div class="cName">${p.name}</div>
              <div class="cMeta">Cant: ${item.qty}</div>
              <div class="cPrice">${money(totalItem)}</div>
            </div>
            <button onclick="removeFromCart(${idx})" class="linkDanger" style="font-size:20px;">&times;</button>
          </div>
        `;
      });
      container.innerHTML = html;
    }
  }

  if(countBadge) countBadge.innerText = totalQty;
  if(subTotalEl) subTotalEl.innerText = money(subtotal);
  if(shipTotalEl) shipTotalEl.innerText = shippingState.label;
  if(grandTotalEl) grandTotalEl.innerText = money(subtotal + shippingState.cost);
}

/* ================= CHECKOUT ================= */

window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Carrito vacío");

  const mode = shippingState.mode;
  const name = $("name")?.value.trim();
  const addr = $("addr")?.value.trim();
  const cp = $("cp")?.value.trim();

  // Validación
  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Completa los datos de envío");
    if (mode === "mx" && cp.length < 5) return toast("CP inválido");
  }

  btn.disabled = true;
  btn.innerText = "Procesando...";

  try {
    const payload = {
      items: cart,
      mode: mode,
      customer: { name, address: addr, postal_code: cp }
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error desconocido");
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
  if(el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const o = $("overlay");
  if(d) d.classList.add("active");
  if(o) o.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

// Iniciar
init();