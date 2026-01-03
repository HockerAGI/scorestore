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
  $("drawer").classList.add("open");
  $("overlay").classList.add("show");
  renderCart();
}
function closeAll() {
  document.querySelectorAll(".drawer,.modal").forEach(e => e.classList.remove("open"));
  $("overlay").classList.remove("show");
}

/* Cart */
function addToCart(prod, size) {
  const found = cart.find(i => i.id === prod.id && i.size === size);
  if (found) found.qty++;
  else cart.push({ id: prod.id, size, qty: 1 });
  saveCart();
  updateCount();
  toast("Producto agregado");
}
function emptyCart() {
  cart = [];
  saveCart();
  renderCart();
}
function updateCount() {
  $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
}
updateCount();

/* Render Cart */
function renderCart() {
  const box = $("cartItems");
  const empty = $("cartEmpty");
  box.innerHTML = "";
  if (!cart.length) {
    empty.style.display = "block";
    $("subTotal").innerText = "$0";
    $("grandTotal").innerText = "$0";
    return;
  }
  empty.style.display = "none";

  let subtotal = 0;

  cart.forEach(item => {
    const p = catalog.products.find(x => x.id === item.id);
    subtotal += p.baseMXN * item.qty;

    const div = document.createElement("div");
    div.className = "cartRow";
    div.innerHTML = `
      <div><strong>${p.name}</strong><br><small>Talla: ${item.size}</small></div>
      <div>x${item.qty}</div>
    `;
    box.appendChild(div);
  });

  $("subTotal").innerText = money(subtotal);
  $("shipTotal").innerText = "Calculado en checkout";
  $("grandTotal").innerText = money(subtotal);
}

/* Checkout */
async function checkout() {
  if (!cart.length) return;

  const mode = document.querySelector('input[name="shipMode"]:checked').value;

  if (mode !== "pickup") {
    if (!$("cp").value || $("cp").value.length !== 5) return toast("CP inválido");
    if (!$("addr").value) return toast("Dirección requerida");
    if (!$("name").value) return toast("Nombre requerido");
  }

  $("checkoutBtn").disabled = true;

  const payload = {
    items: cart,
    mode,
    promo: $("promoCode")?.value || null,
    to: {
      postal_code: $("cp").value,
      address1: $("addr").value,
      name: $("name").value
    }
  };

  const r = await fetch(`${API_BASE}/create_checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const d = await r.json();
  if (d.url) location.href = d.url;
  else toast("Error iniciando pago");
}