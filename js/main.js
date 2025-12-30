/**
 * SCORE STORE — main.js (FINAL REAL)
 * ✔ Alineado con index.html FINAL
 * ✔ Alineado con styles.css FINAL
 * ✔ Respeta assets y estructura real
 * ✔ Sin romper backend / Stripe
 */

/* =========================
   CONFIG
========================= */
const LS_CART = "score_cart_v1";

/* =========================
   STATE
========================= */
let catalog = null;
let cart = safeJson(localStorage.getItem(LS_CART), []);

/* =========================
   HELPERS
========================= */
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));

function safeJson(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function moneyMXN(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(Number(n || 0));
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 2600);
}

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
}

/* =========================
   BOOT
========================= */
async function boot() {
  try {
    catalog = await fetchJSON("/data/catalog.json");
  } catch {
    toast("No se pudo cargar el catálogo");
    return;
  }

  // Abrir catálogo desde cards
  $$("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      openCatalog(btn.dataset.open, btn.dataset.title);
    });
  });

  // Abrir carrito
  $("#cartBtnTrigger")?.addEventListener("click", openDrawer);

  // Cerrar modales
  $$("[data-close='all']").forEach(b =>
    b.addEventListener("click", closeAll)
  );
  $("#overlay")?.addEventListener("click", closeAll);

  updateCart();
}

/* =========================
   CATÁLOGO
========================= */
function openCatalog(sectionId, title) {
  const wrap = $("#catContent");
  wrap.innerHTML = "";
  $("#catTitle").textContent = title || "CATÁLOGO";

  const items = catalog.products.filter(p => p.sectionId === sectionId);

  if (!items.length) {
    wrap.innerHTML = `<div style="padding:40px;text-align:center">Próximamente</div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "productGrid";

    items.forEach(p => {
      let selectedSize = p.sizes?.[0] || "Unitalla";

      const card = document.createElement("div");
      card.className = "productCard";
      card.innerHTML = `
        <div class="productImg">
          <img src="${p.img}" alt="${p.name}">
          <span class="badge ${p.status === "low_stock" ? "limited" : "available"}">
            ${p.status === "low_stock" ? "EDICIÓN LIMITADA" : "DISPONIBLE"}
          </span>
        </div>
        <div class="productInfo">
          <h4>${p.name}</h4>
          <div class="sku">${p.sku || ""}</div>
          <div class="price">${moneyMXN(p.baseMXN)}</div>
          <div class="sizeRow">
            ${p.sizes.map(s =>
              `<button class="sizeBtn ${s === selectedSize ? "active" : ""}">${s}</button>`
            ).join("")}
          </div>
          <button class="addBtn">AGREGAR AL CARRITO</button>
        </div>
      `;

      card.querySelectorAll(".sizeBtn").forEach(b => {
        b.onclick = () => {
          card.querySelectorAll(".sizeBtn").forEach(x => x.classList.remove("active"));
          b.classList.add("active");
          selectedSize = b.textContent;
        };
      });

      card.querySelector(".addBtn").onclick = () => {
        addToCart(p, selectedSize);
      };

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  }

  $("#modalCatalog").classList.add("show");
  $("#overlay").classList.add("show");
  document.body.classList.add("modalOpen");
}

/* =========================
   CART
========================= */
function addToCart(p, size) {
  const key = `${p.id}_${size}`;
  const found = cart.find(i => i.key === key);

  if (found) found.qty++;
  else cart.push({
    key,
    id: p.id,
    name: p.name,
    img: p.img,
    size,
    price: p.baseMXN,
    qty: 1
  });

  saveCart();
  updateCart();
  toast("Producto agregado al carrito");
  openDrawer();
}

function updateCart() {
  $("#cartCount").textContent = cart.reduce((a, b) => a + b.qty, 0);
  renderCart();
}

function renderCart() {
  const body = $("#cartBody");
  body.innerHTML = "";

  if (!cart.length) {
    body.innerHTML = `<div style="opacity:.6;text-align:center;padding:40px">Tu carrito está vacío</div>`;
    return;
  }

  cart.forEach(item => {
    const el = document.createElement("div");
    el.className = "cartItem";
    el.innerHTML = `
      <img src="${item.img}">
      <div class="cartMeta">
        <strong>${item.name}</strong>
        <span>Talla: ${item.size}</span>
        <div class="qtyRow">
          <button class="qtyBtn">−</button>
          <span>${item.qty}</span>
          <button class="qtyBtn">+</button>
        </div>
      </div>
      <div class="cartRight">
        <span class="itemPrice">${moneyMXN(item.price * item.qty)}</span>
        <button class="removeBtn">✕</button>
      </div>
    `;

    const [dec, inc] = el.querySelectorAll(".qtyBtn");
    dec.onclick = () => {
      item.qty--;
      if (item.qty <= 0) cart = cart.filter(c => c !== item);
      saveCart(); updateCart();
    };
    inc.onclick = () => {
      item.qty++;
      saveCart(); updateCart();
    };
    el.querySelector(".removeBtn").onclick = () => {
      cart = cart.filter(c => c !== item);
      saveCart(); updateCart();
    };

    body.appendChild(el);
  });
}

/* =========================
   UI
========================= */
function openDrawer() {
  $("#drawer").classList.add("show");
  $("#overlay").classList.add("show");
  document.body.classList.add("modalOpen");
}

function closeAll() {
  $("#drawer")?.classList.remove("show");
  $("#modalCatalog")?.classList.remove("show");
  $("#overlay")?.classList.remove("show");
  document.body.classList.remove("modalOpen");
}

/* =========================
   FETCH
========================= */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("fetch error");
  return res.json();
}

/* =========================
   START
========================= */
boot();