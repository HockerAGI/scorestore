/* SCORE STORE LOGIC — MASTER */

// Stripe PK
const STRIPE_PK =
  "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVZbWEno2u0Sk2tfxqZ4bVbE7oBRG3qX3pENo9kF2y1iQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";

const stripe = window.Stripe ? window.Stripe(STRIPE_PK) : null;

const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_final_v18";

let cart = [];
let catalog = [];
let shipQuote = null;

const $ = (id) => document.getElementById(id);

const money = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(n || 0);

/* URL safe image helper */
function safeImg(src) {
  const s = (src ?? "").toString().trim();
  if (!s) return "/assets/logo-score.webp";
  if (s.startsWith("http://") || s.startsWith("https://"))
    return s.replace(/ /g, "%20");
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return encodeURI(withSlash);
}

/* ================= UTIL ================= */
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function scrollToId(id) {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ================= CART STORAGE ================= */
function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    cart = [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

/* ================= INIT ================= */
async function init() {
  loadCart();
  updateCart();

  // Catálogo (NO CACHE para evitar “me sigue saliendo viejo”)
  try {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });
    const data = await res.json();
    catalog = Array.isArray(data.products) ? data.products : [];
  } catch (e) {
    console.error("Error loading catalog", e);
    catalog = [];
  }

  // UI eventos
  $("shipMethod")?.addEventListener("change", updateTotals);
  $("zip")?.addEventListener("input", (e) => {
    if (String(e.target.value || "").trim().length === 5) quoteShipping();
  });

  $("scrollCollections")?.addEventListener("click", () =>
    scrollToId("collections")
  );
}

init();

/* ================= CATALOG MODAL ================= */
function openCatalog(sectionId, title) {
  if (!Array.isArray(catalog) || !catalog.length) {
    toast("Catálogo no disponible. Recarga la página.");
    return;
  }

  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  $("catTitle").innerText = title;
  $("catContent").innerHTML =
    "<div style='padding:40px;text-align:center;color:#555;'>Cargando inventario...</div>";

  const items = catalog.filter((p) => p.sectionId === sectionId);

  if (!items.length) {
    $("catContent").innerHTML =
      "<div style='padding:40px;text-align:center;'>Agotado.</div>";
    return;
  }

  // Agrupar por subSection (si existe)
  const groups = {};
  for (const p of items) {
    const g = p.subSection || "General";
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  }

  const html = Object.keys(groups)
    .map((g) => {
      const groupItems = groups[g]
        .map((p) => {
          const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
          const sizeBtns = sizes
            .map(
              (s) =>
                `<button class="sizeBtn" onclick="selectSize('${p.id}','${s}', this)">${s}</button>`
            )
            .join("");

          return `
            <div class="prodCard" id="card_${p.id}">
              <div class="metallic-frame">
                <img
                  src="${safeImg(p.img)}"
                  alt="${p.name}"
                  class="prodImg"
                  loading="lazy"
                  onerror="this.onerror=null;this.src='/assets/logo-score.webp';"
                />
              </div>

              <div class="prodName">${p.name}</div>
              <div class="prodPrice">${money(p.baseMXN)}</div>

              <div class="sizesRow">${sizeBtns}</div>
              <div class="selectedSize" id="sel_${p.id}" data-size=""></div>

              <button class="btnAdd" onclick="addToCart('${p.id}')">AGREGAR +</button>
            </div>
          `;
        })
        .join("");

      return `
        <div class="groupBlock">
          <h4 class="groupTitle">${g}</h4>
          <div class="catGrid">${groupItems}</div>
        </div>
      `;
    })
    .join("");

  $("catContent").innerHTML = html;
}

window.openCatalog = openCatalog;

/* ================= SIZE ================= */
function selectSize(pid, size, btn) {
  const el = $("sel_" + pid);
  if (el) el.setAttribute("data-size", size);

  // Toggle active buttons only inside the card
  const card = $("card_" + pid);
  if (card) {
    card.querySelectorAll(".sizeBtn").forEach((b) => b.classList.remove("active"));
  }
  btn.classList.add("active");
}

window.selectSize = selectSize;

