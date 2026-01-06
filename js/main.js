/* SCORE STORE LOGIC — FINAL PRODUCTION (Netlify Static + Functions)
   Frontend: /index.html + /css/styles.css + /js/main.js
   Data:     /data/catalog.json + /data/promos.json
   Backend:  /.netlify/functions/*  (Netlify Functions)
*/

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api" // Netlify Dev proxy
  : "/.netlify/functions";

const CART_KEY = "score_cart_prod_v1";

let cart = [];
let catalogProducts = [];
let catalogSections = [];

let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };
let selectedSizeByProduct = {}; // { [productId]: "M" }

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

/* ================= INIT ================= */

async function init() {
  loadCart();
  await loadCatalog();

  setupListeners();
  markEmptyCollections();
  syncShipUIFromState();

  updateCartUI();
  registerServiceWorker();

  // Stripe redirect feedback
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
  navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW registration failed:", err));
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

    // Preparar talla default por producto
    catalogProducts.forEach((p) => {
      if (!p?.id) return;
      const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];
    });
  } catch (e) {
    console.error("Error cargando catálogo:", e);
    toast("No se pudo cargar el catálogo.");
    catalogProducts = [];
    catalogSections = [];
  }
}

/* ================= LISTENERS ================= */

function setupListeners() {
  // Shipping radios
  Array.from(document.getElementsByName("shipMode") || []).forEach((r) => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

  // CP input (solo dígitos + autcotiza si es nacional)
  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      const val = String(e.target.value || "").replace(/\D/g, "").slice(0, 5);
      e.target.value = val;

      if (val.length === 5 && shippingState.mode === "mx") {
        quoteShipping(val);
      } else if (shippingState.mode === "mx") {
        shippingState.cost = 0;
        shippingState.label = "Ingresa CP para cotizar";
        updateCartUI();
      }
    });
  }

  // Delegación de eventos para catálogo (tallas + add)
  const catContent = $("catContent");
  if (catContent) {
    catContent.addEventListener("click", (e) => {
      const sizeBtn = e.target.closest?.("[data-size]");
      if (sizeBtn) {
        const pid = sizeBtn.getAttribute("data-pid");
        const size = sizeBtn.getAttribute("data-size");
        if (!pid || !size) return;

        selectedSizeByProduct[pid] = size;

        // Active state en pills
        const row = sizeBtn.closest(".sizeRow");
        if (row) row.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
        sizeBtn.classList.add("active");
        return;
      }

      const addBtn = e.target.closest?.("[data-add]");
      if (addBtn) {
        const pid = addBtn.getAttribute("data-add");
        if (!pid) return;
        const size = selectedSizeByProduct[pid] || "Unitalla";
        addToCart(pid, size);
      }
    });
  }
}

/* ================= COLLECTIONS (AUTO) ================= */

function markEmptyCollections() {
  // Mapa: sectionId -> count
  const counts = {};
  catalogProducts.forEach((p) => {
    const sid = String(p.sectionId || "");
    if (!sid) return;
    counts[sid] = (counts[sid] || 0) + 1;
  });

  document.querySelectorAll(".champItem[data-section]").forEach((el) => {
    const sid = el.getAttribute("data-section");
    const n = counts[sid] || 0;
    const cta = el.querySelector(".card-btn[data-cta]");

    if (n <= 0) {
      el.classList.add("is-disabled");
      if (cta) cta.textContent = "PRÓXIMAMENTE";

      // Si tenía onclick inline, lo anulamos (sin tocar HTML a mano luego)
      el.removeAttribute("onclick");
      el.onclick = () => toast("Próximamente 🔥");
    } else {
      el.classList.remove("is-disabled");
      if (cta) cta.textContent = "VER PRODUCTOS";
    }
  });
}

/* ================= MODALS / DRAWER ================= */

function openModal(id) {
  const m = $(id);
  const o = $("overlay");
  if (m) m.classList.add("active");
  if (o) o.classList.add("active");
  document.body.classList.add("modalOpen");
}

window.closeAll = () => {
  $("overlay")?.classList.remove("active");
  $("modalCatalog")?.classList.remove("active");
  $("legalModal")?.classList.remove("active");
  $("drawer")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
};

