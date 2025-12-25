// js/main.js (PRODUCCIÓN)

// ===== Config =====
const STRIPE_PK = window.STRIPE_PK || "";
const USD_RATE = 17.50; // fallback (si quieres, lo leemos del catalog.json)
const $ = (id) => document.getElementById(id);

// ===== State =====
let catalog = null;
let promos = null;

let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let ship = { method: "", cost: 0 };
let promoState = { code: "", discountMXN: 0, label: "" };

// ===== Helpers =====
function toMXN(n) {
  const v = Number(n || 0);
  return `$${v.toLocaleString("es-MX")} MXN`;
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function safeUpper(s) { return String(s || "").trim().toUpperCase(); }
function normalizePromo(code) { return safeUpper(code).replace(/\s+/g, ""); }

function toast(msg) {
  const wrap = $("toastWrap");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ===== Tracking (cliente) =====
function track(eventName, data = {}) {
  try {
    // GA4
    if (window.gtag) window.gtag("event", eventName, data);
  } catch {}
  try {
    // Meta Pixel
    if (window.fbq) window.fbq("trackCustom", eventName, data);
  } catch {}
}

// ===== Cart =====
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function cartSubtotal() {
  return cart.reduce((a, i) => a + (Number(i.price) * Number(i.qty)), 0);
}

function computePromo(sub) {
  promoState.discountMXN = 0;
  promoState.label = "";
  const code = normalizePromo(promoState.code);
  if (!code || !promos?.rules?.length) return;

  const rule = promos.rules.find(r => normalizePromo(r.code) === code && r.active);
  if (!rule) return;

  if (rule.type === "percent") {
    const disc = Math.round(sub * Number(rule.value || 0));
    promoState.discountMXN = clamp(disc, 0, sub);
    promoState.label = `${Math.round(Number(rule.value) * 100)}%`;
  } else if (rule.type === "fixed_mxn") {
    promoState.discountMXN = clamp(Math.round(Number(rule.value || 0)), 0, sub);
    promoState.label = `-$${promoState.discountMXN} MXN`;
  } else if (rule.type === "free_shipping") {
    // se aplica en shipping (si quieres activarlo)
    promoState.label = "Envío gratis";
  } else if (rule.type === "free_total") {
    promoState.label = "Total gratis (promo especial)";
    promoState.discountMXN = sub; // extremo
  }
}

function renderCart(resetShip = true) {
  const method = $("shipMethod").value || "";
  ship.method = method;

  if (resetShip) {
    if (method === "pickup") ship.cost = 0;
    else if (method === "tj") ship.cost = 200;
    else if (method === "mx") {
      ship.cost = 0;
      if (($("cp").value || "").length === 5) quoteShipping();
    } else {
      ship.cost = 0;
    }
  }

  $("shipForm").style.display = method === "mx" ? "block" : "none";

  const sub = cartSubtotal();
  computePromo(sub);

  const disc = promoState.discountMXN || 0;

  // Free shipping promo support (si activas ENVIOFREE en promos.json)
  const promoRule = promos?.rules?.find(r => normalizePromo(r.code) === normalizePromo(promoState.code) && r.active);
  const freeShip = promoRule?.type === "free_shipping";

  const shipCost = freeShip ? 0 : ship.cost;
  const total = Math.max(0, sub - disc) + shipCost;

  const usd = (total / USD_RATE).toFixed(2);

  $("cartCount").innerText = cart.reduce((a, i) => a + i.qty, 0);
  $("lnSub").innerText = toMXN(sub);
  $("lnDisc").innerText = toMXN(disc);
  $("lnShip").innerText = toMXN(shipCost);
  $("lnTotal").innerText = toMXN(total);
  $("lnUsd").innerText = `aprox $${usd} USD`;

  $("cartBody").innerHTML = cart.map((i, idx) => `
    <div class="cart-item">
      <img src="${i.img}" alt="${i.name}" loading="lazy" />
      <div class="cart-item-details">
        <div class="cart-item-title">${i.name}</div>
        <div style="font-size:12px; color:#666;">Talla: ${i.size || "Unitalla"}</div>
        <div style="font-weight:800; margin-top:4px;">${toMXN(i.price)}</div>
      </div>
      <div style="text-align:right; min-width:80px;">
        <div style="font-weight:900;">x${i.qty}</div>
        <div class="cart-remove" onclick="window.__rm(${idx})">Eliminar</div>
      </div>
    </div>
  `).join("") || `<div style="text-align:center; padding:40px 20px; opacity:.6;">Tu equipo está vacío</div>`;

  window.__rm = (idx) => { cart.splice(idx, 1); saveCart(); renderCart(); };

  const hasItems = cart.length > 0;

  let valid = hasItems && !!method;
  if (method === "mx") {
    valid = valid &&
      (($("cp").value || "").length === 5) &&
      (($("addr").value || "").trim().length > 5);
    // shipCost debe estar > 0 (o 0 si freeShip)
    valid = valid && (shipCost > 0 || freeShip);
  }

  $("payBtn").disabled = !valid;

  // Promo message
  const pm = $("promoMsg");
  if (!promoState.code) pm.textContent = "";
  else if (promoRule && promoRule.active) pm.textContent = `Cupón aplicado: ${normalizePromo(promoState.code)} ${promoState.label ? "(" + promoState.label + ")" : ""}`;
  else pm.textContent = "Cupón no válido.";
}

function addToCart(prodId) {
  const p = catalog.products.find(x => x.id === prodId);
  if (!p) return;

  const sel = document.getElementById(`size_${p.id}`);
  const size = (sel?.value || (p.sizes?.[0] || "Unitalla"));

  const key = `${p.id}:${size}`;
  const exist = cart.find(i => i.key === key);
  if (exist) exist.qty += 1;
  else cart.push({
    key,
    id: p.id,
    name: p.name,
    price: Number(p.baseMXN),
    img: p.img,
    size,
    qty: 1
  });

  saveCart();
  openCart();
  toast("Agregado al equipo");
  track("AddToCart", { product_id: p.id, value: p.baseMXN, currency: "MXN" });
}

// ===== UI open/close =====
function openCart() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
  renderCart();
}
function closeAll() {
  $("drawer").classList.remove("active");
  $("overlay").classList.remove("active");
  document.body.classList.remove("modalOpen");
}

// ===== Shipping quote =====
let _quoteTimer = null;

async function quoteShipping() {
  const cp = ($("cp").value || "").trim();
  if (cp.length !== 5) return;

  $("quoteResult").style.display = "block";
  $("quoteResult").innerText = "Cotizando envío...";

  try {
    const res = await fetch("/.netlify/functions/quote_shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart,
        to: {
          postal_code: cp,
          address1: ($("addr").value || "").trim(),
          city: "", state: "BC"
        },
        mode: "auto"
      })
    });

    const data = await res.json();
    if (data.ok) {
      ship.cost = Number(data.mxn || 0);
      $("quoteResult").innerText = `Envío: ${toMXN(ship.cost)} (${data.carrier || "MX"})`;
    } else {
      ship.cost = 250;
      $("quoteResult").innerText = "Tarifa estándar: $250 MXN";
    }

    renderCart(false);
  } catch (e) {
    ship.cost = 250;
    $("quoteResult").innerText = "Tarifa estándar: $250 MXN";
    renderCart(false);
  }
}

