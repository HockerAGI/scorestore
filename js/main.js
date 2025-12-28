/* ======================================================
   SCORE STORE — MAIN JS (FINAL DEFINITIVO)
   - Carrito abre SIEMPRE
   - Overlay/Scroll-lock real (sin romper footer)
   - Catálogo por secciones desde /data/catalog.json
   - Shipping: pickup/tj fijo + mx cotiza (si tienes función)
   ====================================================== */

let CATALOG = null;
let CART = [];
let SHIPPING = {
  method: "",
  cost: 0,
  quoted: false,
  cp: "",
  addr: "",
  name: ""
};

const $ = (id) => document.getElementById(id);

function money(n) {
  return `$${Number(n || 0).toLocaleString("es-MX")} MXN`;
}

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

/* ===========================
   Catalog
=========================== */
async function loadCatalog() {
  if (CATALOG) return CATALOG;
  const res = await fetch("/data/catalog.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar catalog.json");
  CATALOG = await res.json();
  return CATALOG;
}

/* ===========================
   Scroll lock REAL
=========================== */
function lockScroll() {
  const y = window.scrollY || 0;
  document.body.dataset.scrollY = String(y);
  document.body.style.top = `-${y}px`;
  document.body.classList.add("modalOpen");
}

function unlockScroll() {
  const y = Number(document.body.dataset.scrollY || "0");
  document.body.classList.remove("modalOpen");
  document.body.style.top = "";
  window.scrollTo(0, y);
  document.body.dataset.scrollY = "0";
}

/* ===========================
   Overlay / Drawer / Modal
=========================== */
function openOverlay() {
  $("overlay")?.classList.add("active");
  lockScroll();
}

function closeOverlay() {
  $("overlay")?.classList.remove("active");
  unlockScroll();
}

function openDrawer() {
  $("drawer")?.classList.add("active");
  $("drawer")?.setAttribute("aria-hidden", "false");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "true");
  openOverlay();
}

function closeDrawer() {
  $("drawer")?.classList.remove("active");
  $("drawer")?.setAttribute("aria-hidden", "true");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "false");
}

function openModal(modalId) {
  $(modalId)?.classList.add("active");
  $(modalId)?.setAttribute("aria-hidden", "false");
  openOverlay();
}

function closeModal(modalId) {
  $(modalId)?.classList.remove("active");
  $(modalId)?.setAttribute("aria-hidden", "true");
}

function closeAll() {
  closeDrawer();
  closeModal("modalCatalog");
  closeOverlay();
}

/* ===========================
   Smooth scroll
=========================== */
function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===========================
   Catalog view
