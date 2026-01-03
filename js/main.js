/* SCORE STORE — FINAL MASTER (NETLIFY + STRIPE + ENVIA)
   - Respeta arquitectura / estructura
   - UI consistente con tu CSS (.size-pill / .btn-add)
*/

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/.netlify/functions"
    : "/api";

const CART_KEY = "score_cart_v1";
const PROMO_KEY = "score_promo_code_v1";

let catalog = [];
let promos = [];
let cart = [];
let shipQuote = null;
let appliedPromo = null;

const $ = (id) => document.getElementById(id);

const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }
function normalizeCode(v) { return upper(v).replace(/\s+/g, ""); }

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
window.scrollToId = scrollToId;

/* ================= IMAGES ================= */
function safeImg(src) {
  const s = toStr(src);
  if (!s) return "/assets/logo-score.webp";

  // http(s)
  if (s.startsWith("http://") || s.startsWith("https://")) return s.replace(/ /g, "%20");

  // ensure leading slash + encode spaces
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return encodeURI(withSlash);
}

function altPathFrom(src) {
  // SOLO corrige errores típicos, no inventa assets
  try {
    const u = new URL(src, location.origin);
    const p = u.pathname;

    // .jpg.webp / .jpeg.webp / .png.webp => .webp
    const noDouble = p
      .replace(/\.jpe?g\.webp$/i, ".webp")
      .replace(/\.png\.webp$/i, ".webp");

    // espacios alrededor de guiones (cafe -oscuro => cafe-oscuro)
    const noWeirdSpaces = noDouble
      .replace(/\s+-/g, "-")
      .replace(/-\s+/g, "-");

    if (noWeirdSpaces !== p) return noWeirdSpaces;
    return null;
  } catch {
    return null;
  }
}

window.handleImgError = (imgEl) => {
  if (!imgEl) return;

  const tried = imgEl.getAttribute("data-alt-tried");
  const src = imgEl.getAttribute("src") || "";

  if (!tried) {
    const alt = altPathFrom(src);
    if (alt) {
      imgEl.setAttribute("data-alt-tried", "1");
      imgEl.src = alt;
      return;
    }
  }

  imgEl.onerror = null;
  imgEl.src = "/assets/logo-score.webp";
};

