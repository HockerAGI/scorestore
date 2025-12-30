/**
 * SCORE STORE - main.js (v22.1 PROD)
 * - IDs alineados con index
 * - Payload alineado con create_checkout: { items, to, mode, promoCode }
 * - Shipping quote: /(.netlify/functions|api)/shipping
 * - Checkout: /(.netlify/functions|api)/create_checkout
 * - Legal modal integrado
 */

const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";
const USD_RATE_FALLBACK = 17.50;

const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";

const API_BASE = (location.hostname.includes("netlify"))
  ? "/.netlify/functions"
  : "/api";

let catalog = null;
let promos = null;

let cart = safeJson(localStorage.getItem(LS_CART), []);
let promoState = safeJson(localStorage.getItem(LS_PROMO), null); // { code, type:'pct|mxn|info', value }
let ship = { mode: "pickup", mxn: 0, label: "Pickup" };

const $ = (id) => document.getElementById(id);

const moneyMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
const moneyUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

function safeJson(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

function debounce(fn, ms = 450) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

async function fetchJSON(url, { timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    return await res.json();
  } finally { clearTimeout(t); }
}

function cartCount() { return cart.reduce((a, b) => a + Number(b.qty || 0), 0); }
function subtotal() { return cart.reduce((a, b) => a + (Number(b.price || 0) * Number(b.qty || 0)), 0); }
function getFx() { return Number(catalog?.site?.fx_mxn_per_usd || USD_RATE_FALLBACK); }

function promoDiscountAmount(sub) {
  if (!promoState) return 0;
  if (promoState.type === "pct") return Math.round(sub * (Number(promoState.value) / 100));
  if (promoState.type === "mxn") return Math.min(sub, Number(promoState.value));
  return 0;
}

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function saveCart() { localStorage.setItem(LS_CART, JSON.stringify(cart)); }

function setShipFromUI() {
  const selected = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";
  ship.mode = selected;

  const form = $("shipForm");
  const needsAddress = (selected === "mx" || selected === "tj");
  if (form) form.style.display = needsAddress ? "block" : "none";

  // fallbacks
  if (selected === "pickup") { ship.mxn = 0; ship.label = "Pickup"; }
  if (selected === "tj") { ship.mxn = 200; ship.label = "Envío local"; }
  if (selected === "mx") { ship.mxn = 250; ship.label = "Envío nacional"; }
}

async function quoteShippingIfPossible() {
  if (!(ship.mode === "mx" || ship.mode === "tj")) return;

  const cp = normalizeCode($("cp")?.value);
  if (!/^\d{5}$/.test(cp)) return;

  try {
    const res = await fetch(`${API_BASE}/shipping`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ mode: ship.mode, to: { postal_code: cp } })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;

    const mxn = Number(data?.mxn ?? data?.amount ?? data?.rate ?? NaN);
    if (Number.isFinite(mxn) && mxn >= 0) {
      ship.mxn = mxn;
      ship.label = String(data?.label || ship.label);
    }
  } catch {
    // fallback silencioso
  }
}

function renderCartBody() {
  const body = $("cartBody");
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center; padding:40px 20px; opacity:.6;">Tu carrito está vacío</div>`;
    return;
  }

  body.innerHTML = cart.map((i, idx) => `
    <div style="display:flex; gap:10px; margin-bottom:12px; background:#f4f4f4; padding:10px; border-radius:12px;">
      <img src="${escapeHtml(i.img)}" alt="" style="width:60px; height:60px; object-fit:contain; mix-blend-mode:multiply;">
      <div style="flex:1;">
        <div style="font-weight:900; font-size:13px; line-height:1.2;">${escapeHtml(i.name)}</div>
        <div style="font-size:12px; color:#666;">Talla: ${escapeHtml(i.size || "Unitalla")}</div>
        <div style="font-size:12px; color:#111; font-weight:900;">${moneyMXN(i.price)}</div>
      </div>
      <div style="text-align:right; display:flex; flex-direction:column; justify-content:space-between;">
        <button type="button" data-remove="${idx}" aria-label="Eliminar"
          style="color:var(--red); border:none; background:none; font-weight:900; font-size:18px; cursor:pointer;">&times;</button>
        <div style="font-weight:900;">x${Number(i.qty || 0)}</div>
      </div>
    </div>
  `).join("");

  body.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.remove);
      cart.splice(idx, 1);
      saveCart();
      updateCart({ recalcShip: true });
    });
  });
}

