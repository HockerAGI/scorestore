/* SCORE STORE LOGIC — FINAL MASTER (PROD SAFE) */

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_final_v18";

let cart = [];
let catalog = [];
let shipQuote = null;

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

const money = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(n || 0);

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ================= LOGOS ================= */
const LOGOS = {
  BAJA_1000: "/assets/logo-baja1000.webp",
  BAJA_500: "/assets/logo-baja500.webp",
  BAJA_400: "/assets/logo-baja400.webp",
  SF_250: "/assets/logo-sf250.webp",
};

/* ================= INIT ================= */
async function init() {
  loadCart();
  renderCart();
  updateTotals();

  try {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    const data = await res.json();
    catalog = data.products || [];
  } catch (e) {
    console.error("❌ Error cargando catálogo", e);
  }

  document
    .querySelectorAll('input[name="shipMode"]')
    .forEach((r) => r.addEventListener("change", updateTotals));

  $("cp")?.addEventListener("input", (e) => {
    if (e.target.value.length === 5) quoteShipping(e.target.value);
  });
}

/* ================= CATÁLOGO ================= */
window.openCatalog = (secId, title) => {
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  const logoUrl = LOGOS[secId];
  $("catTitle").innerHTML = logoUrl
    ? `<img src="${logoUrl}" alt="${title}">`
    : title;

  $("catContent").innerHTML =
    "<div style='padding:40px;text-align:center;'>Cargando...</div>";

  const items = catalog.filter((p) => p.sectionId === secId);
  if (!items.length) {
    $("catContent").innerHTML =
      "<div style='padding:40px;text-align:center;'>Agotado</div>";
    return;
  }

  $("catContent").innerHTML =
    `<div class="catGrid">` +
    items
      .map((p) => {
        const sizes = p.sizes || ["Unitalla"];
        const sizeBtns = sizes
          .map(
            (s) =>
              `<div class="size-pill" onclick="selectSize(this,'${s}')">${s}</div>`
          )
          .join("");

        const imgSrc = p.img.startsWith("http")
          ? p.img
          : `${location.origin}${p.img}`;

        return `
        <div class="prodCard">
          <div class="metallic-frame">
            <img src="${imgSrc}"
              class="prodImg"
              alt="${p.name}"
              loading="lazy"
              onerror="this.src='/assets/img-placeholder.webp'">
          </div>
          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>
          <div class="size-row">${sizeBtns}</div>
          <div id="sizes_${p.id}" data-selected="" hidden></div>
          <button class="btn-add" onclick="add('${p.id}')">AGREGAR +</button>
        </div>`;
      })
      .join("") +
    `</div>`;
};

window.selectSize = (el, s) => {
  const hidden = el.parentElement.nextElementSibling;
  hidden.dataset.selected = s;
  el.parentElement
    .querySelectorAll(".size-pill")
    .forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
};

/* ================= CART ================= */
window.add = (id) => {
  const sizeEl = document.getElementById(`sizes_${id}`);
  let size = sizeEl?.dataset.selected;

  if (!size) {
    toast("Selecciona una talla");
    return;
  }

  const product = catalog.find((p) => p.id === id);
  const key = `${id}_${size}`;
  const existing = cart.find((i) => i.key === key);

  if (existing) existing.qty++;
  else {
    cart.push({
      key,
      id,
      name: product.name,
      size,
      variant: `Talla: ${size}`,
      price: product.baseMXN,
      qty: 1,
      img: product.img,
    });
  }

  saveCart();
  renderCart();
  openDrawer();
  toast("Agregado");
};

function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

window.emptyCart = () => {
  if (!cart.length) return;
  if (!confirm("¿Vaciar carrito?")) return;
  cart = [];
  saveCart();
  renderCart();
};

window.delCart = (i) => {
  cart.splice(i, 1);
  saveCart();
  renderCart();
};

function renderCart() {
  const wrap = $("cartItems");
  const count = cart.reduce((a, b) => a + b.qty, 0);
  $("cartCount").innerText = count;
  $("cartCount").style.display = count ? "flex" : "none";

  if (!cart.length) {
    wrap.innerHTML = "";
    $("cartEmpty").style.display = "block";
    updateTotals();
    return;
  }

  $("cartEmpty").style.display = "none";

  wrap.innerHTML = cart
    .map(
      (i, x) => `
      <div class="cartItem">
        <img src="${location.origin}${i.img}" class="cartThumb">
        <div class="cInfo">
          <div class="cName">${i.name}</div>
          <div class="cMeta">${i.variant}</div>
          <div class="cPrice">${money(i.price)}</div>
        </div>
        <button onclick="delCart(${x})">×</button>
      </div>`
    )
    .join("");

  updateTotals();
}

/* ================= SHIPPING ================= */
async function quoteShipping(zip) {
  try {
    const pieces = cart.reduce((a, b) => a + b.qty, 0) || 1;
    const r = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: zip, items: pieces }),
    });
    const d = await r.json();
    shipQuote = d.ok ? d : { mxn: 250 };
    updateTotals();
  } catch (e) {
    console.error("Shipping error", e);
  }
}

function updateTotals() {
  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  $("subTotal").innerText = money(sub);

  const mode =
    document.querySelector('input[name="shipMode"]:checked')?.value ||
    "pickup";

  $("shipForm").style.display = mode === "mx" ? "block" : "none";

  let ship = 0;
  if (mode === "tj") ship = 200;
  if (mode === "mx") ship = shipQuote?.mxn || 250;

  $("shipTotal").innerText = ship ? money(ship) : "Gratis";
  $("grandTotal").innerText = money(sub + ship);
}

/* ================= CHECKOUT ================= */
window.checkout = async () => {
  if (!cart.length) return;

  const btn = $("checkoutBtn");
  btn.disabled = true;
  btn.innerText = "PROCESANDO...";

  const mode =
    document.querySelector('input[name="shipMode"]:checked')?.value ||
    "pickup";

  try {
    const payload = {
      items: cart.map((i) => ({
        id: i.id,
        qty: i.qty,
        size: i.size,
      })),
      mode,
      to: {
        postal_code: $("cp")?.value,
        address1: $("addr")?.value,
        name: $("name")?.value,
      },
    };

    const r = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (d.url) location.href = d.url;
    else throw new Error("No checkout URL");
  } catch (e) {
    console.error(e);
    toast("Error iniciando pago");
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA";
  }
};

/* ================= UI ================= */
window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document
    .querySelectorAll(".active")
    .forEach((e) => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

window.openLegal = (key) => {
  closeAll();
  $("legalModal").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  document.querySelectorAll(".legalBlock").forEach((b) => {
    b.style.display = b.dataset.legalBlock === key ? "block" : "none";
  });
};

init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}