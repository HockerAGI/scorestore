/* SCORE STORE LOGIC — FINAL FIXED MASTER */

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
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

/* ================= UTIL ================= */
function scrollToId(id) {
  const el = $(id);
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
    const res = await fetch("/data/catalog.json");
    const data = await res.json();
    catalog = data.products || [];
  } catch (e) {
    console.error("Error loading catalog", e);
  }

  document
    .querySelectorAll('input[name="shipMode"]')
    .forEach((r) => r.addEventListener("change", updateTotals));

  $("cp")?.addEventListener("input", (e) => {
    if (e.target.value.length === 5) quoteShipping(e.target.value);
  });
}

/* ================= CATALOG MODAL ================= */
window.openCatalog = (secId, title) => {
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  const logoUrl = LOGOS[secId];
  if (logoUrl) {
    let outlineClass = "";
    if (secId === "SF_250" || secId === "BAJA_500") {
      outlineClass = "outline-black";
    }
    $("catTitle").innerHTML = `<img src="${logoUrl}" alt="${title}" class="${outlineClass}">`;
  } else {
    $("catTitle").innerText = title;
  }

  $("catContent").innerHTML =
    "<div style='padding:40px;text-align:center;color:#555;'>Cargando inventario...</div>";

  const items = catalog.filter((p) => p.sectionId === secId);
  if (!items.length) {
    $("catContent").innerHTML =
      "<div style='padding:40px;text-align:center;'>Agotado.</div>";
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

        return `
        <div class="prodCard" id="card_${p.id}">
          <div class="metallic-frame">
            <img
              src="${location.origin}${p.img}"
              alt="${p.name}"
              class="prodImg"
              loading="lazy"
              onerror="this.onerror=null;this.src='/assets/img-placeholder.webp';"
            >
          </div>
          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>
          <div class="size-row">${sizeBtns}</div>
          <div id="sizes_${p.id}" data-selected="" style="display:none;"></div>
          <button class="btn-add" onclick="add('${p.id}')">AGREGAR +</button>
        </div>
      `;
      })
      .join("") +
    `</div>`;
};

/* ================= SIZE ================= */
window.selectSize = (el, s) => {
  const parent = el.parentElement;
  const hidden = parent.nextElementSibling;
  hidden.setAttribute("data-selected", s);
  parent.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
};

/* ================= CART ================= */
window.add = (id) => {
  const sizeCont = document.getElementById(`sizes_${id}`);
  let s = sizeCont?.getAttribute("data-selected");

  if (!s) {
    const btns = sizeCont?.previousElementSibling?.children;
    if (btns && btns.length === 1) s = btns[0].innerText;
  }

  if (!s) {
    toast("⚠️ Selecciona una talla");
    return;
  }

  const p = catalog.find((x) => x.id === id);
  const key = `${id}_${s}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty++;
  else
    cart.push({
      key,
      id,
      name: p.name,
      size: s, // 🔴 talla correcta
      variant: `Talla: ${s}`,
      price: p.baseMXN,
      qty: 1,
      img: p.img,
    });

  saveCart();
  renderCart();
  openDrawer();
  toast("Agregado");
};

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

function renderCart() {
  const wrap = $("cartItems");
  const count = cart.reduce((a, b) => a + b.qty, 0);
  $("cartCount").innerText = count;
  $("cartCount").style.display = count > 0 ? "flex" : "none";

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
        <button onclick="delCart(${x})">&times;</button>
      </div>
    `
    )
    .join("");

  updateTotals();
}

window.delCart = (x) => {
  cart.splice(x, 1);
  saveCart();
  renderCart();
};

/* ================= START ================= */
init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}