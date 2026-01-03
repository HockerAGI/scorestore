/* SCORE STORE LOGIC — FINAL FIXED MASTER (Promos + Image Fix + Checkout Bulletproof)
   - Respeta arquitectura: NO requiere cambiar index.html ni styles.css
   - Inyecta UI de promo dentro del drawer existente
   - Aplica promo en UI + manda promo_code al backend para cobro real en Stripe
*/

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_final_v18";
const PROMO_KEY = "score_promo_code_v1";

let cart = [];
let catalog = [];
let promos = []; // rules[]
let shipQuote = null;
let appliedPromo = null; // {code,type,value}

const $ = (id) => document.getElementById(id);

const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

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

/* ================= LOGOS ================= */
const LOGOS = {
  BAJA_1000: "/assets/logo-baja1000.webp",
  BAJA_500: "/assets/logo-baja500.webp",
  BAJA_400: "/assets/logo-baja400.webp",
  SF_250: "/assets/logo-sf250.webp",
};

/* ================= IMAGES (robusto) ================= */
function safePath(p) {
  // No inventa rutas, solo limpia basura típica
  return toStr(p);
}

function altPathFrom(src) {
  try {
    const u = new URL(src, location.origin);
    const p = u.pathname;

    // 1) quitar doble extensión rara: .jpg.webp / .jpeg.webp / .png.webp
    const noDouble = p
      .replace(/\.jpe?g\.webp$/i, ".webp")
      .replace(/\.png\.webp$/i, ".webp");

    // 2) corregir espacios alrededor de guiones (ej: "cafe -oscuro" -> "cafe-oscuro")
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

  // fallback final 100% existente
  imgEl.onerror = null;
  imgEl.src = "/assets/logo-score.webp";
};

/* ================= CART STORAGE ================= */
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

function loadPromoFromStorage() {
  const code = normalizeCode(localStorage.getItem(PROMO_KEY) || "");
  if (!code) return null;

  const rule = promos.find(r => normalizeCode(r.code) === code && r.active);
  if (!rule) return null;

  return { code, type: rule.type, value: rule.value };
}

function savePromo(code) {
  const c = normalizeCode(code);
  if (!c) {
    localStorage.removeItem(PROMO_KEY);
    appliedPromo = null;
    return;
  }
  localStorage.setItem(PROMO_KEY, c);
}

/* ================= UI: OPEN/CLOSE ================= */
window.openDrawer = () => {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  $("modalCatalog")?.classList.remove("active");
  $("drawer")?.classList.remove("active");
  $("legalModal")?.classList.remove("active");
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
};

window.openLegal = (t) => {
  $("legalModal")?.classList.add("active");
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");

  document.querySelectorAll(".legalBlock").forEach((b) => {
    b.style.display = (b.dataset.legalBlock === t) ? "block" : "none";
  });
};

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
    items.map((p) => {
      const sizes = p.sizes || ["Unitalla"];
      const sizeBtns = sizes
        .map((s) => `<div class="size-pill" onclick="selectSize(this,'${s}')">${s}</div>`)
        .join("");

      const img = safePath(p.img);

      return `
        <div class="prodCard" id="card_${p.id}">
          <div class="metallic-frame">
            <img
              src="${img}"
              loading="lazy"
              alt="${p.name}"
              class="prodImg"
              style="mix-blend-mode: normal;" 
              onerror="handleImgError(this)"
            >
          </div>
          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>
          <div class="size-row">${sizeBtns}</div>
          <div id="sizes_${p.id}" data-selected="" style="display:none;"></div>
          <button class="btn-add" onclick="add('${p.id}')">AGREGAR +</button>
        </div>
      `;
    }).join("") +
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
  if (!p) {
    toast("Producto no disponible");
    return;
  }

  const key = `${id}_${s}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty++;
  else cart.push({
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
  window.openDrawer();
  toast("Agregado");
};

window.delCart = (x) => {
  cart.splice(x, 1);
  saveCart();
  renderCart();
};

window.emptyCart = () => {
  cart = [];
  shipQuote = null;
  saveCart();
  renderCart();
  toast("Carrito vacío");
};

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

  wrap.innerHTML = cart.map((i, x) => {
    const img = safePath(i.img);
    return `
      <div class="cartItem">
        <img src="${img}" class="cartThumb" style="mix-blend-mode: normal;" onerror="handleImgError(this)">
        <div class="cInfo">
          <div class="cName">${i.name}</div>
          <div class="cMeta">${i.variant}</div>
          <div class="cPrice">${money(i.price)}</div>
        </div>
        <button onclick="delCart(${x})" style="background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;">&times;</button>
      </div>
    `;
  }).join("");

  updateTotals();
}

/* ================= PROMOS (UI + envío) ================= */
function ensurePromoUI() {
  const drawerFoot = document.querySelector("#drawer .dFoot");
  if (!drawerFoot) return;
  if (document.getElementById("promoCode")) return;

  // Lo insertamos arriba del subtotal (sin tocar tu HTML)
  const subTotalEl = document.getElementById("subTotal");
  const subRow = subTotalEl?.closest(".sumRow");
  if (!subRow) return;

  const box = document.createElement("div");
  box.id = "promoBox";
  box.style.margin = "10px 0 12px";
  box.innerHTML = `
    <div style="font-size:12px;color:#666;font-weight:800;margin-bottom:6px;">CÓDIGO DE PROMOCIÓN</div>
    <div style="display:flex;gap:10px;align-items:center;">
      <input id="promoCode" class="inputField" placeholder="Ej: SCORE10" maxlength="24" style="flex:1;">
      <button id="promoApply" type="button" style="
        border-radius:10px;
        padding:12px 14px;
        border:2px solid var(--score-red);
        background:#fff;
        color:var(--score-red);
        font-weight:900;
        cursor:pointer;
        text-transform:uppercase;
      ">Aplicar</button>
    </div>
    <div id="promoHint" style="margin-top:6px;font-size:12px;color:#666;"></div>
  `;

  drawerFoot.insertBefore(box, subRow);

  document.getElementById("promoApply")?.addEventListener("click", () => {
    const val = document.getElementById("promoCode")?.value || "";
    applyPromo(val);
  });

  // precargar si ya había
  const saved = normalizeCode(localStorage.getItem(PROMO_KEY) || "");
  if (saved) document.getElementById("promoCode").value = saved;
}

function applyPromo(codeRaw) {
  const code = normalizeCode(codeRaw);
  const hint = document.getElementById("promoHint");

  if (!code) {
    savePromo("");
    appliedPromo = null;
    if (hint) hint.innerText = "Sin promoción aplicada.";
    updateTotals();
    toast("Promo removida");
    return;
  }

  const rule = promos.find(r => r.active && normalizeCode(r.code) === code);
  if (!rule) {
    savePromo("");
    appliedPromo = null;
    if (hint) hint.innerText = "Código inválido.";
    updateTotals();
    toast("Código inválido");
    return;
  }

  appliedPromo = { code, type: rule.type, value: rule.value };
  savePromo(code);

  if (hint) {
    if (rule.type === "percent") hint.innerText = `Aplicado: ${code} (-${Math.round(rule.value * 100)}%)`;
    else if (rule.type === "free_shipping") hint.innerText = `Aplicado: ${code} (Envío gratis)`;
    else if (rule.type === "fixed_mxn") hint.innerText = `Aplicado: ${code} (-${money(rule.value)})`;
    else hint.innerText = `Aplicado: ${code}`;
  }

  updateTotals();
  toast("Promo aplicada");
}

function setDiscountRow(amount) {
  const shipRow = document.getElementById("shipTotal")?.closest(".sumRow");
  if (!shipRow) return;

  let row = document.getElementById("discountRow");

  if (amount > 0) {
    if (!row) {
      row = document.createElement("div");
      row.id = "discountRow";
      row.className = "sumRow";
      row.innerHTML = `<span>Descuento</span><strong id="discountTotal">- $0</strong>`;
      shipRow.parentNode.insertBefore(row, shipRow);
    }
    document.getElementById("discountTotal").innerText = `- ${money(amount)}`;
  } else {
    if (row) row.remove();
  }
}

/* ================= SHIPPING ================= */
async function quoteShipping(zip) {
  $("shipTotal").innerText = "Calculando...";
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
      $("shipTotal").innerText = money(d.mxn);
    } else {
      shipQuote = { mxn: 250, label: "Envío Nacional" };
      $("shipTotal").innerText = "$250.00 (Estándar)";
    }

    updateTotals();
  } catch (e) {
    console.error(e);
    shipQuote = { mxn: 250, label: "Envío Nacional" };
    updateTotals();
  }
}

function updateTotals() {
  const sub = cart.reduce((a, b) => a + (b.price * b.qty), 0);
  $("subTotal").innerText = money(sub);

  const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";
  $("shipForm").style.display = (mode !== "pickup") ? "block" : "none";

  // promo discount (solo UI, el cobro real se aplica en backend también)
  let discount = 0;
  if (appliedPromo) {
    if (appliedPromo.type === "percent") {
      discount = Math.min(sub, sub * (appliedPromo.value || 0));
    } else if (appliedPromo.type === "fixed_mxn") {
      discount = Math.min(sub, Number(appliedPromo.value || 0));
    }
  }
  setDiscountRow(discount);

  // shipping
  let shipCost = 0;
  let shipLabel = "Gratis";

  const promoFreeShip = appliedPromo?.type === "free_shipping";

  if (mode === "tj") {
    shipCost = promoFreeShip ? 0 : 200;
    shipLabel = promoFreeShip ? "Gratis (Promo)" : "$200.00";
  } else if (mode === "mx") {
    if (promoFreeShip) {
      shipCost = 0;
      shipLabel = "Gratis (Promo)";
    } else if (shipQuote?.mxn) {
      shipCost = shipQuote.mxn;
      shipLabel = money(shipCost);
    } else {
      shipLabel = "Cotizar";
    }
  }

  $("shipTotal").innerText = shipLabel;

  const grand = Math.max(0, (sub - discount) + shipCost);
  $("grandTotal").innerText = money(grand);
}

/* ================= CHECKOUT ================= */
window.checkout = async () => {
  if (!cart.length) return;

  const btn = $("checkoutBtn");
  btn.disabled = true;
  btn.innerText = "PROCESANDO...";

  const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";

  const to = {
    postal_code: $("cp")?.value,
    address1: $("addr")?.value,
    city: "Tijuana",
    name: $("name")?.value,
  };

  // Validaciones mínimas (sin romper flujo)
  if (mode !== "pickup") {
    if (!toStr(to.name)) {
      toast("⚠️ Escribe tu nombre");
      btn.disabled = false;
      btn.innerText = "PAGAR AHORA";
      return;
    }
  }
  if (mode === "mx") {
    const cp = toStr(to.postal_code).replace(/\D+/g, "");
    if (cp.length !== 5) {
      toast("⚠️ Código Postal inválido");
      btn.disabled = false;
      btn.innerText = "PAGAR AHORA";
      return;
    }
    if (!toStr(to.address1)) {
      toast("⚠️ Escribe tu dirección");
      btn.disabled = false;
      btn.innerText = "PAGAR AHORA";
      return;
    }
  }

  try {
    const payload = {
      items: cart.map((i) => ({ id: i.id, qty: i.qty, size: i.size })),
      mode,
      to,
      promo_code: appliedPromo?.code || normalizeCode(localStorage.getItem(PROMO_KEY) || ""),
    };

    const r = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (d.url) location.href = d.url;
    else throw new Error(d.error || "No session url");
  } catch (e) {
    console.error(e);
    toast("Error iniciando pago");
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA";
  }
};

/* ================= INIT ================= */
async function init() {
  loadCart();
  renderCart();

  // listeners shipping mode
  document.querySelectorAll('input[name="shipMode"]').forEach((r) =>
    r.addEventListener("change", () => {
      const mode = document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";
      // Si cambian a MX y ya hay CP válido, cotiza
      if (mode === "mx") {
        const cp = toStr($("cp")?.value).replace(/\D+/g, "");
        if (cp.length === 5) quoteShipping(cp);
      }
      updateTotals();
    })
  );

  $("cp")?.addEventListener("input", (e) => {
    const v = toStr(e.target.value).replace(/\D+/g, "").slice(0, 5);
    e.target.value = v;
    if (v.length === 5) quoteShipping(v);
  });

  // Cargar catálogo + promos sin cache (evita PWA “atorada”)
  try {
    const [catRes, promoRes] = await Promise.all([
      fetch(`/data/catalog.json?ts=${Date.now()}`, { cache: "no-store" }),
      fetch(`/data/promos.json?ts=${Date.now()}`, { cache: "no-store" }),
    ]);

    const catData = await catRes.json();
    const promoData = await promoRes.json();

    catalog = catData.products || [];
    promos = promoData.rules || [];
  } catch (e) {
    console.error("Error loading data", e);
  }

  ensurePromoUI();

  appliedPromo = loadPromoFromStorage();
  if (appliedPromo) {
    const hint = document.getElementById("promoHint");
    if (hint) hint.innerText = `Aplicado: ${appliedPromo.code}`;
  }

  // toast success/cancel
  const params = new URLSearchParams(location.search);
  if (params.get("success") === "true") {
    // compra completada
    cart = [];
    shipQuote = null;
    saveCart();
    renderCart();
    toast("✅ Pago confirmado. Gracias.");
  } else if (params.get("cancel") === "true") {
    toast("Pago cancelado");
  }

  updateTotals();
}

init();

/* ================= PWA ================= */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}