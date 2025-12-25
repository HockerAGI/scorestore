/* /js/main.js — SCORE Store (Frontend PRO) */
const $ = (id) => document.getElementById(id);

const API = {
  config: "/.netlify/functions/site_config",
  quote: "/.netlify/functions/quote_shipping",
  checkout: "/.netlify/functions/create_checkout",
};

const MX_STATES = [
  ["AGU", "Aguascalientes"], ["BC", "Baja California"], ["BCS", "Baja California Sur"],
  ["CAM", "Campeche"], ["CHP", "Chiapas"], ["CHH", "Chihuahua"], ["COA", "Coahuila"],
  ["COL", "Colima"], ["CDMX", "Ciudad de México"], ["DUR", "Durango"], ["GUA", "Guanajuato"],
  ["GRO", "Guerrero"], ["HID", "Hidalgo"], ["JAL", "Jalisco"], ["MEX", "Estado de México"],
  ["MIC", "Michoacán"], ["MOR", "Morelos"], ["NAY", "Nayarit"], ["NLE", "Nuevo León"],
  ["OAX", "Oaxaca"], ["PUE", "Puebla"], ["QUE", "Querétaro"], ["ROO", "Quintana Roo"],
  ["SLP", "San Luis Potosí"], ["SIN", "Sinaloa"], ["SON", "Sonora"], ["TAB", "Tabasco"],
  ["TAM", "Tamaulipas"], ["TLA", "Tlaxcala"], ["VER", "Veracruz"], ["YUC", "Yucatán"],
  ["ZAC", "Zacatecas"],
];

let stripePK = "";
let catalog = null;
let promos = null;
let activeSection = "ALL";

let cart = JSON.parse(localStorage.getItem("cart") || "[]"); // [{key,id,size,qty,name,img,price}]
let ship = {
  method: "",
  baseCost: 0,
  cost: 0,
  quoted: false,
  carrier: "",
  service: "",
  days: null,
  note: "",
};

let promoState = {
  code: localStorage.getItem("promoCode") || "",
  valid: false,
  discount: 0,
  freeShipping: false,
  msg: "",
};

function normalizePromo(code) {
  return (code || "").toString().trim().toUpperCase().replace(/\s+/g, "");
}

