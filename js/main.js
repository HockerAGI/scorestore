/* SCORE STORE LOGIC — Production (Netlify Static + Functions)
   - Catálogo: /data/catalog.json
   - Functions: /.netlify/functions/*
   - Local dev (Netlify CLI): /api/* redirige a functions
*/

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api"
  : "/.netlify/functions";

const CART_KEY = "score_cart_prod_v1";

let cart = [];
let catalogProducts = [];
let catalogSections = [];
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {}; // { [productId]: "M" }

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

/* ================= INIT ================= */

async function init() {
  loadCart();
  await loadCatalog();
  setupListeners();
  updateCartUI();
  registerServiceWorker();

  // Feedback post-checkout (Stripe redirect)
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
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("SW registration failed:", err);
  });
}

/* ================= DATA ================= */

function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) cart = parsed;
  } catch (e) {
    console.warn("Cart parse error:", e);
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Catálogo no disponible (${res.status})`);
    const data = await res.json();
    catalogProducts = Array.isArray(data.products) ? data.products : [];
    catalogSections = Array.isArray(data.sections) ? data.sections : [];
  } catch (e) {
    console.error("Error cargando catálogo:", e);
    toast("No se pudo cargar el catálogo.");
    catalogProducts = [];
    catalogSections = [];
  }
}

/* ================= UI LISTENERS ================= */

function setupListeners() {
  // Shipping radios
  const radios = document.getElementsByName("shipMode");
  Array.from(radios || []).forEach(r => r.addEventListener("change", (e) => handleShipModeChange(e.target.value)));

  // CP input (solo dígitos + autcotiza)
  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      const val = (e.target.value || "").replace(/\D/g, "").slice(0, 5);
      e.target.value = val;
      if (val.length === 5 && shippingState.mode === "mx") quoteShipping(val);
    });
  }

  // Delegación de eventos para catálogo (tallas + add)
  const catContent = $("catContent");
  if (catContent) {
    catContent.addEventListener("click", (e) => {
      const btnSize = e.target.closest?.("[data-size]");
      if (btnSize) {
        const pid = btnSize.getAttribute("data-pid");
        const size = btnSize.getAttribute("data-size");
        if (!pid || !size) return;

        selectedSizeByProduct[pid] = size;

        // activar visualmente
        const row = btnSize.closest(".sizeRow");
        if (row) row.querySelectorAll(".size-pill").forEach(p => p.classList.remove("active"));
        btnSize.classList.add("active");
        return;
      }

      const btnAdd = e.target.closest?.("[data-add]");
      if (btnAdd) {
        const pid = btnAdd.getAttribute("data-add");
        if (!pid) return;
        const size = selectedSizeByProduct[pid] || "Unitalla";
        addToCart(pid, size);
      }
    });
  }
}

/* ================= CATALOG MODAL ================= */

window.openCatalog = (sectionId, title) => {
  if (!catalogProducts || catalogProducts.length === 0) return toast("Cargando productos...");

  const titleEl = $("catTitle");
  if (titleEl) titleEl.innerText = title || "COLECCIÓN";

  const container = $("catContent");
  if (!container) return;

  container.innerHTML = "";

  const items = catalogProducts.filter(p => {
    if (!p) return false;
    if (p.sectionId) return String(p.sectionId) === String(sectionId);
    // fallback por si llega otro esquema
    const pId = String(p.id || "").toLowerCase();
    return pId.includes(String(sectionId || "").toLowerCase());
  });

  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;width:100%;">
        <p style="color:#666;">No se encontraron productos disponibles en esta colección por el momento.</p>
      </div>
    `;
    openModal("modalCatalog");
    return;
  }

  const grid = document.createElement("div");
  grid.className = "catGrid";

  items.forEach(p => {
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
    if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];

    const sizesHtml = sizes.map(sz => {
      const active = (selectedSizeByProduct[p.id] === sz) ? "active" : "";
      return `<button class="size-pill ${active}" type="button" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
    }).join("");

    const el = document.createElement("div");
    el.className = "prodCard";
    el.innerHTML = `
      <div class="metallic-frame">
        <img src="${p.img}" class="prodImg" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.opacity=0.2">
      </div>

      <div class="prodName">${escapeHtml(p.name)}</div>
      <div class="prodPrice">${money(p.baseMXN)}</div>

      <div class="sizeRow" aria-label="Tallas">${sizesHtml}</div>

      <button class="btn-add" type="button" data-add="${p.id}">AGREGAR AL CARRITO</button>
    `;
    grid.appendChild(el);
  });

  container.appendChild(grid);
  openModal("modalCatalog");
};

window.openLegal = (section) => {
  document.querySelectorAll(".legalBlock").forEach(b => (b.style.display = "none"));
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

/* ================= CART ================= */

function addToCart(id, size) {
  const safeSize = String(size || "Unitalla");
  const existing = cart.find(i => i.id === id && i.size === safeSize);
  if (existing) existing.qty++;
  else cart.push({ id, size: safeSize, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado al carrito");
  openDrawer();
}

window.addToCart = (id, size) => addToCart(id, size);

window.emptyCart = (silent) => {
  if (!silent && !confirm("¿Vaciar carrito?")) return;
  cart = [];
  saveCart();
  updateCartUI();
};

window.removeFromCart = (index) => {
  cart.splice(index, 1);
  saveCart();
  updateCartUI();
};

window.changeQty = (index, delta) => {
  const item = cart[index];
  if (!item) return;
  item.qty = Math.max(1, (parseInt(item.qty, 10) || 1) + delta);
  saveCart();
  updateCartUI();
};

function updateCartUI() {
  const container = $("cartItems");
  const countBadge = $("cartCount");
  const cartEmpty = $("cartEmpty");
  const subTotalEl = $("subTotal");
  const shipTotalEl = $("shipTotal");
  const grandTotalEl = $("grandTotal");

  let subtotal = 0;
  let totalQty = 0;

  if (container) {
    if (cart.length === 0) {
      container.innerHTML = "";
      if (cartEmpty) cartEmpty.style.display = "block";
    } else {
      if (cartEmpty) cartEmpty.style.display = "none";
      let html = "";

      cart.forEach((item, idx) => {
        const p = catalogProducts.find(x => x.id === item.id);
        if (!p) return;

        const qty = Math.max(1, parseInt(item.qty, 10) || 1);
        const totalItem = (Number(p.baseMXN) || 0) * qty;

        subtotal += totalItem;
        totalQty += qty;

        html += `
          <div class="cartItem">
            <img src="${p.img}" class="cartThumb" alt="${escapeHtml(p.name)}" onerror="this.style.opacity=0.2">
            <div class="cInfo">
              <div class="cName">${escapeHtml(p.name)}</div>
              <div class="cMeta">Talla: <strong>${escapeHtml(item.size || "Unitalla")}</strong></div>

              <div class="qtyRow" aria-label="Cantidad">
                <button class="qtyBtn" type="button" onclick="changeQty(${idx},-1)">−</button>
                <div class="qtyVal">${qty}</div>
                <button class="qtyBtn" type="button" onclick="changeQty(${idx},1)">+</button>
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

  if (countBadge) countBadge.innerText = String(totalQty);
  if (subTotalEl) subTotalEl.innerText = money(subtotal);
  if (shipTotalEl) shipTotalEl.innerText = shippingState.label;
  if (grandTotalEl) grandTotalEl.innerText = money(subtotal + (Number(shippingState.cost) || 0));
}

/* ================= SHIPPING ================= */

function handleShipModeChange(mode) {
  shippingState.mode = mode;
  const form = $("shipForm");
  if (form) form.style.display = (mode === "pickup") ? "none" : "block";

  if (mode === "pickup") {
    shippingState.cost = 0;
    shippingState.label = "Gratis (Fábrica)";
    updateCartUI();
    return;
  }

  if (mode === "tj") {
    shippingState.cost = 200;
    shippingState.label = `${money(200)} (Local TJ)`;
    updateCartUI();
    return;
  }

  // mode === "mx"
  const currentCP = ($("cp")?.value || "").trim();
  if (currentCP && currentCP.length === 5) {
    quoteShipping(currentCP);
  } else {
    shippingState.cost = 0;
    shippingState.label = "Ingresa CP para cotizar";
    updateCartUI();
  }
}

async function quoteShipping(zip) {
  const labelEl = $("shipTotal");
  if (labelEl) labelEl.innerText = "Calculando...";

  try {
    const qty = cart.reduce((acc, i) => acc + (parseInt(i.qty, 10) || 1), 0) || 1;

    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, items: qty })
    });

    const data = await res.json();

    if (data && Number.isFinite(Number(data.cost))) {
      shippingState.cost = Number(data.cost);
      shippingState.label = data.label ? `${money(shippingState.cost)} · ${data.label}` : money(shippingState.cost);
    } else {
      shippingState.cost = 250;
      shippingState.label = `${money(250)} (Estándar)`;
    }
  } catch (e) {
    console.error(e);
    shippingState.cost = 250;
    shippingState.label = `${money(250)} (Estándar)`;
  }

  updateCartUI();
}