window.openDrawer = () => {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.openLegal = (section) => {
  document.querySelectorAll(".legalBlock").forEach((b) => (b.style.display = "none"));
  const block = document.querySelector(`.legalBlock[data-legal-block="${section}"]`);
  if (block) block.style.display = "block";
  openModal("legalModal");
};

/* ================= CATALOG MODAL ================= */

window.openCatalog = (sectionId, title) => {
  if (!catalogProducts || catalogProducts.length === 0) return toast("Cargando productos...");

  const titleEl = $("catTitle");
  if (titleEl) titleEl.innerText = title || "COLECCIÓN";

  const container = $("catContent");
  if (!container) return;
  container.innerHTML = "";

  const items = catalogProducts.filter((p) => String(p.sectionId || "") === String(sectionId || ""));

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

  items.forEach((p) => {
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
    const currentSize = selectedSizeByProduct[p.id] || sizes[0];

    const sizesHtml = sizes
      .map((sz) => {
        const active = currentSize === sz ? "active" : "";
        return `<button class="size-pill ${active}" type="button" data-pid="${escapeHtml(p.id)}" data-size="${escapeHtml(sz)}">${escapeHtml(sz)}</button>`;
      })
      .join("");

    const card = document.createElement("div");
    card.className = "prodCard";
    card.innerHTML = `
      <div class="metallic-frame">
        <img src="${p.img}" class="prodImg" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.opacity=0.2">
      </div>

      <div class="prodName">${escapeHtml(p.name)}</div>
      <div class="prodPrice">${money(p.baseMXN)}</div>

      <div class="sizeRow" aria-label="Tallas">${sizesHtml}</div>

      <button class="btn-add" type="button" data-add="${escapeHtml(p.id)}">AGREGAR AL CARRITO</button>
    `;
    grid.appendChild(card);
  });

  container.appendChild(grid);
  openModal("modalCatalog");
};

/* ================= CART ================= */

function addToCart(id, size) {
  const safeId = String(id || "");
  const safeSize = String(size || "Unitalla");

  const existing = cart.find((i) => i.id === safeId && i.size === safeSize);
  if (existing) existing.qty++;
  else cart.push({ id: safeId, size: safeSize, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado al carrito");
  window.openDrawer();
}

window.addToCart = (id) => addToCart(id, selectedSizeByProduct[id] || "Unitalla");

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
        const p = catalogProducts.find((x) => x.id === item.id);
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

  if (mode === "pickup") {
    shippingState.cost = 0;
    shippingState.label = "Gratis";
  } else if (mode === "tj") {
    shippingState.cost = 200;
    shippingState.label = `${money(200)}`;
  } else if (mode === "mx") {
    const cp = String($("cp")?.value || "").trim();
    shippingState.cost = 0;
    shippingState.label = cp && cp.length === 5 ? "Calculando..." : "Ingresa CP para cotizar";
    if (cp && cp.length === 5) quoteShipping(cp);
  }

  syncShipUIFromState();
  updateCartUI();
}

function syncShipUIFromState() {
  const form = $("shipForm");
  if (form) form.style.display = shippingState.mode === "pickup" ? "none" : "block";
}

async function quoteShipping(zip) {
  try {
    const qty = cart.reduce((acc, i) => acc + (parseInt(i.qty, 10) || 1), 0) || 1;

    shippingState.label = "Calculando...";
    updateCartUI();

    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, items: qty })
    });

    const data = await res.json().catch(() => ({}));

    if (data && Number.isFinite(Number(data.cost))) {
      shippingState.cost = Number(data.cost);
      shippingState.label = data.label ? `${money(shippingState.cost)} · ${data.label}` : money(shippingState.cost);
    } else {
      shippingState.cost = 250;
      shippingState.label = `${money(250)} · Estándar`;
    }
  } catch (e) {
    console.error("quoteShipping error:", e);
    shippingState.cost = 250;
    shippingState.label = `${money(250)} · Estándar`;
  }

  updateCartUI();
}

/* ================= CHECKOUT ================= */

window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (!btn) return;

  if (cart.length === 0) return toast("Carrito vacío");

  const mode = shippingState.mode;
  const name = String($("name")?.value || "").trim();
  const addr = String($("addr")?.value || "").trim();
  const cp = String($("cp")?.value || "").trim();

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Completa los datos de envío");
    if (mode === "mx" && cp.length < 5) return toast("CP inválido");
    if (mode === "mx" && (!shippingState.cost || shippingState.cost <= 0)) return toast("Cotiza el envío (CP) antes de pagar.");
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

    const data = await res.json().catch(() => ({}));

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error(data?.error || "No se pudo iniciar el pago.");
  } catch (err) {
    console.error("checkout error:", err);
    toast("Error: " + (err.message || "desconocido"));
    btn.disabled = false;
    btn.innerText = originalText || "PAGAR AHORA";
  }
};

/* ================= UTIL ================= */

window.scrollToId = (id) => {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.toast = (msg) => {
  const t = $("toast");
  if (!t) return alert(msg);
  t.textContent = String(msg || "");
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
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

// Start
init();