function formatMXN(v) {
  const n = Number(v || 0);
  try {
    return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MXN`;
  } catch {
    return `$${n} MXN`;
  }
}

function toast(msg) {
  const wrap = $("toastWrap");
  if (!wrap) return alert(msg);
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function save() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function getProduct(id) {
  return catalog?.products?.find((p) => p.id === id) || null;
}

function calcSubtotal() {
  return cart.reduce((sum, i) => {
    const p = getProduct(i.id);
    const price = Number(p?.baseMXN ?? i.price ?? 0);
    return sum + price * Number(i.qty || 0);
  }, 0);
}

function promoRule(code) {
  const c = normalizePromo(code);
  if (!c) return null;
  const rules = promos?.rules || [];
  return rules.find((r) => normalizePromo(r.code) === c) || null;
}

function applyPromoLocal(subtotal, shippingBase) {
  const code = normalizePromo(promoState.code);
  if (!code) return { valid: false, discount: 0, freeShipping: false, msg: "" };

  const rule = promoRule(code);
  if (!rule || !rule.active) return { valid: false, discount: 0, freeShipping: false, msg: "Cupón inválido o desactivado." };

  let discount = 0;
  let freeShipping = false;

  if (rule.type === "percent") discount = Math.round(subtotal * Number(rule.value || 0));
  if (rule.type === "fixed_mxn") discount = Math.round(Number(rule.value || 0));
  if (rule.type === "free_shipping") freeShipping = true;

  discount = Math.max(0, Math.min(discount, subtotal));
  return {
    valid: true,
    discount,
    freeShipping,
    msg: freeShipping ? "Cupón aplicado: envío gratis." : "Cupón aplicado.",
  };
}

function isEmail(v) {
  const s = (v || "").toString().trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function fillStates() {
  const sel = $("state");
  if (!sel) return;
  sel.innerHTML = MX_STATES.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
  // default BC
  sel.value = "BC";
}

function setShipFormVisibility() {
  const method = $("shipMethod").value;
  ship.method = method;

  const show = method === "tj" || method === "mx";
  $("shipForm").style.display = show ? "block" : "none";

  // Prefill para TJ
  if (method === "tj") {
    if (!$("city").value) $("city").value = "Tijuana";
    if (!$("state").value) $("state").value = "BC";
  }
}

function computeShippingBase() {
  const method = ship.method;

  ship.quoted = false;
  ship.carrier = "";
  ship.service = "";
  ship.days = null;
  ship.note = "";

  if (method === "pickup") {
    ship.baseCost = 0;
    return;
  }
  if (method === "tj") {
    ship.baseCost = 200;
    return;
  }
  if (method === "mx") {
    ship.baseCost = 0; // se cotiza
    return;
  }
  ship.baseCost = 0;
}

function renderCart() {
  $("cartBody").innerHTML =
    cart.map((i, x) => {
      const p = getProduct(i.id);
      const img = p?.img || i.img || "";
      const name = p?.name || i.name || "Producto";
      const sizeLine = i.size ? `<div style="opacity:.8">Talla: ${i.size}</div>` : "";
      return `
      <div class="cart-item">
        <img src="${img}" alt="${name}" />
        <div class="cart-item-details">
          <div class="cart-item-title">${name}</div>
          ${sizeLine}
        </div>
        <div style="text-align:right">
          <div style="font-weight:700">x${i.qty}</div>
          <div class="cart-remove" onclick="removeItem(${x})">Eliminar</div>
        </div>
      </div>`;
    }).join("") || `<div style="text-align:center;opacity:.5">Carrito vacío</div>`;
}

function updateTotals() {
  const subtotal = calcSubtotal();

  // promo preview
  const promo = applyPromoLocal(subtotal, ship.baseCost);
  promoState.valid = promo.valid;
  promoState.discount = promo.discount;
  promoState.freeShipping = promo.freeShipping;
  promoState.msg = promo.msg;

  let shippingShown = ship.baseCost;
  if (promo.freeShipping) shippingShown = 0;

  const total = Math.max(0, subtotal - promo.discount + shippingShown);

  $("cartCount").innerText = cart.reduce((a, b) => a + Number(b.qty || 0), 0);
  $("lnSub").innerText = formatMXN(subtotal);
  $("lnShip").innerText = formatMXN(shippingShown);
  $("lnTotal").innerText = formatMXN(total);

  if (promo.discount > 0) {
    $("rowDiscount").style.display = "flex";
    $("lnDiscount").innerText = `-${formatMXN(promo.discount).replace(" MXN", "")} MXN`;
  } else {
    $("rowDiscount").style.display = "none";
  }

  $("promoMsg").innerText = promoState.code ? promoState.msg : "";

  // habilitar pago
  const method = ship.method;
  const nameOk = ($("name").value || "").trim().length >= 3;
  const emailOk = isEmail($("email").value);
  const phoneOk = ($("phone").value || "").trim().length >= 7;

  let shipOk = !!method;

  if (method === "tj") {
    const addrOk = ($("addr").value || "").trim().length >= 6;
    const cityOk = ($("city").value || "").trim().length >= 2;
    shipOk = shipOk && addrOk && cityOk;
  }

  if (method === "mx") {
    const cpOk = ($("cp").value || "").trim().length === 5;
    const stateOk = ($("state").value || "").trim().length >= 2;
    const cityOk = ($("city").value || "").trim().length >= 2;
    const addrOk = ($("addr").value || "").trim().length >= 6;
    // requiere cotización (o cupón free shipping)
    const quotedOk = ship.quoted || promoState.freeShipping;
    shipOk = shipOk && cpOk && stateOk && cityOk && addrOk && quotedOk;
  }

  const canPay = cart.length > 0 && shipOk && nameOk && emailOk && phoneOk;
  $("payBtn").disabled = !canPay;
}

function updateCart(resetShipping = true) {
  if (resetShipping) {
    setShipFormVisibility();
    computeShippingBase();
    ship.cost = ship.baseCost;
    $("quoteResult").innerText = "";
  }

  renderCart();
  updateTotals();
}

function removeItem(idx) {
  cart.splice(idx, 1);
  save();
  updateCart(true);
}

function openDrawer() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  updateCart(false);
}
function closeAll() {
  $("drawer").classList.remove("active");
  $("overlay").classList.remove("active");
}
window.openDrawer = openDrawer;
window.closeAll = closeAll;
window.removeItem = removeItem;

function renderSectionsNav() {
  const wrap = $("sectionNav");
  if (!wrap) return;

  const secs = Array.isArray(catalog?.sections) ? [...catalog.sections] : [];
  secs.sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

  const pills = [
    { id: "ALL", title: "TODO" },
    ...secs.map((s) => ({ id: s.id, title: s.title })),
  ];

  wrap.innerHTML = pills.map((p) =>
    `<button class="nav-pill ${p.id === activeSection ? "active" : ""}" data-sec="${p.id}">${p.title}</button>`
  ).join("");

  wrap.querySelectorAll("button[data-sec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSection = btn.getAttribute("data-sec") || "ALL";
      renderSectionsNav();
      renderCatalog();
    });
  });
}

function renderCatalog() {
  const grid = $("catGrid");
  const products = Array.isArray(catalog?.products) ? catalog.products : [];

  const list = activeSection === "ALL"
    ? products
    : products.filter((p) => p.sectionId === activeSection);

  grid.innerHTML = list.map((p) => {
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    const isUnitalla = sizes.length === 1 && /unit/i.test(String(sizes[0] || ""));
    const sizeSelect = isUnitalla
      ? `<div class="label-sm" style="opacity:.8;margin-top:6px">Talla: Unitalla</div>`
      : `<select id="size_${p.id}">${sizes.map((s) => `<option value="${s}">${s}</option>`).join("")}</select>`;

    const sub = p.subSection ? `<div class="label-sm" style="opacity:.75;margin-bottom:6px">${p.subSection}</div>` : "";

    return `
      <div class="prodCard">
        <div class="prodImgBox">
          <img src="${p.img}" class="prodImg" alt="${p.name}" />
        </div>
        <div class="prodInfo">
          ${sub}
          <div class="prodTitle">${p.name}</div>
          ${sizeSelect}
          <div class="prodPrice">${formatMXN(p.baseMXN)}</div>
          <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
        </div>
      </div>
    `;
  }).join("");
}

function addToCart(id) {
  const p = getProduct(id);
  if (!p) return;

  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  const isUnitalla = sizes.length === 1 && /unit/i.test(String(sizes[0] || ""));
  const size = isUnitalla ? "Unitalla" : ($(`size_${id}`)?.value || "");

  const key = `${id}__${size}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty += 1;
  else cart.push({
    key,
    id,
    size,
    qty: 1,
    name: p.name,
    img: p.img,
    price: p.baseMXN,
  });

  save();
  openDrawer();
}
window.addToCart = addToCart;

let quoteTimer = null;
async function quoteShippingDebounced() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(quoteShipping, 450);
}