async function updateCart({ recalcShip } = { recalcShip: true }) {
  setShipFromUI();
  if (recalcShip) await quoteShippingIfPossible();

  const sub = subtotal();
  const disc = promoDiscountAmount(sub);
  const total = Math.max(0, sub - disc) + Number(ship.mxn || 0);

  // count
  const countEl = $("cartCount");
  if (countEl) countEl.innerText = String(cartCount());

  // lines
  $("lnSub").innerText = moneyMXN(sub);
  $("lnShip").innerText = moneyMXN(ship.mxn || 0);
  $("lnTotal").innerText = moneyMXN(total);

  const rowDiscount = $("rowDiscount");
  if (rowDiscount) rowDiscount.style.display = disc > 0 ? "flex" : "none";
  if ($("lnDiscount")) $("lnDiscount").innerText = `- ${moneyMXN(disc)}`;

  const fx = getFx();
  const usd = total / fx;
  const usdEl = $("lnUsd");
  if (usdEl) usdEl.textContent = `Aprox ${moneyUSD(usd)} USD`;

  renderCartBody();

  // paybar
  $("barTotal").innerText = moneyMXN(total);
  $("paybar")?.classList.toggle("visible", cart.length > 0);

  // validate
  let valid = cart.length > 0 && ship.mode;
  if (ship.mode === "mx" || ship.mode === "tj") {
    const cp = String($("cp")?.value || "").trim();
    const addr = String($("addr")?.value || "").trim();
    const name = String($("name")?.value || "").trim();
    const city = String($("city")?.value || "").trim();
    const state = String($("state")?.value || "").trim();
    valid = valid && /^\d{5}$/.test(cp) && addr.length >= 6 && name.length >= 3 && city.length >= 2 && state.length >= 2;
  }
  $("payBtn").disabled = !valid;
}

async function applyPromo() {
  const code = normalizeCode($("promoInput")?.value);
  if (!code) return;

  const list = promos?.active_promos || promos?.rules || [];
  const found = list.find(x => normalizeCode(x.code) === code);

  if (!found || found.active === false) {
    promoState = null;
    localStorage.removeItem(LS_PROMO);
    toast("Cupón no válido o expirado.");
    updateCart({ recalcShip: false });
    return;
  }

  // soporta percent en 0.10 o 10
  if (found.type === "percent") {
    const v = Number(found.value);
    const pct = (v <= 1) ? (v * 100) : v;
    promoState = { code, type: "pct", value: pct };
  } else if (found.type === "fixed_mxn") {
    promoState = { code, type: "mxn", value: Number(found.value) };
  } else {
    promoState = { code, type: "info", value: 0 };
  }

  localStorage.setItem(LS_PROMO, JSON.stringify(promoState));
  toast("Cupón aplicado (se confirma al pagar).");
  updateCart({ recalcShip: true });
}

