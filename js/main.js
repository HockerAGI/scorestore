/* SCORE STORE LOGIC — MASTER (PROMOS + CHECKOUT VALIDATION) */

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_final_v19";
const PROMO_KEY = "score_promo_code_v1";

let cart = [];
let catalog = [];
let shipQuote = null;

let promos = null;         // /data/promos.json
let appliedPromo = null;   // {code,type,value,active}

const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    n || 0
  );

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

function digitsOnly(v) {
  return (v || "").toString().replace(/\D+/g, "");
}

function getShipMode() {
  return (
    document.querySelector('input[name="shipMode"]:checked')?.value || "pickup"
  );
}

/* ================= LOGOS ================= */

const LOGOS = {
  BAJA_1000: "/assets/logo-baja1000.webp",
  BAJA_500: "/assets/logo-baja500.webp",
  BAJA_400: "/assets/logo-baja400.webp",
  SF_250: "/assets/logo-sf250.webp",
};

/* ================= PROMOS ================= */

async function loadPromos() {
  try {
    const res = await fetch("/data/promos.json", { cache: "no-store" });
    promos = await res.json();
  } catch (e) {
    promos = null;
  }
}

function findPromo(code) {
  if (!promos?.rules?.length) return null;
  const c = (code || "").toString().trim().toUpperCase();
  if (!c) return null;
  return promos.rules.find((r) => r.active && r.code === c) || null;
}

