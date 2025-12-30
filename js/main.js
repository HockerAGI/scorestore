/**
 * SCORE STORE — main.js (PROD ALINEADO)
 * - Frontend ligero
 * - Backend manda la verdad (anti-tampering)
 * - Stripe Checkout por redirect
 */

const LS_CART = "score_cart_v1";

let catalog = null;
let cart = safeJson(localStorage.getItem(LS_CART), []);
let ship = { mode: "pickup", cost: 0 };

const $ = (id) => document.getElementById(id);
const moneyMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

function safeJson(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ---------------- BOOT ---------------- */
async function boot() {
  try {
    catalog = await fetch(`/data/catalog.json?t=${Date.now()}`).then(r => r.json());
  } catch {
    toast("No se pudo cargar el catálogo");
  }

  document.querySelectorAll("input[name='shipMode']").forEach(radio => {
    radio.addEventListener("change", () => {
      ship.mode = radio.value;
      $("postalCode").disabled = ship.mode !== "shipping";
      updateCart();
    });
  });

  $("postalCode")?.addEventListener("input", updateCart);
  $("cartTrigger")?.addEventListener("click", openDrawer);
  $("overlay")?.addEventListener("click", closeAll);
  $("payBtn")?.addEventListener("click", checkout);

  updateCart();
}

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
}

function cartCount() {
  return cart.reduce((a, b) => a + b.qty, 0);
}

function subtotal() {
  return cart.reduce((a, b) => a + b.price * b.qty, 0);
}

/* ---------------- CART UI ---------------- */
function updateCart() {
  const sub = subtotal();

  ship.cost =
    ship.mode === "pickup" ? 0 :
    ship.mode === "shipping" ? 250 : 0;

  const total = sub + ship.cost;

  $("cartCount").innerText = cartCount();
  $("lnSub").innerText = moneyMXN(sub);
  $("lnShip").innerText = moneyMXN(ship.cost);
  $("lnTotal").innerText = moneyMXN(total);
  $("barTotal").innerText = moneyMXN(total);

  $("lnShipRow").style.display = ship.cost > 0 ? "flex" : "none";
  $("paybar").classList.toggle("visible", cart.length > 0);

  renderCart();
  validateCheckout();
}

function renderCart() {
  const body = $("cartBody");
  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center;opacity:.6">Tu carrito está vacío</div>`;
    return;
  }

  body.innerHTML = cart.map((i, idx) => `
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <img src="${i.img}" style="width:60px">
      <div style="flex:1">
        <strong>${i.name}</strong><br>
        <small>Talla: ${i.size}</small><br>
        ${moneyMXN(i.price)}
      </div>
      <div>
        <button data-rm="${idx}" style="font-size:18px;border:none;background:none">&times;</button>
        x${i.qty}
      </div>
    </div>
  `).join("");

  body.querySelectorAll("button[data-rm]").forEach(b => {
    b.onclick = () => {
      cart.splice(Number(b.dataset.rm), 1);
      saveCart();
      updateCart();
    };
  });
}

function validateCheckout() {
  let ok = cart.length > 0;
  if (ship.mode === "shipping") {
    ok = ok && ($("postalCode").value || "").length === 5;
  }
  $("payBtn").disabled = !ok;
}

/* ---------------- CATALOG ---------------- */
function openCatalog(sectionId, title) {
  $("catTitle").innerText = title;
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  const items = (catalog.products || []).filter(p => p.sectionId === sectionId);
  $("catContent").innerHTML = items.map(p => `
    <div class="prodCard">
      <img src="${p.img}">
      <strong>${p.name}</strong>
      <div>${moneyMXN(p.baseMXN)}</div>
      <select id="size_${p.id}">
        ${(p.sizes || ["Unitalla"]).map(s => `<option>${s}</option>`).join("")}
      </select>
      <button onclick="addToCart('${p.id}')">AGREGAR</button>
    </div>
  `).join("");
}

function addToCart(id) {
  const p = catalog.products.find(x => x.id === id);
  const size = document.getElementById(`size_${id}`).value;
  const key = `${id}_${size}`;

  const found = cart.find(i => i.key === key);
  if (found) found.qty++;
  else cart.push({ key, id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });

  saveCart();
  toast("Agregado al carrito");
  updateCart();
}

/* ---------------- UI ---------------- */
function openDrawer() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
}

function closeAll() {
  $("drawer")?.classList.remove("active");
  $("modalCatalog")?.classList.remove("active");
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
}

/* ---------------- CHECKOUT ---------------- */
async function checkout() {
  $("payBtn").disabled = true;
  $("payBtn").innerText = "PROCESANDO...";

  try {
    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
        mode: ship.mode,
        to: { postal_code: $("postalCode").value }
      })
    });

    const data = await res.json();
    if (!data.url) throw new Error("No se pudo iniciar el pago");

    location.href = data.url;
  } catch (e) {
    toast(e.message);
    $("payBtn").disabled = false;
    $("payBtn").innerText = "PAGAR";
  }
}

boot();