async function quoteShipping() {
  if (ship.method !== "mx") return;

  const cp = ($("cp").value || "").trim();
  const state = ($("state").value || "").trim();
  const city = ($("city").value || "").trim();
  const addr = ($("addr").value || "").trim();

  // no pegamos a la API si está incompleto
  if (cp.length !== 5 || !state || city.length < 2 || addr.length < 6) {
    ship.quoted = false;
    $("quoteResult").innerText = "Completa tu dirección para cotizar.";
    updateTotals();
    return;
  }

  $("quoteResult").innerText = "Cotizando envío...";
  ship.quoted = false;

  const payload = {
    items: cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size })),
    to: { postal_code: cp, state_code: state, city, address1: addr },
    mode: "auto",
  };

  try {
    const res = await fetch(API.quote, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    const mxn = Number(data.mxn || 0) || 250;
    ship.baseCost = mxn;
    ship.quoted = true;
    ship.carrier = data.carrier || "";
    ship.service = data.service || "";
    ship.days = data.days ?? null;
    ship.note = data.note || "";

    const extra = [
      ship.carrier ? `${ship.carrier}` : "",
      ship.service ? `${ship.service}` : "",
      ship.days ? `${ship.days} días` : "",
    ].filter(Boolean).join(" · ");

    $("quoteResult").innerText = `Envío: ${formatMXN(mxn)}${extra ? ` (${extra})` : ""}`;
    updateCart(false);
  } catch (e) {
    ship.baseCost = 250;
    ship.quoted = true; // permitimos continuar con mínimo
    $("quoteResult").innerText = `Envío: ${formatMXN(250)} (tarifa base)`;
    updateCart(false);
  }
}

