/**
 * SCORE STORE - main.js (v21 PROD)
 * - Carrito robusto
 * - Catálogo dinámico
 * - Promo con validación (si mapeas a Stripe Promotion Codes)
 * - Backend recalcula precios desde catalog.json (anti-tampering)
 */

const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; // <-- pega tu pk_live real
const USD_RATE_FALLBACK = 17.50;

const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";

let catalog = null;
let promos = null;

let cart = safeJson(localStorage.getItem(LS_CART), []);
let promoState = safeJson(localStorage.getItem(LS_PROMO), null); // { code, type, value, stripe_promotion_code }
let ship = { method: "", cost: 0 };

const $ = (id) => document.getElementById(id);
const moneyMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
const moneyUSD = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

function safeJson(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.visibility = "visible";
  t.classList.add("show");
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => (t.style.visibility = "hidden"), 300);
  }, 2400);
}

function debounce(fn, ms=450) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function fetchJSON(url, { timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function boot() {
  // UI events
  $("cartBtnTrigger")?.addEventListener("click", openDrawer);
  $("viewCartBtn")?.addEventListener("click", openDrawer);
  $("paybarCartBtn")?.addEventListener("click", openDrawer);

  $("closeDrawerBtn")?.addEventListener("click", closeAll);
  $("closeCatalogBtn")?.addEventListener("click", closeAll);
  $("continueBtn")?.addEventListener("click", closeAll);
  $("continueBtn")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") closeAll();
  });

  $("buyNowBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("grid")?.scrollIntoView({ behavior: "smooth" });
  });

  $("promoApplyBtn")?.addEventListener("click", applyPromo);

  $("shipMethod")?.addEventListener("change", () => updateCart(true));
  $("cp")?.addEventListener("input", debounce(() => updateCart(false), 300));
  $("addr")?.addEventListener("input", () => updateCart(false));
  $("name")?.addEventListener("input", () => updateCart(false));

  $("payBtn")?.addEventListener("click", checkout);

  $("overlay")?.addEventListener("click", closeAll);

  // Cards open
  document.querySelectorAll(".card[data-open]").forEach((card) => {
    const open = () => openCatalog(card.dataset.open, card.dataset.title);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });

  // load catalog + promos
  try {
    catalog = await fetchJSON(`/data/catalog.json?t=${Date.now()}`);
  } catch {
    toast("No se pudo cargar el catálogo. Reintenta.");
  }

  try {
    promos = await fetchJSON(`/data/promos.json?t=${Date.now()}`);
  } catch {
    promos = { active_promos: [] };
  }

  // normalize promo state (si ya guardaste algo viejo)
  if (promoState && !isPromoValidLocal(promoState)) {
    promoState = null;
    localStorage.removeItem(LS_PROMO);
  }

  updateCart(true);

  // Service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
  }
}

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
}

function cartCount() {
  return cart.reduce((a, b) => a + (b.qty || 0), 0);
}

function subtotal() {
  return cart.reduce((a, b) => a + (Number(b.price || 0) * Number(b.qty || 0)), 0);
}

function getFx() {
  return Number(catalog?.site?.fx_mxn_per_usd || USD_RATE_FALLBACK);
}

/**
 * Promo local: SOLO PARA MOSTRAR ESTIMADO.
 * El descuento real debe vivir en Stripe con Promotion Code.
 */
function promoDiscountAmount(sub) {
  if (!promoState) return 0;
  if (promoState.type === "pct") return Math.round(sub * (Number(promoState.value) / 100));
  if (promoState.type === "mxn") return Math.min(sub, Number(promoState.value));
  return 0;
}

function isPromoValidLocal(p) {
  if (!p || !p.code) return false;
  // validación mínima (la real se revalida en backend)
  return true;
}

