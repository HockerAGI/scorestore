/**
 * SCORE STORE — main.js (FINAL OPERACIÓN REAL)
 * - Respeta index.html + styles.css finales
 * - Normaliza sectionId (SF_250 / SF250 etc.)
 * - Catálogo: modal + grid pro + tallas
 * - Carrito: drawer + qty + remove + totals
 * - Envío: pickup / tj / mx (estimado UI)
 * - Promo: promos.json (optional)
 * - Checkout: NO cambia tu backend; intenta /api/create_checkout y fallback Netlify
 */

const USD_RATE_FALLBACK = 17.5;
const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";

let catalog = null;
let promos = { active_promos: [] };

let cart = safeJson(localStorage.getItem(LS_CART), []);
let promoState = safeJson(localStorage.getItem(LS_PROMO), null);

let ship = { mode: "pickup", mxn: 0, label: "Pickup" };

const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));

function safeJson(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function moneyMXN(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })
    .format(Number(n || 0));
}
function moneyUSD(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format(Number(n || 0));
}

function getFx() {
  return Number(catalog?.site?.fx_mxn_per_usd || USD_RATE_FALLBACK);
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
}
function savePromo() {
  localStorage.setItem(LS_PROMO, JSON.stringify(promoState));
}

function cartCount() {
  return cart.reduce((a, b) => a + Number(b.qty || 0), 0);
}
function subtotal() {
  return cart.reduce((a, b) => a + Number(b.price || 0) * Number(b.qty || 0), 0);
}

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Normaliza sectionId por tus variantes reales */
function normalizeSectionId(id) {
  const s = String(id || "").trim().toUpperCase();
  // SF variants
  if (s === "SF_250" || s === "SF-250" || s === "SANFELIPE250") return "SF250";
  if (s === "SF250") return "SF250";
  // Baja variants
  if (s === "BAJA1000" || s === "BAJA_1000" || s === "BAJA-1000") return "BAJA_1000";
  if (s === "BAJA500" || s === "BAJA_500" || s === "BAJA-500") return "BAJA_500";
  if (s === "BAJA400" || s === "BAJA_400" || s === "BAJA-400") return "BAJA_400";
  // default keep (but normalized)
  return s;
}

function promoDiscount(sub) {
  if (!promoState) return 0;
  if (promoState.type === "pct") return Math.round(sub * (Number(promoState.value || 0) / 100));
  if (promoState.type === "mxn") return Math.min(sub, Number(promoState.value || 0));
  return 0;
}

/** Estimado UI (el backend puede recalcular) */
function computeShipEstimate(mode) {
  // Si en tu catalog.json pones: site.shipping = { pickup:0, tj:120, mx:180 } lo toma.
  const conf = catalog?.site?.shipping || null;
  const fallback = { pickup: 0, tj: 120, mx: 180 };
  const src = conf && typeof conf === "object" ? conf : fallback;
  const mxn = Number(src?.[mode] ?? fallback[mode] ?? 0);
  return mxn;
}