/* ================= STORAGE ================= */
function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(cart)) cart = [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadSavedPromo() {
  const code = normalizeCode(localStorage.getItem(PROMO_KEY) || "");
  if (!code) return null;
  const rule = promos.find((r) => r.active && normalizeCode(r.code) === code);
  if (!rule) return null;
  return { code, type: rule.type, value: rule.value };
}

function savePromo(codeRaw) {
  const code = normalizeCode(codeRaw);
  if (!code) localStorage.removeItem(PROMO_KEY);
  else localStorage.setItem(PROMO_KEY, code);
}

/* ================= UI OPEN/CLOSE ================= */
function setOverlay(on) {
  $("overlay")?.classList.toggle("active", !!on);
  document.body.classList.toggle("modalOpen", !!on);
}

function openDrawer() {
  $("drawer")?.classList.add("active");
  setOverlay(true);
}
window.openDrawer = openDrawer;

function closeAll() {
  $("modalCatalog")?.classList.remove("active");
  $("drawer")?.classList.remove("active");
  $("legalModal")?.classList.remove("active");
  setOverlay(false);
}
window.closeAll = closeAll;

function openLegal(key) {
  closeAll();
  $("legalModal")?.classList.add("active");
  setOverlay(true);

  document.querySelectorAll(".legalBlock").forEach((b) => {
    b.style.display = (b.dataset.legalBlock === key) ? "block" : "none";
  });
}
window.openLegal = openLegal;

/* ================= CATALOG ================= */
function openCatalog(sectionId, title) {
  if (!catalog.length) {
    toast("Catálogo no disponible. Recarga la página.");
    return;
  }

  $("modalCatalog")?.classList.add("active");
  setOverlay(true);

  if ($("catTitle")) $("catTitle").innerText = title;

  const items = catalog.filter((p) => p.sectionId === sectionId);
  if (!items.length) {
    $("catContent").innerHTML = "<div style='padding:40px;text-align:center;'>Agotado.</div>";
    return;
  }

  // Agrupar por subSection (si existe)
  const groups = {};
  for (const p of items) {
    const g = p.subSection || "General";
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  }

  const html = Object.keys(groups).map((g) => {
    const cards = groups[g].map((p) => {
      const sizes = (Array.isArray(p.sizes) && p.sizes.length) ? p.sizes : ["Unitalla"];
      const sizePills = sizes.map((s) =>
        `<button class="size-pill" type="button" onclick="selectSize('${p.id}','${s}', this)">${s}</button>`
      ).join("");

      return `
        <div class="prodCard" id="card_${p.id}">
          <div class="metallic-frame">
            <img
              src="${safeImg(p.img)}"
              alt="${p.name}"
              class="prodImg"
              loading="lazy"
              decoding="async"
              onerror="handleImgError(this)"
            />
          </div>

          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>

          <div class="sizeRow">${sizePills}</div>
          <div id="sel_${p.id}" data-size="" style="display:none;"></div>

          <button class="btn-add" type="button" onclick="addToCart('${p.id}')">AGREGAR +</button>
        </div>
      `;
    }).join("");

    return `
      <div style="margin-bottom:22px;">
        ${Object.keys(groups).length > 1 ? `<h4 style="margin:0 0 12px;color:#111;">${g}</h4>` : ""}
        <div class="catGrid">${cards}</div>
      </div>
    `;
  }).join("");

  $("catContent").innerHTML = html;
}
window.openCatalog = openCatalog;

function selectSize(pid, size, btn) {
  const sel = $("sel_" + pid);
  if (sel) sel.setAttribute("data-size", size);

  const card = $("card_" + pid);
  if (card) card.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}
window.selectSize = selectSize;

/* ================= CART ================= */
function addToCart(pid) {
  const p = catalog.find((x) => x.id === pid);
  if (!p) return;

  const sel = $("sel_" + pid);
  let size = sel?.getAttribute("data-size") || "";

  const sizes = (Array.isArray(p.sizes) && p.sizes.length) ? p.sizes : ["Unitalla"];
  if (!size && sizes.length === 1) size = sizes[0];

  if (!size) {
    toast("⚠️ Selecciona una talla");
    return;
  }

  const key = `${pid}_${size}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty += 1;
  else {
    cart.push({
      key,
      id: pid,
      name: p.name,
      size,
      price: Number(p.baseMXN || 0),
      qty: 1,
      img: safeImg(p.img),
    });
  }

  saveCart();
  renderCart();
  openDrawer();
  toast("Agregado");
}
window.addToCart = addToCart;

function incQty(i) {
  if (!cart[i]) return;
  cart[i].qty += 1;
  saveCart();
  renderCart();
}
window.incQty = incQty;

function decQty(i) {
  if (!cart[i]) return;
  cart[i].qty = Math.max(1, (cart[i].qty || 1) - 1);
  saveCart();
  renderCart();
}
window.decQty = decQty;

function delCart(i) {
  cart.splice(i, 1);
  saveCart();
  renderCart();
}
window.delCart = delCart;

function emptyCart() {
  if (!cart.length) return;
  if (!confirm("¿Vaciar carrito?")) return;
  cart = [];
  shipQuote = null;
  saveCart();
  renderCart();
  toast("Carrito vacío");
}
window.emptyCart = emptyCart;

function renderCart() {
  const wrap = $("cartItems");
  const count = cart.reduce((a, b) => a + (b.qty || 0), 0);

  if ($("cartCount")) {
    $("cartCount").innerText = String(count);
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
    wrap.innerHTML = cart.map((item, idx) => `
      <div class="cartItem">
        <img src="${safeImg(item.img)}" class="cartThumb" alt="${item.name}" onerror="handleImgError(this)" />
        <div class="cInfo">
          <div class="cName">${item.name}</div>
          <div class="cMeta">Talla: ${item.size}</div>
          <div class="cPrice">${money(item.price)}</div>

          <div class="qtyRow" aria-label="Cantidad">
            <button class="qtyBtn" type="button" onclick="decQty(${idx})">−</button>
            <span class="qtyVal">${item.qty}</span>
            <button class="qtyBtn" type="button" onclick="incQty(${idx})">+</button>
          </div>
        </div>
        <button type="button" onclick="delCart(${idx})" aria-label="Eliminar" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;">&times;</button>
      </div>
    `).join("");
  }

  updateTotals();
}

/* ================= PROMOS ================= */
function applyPromo(codeRaw) {
  const code = normalizeCode(codeRaw);
  const hint = $("promoHint");

  if (!code) {
    appliedPromo = null;
    savePromo("");
    if (hint) hint.innerText = "Sin promoción aplicada.";
    updateTotals();
    toast("Promo removida");
    return;
  }

  const rule = promos.find((r) => r.active && normalizeCode(r.code) === code);
  if (!rule) {
    appliedPromo = null;
    savePromo("");
    if (hint) hint.innerText = "Código inválido.";
    updateTotals();
    toast("Código inválido");
    return;
  }

  appliedPromo = { code, type: rule.type, value: rule.value };
  savePromo(code);

  if (hint) {
    if (rule.type === "percent") hint.innerText = `Aplicado: ${code} (-${Math.round(Number(rule.value || 0) * 100)}%)`;
    else if (rule.type === "fixed_mxn") hint.innerText = `Aplicado: ${code} (-${money(rule.value)})`;
    else if (rule.type === "free_shipping") hint.innerText = `Aplicado: ${code} (Envío gratis)`;
    else hint.innerText = `Aplicado: ${code}`;
  }

  updateTotals();
  toast("Promo aplicada");
}

/* ================= SHIPPING ================= */
function getShipMode() {
  return document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";
}

function sumPieces() {
  return cart.reduce((a, b) => a + (b.qty || 0), 0) || 1;
}

async function quoteShipping() {
  const mode = getShipMode();
  if (mode !== "mx") return;

  const zip = toStr($("cp")?.value).replace(/\D+/g, "").slice(0, 5);
  if (zip.length !== 5) return;

  try {
    const res = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: zip, items: sumPieces() }),
    });
    const data = await res.json();
    if (data?.ok) shipQuote = data;
    else shipQuote = { ok: true, mxn: 250, fallback: true };
  } catch {
    shipQuote = { ok: true, mxn: 250, fallback: true };
  }

  updateTotals();
}
window.quoteShipping = quoteShipping;

function updateShipFormVisibility() {
  const mode = getShipMode();
  const shipForm = $("shipForm");
  if (!shipForm) return;

  // Mostrar form para tj y mx (porque ambos necesitan nombre/dirección)
  shipForm.style.display = (mode === "pickup") ? "none" : "grid";

  // CP solo aplica en nacional (mx)
  const cp = $("cp");
  if (cp) cp.parentElement && (cp.parentElement.style.display = ""); // por si se reusa layout
  if (cp) cp.style.display = (mode === "mx") ? "block" : "none";
}

function getSubtotal() {
  return cart.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.qty || 1)), 0);
}

function computeDiscount(subtotal) {
  if (!appliedPromo) return 0;
  const t = appliedPromo.type;
  const v = Number(appliedPromo.value || 0);

  if (t === "percent") return Math.min(subtotal, subtotal * v);
  if (t === "fixed_mxn") return Math.min(subtotal, v);
  return 0;
}

function computeShipping(mode) {
  if (appliedPromo?.type === "free_shipping") return 0;
  if (mode === "pickup") return 0;
  if (mode === "tj") return 200;
  // mx
  return Number(shipQuote?.mxn || 250);
}

function updateTotals() {
  const mode = getShipMode();
  updateShipFormVisibility();

  const sub = getSubtotal();
  const discount = computeDiscount(sub);
  const ship = computeShipping(mode);
  const grand = Math.max(0, (sub - discount) + ship);

  if ($("subTotal")) $("subTotal").innerText = money(sub);

  // descuento row
  const dRow = $("discountRow");
  if (dRow) {
    if (discount > 0) {
      dRow.style.display = "flex";
      $("discountTotal").innerText = `- ${money(discount)}`;
    } else {
      dRow.style.display = "none";
    }
  }

  if ($("shipTotal")) $("shipTotal").innerText = ship === 0 ? "Gratis" : money(ship);
  if ($("grandTotal")) $("grandTotal").innerText = money(grand);

  // habilitar checkout
  const btn = $("checkoutBtn");
  if (btn) btn.disabled = cart.length === 0;
}

/* ================= CHECKOUT ================= */
async function checkout() {
  if (!cart.length) return;

  const btn = $("checkoutBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerText = "PROCESANDO...";
  }

  const mode = getShipMode();

  const to = {
    name: toStr($("name")?.value),
    address: toStr($("addr")?.value),
    postal_code: toStr($("cp")?.value).replace(/\D+/g, "").slice(0, 5),
  };

  // Validaciones (directo y sin drama)
  if (mode !== "pickup") {
    if (!to.name) {
      toast("⚠️ Escribe tu nombre");
      if (btn) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
      return;
    }
    if (!to.address) {
      toast("⚠️ Escribe tu dirección");
      if (btn) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
      return;
    }
  }
  if (mode === "mx" && to.postal_code.length !== 5) {
    toast("⚠️ Código Postal inválido");
    if (btn) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
    return;
  }

  try {
    const payload = {
      mode,
      to,
      promo_code: appliedPromo?.code || normalizeCode(localStorage.getItem(PROMO_KEY) || ""),
      items: cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size })),
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data?.url) {
      location.href = data.url;
      return;
    }

    throw new Error(data?.error || "No session url");
  } catch (e) {
    console.error(e);
    toast("Error iniciando pago. Intenta de nuevo.");
    if (btn) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
  }
}
window.checkout = checkout;

/* ================= INIT ================= */
async function init() {
  loadCart();

  // Load data (no-store + bust)
  try {
    const [catRes, promoRes] = await Promise.all([
      fetch(`/data/catalog.json?ts=${Date.now()}`, { cache: "no-store" }),
      fetch(`/data/promos.json?ts=${Date.now()}`, { cache: "no-store" }),
    ]);
    const cat = await catRes.json();
    const pro = await promoRes.json();

    catalog = Array.isArray(cat.products) ? cat.products : [];
    promos = Array.isArray(pro.rules) ? pro.rules : [];
  } catch (e) {
    console.error("Error loading data:", e);
    catalog = [];
    promos = [];
  }

  // promo handlers
  const promoApplyBtn = $("promoApply");
  if (promoApplyBtn) {
    promoApplyBtn.addEventListener("click", () => {
      applyPromo($("promoCode")?.value || "");
    });
  }

  // restore promo
  appliedPromo = loadSavedPromo();
  if (appliedPromo && $("promoCode")) {
    $("promoCode").value = appliedPromo.code;
    $("promoHint").innerText = `Aplicado: ${appliedPromo.code}`;
  }

  // shipping mode listeners
  document.querySelectorAll('input[name="shipMode"]').forEach((r) => {
    r.addEventListener("change", async () => {
      shipQuote = null;
      updateTotals();
      if (getShipMode() === "mx") await quoteShipping();
    });
  });

  // CP input
  $("cp")?.addEventListener("input", async (e) => {
    const v = toStr(e.target.value).replace(/\D+/g, "").slice(0, 5);
    e.target.value = v;
    if (v.length === 5 && getShipMode() === "mx") await quoteShipping();
  });

  renderCart();

  // url flags success/cancel
  const params = new URLSearchParams(location.search);
  if (params.get("success") === "true") {
    cart = [];
    shipQuote = null;
    saveCart();
    renderCart();
    toast("✅ Pago confirmado. Gracias.");
    history.replaceState({}, "", "/");
  } else if (params.get("cancel") === "true") {
    toast("Pago cancelado");
    history.replaceState({}, "", "/");
  }

  updateTotals();

  // PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);