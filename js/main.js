const API_BASE = "/.netlify/functions";
const CART_KEY = "score_cart_v1";

let catalog = null;
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

/* Helpers */
const $ = (id) => document.getElementById(id);
const money = (n) => `$${Number(n).toLocaleString("es-MX")}`;
const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(cart));

/* Toast */
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* Load Catalog */
async function loadCatalog() {
  const r = await fetch("/data/catalog.json");
  catalog = await r.json();
}
loadCatalog();

/* UI */
function openDrawer() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  renderCart();
}

function closeAll() {
  document.querySelectorAll(".drawer,.modal").forEach(e => e.classList.remove("active"));
  $("overlay").classList.remove("active");
}

/* Cart */
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
  $("cartCount").innerText = cart.reduce((a, b) => a + b.qty, 0);
}
updateCount();

/* Render Cart */
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

/* Checkout */
async function checkout() {
  if (!cart.length) return toast("Carrito vacío");

  const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";

  if (mode !== "pickup") {
    if (!$("cp")?.value || $("cp").value.length !== 5) return toast("CP inválido");
    if (!$("addr")?.value) return toast("Dirección requerida");
    if (!$("name")?.value) return toast("Nombre requerido");
  }

  $("checkoutBtn").disabled = true;

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
      $("checkoutBtn").disabled = false;
    }
  } catch {
    toast("Error de red");
    $("checkoutBtn").disabled = false;
  }
}