// ===== Checkout =====
async function checkout() {
  const btn = $("payBtn");
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;

  try {
    if (!STRIPE_PK || STRIPE_PK.startsWith("pk_live_TU_") || STRIPE_PK.startsWith("pk_test_TU_")) {
      throw new Error("Falta configurar STRIPE_PK (clave pública).");
    }

    // Guardar datos de factura en localStorage (si el usuario los llenó)
    const invoice = {
      rfc: ($("rfc").value || "").trim(),
      razon: ($("razon").value || "").trim(),
      cfdi: ($("cfdi").value || "").trim(),
      regimen: ($("regimen").value || "").trim()
    };
    localStorage.setItem("invoice_data", JSON.stringify(invoice));

    // Promo code (si aplica)
    const promoRule = promos?.rules?.find(r => normalizePromo(r.code) === normalizePromo(promoState.code) && r.active);
    const freeShip = promoRule?.type === "free_shipping";

    // Mandamos payload mínimo (backend crea line_items)
    const payload = {
      items: cart,
      mode: ship.method,
      to: { postal_code: ($("cp").value || "").trim() },
      promo_code: normalizePromo(promoState.code || ""),
      invoice
    };

    track("InitiateCheckout", { value: cartSubtotal(), currency: "MXN" });
    if (window.fbq) window.fbq("track", "InitiateCheckout");

    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    throw new Error(data.error || "No se pudo iniciar el pago.");
  } catch (e) {
    alert(e.message);
    btn.innerText = "IR A PAGAR";
    btn.disabled = false;
  }
}