/* ================= CHECKOUT ================= */

window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (!btn) return;

  if (cart.length === 0) return toast("Carrito vacío");

  const mode = shippingState.mode;
  const name = ($("name")?.value || "").trim();
  const addr = ($("addr")?.value || "").trim();
  const cp = ($("cp")?.value || "").trim();

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Completa los datos de envío");
    if (mode === "mx" && cp.length < 5) return toast("CP inválido");
    if (mode === "mx" && (!shippingState.cost || shippingState.cost <= 0)) return toast("Primero cotiza tu envío (CP).");
  }

  btn.disabled = true;
  const originalText = btn.innerText;
  btn.innerText = "Procesando...";

  try {
    const payload = {
      items: cart,
      mode,
      customer: { name, address: addr, postal_code: cp }
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error(data?.error || "No se pudo iniciar el pago.");
  } catch (err) {
    console.error(err);
    toast("Error: " + (err.message || "desconocido"));
    btn.disabled = false;
    btn.innerText = originalText || "PAGAR AHORA";
  }
};

/* ================= UTILS ================= */

window.scrollToId = (id) => {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.toast = (msg) => {
  const t = $("toast");
  if (t) {
    t.innerText = String(msg || "OK");
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  } else {
    alert(msg);
  }
};

function toast(msg) { window.toast(msg); }

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= DRAWER & OVERLAY ================= */

window.openDrawer = () => openDrawer();
function openDrawer() {
  const d = $("drawer");
  const o = $("overlay");
  if (d) d.classList.add("active");
  if (o) o.classList.add("active");
  document.body.classList.add("modalOpen");
}

window.closeAll = () => {
  // NO limpiar clases .active globalmente (para no romper pills/estados internos)
  const overlay = $("overlay");
  const modalCatalog = $("modalCatalog");
  const legalModal = $("legalModal");
  const drawer = $("drawer");

  overlay?.classList.remove("active");
  modalCatalog?.classList.remove("active");
  legalModal?.classList.remove("active");
  drawer?.classList.remove("active");

  document.body.classList.remove("modalOpen");
};

// Start
init();