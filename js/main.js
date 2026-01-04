/* ======================================================
   SCORE STORE — MAIN JS (UNIFICADO Y ESTABLE)
====================================================== */

const API_BASE = "/.netlify/functions";
const CART_KEY = "score_cart_v1";

let catalog = null;
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

/* =====================
   HELPERS
===================== */
const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n).toLocaleString("es-MX")}`;
const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(cart));

/* =====================
   TOAST
===================== */
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* =====================
   LOAD CATALOG
===================== */
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json");
    catalog = await r.json();
  } catch (e) {
    console.error("Error cargando catálogo", e);
    toast("Error cargando catálogo");
  }
}
loadCatalog();

/* =====================
   UI — DRAWER / OVERLAY
===================== */
function openDrawer() {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  renderCart();
}

function closeAll() {
  document.querySelectorAll(".drawer,.modal").forEach(e => e.classList.remove("active"));
  $("overlay")?.classList.remove("active");
}

/* =====================
   CART LOGIC
===================== */
function addToCart(prod, size) {
  if (!catalog) return toast("Catálogo no cargado");

  const found = cart.find(i => i.id === prod.id && i.size === size);
  if (found) {
    found.qty = Math.min(found.qty + 1, 10);
  } else {
    cart.push({ id: prod.id, size, qty: 1 });
  }

  saveCart();
  updateCount();
  toast("Producto agregado");
}

function updateQty(id, size, delta) {
  const item = cart.find(i => i.id === id && i.size === size);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => !(i.id === id && i.size === size));
  }

  saveCart();
  renderCart();
  updateCount();
}

function emptyCart() {
  cart = [];
  saveCart();
  renderCart();
  updateCount();
}

function updateCount() {
  const el = $("cartCount");
  if (!el) return;
  el.innerText = cart.reduce((a, b) => a + b.qty, 0);
}
updateCount();

/* =====================
   RENDER CART
===================== */
function renderCart() {
  const box = $("cartItems");
  const empty = $("cartEmpty");
  if (!box || !catalog) return;

  box.innerHTML = "";

  if (!cart.length) {
    empty.style.display = "block";
    $("subTotal").innerText = "$0";
    $("shipTotal").innerText = "$0";
    $("grandTotal").innerText = "$0";
    return;
  }

  empty.style.display = "none";

  let subtotal = 0;

  cart.forEach(item => {
    const p = catalog.products.find(x => x.id === item.id);
    if (!p) return;

    subtotal += p.baseMXN * item.qty;

    const div = document.createElement("div");
    div.className = "cartItem";
    div.innerHTML = `
      <img src="${p.img}" class="cartThumb" />
      <div class="cInfo">
        <div class="cName">${p.name}</div>
        <div class="cMeta">Talla: ${item.size}</div>
        <div class="cPrice">${money(p.baseMXN)}</div>
        <div class="qtyRow">
          <button class="qtyBtn" onclick="updateQty('${item.id}','${item.size}',-1)">−</button>
          <span class="qtyVal">${item.qty}</span>
          <button class="qtyBtn" onclick="updateQty('${item.id}','${item.size}',1)">+</button>
        </div>
      </div>
    `;
    box.appendChild(div);
  });

  $("subTotal").innerText = money(subtotal);
  $("shipTotal").innerText = "Se calcula al pagar";
  $("grandTotal").innerText = money(subtotal);
}

/* =====================
   CHECKOUT
===================== */
async function checkout() {
  if (!cart.length) return toast("Carrito vacío");

  const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";

  if (mode !== "pickup") {
    if (!$("cp")?.value || $("cp").value.length !== 5) return toast("CP inválido");
    if (!$("addr")?.value) return toast("Dirección requerida");
    if (!$("name")?.value) return toast("Nombre requerido");
  }

  const btn = $("checkoutBtn");
  if (btn) btn.disabled = true;

  const payload = {
    items: cart,
    mode,
    promo: $("promoCode")?.value || null,
    to: {
      postal_code: $("cp")?.value || "",
      address1: $("addr")?.value || "",
      name: $("name")?.value || ""
    }
  };

  try {
    const r = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const d = await r.json();
    if (d.url) {
      localStorage.removeItem(CART_KEY);
      location.href = d.url;
    } else {
      toast("Error iniciando pago");
      if (btn) btn.disabled = false;
    }
  } catch {
    toast("Error de red");
    if (btn) btn.disabled = false;
  }
}

/* =====================
   CATÁLOGO / MODAL
===================== */
function openCatalog(sectionId, title) {
  if (!catalog) return toast("Catálogo no cargado");

  const modal = $("modalCatalog");
  const overlay = $("overlay");
  const content = $("catContent");
  const titleEl = $("catTitle");

  if (!modal || !overlay || !content || !titleEl) {
    console.error("Modal de catálogo incompleto");
    return;
  }

  titleEl.innerText = title || "";

  const products = catalog.products.filter(p => p.sectionId === sectionId);

  if (!products.length) {
    content.innerHTML = `<p style="text-align:center;">No hay productos disponibles.</p>`;
  } else {
    content.innerHTML = `
      <div class="catGrid">
        ${products.map(p => `
          <div class="prodCard">
            <div class="metallic-frame">
              <img src="${p.img}" alt="${p.name}" class="prodImg" loading="lazy">
            </div>
            <div class="prodName">${p.name}</div>
            <div class="prodPrice">${money(p.baseMXN)}</div>

            <div class="sizeRow">
              ${p.sizes.map(s => `
                <button class="size-pill" onclick="addToCart(${JSON.stringify(p).replace(/"/g,'&quot;')},'${s}')">
                  ${s}
                </button>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  modal.classList.add("active");
  overlay.classList.add("active");
}

/* =====================
   LEGAL MODAL
===================== */
function openLegal(block) {
  const modal = $("legalModal");
  const overlay = $("overlay");
  if (!modal || !overlay) return;

  modal.querySelectorAll("[data-legal-block]").forEach(b => {
    b.style.display = b.dataset.legalBlock === block ? "block" : "none";
  });

  modal.classList.add("active");
  overlay.classList.add("active");
}