async function applyPromo() {
  const input = $("promoInput");
  const code = (input?.value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return;

  const list = promos?.active_promos || [];
  const found = list.find(x => (x.code || "").toUpperCase() === code);

  if (!found) {
    promoState = null;
    localStorage.removeItem(LS_PROMO);
    toast("Cupón no válido o expirado.");
    updateCart(false);
    return;
  }

  // validaciones simples
  const sub = subtotal();
  const min = Number(found.minSubtotal || 0);
  if (min && sub < min) {
    toast(`Cupón requiere mínimo ${moneyMXN(min)}.`);
    return;
  }

  promoState = {
    code: found.code,
    type: found.type,
    value: found.value,
    stripe_promotion_code: found.stripe_promotion_code || "" // recomendado
  };
  localStorage.setItem(LS_PROMO, JSON.stringify(promoState));
  toast("Cupón aplicado (se confirma en checkout).");
  updateCart(false);
}

function setShipMethodFromUI() {
  const method = $("shipMethod")?.value || "";
  ship.method = method;

  // costos base (operación real sin cotizador externo)
  if (method === "pickup") ship.cost = 0;
  else if (method === "tj") ship.cost = 200;
  else if (method === "mx") ship.cost = 250; // tarifa estándar nacional
  else ship.cost = 0;

  const shipForm = $("shipForm");
  if (shipForm) shipForm.style.display = (method === "mx") ? "block" : "none";
}

function updateCart(resetShip = true) {
  if (resetShip) setShipMethodFromUI();

  const sub = subtotal();
  const disc = promoDiscountAmount(sub);
  const total = Math.max(0, sub - disc) + ship.cost;

  // counter
  const countEl = $("cartCount");
  if (countEl) {
    countEl.innerText = String(cartCount());
    const trigger = $("cartBtnTrigger");
    trigger?.classList.remove("cart-bounce");
    void trigger?.offsetWidth;
    trigger?.classList.add("cart-bounce");
  }

  // lines
  $("lnSub").innerText = moneyMXN(sub).replace("MXN", "").trim();
  $("lnShip").innerText = moneyMXN(ship.cost).replace("MXN", "").trim();
  $("lnTotal").innerText = `${moneyMXN(total)} MXN`.replace("MXN MXN", "MXN");

  const fx = getFx();
  const usd = total / fx;
  $("lnUsd").innerText = `Aprox ${moneyUSD(usd)} USD`;

  const rowDiscount = $("rowDiscount");
  if (rowDiscount) rowDiscount.style.display = disc > 0 ? "flex" : "none";
  if ($("lnDiscount")) $("lnDiscount").innerText = `-${moneyMXN(disc).replace("MXN","").trim()}`;

  // cart body
  const body = $("cartBody");
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center; padding:40px 20px; opacity:0.55;">Tu equipo está vacío</div>`;
  } else {
    body.innerHTML = cart.map((i, idx) => `
      <div style="display:flex; gap:10px; margin-bottom:12px; background:#f4f4f4; padding:10px; border-radius:8px;">
        <img src="${i.img}" alt="" style="width:60px; height:60px; object-fit:contain; mix-blend-mode:multiply;">
        <div style="flex:1;">
          <div style="font-weight:800; font-size:13px; line-height:1.2;">${escapeHtml(i.name)}</div>
          <div style="font-size:12px; color:#666;">Talla: ${escapeHtml(i.size || "Unitalla")}</div>
          <div style="font-size:12px; color:#111; font-weight:800;">${moneyMXN(i.price)}</div>
        </div>
        <div style="text-align:right; display:flex; flex-direction:column; justify-content:space-between;">
          <button type="button" data-remove="${idx}" aria-label="Eliminar" style="color:var(--red); border:none; background:none; font-weight:900; font-size:18px; cursor:pointer;">&times;</button>
          <div style="font-weight:900;">x${Number(i.qty || 0)}</div>
        </div>
      </div>
    `).join("");

    body.querySelectorAll("button[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.remove);
        cart.splice(idx, 1);
        saveCart();
        updateCart(false);
      });
    });
  }

  // paybar
  $("barTotal").innerText = moneyMXN(total).replace("MXN","").trim();
  $("paybar")?.classList.toggle("visible", cart.length > 0);

  // validate checkout
  let valid = cart.length > 0 && ship.method;
  if (ship.method === "mx") {
    const cp = ($("cp")?.value || "").trim();
    const addr = ($("addr")?.value || "").trim();
    const name = ($("name")?.value || "").trim();
    valid = valid && cp.length === 5 && addr.length >= 6 && name.length >= 3;
  }

  $("payBtn").disabled = !valid;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