window.openCatalog = async function openCatalog(sectionId, title) {
  $("catTitle").innerText = String(title || "CATÁLOGO").toUpperCase();
  const content = $("catContent");
  const modal = $("modalCatalog");

  if (!catalog) {
    content.innerHTML = `<div style="padding:20px; text-align:center; color:#666;">No se pudo cargar el catálogo.</div>`;
    modal.classList.add("active");
    $("overlay").classList.add("active");
    document.body.classList.add("modalOpen");
    return;
  }

  content.innerHTML = `<div class="catGrid">Cargando…</div>`;
  modal.classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  const items = (catalog.products || []).filter(p => p.sectionId === sectionId);
  if (!items.length) {
    content.innerHTML = `<div style="text-align:center; padding:40px; color:#666;"><h3>PRÓXIMAMENTE</h3><p>Colección en proceso de carga.</p></div>`;
    return;
  }

  const groups = {};
  items.forEach(p => {
    const k = p.subSection || "GENERAL";
    if (!groups[k]) groups[k] = [];
    groups[k].push(p);
  });

  const keys = Object.keys(groups).sort((a,b) => a.localeCompare(b));
  let html = "";

  for (const groupName of keys) {
    html += `<div class="catSectionTitle" style="font-weight:900; margin:10px 0 8px;">${escapeHtml(groupName)}</div>`;
    html += `<div class="catGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">`;

    html += groups[groupName].map(p => {
      const price = Number(p.baseMXN || 0);
      const sizes = (p.sizes && p.sizes.length) ? p.sizes : ["Unitalla"];
      return `
        <div class="prodCard" style="background:#fff;border:1px solid #eee;border-radius:16px;padding:12px;box-shadow:0 8px 18px rgba(0,0,0,.06);">
          <img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.name)}" loading="lazy"
            style="width:100%;height:140px;object-fit:contain;mix-blend-mode:multiply;">
          <div style="font-weight:900; font-size:14px; margin:8px 0 4px;">${escapeHtml(p.name)}</div>
          <div style="color:var(--red); font-weight:900; margin-bottom:8px;">${moneyMXN(price)}</div>

          <select id="size_${escapeHtml(p.id)}" aria-label="Talla"
            style="width:100%;padding:10px;border-radius:12px;border:1px solid #ddd;margin-bottom:10px;">
            ${sizes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
          </select>

          <button class="btn primary" type="button" style="width:100%; padding:10px;"
            data-add="${escapeHtml(p.id)}">AGREGAR</button>
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
};

function addToCart(prod, size, btn) {
  const id = prod.id;
  const name = prod.name;
  const price = Number(prod.baseMXN || 0);
  const img = prod.img;

  const key = `${id}__${size}`;
  const exist = cart.find(i => i.key === key);
  if (exist) exist.qty += 1;
  else cart.push({ key, id, name, price, img, size, qty: 1 });

  saveCart();

  if (btn) {
    const old = btn.innerText;
    btn.innerText = "¡LISTO!";
    btn.style.background = "var(--green)";
    btn.style.color = "#fff";
    setTimeout(() => { btn.innerText = old; btn.style.background = ""; btn.style.color = ""; }, 650);
  }

  toast("Agregado al carrito");
  closeAll();
  openDrawer();
}

window.openDrawer = function openDrawer() {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "true");
  updateCart({ recalcShip: true });
};

window.closeAll = function closeAll() {
  $("drawer")?.classList.remove("active");
  $("modalCatalog")?.classList.remove("active");
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "false");
};

window.openLegal = function openLegal(which) {
  const m = $("legalModal");
  if (!m) return;

  m.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");

  document.querySelectorAll(".tabBtn").forEach(b => b.classList.toggle("active", b.dataset.legal === which));
  document.querySelectorAll(".legalBlock").forEach(a => a.classList.toggle("active", a.dataset.legalBlock === which));
};

window.closeLegal = function closeLegal() {
  $("legalModal")?.classList.remove("active");
  const anyOpen = $("drawer")?.classList.contains("active") || $("modalCatalog")?.classList.contains("active");
  if (!anyOpen) {
    $("overlay")?.classList.remove("active");
    document.body.classList.remove("modalOpen");
  }
};

window.checkout = async function checkout() {
  const btn = $("payBtn");
  btn.innerText = "PROCESANDO…";
  btn.disabled = true;

  try {
    if (!window.Stripe) throw new Error("Stripe no cargó. Reintenta.");

    const stripe = Stripe(STRIPE_PK);
    const mode = ship.mode || "pickup";

    const to = {
      postal_code: String($("cp")?.value || "").trim(),
      state_code: String($("state")?.value || "").trim(),
      city: String($("city")?.value || "").trim(),
      address1: String($("addr")?.value || "").trim(),
      name: String($("name")?.value || "").trim(),
    };

    const payload = {
      items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })), // anti-tamper
      to: (mode === "pickup") ? {} : to,
      mode,
      promoCode: promoState?.code ? String(promoState.code) : ""
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No se pudo iniciar el pago.");

    if (data.url) {
      location.href = data.url;
      return;
    }
    throw new Error("Respuesta inválida al iniciar pago.");
  } catch (e) {
    toast(e.message || "Error iniciando pago.");
    btn.innerText = "PAGAR SEGURO";
    btn.disabled = false;
  }
};

async function boot() {
  $("overlay")?.addEventListener("click", () => { closeAll(); closeLegal(); });

  document.querySelectorAll('input[name="shipMode"]').forEach(r => {
    r.addEventListener("change", () => updateCart({ recalcShip: true }));
  });

  $("promoApplyBtn")?.addEventListener("click", applyPromo);

  const onAddrChange = debounce(() => updateCart({ recalcShip: true }), 350);
  $("cp")?.addEventListener("input", onAddrChange);
  $("addr")?.addEventListener("input", onAddrChange);
  $("name")?.addEventListener("input", () => updateCart({ recalcShip: false }));
  $("city")?.addEventListener("input", () => updateCart({ recalcShip: false }));
  $("state")?.addEventListener("input", () => updateCart({ recalcShip: false }));

  try { catalog = await fetchJSON(`/data/catalog.json?t=${Date.now()}`); }
  catch { toast("No se pudo cargar el catálogo. Reintenta."); }

  try { promos = await fetchJSON(`/data/promos.json?t=${Date.now()}`); }
  catch { promos = { active_promos: [] }; }

  if (promoState && !promoState.code) {
    promoState = null;
    localStorage.removeItem(LS_PROMO);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
  }

  updateCart({ recalcShip: true });
}

boot();