function ensureDom() {
  const needed = ["#overlay","#drawer","#modalCatalog","#catContent","#cartBody","#cartCount","#lnSub","#lnShip","#lnTotal","#barTotal","#payBtn"];
  const missing = needed.filter(s => !$(s));
  if (missing.length) {
    console.error("Faltan IDs en index.html:", missing);
    toast("Falta estructura en index.html (IDs). Revisa consola.");
    return false;
  }
  return true;
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

/* =========================
   UI OPEN/CLOSE
========================= */
window.openDrawer = function () {
  $("#overlay").classList.add("active");
  $("#drawer").classList.add("active");
  $("#overlay").setAttribute("aria-hidden","false");
  $("#drawer").setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
  $("#cartBtnTrigger")?.setAttribute("aria-expanded","true");
  updateCart();
};

window.closeAll = function () {
  $("#drawer")?.classList.remove("active");
  $("#modalCatalog")?.classList.remove("active");
  $("#legalModal")?.classList.remove("active");
  $("#overlay")?.classList.remove("active");

  $("#overlay")?.setAttribute("aria-hidden","true");
  $("#drawer")?.setAttribute("aria-hidden","true");
  $("#modalCatalog")?.setAttribute("aria-hidden","true");
  $("#legalModal")?.setAttribute("aria-hidden","true");

  document.body.classList.remove("modalOpen");
  $("#cartBtnTrigger")?.setAttribute("aria-expanded","false");
};

window.openLegal = function(key) {
  const overlay = $("#overlay");
  const legal = $("#legalModal");
  if (!legal) return;
  overlay.classList.add("active");
  legal.classList.add("active");
  overlay.setAttribute("aria-hidden","false");
  legal.setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
  if (key) activateLegal(key);
};

window.closeLegal = function() {
  const overlay = $("#overlay");
  const legal = $("#legalModal");
  if (!legal) return;
  legal.classList.remove("active");
  overlay.classList.remove("active");
  legal.setAttribute("aria-hidden","true");
  overlay.setAttribute("aria-hidden","true");
  document.body.classList.remove("modalOpen");
};

function activateLegal(key){
  $$(".tabBtn").forEach(b=>b.classList.toggle("active", b.dataset.legalTab===key));
  $$(".legalBlock").forEach(a=>a.classList.toggle("active", a.dataset.legalBlock===key));
}

/* =========================
   CATALOG
========================= */
window.openCatalog = function (sectionId, title) {
  const sid = normalizeSectionId(sectionId);
  const wrap = $("#catContent");
  const modal = $("#modalCatalog");
  const overlay = $("#overlay");

  $("#catTitle").textContent = title || "CATÁLOGO";
  wrap.innerHTML = "";

  const items = (catalog?.products || []).filter(p => normalizeSectionId(p.sectionId) === sid);

  if (!items.length) {
    wrap.innerHTML = `<div class="emptyState" style="padding:22px;text-align:center;opacity:.7">
      <h4 style="margin-bottom:6px">Próximamente</h4>
      <p style="font-size:13px">No hay productos cargados para esta sección.</p>
    </div>`;
  } else {
    // Agrupar por subSection si existe
    const groups = {};
    items.forEach(p => {
      const k = String(p.subSection || "GENERAL");
      (groups[k] ||= []).push(p);
    });

    Object.keys(groups).forEach(k => {
      const h = document.createElement("h4");
      h.style.margin = "6px 0 10px";
      h.style.fontWeight = "900";
      h.textContent = (catalog?.labels?.subsections?.[k] || k);
      wrap.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "productGrid";

      groups[k].forEach(p => {
        let selectedSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";

        const card = document.createElement("div");
        card.className = "productCard";

        const isLimited = String(p.status||"").toLowerCase() === "low_stock";
        const badgeText = isLimited ? "EDICIÓN LIMITADA" : "DISPONIBLE";

        card.innerHTML = `
          <div class="productImg">
            <img src="${p.img}" alt="${escapeHtml(p.name)}" loading="lazy">
            <span class="badge ${isLimited ? "limited":"available"}">${badgeText}</span>
          </div>
          <div class="productInfo">
            <h4>${escapeHtml(p.name)}</h4>
            <div class="sku">${escapeHtml(p.sku || "")}</div>
            <div class="price">${moneyMXN(p.baseMXN)}</div>
            <div class="sizeRow">
              ${(p.sizes && p.sizes.length ? p.sizes : ["Unitalla"])
                .map(s => `<button type="button" class="sizeBtn ${s===selectedSize?"active":""}">${escapeHtml(s)}</button>`)
                .join("")}
            </div>
            <button class="addBtn" type="button">AGREGAR AL CARRITO</button>
          </div>
        `;

        card.querySelectorAll(".sizeBtn").forEach(btn => {
          btn.addEventListener("click", () => {
            card.querySelectorAll(".sizeBtn").forEach(x => x.classList.remove("active"));
            btn.classList.add("active");
            selectedSize = btn.textContent.trim();
          });
        });

        card.querySelector(".addBtn").addEventListener("click", () => addToCart(p, selectedSize));

        grid.appendChild(card);
      });

      wrap.appendChild(grid);
    });

    wrap.dataset.filled = "1";
  }

  modal.classList.add("active");
  overlay.classList.add("active");
  modal.setAttribute("aria-hidden","false");
  overlay.setAttribute("aria-hidden","false");
  document.body.classList.add("modalOpen");
};

/* =========================
   CART
========================= */
function addToCart(prod, size) {
  const sz = String(size || "Unitalla").trim();
  const key = `${prod.id}__${sz}`;
  const found = cart.find(i => i.key === key);

  if (found) found.qty += 1;
  else cart.push({
    key,
    id: prod.id,
    sku: prod.sku,
    name: prod.name,
    img: prod.img,
    size: sz,
    price: Number(prod.baseMXN || 0),
    qty: 1,
  });

  saveCart();
  updateCart();
  toast("Producto agregado al carrito 🛒");
  window.openDrawer();
}

window.renderCart = function () {
  const body = $("#cartBody");
  body.innerHTML = "";

  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center;padding:28px;opacity:.65">Tu carrito está vacío</div>`;
    return;
  }

  cart.forEach((item) => {
    const el = document.createElement("div");
    el.className = "cartItem";

    el.innerHTML = `
      <img src="${item.img}" alt="" loading="lazy">
      <div class="cartMeta">
        <strong>${escapeHtml(item.name)}</strong>
        <span>Talla: ${escapeHtml(item.size)}</span>
        <div class="qtyRow">
          <button class="qtyBtn" type="button" aria-label="Disminuir">−</button>
          <span>${item.qty}</span>
          <button class="qtyBtn" type="button" aria-label="Aumentar">+</button>
        </div>
      </div>
      <div class="cartRight">
        <span class="itemPrice">${moneyMXN(item.price * item.qty)}</span>
        <button class="removeBtn" type="button" aria-label="Eliminar">✕</button>
      </div>
    `;

    const [decBtn, incBtn] = el.querySelectorAll(".qtyBtn");
    decBtn.onclick = () => {
      item.qty -= 1;
      if (item.qty <= 0) cart = cart.filter(c => c !== item);
      saveCart();
      updateCart();
    };
    incBtn.onclick = () => {
      item.qty += 1;
      saveCart();
      updateCart();
    };

    el.querySelector(".removeBtn").onclick = () => {
      cart = cart.filter(c => c !== item);
      saveCart();
      updateCart();
    };

    body.appendChild(el);
  });
};