/* ================= ADD TO CART ================= */
function addToCart(pid) {
  const p = catalog.find((x) => x.id === pid);
  if (!p) return;

  const sel = $("sel_" + pid);
  let size = sel?.getAttribute("data-size");

  // si solo hay una talla, auto
  const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
  if (!size && sizes.length === 1) size = sizes[0];

  if (!size) {
    toast("⚠️ Selecciona una talla");
    return;
  }

  const key = `${pid}_${size}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty++;
  else {
    cart.push({
      key,
      id: pid,
      name: p.name,
      size,
      variant: `Talla: ${size}`,
      price: p.baseMXN,
      qty: 1,
      img: safeImg(p.img),
    });
  }

  saveCart();
  updateCart();
  openDrawer();
  toast("Agregado");
}

window.addToCart = addToCart;

/* ================= DRAWER / CART UI ================= */
function openDrawer() {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
}

window.openDrawer = openDrawer;

function closeAll() {
  $("modalCatalog")?.classList.remove("active");
  $("drawer")?.classList.remove("active");
  $("legalModal")?.classList.remove("active");
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
}

window.closeAll = closeAll;

function updateCart() {
  const wrap = $("cartItems");
  const count = cart.reduce((a, b) => a + (b.qty || 0), 0);

  if ($("cartCount")) {
    $("cartCount").innerText = count;
    $("cartCount").style.display = count > 0 ? "flex" : "none";
  }

  if (!cart.length) {
    if (wrap) wrap.innerHTML = "";
    $("cartEmpty") && ($("cartEmpty").style.display = "block");
    updateTotals();
    return;
  }

  $("cartEmpty") && ($("cartEmpty").style.display = "none");

  if (wrap) {
    wrap.innerHTML = cart
      .map(
        (item, idx) => `
        <div class="cartItem">
          <img src="${safeImg(item.img)}" class="cartThumb" alt="${item.name}" />
          <div class="cInfo">
            <div class="cName">${item.name}</div>
            <div class="cMeta">${item.variant}</div>
            <div class="cPrice">${money(item.price)}</div>
            <div class="qtyRow">
              <button class="qtyBtn" onclick="decQty(${idx})">−</button>
              <span class="qtyVal">${item.qty}</span>
              <button class="qtyBtn" onclick="incQty(${idx})">+</button>
            </div>
          </div>
          <button class="delBtn" onclick="delCart(${idx})">&times;</button>
        </div>
      `
      )
      .join("");
  }

  updateTotals();
}

function incQty(i) {
  cart[i].qty++;
  saveCart();
  updateCart();
}
window.incQty = incQty;

function decQty(i) {
  cart[i].qty = Math.max(1, (cart[i].qty || 1) - 1);
  saveCart();
  updateCart();
}
window.decQty = decQty;

function delCart(i) {
  cart.splice(i, 1);
  saveCart();
  updateCart();
}
window.delCart = delCart;

function emptyCart() {
  cart = [];
  saveCart();
  updateCart();
  toast("Carrito vacío");
}
window.emptyCart = emptyCart;

/* ================= SHIPPING / TOTALS ================= */
function getSubtotal() {
  return cart.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 1), 0);
}

function updateTotals() {
  const sub = getSubtotal();
  const shipMethod = $("shipMethod")?.value || "pickup";

  // Mostrar / ocultar form envío
  const shipForm = $("shipForm");
  if (shipForm) shipForm.style.display = shipMethod === "mx" ? "block" : "none";

  let ship = 0;
  if (shipMethod === "pickup") ship = 0;
  if (shipMethod === "tj") ship = 200;
  if (shipMethod === "mx") {
    ship = shipQuote?.mxn || 250; // fallback
  }

  $("subTotal") && ($("subTotal").innerText = money(sub));
  $("shipTotal") &&
    ($("shipTotal").innerText = ship === 0 ? "Gratis" : money(ship));
  $("grandTotal") && ($("grandTotal").innerText = money(sub + ship));

  // habilitar / deshabilitar checkout
  const btn = $("checkoutBtn");
  if (btn) btn.disabled = cart.length === 0;
}

/* ================= QUOTE SHIPPING ================= */
async function quoteShipping() {
  const zip = String($("zip")?.value || "").trim();
  if (zip.length !== 5) return;

  try {
    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: zip, items: cart.length || 1 }),
    });
    const data = await res.json();
    if (data?.ok) shipQuote = data;
  } catch (e) {
    console.error("Quote shipping error", e);
    shipQuote = { mxn: 250, fallback: true };
  }

  updateTotals();
}

window.quoteShipping = quoteShipping;

/* ================= CHECKOUT ================= */
async function checkout() {
  if (!cart.length) return;

  const shipMethod = $("shipMethod")?.value || "pickup";

  const to =
    shipMethod === "mx"
      ? {
          name: String($("name")?.value || "").trim(),
          address: String($("addr")?.value || "").trim(),
          postal_code: String($("zip")?.value || "").trim(),
        }
      : null;

  if (shipMethod === "mx") {
    if (!to?.name || !to?.address || String(to.postal_code || "").length !== 5) {
      toast("⚠️ Completa nombre, dirección y CP");
      return;
    }
  }

  try {
    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: shipMethod, // pickup | tj | mx
        items: cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size })),
        to,
      }),
    });

    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    toast("Error iniciando pago. Intenta de nuevo.");
  } catch (e) {
    console.error("Checkout error", e);
    toast("Error iniciando pago. Intenta de nuevo.");
  }
}

window.checkout = checkout;

/* ================= LEGAL ================= */
function openLegal(key) {
  $("legalModal")?.classList.add("active");
  $("drawer")?.classList.remove("active");
  $("modalCatalog")?.classList.remove("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");

  document
    .querySelectorAll(".legalBlock")
    .forEach((b) => (b.style.display = "none"));

  const block = document.querySelector(`[data-legal-block="${key}"]`);
  if (block) block.style.display = "block";
}

window.openLegal = openLegal;

/* ================= SERVICE WORKER ================= */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}