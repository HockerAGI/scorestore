/* ======================================================
   SCORE STORE — MAIN JS (PRODUCCIÓN + BLINDADO)
   ====================================================== */

let CATALOG = null;
let CART = [];

/* ===========================
   HELPERS
=========================== */
const $ = (id) => document.getElementById(id);

function money(n) {
  return `$${Number(n).toLocaleString("es-MX")} MXN`;
}

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

/* ===========================
   LOAD CATALOG (ROBUSTO)
=========================== */
async function loadCatalog() {
  if (CATALOG) return CATALOG;

  try {
    const res = await fetch("/data/catalog.json", { cache: "no-store" });

    if (!res.ok) {
      showToast("No se pudo cargar el catálogo");
      console.error("Catalog fetch failed:", res.status, res.statusText);
      return null;
    }

    CATALOG = await res.json();
    return CATALOG;
  } catch (e) {
    showToast("Error cargando catálogo");
    console.error("Catalog load error:", e);
    return null;
  }
}

/* ===========================
   OVERLAY / DRAWER / MODAL
=========================== */
function openOverlay() {
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
}

function closeOverlay() {
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
}

function openDrawer() {
  const drawer = $("drawer");
  if (!drawer) return;
  drawer.classList.add("active");
  openOverlay();
}

function closeDrawer() {
  $("drawer")?.classList.remove("active");
}

function closeAll() {
  closeDrawer();
  $("modalCatalog")?.classList.remove("active");
  closeOverlay();
}

/* ===========================
   HERO SCROLL
=========================== */
function smoothScroll(e, id) {
  e?.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===========================
   OPEN CATALOG (FIX REAL)
=========================== */
async function openCatalog(sectionId, title) {
  const data = await loadCatalog();
  if (!data) return;

  const modal = $("modalCatalog");
  const wrap = $("catContent");
  const catTitle = $("catTitle");

  if (!modal || !wrap || !catTitle) {
    console.error("FALTAN NODOS DEL MODAL EN index.html (modalCatalog/catContent/catTitle)");
    showToast("Error: modal no disponible");
    return;
  }

  catTitle.textContent = title || "CATÁLOGO";
  wrap.innerHTML = "";

  const products = (data.products || []).filter(p => p.sectionId === sectionId);

  if (!products.length) {
    wrap.innerHTML = `<p style="opacity:.65; padding:10px 0;">Catálogo en preparación o sin productos.</p>`;
    modal.classList.add("active");
    openOverlay();
    return;
  }

  const grouped = {};
  products.forEach(p => {
    grouped[p.subSection] ??= [];
    grouped[p.subSection].push(p);
  });

  Object.entries(grouped).forEach(([sub, items]) => {
    const h = document.createElement("h4");
    h.className = "catSectionTitle";
    h.textContent = sub;
    wrap.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "catGrid";

    items.forEach(p => {
      const card = document.createElement("div");
      card.className = "prodCard";

      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}" loading="lazy">
        <strong>${p.name}</strong>
        <div class="ux-note">${money(p.baseMXN)}</div>

        <select aria-label="Selecciona talla">
          ${(p.sizes || ["Unitalla"]).map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>

        <button class="btn-sm" type="button">AGREGAR</button>
      `;

      card.querySelector("button").addEventListener("click", () => {
        const size = card.querySelector("select").value;
        addToCart(p, size);
      });

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  });

  modal.classList.add("active");
  openOverlay();
}

/* ===========================
   CART
=========================== */
function addToCart(prod, size) {
  CART.push({
    id: prod.id,
    name: prod.name,
    price: prod.baseMXN,
    size
  });

  updateCart();
  showToast("Producto agregado");
}

function updateCart() {
  const body = $("cartBody");
  if (!body) return;

  body.innerHTML = "";
  let subtotal = 0;

  CART.forEach((p) => {
    subtotal += p.price;
    body.innerHTML += `
      <div class="sumRow">
        <span>${p.name} (${p.size})</span>
        <span>${money(p.price)}</span>
      </div>
    `;
  });

  $("lnSub") && ($("lnSub").textContent = money(subtotal));
  $("lnTotal") && ($("lnTotal").textContent = money(subtotal));
  $("barTotal") && ($("barTotal").textContent = money(subtotal));
  $("cartCount") && ($("cartCount").textContent = CART.length);

  $("payBtn") && ($("payBtn").disabled = CART.length === 0);

  if ($("paybar")) {
    if (CART.length > 0) $("paybar").classList.add("visible");
    else $("paybar").classList.remove("visible");
  }
}

/* ===========================
   CHECKOUT
=========================== */
async function checkout() {
  if (CART.length === 0) return;

  try {
    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: CART })
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else showToast("No se pudo iniciar el pago");
  } catch (err) {
    console.error(err);
    showToast("Error al iniciar pago");
  }
}

/* ===========================
   EVENTS
=========================== */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAll();
});

$("overlay")?.addEventListener("click", closeAll);

window.addEventListener("load", () => {
  document.body.classList.add("loaded");
});

/* ===========================
   EXPONER A WINDOW (CLAVE)
   Para que onclick="" SIEMPRE funcione
=========================== */
window.openCatalog = openCatalog;
window.openDrawer = openDrawer;
window.closeAll = closeAll;
window.checkout = checkout;
window.smoothScroll = smoothScroll;