function updateCart() {
  // shipping UI toggle
  const shipForm = $("#shipForm");
  if (shipForm) shipForm.style.display = (ship.mode === "pickup") ? "none" : "block";

  ship.mxn = computeShipEstimate(ship.mode);

  const sub = subtotal();
  const disc = promoDiscount(sub);
  const total = Math.max(0, sub - disc) + Number(ship.mxn || 0);

  $("#cartCount").textContent = cartCount();
  $("#cartBtnTrigger")?.setAttribute("aria-label", `Abrir carrito (${cartCount()} artículos)`);

  $("#lnSub").textContent = moneyMXN(sub);
  $("#lnShip").textContent = moneyMXN(ship.mxn || 0);
  $("#lnTotal").textContent = moneyMXN(total);
  $("#barTotal").textContent = moneyMXN(total);

  const rowDiscount = $("#rowDiscount");
  if (rowDiscount) rowDiscount.style.display = disc > 0 ? "flex" : "none";
  $("#lnDiscount") && ($("#lnDiscount").textContent = `-${moneyMXN(disc)}`);

  const usd = total / getFx();
  $("#lnUsd") && ($("#lnUsd").textContent = total > 0 ? `Aprox ${moneyUSD(usd)} USD` : "");

  window.renderCart();

  $("#paybar")?.classList.toggle("visible", cart.length > 0);
  $("#payBtn").disabled = cart.length === 0;
}

/* =========================
   PROMO
========================= */
function applyPromo() {
  const input = $("#promoInput");
  const code = normalizeCode(input?.value || "");
  if (!code) { promoState = null; savePromo(); updateCart(); toast("Cupón removido"); return; }

  const p = promos?.active_promos?.find(x => normalizeCode(x.code) === code);
  if (!p) return toast("Cupón no válido");

  promoState = p;
  savePromo();
  toast("Cupón aplicado ✅");
  updateCart();
}