function getStoredPromoCode() {
  try {
    return localStorage.getItem(PROMO_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredPromoCode(code) {
  try {
    localStorage.setItem(PROMO_KEY, (code || "").toString().trim().toUpperCase());
  } catch {}
}

function clearStoredPromo() {
  try {
    localStorage.removeItem(PROMO_KEY);
  } catch {}
}

function syncPromoFromInput() {
  const input = $("promoCode");
  if (!input) return;
  input.value = getStoredPromoCode();
}

window.applyPromo = (code) => {
  const c = (code || "").toString().trim().toUpperCase();
  if (!c) {
    appliedPromo = null;
    clearStoredPromo();
    updateTotals();
    toast("Cupón removido");
    return;
  }

  const p = findPromo(c);
  if (!p) {
    appliedPromo = null;
    clearStoredPromo();
    updateTotals();
    toast("Cupón inválido");
    return;
  }

  appliedPromo = p;
  setStoredPromoCode(p.code);
  updateTotals();
  toast(`Cupón aplicado: ${p.code}`);
};

function bootPromoFromStorage() {
  const saved = getStoredPromoCode();
  if (!saved) {
    appliedPromo = null;
    return;
  }
  const p = findPromo(saved);
  appliedPromo = p || null;
  if (!p) clearStoredPromo();
}

/* ================= INIT ================= */

async function init() {
  loadCart();
  renderCart();

  // Cargar catálogo
  try {
    const res = await fetch("/data/catalog.json");
    const data = await res.json();
    catalog = data.products || [];
  } catch (e) {
    console.error("Error loading catalog", e);
  }

  // Cargar promos y restaurar
  await loadPromos();
  bootPromoFromStorage();
  syncPromoFromInput();

  // Shipping mode change
  document
    .querySelectorAll('input[name="shipMode"]')
    .forEach((r) => r.addEventListener("change", updateTotals));

  // Auto-quote CP
  $("cp")?.addEventListener("input", (e) => {
    const zip = digitsOnly(e.target.value);
    if (zip.length === 5) quoteShipping(zip);
    updateTotals();
  });

  // Hook: si tu HTML usa botón APLICAR
  $("applyPromoBtn")?.addEventListener("click", () => {
    const code = ($("promoCode")?.value || "").trim();
    window.applyPromo(code);
  });

  // Hook: si tu index manda evento custom
  window.addEventListener("scorestore:promo", (ev) => {
    const code = ev?.detail?.code || "";
    window.applyPromo(code);
  });

  updateTotals();
}

/* ================= CATALOG MODAL ================= */

window.openCatalog = (secId, title) => {
  $("modalCatalog")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");

  const logoUrl = LOGOS[secId];
  if (logoUrl) {
    let outlineClass = "";
    if (secId === "SF_250" || secId === "BAJA_500") outlineClass = "outline-black";
    $("catTitle").innerHTML = `<img src="${logoUrl}" alt="${title}" class="${outlineClass}">`;
  } else {
    $("catTitle").innerText = title;
  }

  $("catContent").innerHTML =
    "<div style='padding:40px; text-align:center; color:#555;'>Cargando inventario...</div>";

  const items = catalog.filter((p) => p.sectionId === secId);
  if (!items.length) {
    $("catContent").innerHTML =
      "<div style='padding:40px; text-align:center;'>Agotado.</div>";
    return;
  }

  $("catContent").innerHTML =
    `<div class="catGrid">` +
    items
      .map((p) => {
        const sizes = p.sizes || ["Unitalla"];
        const sizeBtns = sizes
          .map((s) => `<div class="size-pill" onclick="selectSize(this,'${s}')">${s}</div>`)
          .join("");

        let statusBadge = "";
        if (p.status === "low_stock") statusBadge = `<div class="status-tag">ÚLTIMAS PIEZAS</div>`;
        if (p.tags && p.tags.includes("new"))
          statusBadge = `<div class="status-tag" style="background:#003087;">NUEVO</div>`;

        return `
          <div class="prodCard" id="card_${p.id}">
            ${statusBadge}
            <div class="metallic-frame">
              <img src="${p.img}" loading="lazy" alt="${p.name}" class="prodImg">
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

  if (!s) return toast("⚠️ Selecciona una talla");

  const p = catalog.find((x) => x.id === id);
  if (!p) return toast("Producto no encontrado");

  const key = `${id}_${s}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty++;
  else
    cart.push({
      key,
      id,
      name: p.name,
      size: s,
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

window.emptyCart = () => {
  cart = [];
  saveCart();
  renderCart();
};

function renderCart() {
  const wrap = $("cartItems");
  const count = cart.reduce((a, b) => a + b.qty, 0);
  if ($("cartCount")) {
    $("cartCount").innerText = count;
    $("cartCount").style.display = count > 0 ? "flex" : "none";
  }

  if (!cart.length) {
    if (wrap) wrap.innerHTML = "";
    if ($("cartEmpty")) $("cartEmpty").style.display = "block";
    updateTotals();
    return;
  }

  if ($("cartEmpty")) $("cartEmpty").style.display = "none";
  if (!wrap) return;

  wrap.innerHTML = cart
    .map(
      (i, x) => `
      <div class="cartItem">
        <img src="${i.img}" class="cartThumb">
        <div class="cInfo">
          <div class="cName">${i.name}</div>
          <div class="cMeta">${i.variant}</div>
          <div class="cPrice">${money(i.price)}</div>
        </div>
        <button onclick="delCart(${x})" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;">&times;</button>
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

/* ================= SHIPPING ================= */

async function quoteShipping(zip) {
  if ($("shipTotal")) $("shipTotal").innerText = "Calculando...";
  try {
    const pieces = cart.reduce((a, b) => a + b.qty, 0) || 1;
    const r = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: zip, items: pieces }),
    });
    const d = await r.json();
    if (d.ok) {
      shipQuote = d;
    } else {
      shipQuote = { mxn: 250, fallback: true };
    }
    updateTotals();
  } catch (e) {
    console.error(e);
    shipQuote = { mxn: 250, fallback: true };
    updateTotals();
  }
}

/* ================= TOTALS (PROMOS) ================= */

function calcDiscount(subtotal) {
  if (!appliedPromo) return 0;

  if (appliedPromo.type === "percent") {
    const pct = Number(appliedPromo.value) || 0;
    return Math.round(subtotal * pct);
  }
  if (appliedPromo.type === "fixed_mxn") {
    return Math.max(0, Math.round(Number(appliedPromo.value) || 0));
  }
  return 0;
}

function promoAffectsShipping() {
  return appliedPromo && appliedPromo.type === "free_shipping";
}

function updateTotals() {
  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  if ($("subTotal")) $("subTotal").innerText = money(sub);

  const mode = getShipMode();
  if ($("shipForm")) $("shipForm").style.display = mode !== "pickup" ? "block" : "none";

  // shipping base
  let shipCost = 0;
  let shipLabel = "Gratis";

  if (mode === "tj") {
    shipCost = 200;
    shipLabel = "$200.00";
  } else if (mode === "mx") {
    if (shipQuote?.mxn) {
      shipCost = shipQuote.mxn;
      shipLabel = money(shipCost);
    } else {
      shipLabel = "Cotizar";
      shipCost = 0;
    }
  }

  // promo free shipping
  if (promoAffectsShipping() && mode !== "pickup") {
    shipCost = 0;
    shipLabel = "Gratis (Cupón)";
  }

  if ($("shipTotal")) $("shipTotal").innerText = shipLabel;

  // subtotal discount
  const discount = Math.min(sub, calcDiscount(sub));
  const grand = Math.max(0, sub - discount + shipCost);

  // UI discount row (si existe en tu HTML)
  const dRow = $("discountRow");
  const dTotal = $("discountTotal");
  if (dRow && dTotal) {
    if (discount > 0) {
      dRow.style.display = "flex";
      dTotal.innerText = `-${money(discount)}`;
    } else {
      dRow.style.display = "none";
    }
  }

  if ($("grandTotal")) $("grandTotal").innerText = money(grand);
}

/* ================= CHECKOUT (PROMO + VALIDATION) ================= */

function validateCheckout() {
  if (!cart.length) return { ok: false, msg: "Tu carrito está vacío." };

  const mode = getShipMode();
  if (mode === "pickup") return { ok: true };

  const cp = digitsOnly($("cp")?.value);
  const addr = ($("addr")?.value || "").trim();
  const name = ($("name")?.value || "").trim();

  if (cp.length !== 5) return { ok: false, msg: "CP inválido (5 dígitos)." };
  if (!addr) return { ok: false, msg: "Falta tu dirección." };
  if (!name) return { ok: false, msg: "Falta tu nombre completo." };

  // Campos opcionales si existen en HTML
  const email = ($("email")?.value || "").trim();
  if ($("email") && (!email || !/^\S+@\S+\.\S+$/.test(email)))
    return { ok: false, msg: "Correo inválido." };

  return { ok: true };
}

window.checkout = async () => {
  const v = validateCheckout();
  if (!v.ok) return toast(v.msg);

  const btn = $("checkoutBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "PROCESANDO...";
  }

  const mode = getShipMode();

  const to = {
    postal_code: digitsOnly($("cp")?.value),
    address1: ($("addr")?.value || "").trim(),
    city: ($("city")?.value || "").trim(),   // si existe en tu HTML, lo manda
    state: ($("state")?.value || "").trim(), // si existe en tu HTML, lo manda
    name: ($("name")?.value || "").trim(),
    phone: ($("phone")?.value || "").trim(),
    email: ($("email")?.value || "").trim(),
  };

  const promoCode = (getStoredPromoCode() || "").trim();

  try {
    const payload = {
      items: cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size })),
      mode,
      to,
      promo: promoCode || null
    };

    const r = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (d.url) location.href = d.url;
    else throw new Error(d?.error || "No session url");
  } catch (e) {
    console.error(e);
    toast("Error iniciando pago");
    if (btn) {
      btn.disabled = false;
      btn.innerText = "PAGAR AHORA";
    }
  }
};

/* ================= UI ================= */

window.openDrawer = () => {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach((e) => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

window.openLegal = (t) => {
  $("legalModal")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
  document
    .querySelectorAll(".legalBlock")
    .forEach((b) => (b.style.display = b.dataset.legalBlock === t ? "block" : "none"));
};

/* ================= START ================= */

init();

/* ================= PWA ================= */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}