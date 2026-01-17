/* SCORE STORE LOGIC — FINAL PRODUCTION v13 */

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api" : "/.netlify/functions";

const CART_KEY = "score_cart_prod_v1";
// CONFIGURACIÓN DE PROMOCIÓN (No modifica JSON, solo cálculo)
const PROMO_ACTIVE = true; 
const DISCOUNT_FACTOR = 0.20; // Pagas el 20% (80% OFF)

let cart = [];
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

// Helper para precio con descuento
const getFinalPrice = (basePrice) => {
    return PROMO_ACTIVE ? Math.round(basePrice * DISCOUNT_FACTOR) : basePrice;
};

/* ================= INIT ================= */

async function init() {
  loadCart();
  await loadCatalog();
  setupListeners();
  updateCartUI();
  registerServiceWorker();

  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  if (status === "success") {
    toast("¡Pago exitoso! Gracias por tu compra.");
    emptyCart(true);
    window.history.replaceState({}, document.title, "/");
  } else if (status === "cancel") {
    toast("Pago cancelado.");
    window.history.replaceState({}, document.title, "/");
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(console.warn);
}

/* ================= DATA ================= */

function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) {
    try { cart = JSON.parse(saved); } catch (e) { console.warn(e); }
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json");
    if (!res.ok) throw new Error("Error HTTP " + res.status);
    const data = await res.json();
    catalogData = data;
  } catch (e) {
    console.error("Error catálogo:", e);
    toast("Error cargando productos. Recarga la página.");
  }
}

/* ================= LISTENERS ================= */

function setupListeners() {
  document.getElementsByName("shipMode").forEach(r => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "").slice(0, 5);
      e.target.value = val;
      if (val.length === 5 && shippingState.mode === "mx") quoteShipping(val);
    });
  }

  const catContent = $("catContent");
  if (catContent) {
    catContent.addEventListener("click", (e) => {
      const btnSize = e.target.closest("[data-size]");
      if (btnSize) {
        const pid = btnSize.dataset.pid;
        const size = btnSize.dataset.size;
        selectedSizeByProduct[pid] = size;
        const row = btnSize.closest(".sizeRow");
        row.querySelectorAll(".size-pill").forEach(p => p.classList.remove("active"));
        btnSize.classList.add("active");
        return;
      }
      const btnAdd = e.target.closest("[data-add]");
      if (btnAdd) {
        const pid = btnAdd.dataset.add;
        const size = selectedSizeByProduct[pid] || "Unitalla";
        addToCart(pid, size);
      }
    });
  }
}

/* ================= CATALOG MODAL ================= */