/* =========================
   CHECKOUT (NO CAMBIOS BACKEND)
========================= */
async function startCheckout() {
  if (!cart.length) return;

  // validación mínima para envío
  if (ship.mode !== "pickup") {
    const name = ($("#name")?.value || "").trim();
    const cp = ($("#cp")?.value || "").trim();
    const addr = ($("#addr")?.value || "").trim();
    const city = ($("#city")?.value || "").trim();
    const st = ($("#state")?.value || "").trim();
    if (!name || cp.length !== 5 || !addr || !city || !st) {
      toast("Completa tu dirección (nombre, CP, calle, ciudad, estado).");
      return;
    }
  }

  const payload = {
    items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
    mode: ship.mode,
    promoCode: promoState?.code || "",
    to: {
      name: $("#name")?.value || "",
      postal_code: $("#cp")?.value || "",
      address1: $("#addr")?.value || "",
      city: $("#city")?.value || "",
      state_code: $("#state")?.value || "",
    },
  };

  // Intento 1: /api/create_checkout (Vercel / rewrite)
  // Fallback: /.netlify/functions/create_checkout (Netlify directo)
  const endpoints = ["/api/create_checkout", "/.netlify/functions/create_checkout"];

  try {
    let lastErr = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.url) {
          window.location.href = data.url;
          return;
        }
        lastErr = data?.error || `No se pudo iniciar el pago (${res.status})`;
      } catch (e) {
        lastErr = "Error de red al conectar con pagos";
      }
    }
    toast(lastErr || "No se pudo iniciar el pago");
  } catch {
    toast("Error al conectar con pagos");
  }
}

/* =========================
   ESCAPE HTML
========================= */
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

/* =========================
   BINDINGS (index -> main)
========================= */
function bindUI() {
  // Overlay close
  $("#overlay")?.addEventListener("click", () => window.closeAll());

  // Close buttons
  $$("[data-close='all']").forEach(b => b.addEventListener("click", () => window.closeAll()));
  $$("[data-close='legal']").forEach(b => b.addEventListener("click", () => window.closeLegal()));

  // Cart open
  $("#cartBtnTrigger")?.addEventListener("click", () => window.openDrawer());
  $("#viewCartBtn")?.addEventListener("click", () => window.openDrawer());
  $("#paybarCartBtn")?.addEventListener("click", () => window.openDrawer());

  // Catalog open (cards)
  $$(".champCard").forEach(btn => {
    btn.addEventListener("click", () => {
      const sid = btn.dataset.open;
      const title = btn.dataset.title;
      window.openCatalog(sid, title);
    });
  });

  // Buy now
  $("#buyNowBtn")?.addEventListener("click", () => {
    const sid = $("#buyNowBtn").dataset.open;
    const title = $("#buyNowBtn").dataset.title;
    window.openCatalog(sid, title);
  });

  // Shipping mode
  $$('input[name="shipMode"]').forEach(r => {
    r.addEventListener("change", () => {
      ship.mode = r.value;
      updateCart();
    });
  });

  // Promo
  $("#promoApplyBtn")?.addEventListener("click", applyPromo);

  // Pay
  $("#payBtn")?.addEventListener("click", startCheckout);

  // Legal
  $$("[data-legal]").forEach(el => {
    el.addEventListener("click", () => window.openLegal(el.dataset.legal));
  });
  $$(".tabBtn").forEach(b => b.addEventListener("click", () => activateLegal(b.dataset.legalTab)));

  // Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.closeAll();
  });

  // Rehidratar ship desde radios
  const checked = $('input[name="shipMode"]:checked');
  ship.mode = checked ? checked.value : "pickup";
}

/* =========================
   BOOT
========================= */
async function boot() {
  if (!ensureDom()) return;

  bindUI();

  try {
    catalog = await fetchJSON(`/data/catalog.json?t=${Date.now()}`);
  } catch {
    toast("No se pudo cargar el catálogo.");
    return;
  }

  try {
    promos = await fetchJSON(`/data/promos.json?t=${Date.now()}`);
  } catch {
    promos = { active_promos: [] };
  }

  // Ajuste inicial de shipping
  ship.mxn = computeShipEstimate(ship.mode);

  updateCart();
}

boot();