// ===== Catalog render =====
function buildSectionNav(sections) {
  const nav = $("sectionNav");
  nav.innerHTML = "";

  // "Todos"
  const allBtn = document.createElement("button");
  allBtn.className = "nav-pill active";
  allBtn.textContent = "Todos";
  allBtn.onclick = () => { setActiveSection(null); };
  nav.appendChild(allBtn);

  sections.forEach(s => {
    const b = document.createElement("button");
    b.className = "nav-pill";
    b.textContent = s.title;
    b.onclick = () => setActiveSection(s.id);
    nav.appendChild(b);
  });
}

let _activeSectionId = null;

function setActiveSection(sectionId) {
  _activeSectionId = sectionId;

  // pills active state
  [...document.querySelectorAll(".nav-pill")].forEach(p => p.classList.remove("active"));
  const pills = [...document.querySelectorAll(".nav-pill")];
  if (!sectionId) pills[0]?.classList.add("active");
  else {
    const found = pills.find(x => x.textContent === (catalog.sections.find(s => s.id === sectionId)?.title));
    found?.classList.add("active");
  }

  renderCatalogGrid();
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth" });
}

function renderCatalogGrid() {
  const grid = $("catGrid");
  if (!catalog) return;

  const prods = catalog.products
    .filter(p => !_activeSectionId ? true : p.sectionId === _activeSectionId);

  grid.innerHTML = prods.map(p => {
    const sizes = (p.sizes || ["Unitalla"]);
    return `
      <div class="prodCard">
        <div class="prodImgBox">
          <img class="prodImg" src="${p.img}" alt="${p.name}" loading="lazy" />
        </div>
        <div class="prodInfo">
          <div class="prodTitle">${p.name}</div>
          <div style="font-size:12px; color:#666; margin-bottom:8px;">
            ${(p.subSection || "").trim()}
          </div>

          <label class="label-sm">Talla</label>
          <select id="size_${p.id}">
            ${sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
          </select>

          <div class="prodPrice">${toMXN(p.baseMXN)}</div>
          <button class="btn-add" type="button" onclick="window.__add('${p.id}')">AGREGAR</button>
        </div>
      </div>
    `;
  }).join("");

  window.__add = (id) => addToCart(id);
}

// ===== Boot =====
async function boot() {
  // UI hooks
  $("openCartBtn").onclick = openCart;
  $("closeCartBtn").onclick = closeAll;
  $("overlay").onclick = closeAll;
  $("ctaCatalog").onclick = () => document.getElementById("catalog").scrollIntoView({ behavior: "smooth" });

  // Promo apply
  $("applyPromoBtn").onclick = () => {
    promoState.code = $("promoCode").value || "";
    renderCart(false);
    track("ApplyPromo", { code: normalizePromo(promoState.code) });
    toast("Cupón actualizado");
  };

  // Input listeners
  ["cp", "addr", "name", "shipMethod"].forEach(id => {
    $(id).addEventListener("input", () => {
      // debounce quote
      if (id === "cp" || id === "addr") {
        clearTimeout(_quoteTimer);
        _quoteTimer = setTimeout(() => renderCart(true), 250);
      } else {
        renderCart(true);
      }
    });
  });

  $("payBtn").onclick = checkout;

  // Load catalog + promos
  const [catRes, promoRes] = await Promise.all([
    fetch("/catalog.json", { cache: "no-store" }),
    fetch("/promos.json", { cache: "no-store" })
  ]);

  catalog = await catRes.json();
  promos = await promoRes.json();

  // Nav + grid
  const sectionsSorted = (catalog.sections || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
  buildSectionNav(sectionsSorted);
  renderCatalogGrid();

  // cart initial
  renderCart(true);

  // PWA SW
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {}
  }

  // Status param
  const url = new URL(window.location.href);
  const status = url.searchParams.get("status");
  if (status === "success") {
    toast("Pago confirmado ✅");
    track("PurchaseClient", { currency: "MXN", value: cartSubtotal() });
    cart = [];
    saveCart();
    renderCart(true);
    url.searchParams.delete("status");
    window.history.replaceState({}, "", url.toString());
  } else if (status === "cancel") {
    toast("Pago cancelado");
    url.searchParams.delete("status");
    window.history.replaceState({}, "", url.toString());
  }
}

boot().catch((e) => {
  console.error("BOOT ERROR:", e);
  alert("Error cargando la tienda. Revisa consola.");
});