=========================== */
async function openCatalog(sectionId, title) {
  const data = await loadCatalog();

  $("catTitle").textContent = title || "CATÁLOGO";
  const wrap = $("catContent");
  wrap.innerHTML = `<div class="cat-intro">Selecciona tu talla y agrega al carrito.</div>`;

  const products = data.products.filter(p => p.sectionId === sectionId);
  const grouped = {};

  products.forEach(p => {
    grouped[p.subSection] ||= [];
    grouped[p.subSection].push(p);
  });

  Object.keys(grouped).forEach(sub => {
    const h = document.createElement("h4");
    h.className = "catSectionTitle";
    h.textContent = sub;
    wrap.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "catGrid";

    grouped[sub].forEach(p => {
      const card = document.createElement("div");
      card.className = "prodCard";

      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}" loading="lazy" decoding="async">
        <strong>${p.name}</strong>
        <div class="ux-note">${money(p.baseMXN)}</div>

        <select aria-label="Selecciona talla">
          ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>

        <button class="btn-sm" type="button">AGREGAR</button>
      `;

      const img = card.querySelector("img");
      img.addEventListener("load", () => img.classList.add("loaded"));

      const sel = card.querySelector("select");
      card.querySelector("button").onclick = () => addToCart(p, sel.value);

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  });

  openModal("modalCatalog");
}

/* ===========================
   Cart persistence
=========================== */
function saveCart() {
  try {
    localStorage.setItem("score_cart", JSON.stringify(CART));
    localStorage.setItem("score_shipping", JSON.stringify(SHIPPING));
  } catch {}
}

function loadCart() {
  try {
    CART = JSON.parse(localStorage.getItem("score_cart") || "[]") || [];
    SHIPPING = JSON.parse(localStorage.getItem("score_shipping") || "null") || SHIPPING;
  } catch {}
}

/* ===========================
   Cart logic
=========================== */
function addToCart(prod, size) {
  CART.push({
    id: prod.id,
    name: prod.name,
    price: prod.baseMXN,
    size
  });
  showToast("Producto agregado");
  updateCart();
  saveCart();
}

function removeFromCart(index) {
  CART.splice(index, 1);
  updateCart();
  saveCart();
}

function setQuoteMsg(msg, visible = true) {
  const q = $("quoteResult");
  if (!q) return;
  q.textContent = msg || "";
  q.style.display = visible ? "block" : "none";
}

/* ===========================
   Shipping logic
=========================== */
function computeShipping() {
  const method = $("shipMethod")?.value || "";

  SHIPPING.method = method;
  SHIPPING.quoted = false;
  SHIPPING.cost = 0;

  const shipForm = $("shipForm");
  if (method === "mx") {
    shipForm.style.display = "block";
    setQuoteMsg("Ingresa CP para cotizar envío nacional.", true);
  } else {
    shipForm.style.display = "none";
    setQuoteMsg("", false);

    if (method === "pickup") SHIPPING.cost = 0;
    if (method === "tj") SHIPPING.cost = 200;
    if (!method) SHIPPING.cost = 0;
  }
}

let _quoteTimer = null;

async function tryQuoteMX() {
  if (SHIPPING.method !== "mx") return;

  const cp = ($("cp")?.value || "").trim();
  const addr = ($("addr")?.value || "").trim();
  const name = ($("name")?.value || "").trim();

  SHIPPING.cp = cp;
  SHIPPING.addr = addr;
  SHIPPING.name = name;

  if (cp.length !== 5) {
    SHIPPING.quoted = false;
    SHIPPING.cost = 0;
    setQuoteMsg("Escribe un Código Postal válido (5 dígitos).", true);
    updateCartTotalsOnly();
    saveCart();
    return;
  }

  setQuoteMsg("Cotizando envío…", true);

  try {
    const res = await fetch("/.netlify/functions/quote_shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cp, items: CART })
    });

    const data = await res.json().catch(() => ({}));

    // Acepta varias formas posibles de respuesta
    const cost =
      Number(data?.cost_mxn) ||
      Number(data?.cost) ||
      Number(data?.price_mxn) ||
      Number(data?.total) ||
      0;

    if (!res.ok || !cost) {
      SHIPPING.quoted = false;
      SHIPPING.cost = 0;
      setQuoteMsg("No se pudo cotizar. Intenta de nuevo o cambia de método.", true);
    } else {
      SHIPPING.quoted = true;
      SHIPPING.cost = cost;
      setQuoteMsg(`Envío estimado: ${money(cost)}`, true);
    }
  } catch (e) {
    SHIPPING.quoted = false;
    SHIPPING.cost = 0;
    setQuoteMsg("Error al cotizar. Revisa tu conexión.", true);
  }

  updateCartTotalsOnly();
  saveCart();
}

/* ===========================
   Totals + UI
=========================== */
function updateCartTotalsOnly() {
  const subtotal = CART.reduce((acc, p) => acc + Number(p.price || 0), 0);

  // Shipping
  let ship = 0;
  if (SHIPPING.method === "tj") ship = 200;
  if (SHIPPING.method === "pickup") ship = 0;
  if (SHIPPING.method === "mx") ship = SHIPPING.quoted ? Number(SHIPPING.cost || 0) : 0;

  const total = subtotal + ship;

  $("lnSub").textContent = money(subtotal);
  $("lnShip").textContent = SHIPPING.method === "mx" && !SHIPPING.quoted ? "--" : money(ship);
  $("lnTotal").textContent = money(total);
  $("barTotal").textContent = money(total);

  // Count
  $("cartCount").textContent = String(CART.length);

  // Paybar
  const pb = $("paybar");
  if (CART.length > 0) pb?.classList.add("visible");
  else pb?.classList.remove("visible");

  // Enable pay
  const payOk =
    CART.length > 0 &&
    !!SHIPPING.method &&
    (SHIPPING.method !== "mx" || SHIPPING.quoted);

  $("payBtn").disabled = !payOk;
}

function updateCart() {
  const body = $("cartBody");
  body.innerHTML = "";

  if (CART.length === 0) {
    body.innerHTML = `<div style="color:#666; font-weight:600;">Tu carrito está vacío.</div>`;
  } else {
    CART.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "sumRow";
      row.innerHTML = `
        <span style="max-width:70%; line-height:1.2;">
          <b style="color:#111">${p.name}</b><br>
          <span style="font-size:12px; color:#777;">Talla: ${p.size}</span>
        </span>
        <span style="text-align:right;">
          ${money(p.price)}
          <button class="btn-sm" style="margin-top:8px; height:30px; padding:0 10px;" type="button" aria-label="Eliminar">X</button>
        </span>
      `;

      row.querySelector("button").onclick = () => removeFromCart(i);
      body.appendChild(row);
    });
  }

  computeShipping();
  updateCartTotalsOnly();
}

/* ===========================
   Checkout
=========================== */
async function checkout() {
  if ($("payBtn")?.disabled) return;

  try {
    const payload = {
      items: CART,
      shipping: {
        method: SHIPPING.method,
        cost: SHIPPING.method === "mx" ? Number(SHIPPING.cost || 0) : (SHIPPING.method === "tj" ? 200 : 0),
        cp: SHIPPING.cp,
        addr: SHIPPING.addr,
        name: SHIPPING.name
      }
    };

    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    alert("No se pudo iniciar el pago. Revisa configuración de Stripe.");
  } catch (err) {
    alert("Error al iniciar pago");
  }
}

/* ===========================
   Events (blindado)
=========================== */
function wireEvents() {
  // Carrito
  $("cartBtnTrigger")?.addEventListener("click", (e) => {
    e.preventDefault();
    openDrawer();
  });

  $("heroCartBtn")?.addEventListener("click", openDrawer);
  $("paybarCartBtn")?.addEventListener("click", openDrawer);

  $("closeDrawerBtn")?.addEventListener("click", closeAll);
  $("keepShopping")?.addEventListener("click", closeAll);
  $("keepShopping")?.addEventListener("keydown", (e) => { if (e.key === "Enter") closeAll(); });

  // Overlay click
  $("overlay")?.addEventListener("click", closeAll);

  // Modal close
  $("closeModalBtn")?.addEventListener("click", closeAll);

  // Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  // Cards -> open catalog
  document.querySelectorAll(".card[data-open]").forEach(card => {
    const sectionId = card.getAttribute("data-open");
    const title = card.getAttribute("data-title") || "CATÁLOGO";

    card.addEventListener("click", () => openCatalog(sectionId, title));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openCatalog(sectionId, title);
    });
  });

  // Smooth scroll
  document.querySelectorAll("[data-scroll]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      smoothScrollTo(a.getAttribute("data-scroll"));
    });
  });

  // Shipping change
  $("shipMethod")?.addEventListener("change", () => {
    computeShipping();
    updateCartTotalsOnly();
    saveCart();

    // Si es mx, intenta cotizar
    if (SHIPPING.method === "mx") {
      clearTimeout(_quoteTimer);
      _quoteTimer = setTimeout(tryQuoteMX, 250);
    }
  });

  // Quote fields
  ["cp", "addr", "name"].forEach(id => {
    $(id)?.addEventListener("input", () => {
      if (SHIPPING.method !== "mx") return;
      clearTimeout(_quoteTimer);
      _quoteTimer = setTimeout(tryQuoteMX, 400);
    });
  });

  // Pay
  $("payBtn")?.addEventListener("click", checkout);
}

/* ===========================
   Init
=========================== */
window.addEventListener("load", () => {
  document.body.classList.add("loaded");

  loadCart();
  updateCart();
  wireEvents();
});