async function openCatalog(sectionId, title) {
  $("catTitle").innerText = String(title || "CATÁLOGO").toUpperCase();
  const content = $("catContent");
  const modal = $("modalCatalog");

  if (!catalog) {
    content.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">No se pudo cargar el catálogo.</div>`;
    modal.classList.add("active");
    $("overlay").classList.add("active");
    document.body.classList.add("modalOpen");
    trapFocus(modal);
    return;
  }

  // skeleton
  let skeletons = "";
  for (let i = 0; i < 6; i++) skeletons += `<div class="prodCard skeleton" style="height:320px;"></div>`;
  content.innerHTML = `<div class="catGrid">${skeletons}</div>`;

  modal.classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
  trapFocus(modal);

  const items = (catalog.products || []).filter(p => p.sectionId === sectionId);
  if (!items.length) {
    content.innerHTML = `<div style="text-align:center; padding:40px; color:#666;"><h3>PRÓXIMAMENTE</h3><p>Colección en proceso de carga.</p></div>`;
    return;
  }

  // group by subSection
  const groups = {};
  items.forEach(p => {
    const k = p.subSection || "GENERAL";
    if (!groups[k]) groups[k] = [];
    groups[k].push(p);
  });

  const keys = Object.keys(groups);
  keys.sort((a,b) => (String(b).includes("2025") - String(a).includes("2025")) || a.localeCompare(b));

  let html = "";
  for (const groupName of keys) {
    html += `<div class="catSectionTitle">${escapeHtml(groupName)}</div>`;
    html += `<div class="catGrid">`;
    html += groups[groupName].map(p => {
      const price = Number(p.baseMXN || p.price || 0);
      const sizes = (p.sizes && p.sizes.length) ? p.sizes : ["Unitalla"];
      return `
        <div class="prodCard">
          <img src="${p.img}" alt="${escapeHtml(p.name)}" loading="lazy"
            onload="this.classList.add('loaded')" onerror="this.src='/assets/logo-score.webp'">
          <div style="font-weight:800; font-size:14px; margin:5px 0;">${escapeHtml(p.name)}</div>
          <div style="color:var(--red); font-weight:900;">${moneyMXN(price)}</div>
          <select id="size_${p.id}" aria-label="Talla">
            ${sizes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
          </select>
          <button id="btn_${p.id}" class="btn primary" type="button"
            style="width:100%; justify-content:center; padding:8px;"
            data-add="${p.id}">AGREGAR</button>
        </div>
      `;
    }).join("");
    html += `</div>`;
  }

  content.innerHTML = html;

  content.querySelectorAll("button[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.add;
      const prod = (catalog.products || []).find(x => x.id === id);
      if (!prod) return;

      const size = ($(`size_${id}`)?.value || "Unitalla");
      addToCart(prod, size, btn);
    });
  });
}

function addToCart(prod, size, btn) {
  const id = prod.id;
  const name = prod.name;
  const price = Number(prod.baseMXN || prod.price || 0);
  const img = prod.img;

  const originalText = btn?.innerText || "AGREGAR";
  if (btn) {
    btn.innerText = "¡LISTO!";
    btn.style.background = "var(--green)";
    btn.style.color = "#fff";
  }

  const key = `${id}__${size}`;
  const exist = cart.find(i => i.key === key);
  if (exist) exist.qty += 1;
  else cart.push({ key, id, name, price, img, size, qty: 1 });

  saveCart();
  toast("Agregado al carrito");

  setTimeout(() => {
    if (btn) {
      btn.innerText = originalText;
      btn.style.background = "";
      btn.style.color = "";
    }
    closeAll();
    openDrawer();
  }, 550);
}

function openDrawer() {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "true");
  updateCart(false);
  trapFocus($("drawer"));
}

function closeAll() {
  $("drawer")?.classList.remove("active");
  $("modalCatalog")?.classList.remove("active");
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "false");
  $("mainContent")?.focus();
}

/**
 * Focus trap sin duplicar listeners (tu versión anterior los acumulaba)
 */
const trapHandlers = new WeakMap();
function trapFocus(container) {
  if (!container) return;

  if (trapHandlers.has(container)) {
    const old = trapHandlers.get(container);
    container.removeEventListener("keydown", old);
    trapHandlers.delete(container);
  }

  const focusables = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  const handler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAll();
      return;
    }
    if (e.key !== "Tab" || !focusables.length) return;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  container.addEventListener("keydown", handler);
  trapHandlers.set(container, handler);
  first?.focus();
}

async function checkout() {
  const btn = $("payBtn");
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;

  try {
    const stripe = Stripe(STRIPE_PK);

    const payload = {
      items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })), // ✅ no mandamos precio: backend lo recalcula
      shipping: {
        method: ship.method,
        data: {
          cp: ($("cp")?.value || "").trim(),
          address: ($("addr")?.value || "").trim(),
          name: ($("name")?.value || "").trim()
        }
      },
      promo: promoState ? { code: promoState.code } : null
    };

    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudo iniciar el pago.");

    if (data.url) {
      location.href = data.url;
      return;
    }
    throw new Error("Respuesta inválida al iniciar pago.");
  } catch (e) {
    toast(e.message || "Error iniciando pago.");
    btn.innerText = "PAGAR AHORA";
    btn.disabled = false;
  }
}

boot();