function applyPromo() {
  promoState.code = normalizePromo($("promoCode").value);
  localStorage.setItem("promoCode", promoState.code);
  toast(promoState.code ? "Cupón actualizado." : "Cupón eliminado.");
  updateCart(false);
}
window.applyPromo = applyPromo;

async function getStripePk() {
  // 1) config endpoint (recomendado)
  try {
    const r = await fetch(API.config, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j?.stripe_pk) return j.stripe_pk;
    }
  } catch {}

  // 2) fallback global
  return (window.STRIPE_PK || "").trim();
}

async function checkout() {
  stripePK = stripePK || (await getStripePk());
  if (!stripePK) {
    toast("Falta configurar STRIPE_PUBLISHABLE_KEY en Netlify.");
    return;
  }

  const method = ship.method;
  const name = ($("name").value || "").trim();
  const email = ($("email").value || "").trim();
  const phone = ($("phone").value || "").trim();

  const to = {
    postal_code: ($("cp").value || "").trim(),
    state_code: ($("state").value || "").trim(),
    city: ($("city").value || "").trim(),
    address1: ($("addr").value || "").trim(),
    name,
    email,
    phone,
  };

  // payload limpio para backend
  const payload = {
    items: cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size })),
    mode: method,
    promoCode: promoState.code,
    to,
  };

  try {
    const res = await fetch(API.checkout, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    toast(data?.error || "No se pudo iniciar el pago.");
  } catch {
    toast("Error de red iniciando el pago.");
  }
}
window.checkout = checkout;

function applyUrlStatus() {
  const qs = new URLSearchParams(location.search);
  const st = qs.get("status");
  if (st === "success") {
    toast("Pago confirmado. Gracias 🔥");
    cart = [];
    save();
    updateCart(true);
    history.replaceState({}, "", "/");
  } else if (st === "cancel") {
    toast("Pago cancelado.");
    history.replaceState({}, "", "/");
  }
}

function bindUI() {
  $("overlay").onclick = closeAll;

  // ship method
  $("shipMethod").addEventListener("change", () => {
    updateCart(true);
    if (ship.method === "mx") quoteShippingDebounced();
  });

  // form inputs
  ["cp", "state", "city", "addr"].forEach((id) => {
    $(id).addEventListener("input", () => {
      updateCart(false);
      if (ship.method === "mx") quoteShippingDebounced();
    });
  });

  ["name", "email", "phone", "promoCode"].forEach((id) => {
    $(id).addEventListener("input", () => updateCart(false));
  });
}

async function loadData() {
  catalog = await (await fetch("/data/catalog.json", { cache: "no-store" })).json();
  promos = await (await fetch("/data/promos.json", { cache: "no-store" })).json();
}

async function registerSW() {
  try {
    if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js");
  } catch {}
}

(async function init() {
  fillStates();
  $("promoCode").value = promoState.code;

  stripePK = await getStripePk();

  await loadData();
  renderSectionsNav();
  renderCatalog();

  bindUI();
  applyUrlStatus();

  updateCart(true);
  registerSW();
})();