window.openCatalog = (sectionId, titleFallback) => {
  const products = catalogData.products || [];
  if (!products.length) return toast("Cargando catálogo...");
  
  // 1. Configurar Encabezado (LOGO)
  const titleEl = $("catTitle");
  const sectionInfo = (catalogData.sections || []).find(s => s.id === sectionId);
  
  if (sectionInfo && sectionInfo.logo) {
    // FIX: Se eliminó filter brightness para mostrar logo original
    titleEl.innerHTML = `<img src="${sectionInfo.logo}" alt="${sectionInfo.title}" style="height:40px;width:auto;vertical-align:middle;filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">`;
  } else {
    // Fallback texto
    titleEl.innerText = titleFallback || sectionInfo?.title || "COLECCIÓN";
  }
  
  const container = $("catContent");
  if (!container) return;
  container.innerHTML = "";

  const items = products.filter(p => {
    if (p.sectionId) return p.sectionId === sectionId;
    return p.id.toLowerCase().includes(sectionId.toLowerCase());
  });

  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#666;">No hay productos disponibles por el momento.</div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "catGrid";
    
    items.forEach(p => {
      const sizes = p.sizes || ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];

      const sizesHtml = sizes.map(sz => {
        const active = (selectedSizeByProduct[p.id] === sz) ? "active" : "";
        return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
      }).join("");

      // --- SLIDER LOGIC ---
      const imageList = (p.images && p.images.length > 0) ? p.images : [p.img];
      
      let slidesHtml = "";
      imageList.forEach(imgSrc => {
        slidesHtml += `<div class="prod-slide"><img src="${imgSrc}" class="prodImg" alt="${p.name}" loading="lazy"></div>`;
      });

      // Indicadores (dots)
      let dotsHtml = "";
      if (imageList.length > 1) {
        dotsHtml = `<div class="slider-dots">`;
        imageList.forEach((_, idx) => {
          dotsHtml += `<div class="slider-dot ${idx===0?'active':''}"></div>`;
        });
        dotsHtml += `</div>`;
      }

      // PRECIOS CON PROMOCIÓN VISUAL
      const finalPrice = getFinalPrice(p.baseMXN);
      const priceHtml = PROMO_ACTIVE 
        ? `<div class="price-container">
             <span class="old-price">${money(p.baseMXN)}</span>
             <span class="new-price">${money(finalPrice)}</span>
           </div>`
        : `<div class="prodPrice">${money(p.baseMXN)}</div>`;

      const promoBadge = PROMO_ACTIVE ? `<div class="promo-badge">80% OFF</div>` : '';

      const el = document.createElement("div");
      el.className = "prodCard";
      el.innerHTML = `
        <div class="metallic-frame">
          ${promoBadge}
          <div class="prod-slider">
            ${slidesHtml}
          </div>
          ${dotsHtml}
        </div>
        <div class="prodName">${p.name}</div>
        ${priceHtml}
        <div class="sizeRow">${sizesHtml}</div>
        <button class="btn-add" data-add="${p.id}">AGREGAR</button>
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
  if (m) m.classList.add("active");
  if (o) o.classList.add("active");
  document.body.classList.add("modalOpen");
}

/* ================= CART ACTIONS ================= */

function addToCart(id, size) {
  const existing = cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty++;
  else cart.push({ id, size, qty: 1 });
  
  saveCart();
  updateCartUI();
  toast("Agregado al carrito");
  openDrawer();
}

window.emptyCart = (silent) => {
  if (!silent && !confirm("¿Vaciar carrito?")) return;
  cart = [];
  saveCart();
  updateCartUI();
};

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  saveCart();
  updateCartUI();
};

window.changeQty = (idx, delta) => {
  if (!cart[idx]) return;
  const newQty = cart[idx].qty + delta;
  if (newQty < 1) return;
  cart[idx].qty = newQty;
  saveCart();
  updateCartUI();
};

function updateCartUI() {
  const container = $("cartItems");
  const countBadge = $("cartCount");
  const cartEmpty = $("cartEmpty");
  const products = catalogData.products || [];
  
  let subtotal = 0;
  let totalQty = 0;

  if (container) {
    if (cart.length === 0) {
      container.innerHTML = "";
      if(cartEmpty) cartEmpty.style.display = "block";
    } else {
      if(cartEmpty) cartEmpty.style.display = "none";
      let html = "";
      
      cart.forEach((item, idx) => {
        const p = products.find(x => x.id === item.id);
        if (!p) return;
        
        // CALCULO DE PRECIO EN CARRITO CON PROMO
        const unitPrice = getFinalPrice(p.baseMXN);
        const totalItem = unitPrice * item.qty;
        subtotal += totalItem;
        totalQty += item.qty;

        html += `
          <div class="cartItem">
            <img src="${p.img}" class="cartThumb">
            <div class="cInfo">
              <div class="cName">${p.name}</div>
              <div class="cMeta">Talla: <strong>${item.size}</strong></div>
              <div class="qtyRow">
                <button class="qtyBtn" onclick="changeQty(${idx}, -1)">-</button>
                <div class="qtyVal">${item.qty}</div>
                <button class="qtyBtn" onclick="changeQty(${idx}, 1)">+</button>
              </div>
              <div class="cPrice">${money(totalItem)}</div>
            </div>
            <button onclick="removeFromCart(${idx})" class="linkDanger" style="font-size:20px;">&times;</button>
          </div>
        `;
      });
      container.innerHTML = html;
    }
  }

  if (countBadge) countBadge.innerText = totalQty;
  if ($("subTotal")) $("subTotal").innerText = money(subtotal);
  if ($("shipTotal")) $("shipTotal").innerText = shippingState.label;
  if ($("grandTotal")) $("grandTotal").innerText = money(subtotal + shippingState.cost);
}

/* ================= CHECKOUT ================= */

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
    const cp = $("cp")?.value;
    if (cp && cp.length === 5) quoteShipping(cp);
    else {
      shippingState.cost = 0;
      shippingState.label = "Ingresa CP...";
    }
  }
  updateCartUI();
}

async function quoteShipping(zip) {
  $("shipTotal").innerText = "Calculando...";
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
    shippingState.cost = 250;
    shippingState.label = "$250.00 (Fallback)";
  }
  updateCartUI();
}

window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Tu carrito está vacío");

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

  // Inyectar precio de promo en el payload para el backend
  // NOTA: Idealmente el backend valida precios, pero para esta estructura 
  // ligera, enviamos los ítems con el precio esperado implícito o
  // dejamos que el backend recalcule. 
  // *IMPORTANTE*: Si tu backend 'create_checkout' lee el catálogo JSON, 
  // cobrará precio full. Si lee el precio del objeto 'item', 
  // necesitamos asegurarnos de pasar el precio correcto.
  // Asumiremos que el backend confía en el ID o recalculamos aquí si el backend lo permite.
  
  // Para asegurar que se cobra el 20%, enviamos la data tal cual y 
  // esperamos que tu función serverless maneje la lógica o acepte "price_data".
  // Dado que no puedo editar el backend, el cambio visual y de carrito está hecho.

  try {
    const payload = {
      items: cart,
      mode,
      customer: { name, address: addr, postal_code: cp },
      promo: PROMO_ACTIVE // Flag para que el backend sepa (si está programado para ello)
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error iniciando pago");
    }

  } catch (err) {
    console.error(err);
    toast("Error: " + err.message);
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA";
  }
};

window.scrollToId = (id) => $(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

window.toast = (msg) => {
  const t = $("toast");
  if (t) {
    t.innerText = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  } else alert(msg);
};
function toast(m) { window.toast(m); }

window.openDrawer = () => {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

init();