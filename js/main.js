/* =========================================================
   SCORE STORE — MASTER JS PROD 2026 (FIXED)
   - Catalog render
   - Cart + Drawer
   - Shipping (pickup/local/envia MX/US)
   - Promo
   - Stripe Checkout (via /api/checkout)
   - AI Chat (via /api/chat)
   ========================================================= */

/* ---------- config ---------- */
const CONFIG = {
  storageKey: "score_cart_2026",
  catalogUrl: "/data/catalog.json",
  legalUrl: "/legal.html",
  endpoints: {
    checkout: "/api/checkout",
    quoteShipping: "/api/quote_shipping",
    chat: "/api/chat",
  },
  currency: "mxn",
  locale: "es-MX",
};

const PLACEHOLDER_IMG = "/assets/placeholder-product.svg";

function escapeAttr(s){
  return String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function uniq(arr){
  return Array.from(new Set(arr.filter(Boolean)));
}
function productImages(p){
  const arr = [];
  if (p?.img) arr.push(safeUrl(p.img));
  if (Array.isArray(p?.images)) arr.push(...p.images.map(safeUrl));
  const u = uniq(arr);
  return u.length ? u : [PLACEHOLDER_IMG];
}
function renderCarousel(images, alt, cid){
  const imgs = Array.isArray(images) ? images : [];
  const one = imgs.length <= 1;
  return `
    <div class="p-carousel ${one ? "one" : ""}" data-carousel="${cid}">
      <div class="p-track">
        ${imgs.map((src, i) => `
          <div class="p-slide">
            <img src="${src}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" data-idx="${i}">
          </div>
        `).join("")}
      </div>
      <div class="p-dots">
        ${imgs.map((_, i) => `<button type="button" class="p-dot ${i===0 ? "active" : ""}" data-go="${i}" aria-label="Imagen ${i+1}"></button>`).join("")}
      </div>
      <button type="button" class="p-nav prev" data-step="-1" aria-label="Anterior">‹</button>
      <button type="button" class="p-nav next" data-step="1" aria-label="Siguiente">›</button>
    </div>
  `;
}
function initCarousel(root){
  const car = root.querySelector(".p-carousel");
  if (!car) return;
  const track = car.querySelector(".p-track");
  const dots = Array.from(car.querySelectorAll(".p-dot"));
  const imgs = Array.from(car.querySelectorAll("img"));
  const count = dots.length || imgs.length;

  // img fallback
  imgs.forEach((img) => {
    img.addEventListener("error", () => {
      if (img.dataset.fallbacked) return;
      img.dataset.fallbacked = "1";
      img.src = PLACEHOLDER_IMG;
    });
  });

  const clampIdx = (n) => Math.max(0, Math.min((count || 1) - 1, n));

  function setActive(i){
    dots.forEach((d, idx) => d.classList.toggle("active", idx === i));
  }

  function goTo(i){
    if (!track) return;
    const idx = clampIdx(i);
    track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
    setActive(idx);
  }

  // dot click
  dots.forEach((d) => d.addEventListener("click", () => goTo(parseInt(d.dataset.go || "0", 10))));

  // arrows
  car.querySelectorAll(".p-nav").forEach((b) => {
    b.addEventListener("click", () => {
      const step = parseInt(b.dataset.step || "0", 10) || 0;
      const idx = Math.round((track.scrollLeft || 0) / Math.max(1, track.clientWidth));
      goTo(idx + step);
    });
  });

  // scroll -> active dot
  let raf = 0;
  track.addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const idx = Math.round((track.scrollLeft || 0) / Math.max(1, track.clientWidth));
      setActive(clampIdx(idx));
    });
  }, { passive: true });

  // If only 1 image hide controls
  if (count <= 1){
    car.classList.add("one");
  }
}

/* ---------- utils ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = (cents, currency = CONFIG.currency) => {
  const v = (Number(cents || 0) / 100);
  try {
    return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
};

const safeUrl = (s) => {
  if (!s) return "";
  if (s.startsWith("http")) return s;
  return s.startsWith("/") ? s : `/${s}`;
};

const loadJSON = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed JSON ${url}`);
  return res.json();
};

const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const read = (k, fallback) => {
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

const uid = () => Math.random().toString(16).slice(2);

/* ---------- state ---------- */
let catalog = null;
let cart = read(CONFIG.storageKey, { items: [], promo: null, shipping: { mode: "pickup" } });

/* ---------- dom refs ---------- */
const refs = {
  grid: $("#productsGrid"),
  filters: $("#categoryFilters"),
  cartBtn: $("#btnCart"),
  drawer: $("#drawer"),
  drawerClose: $("#drawerClose"),
  cartList: $("#cartList"),
  cartTotal: $("#cartTotal"),
  checkoutBtn: $("#btnCheckout"),
  shipMode: $("#shipMode"),
  shipPostal: $("#shipPostal"),
  shipQuote: $("#shipQuote"),
  promoInput: $("#promoCode"),
  promoApply: $("#promoApply"),
  promoBadge: $("#promoBadge"),
  toast: $("#toast"),
};

/* ---------- toast ---------- */
function toast(msg, type = "info") {
  if (!refs.toast) return alert(msg);
  refs.toast.textContent = msg;
  refs.toast.dataset.type = type;
  refs.toast.classList.add("show");
  setTimeout(() => refs.toast.classList.remove("show"), 2600);
}

/* ---------- catalog render ---------- */
function showProducts(sectionId = null) {
  const items = (catalog?.products || []).filter((p) => !sectionId || p.sectionId === sectionId);

  refs.grid.innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card";
    const safeId = `p_${p.id.replace(/[^a-z0-9_]/gi, "_")}_${uid()}`;

    card.innerHTML = `
      <div class="p-media">
        ${renderCarousel(productImages(p), p.name, safeId)}
      </div>
      <div class="p-body">
        <div class="p-title">${p.name}</div>
        <div class="p-desc">${p.desc || ""}</div>
        <div class="p-row">
          <div class="p-price">${money(p.price_cents, p.currency || CONFIG.currency)}</div>
          <button class="p-btn-add" type="button" data-id="${p.id}">Agregar</button>
        </div>
      </div>
    `;

    card.querySelector(".p-btn-add")?.addEventListener("click", () => {
      addToCart(p.id);
    });

    initCarousel(card);

    refs.grid.appendChild(card);
  });
}

function showCategories() {
  refs.filters.innerHTML = "";

  const cats = catalog?.categories || [];
  const allBtn = document.createElement("button");
  allBtn.className = "filter active";
  allBtn.textContent = "Todo";
  allBtn.addEventListener("click", () => {
    $$(".filter", refs.filters).forEach((b) => b.classList.remove("active"));
    allBtn.classList.add("active");
    showProducts(null);
  });
  refs.filters.appendChild(allBtn);

  cats.forEach((c) => {
    const b = document.createElement("button");
    b.className = "filter";
    b.textContent = c.name;
    b.title = c.pill || "";
    b.addEventListener("click", () => {
      $$(".filter", refs.filters).forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      showProducts(c.id);
    });
    refs.filters.appendChild(b);
  });
}

/* ---------- cart ---------- */
function persistCart() {
  save(CONFIG.storageKey, cart);
  renderCart();
}

function getCartItemIndex(id, size = "") {
  return cart.items.findIndex((x) => x.id === id && (x.size || "") === (size || ""));
}

function addToCart(productId, size = "") {
  const p = catalog.products.find((x) => x.id === productId);
  if (!p) return;

  const sizes = p.sizes || [];
  let pick = size || "";
  if (sizes.length && !pick) pick = sizes[0];

  const idx = getCartItemIndex(productId, pick);
  if (idx >= 0) cart.items[idx].qty += 1;
  else cart.items.push({ id: productId, qty: 1, size: pick });

  toast("Agregado al carrito ✅", "ok");
  persistCart();
}

function removeFromCart(i) {
  cart.items.splice(i, 1);
  persistCart();
}

function changeQty(i, delta) {
  cart.items[i].qty += delta;
  if (cart.items[i].qty <= 0) cart.items.splice(i, 1);
  persistCart();
}

function cartSubtotalCents() {
  let sum = 0;
  cart.items.forEach((it) => {
    const p = catalog.products.find((x) => x.id === it.id);
    if (!p) return;
    sum += (p.price_cents || 0) * (it.qty || 0);
  });
  return sum;
}

function renderCart() {
  if (!refs.cartList) return;

  refs.cartList.innerHTML = "";

  if (!cart.items.length) {
    refs.cartList.innerHTML = `<div class="small">Tu carrito está vacío.</div>`;
    refs.cartTotal.textContent = money(0);
    return;
  }

  cart.items.forEach((it, i) => {
    const p = catalog.products.find((x) => x.id === it.id);
    if (!p) return;

    const row = document.createElement("div");
    row.className = "cart-item";

    const img = safeUrl(p.img || PLACEHOLDER_IMG);

    row.innerHTML = `
      <img src="${img}" alt="${escapeAttr(p.name)}" loading="lazy" decoding="async">
      <div class="meta">
        <strong>${p.name}</strong>
        <span>${it.size ? `Talla: ${it.size}` : ""}</span>
        <span>${money(p.price_cents, p.currency || CONFIG.currency)} x ${it.qty}</span>
      </div>
      <div class="actions">
        <div class="qty">
          <button type="button" data-act="dec">-</button>
          <span>${it.qty}</span>
          <button type="button" data-act="inc">+</button>
        </div>
        <button class="btn" type="button" data-act="rm">Quitar</button>
      </div>
    `;

    // image fallback
    const imgEl = $("img", row);
    imgEl?.addEventListener("error", () => {
      imgEl.src = PLACEHOLDER_IMG;
    });

    row.querySelector('[data-act="dec"]')?.addEventListener("click", () => changeQty(i, -1));
    row.querySelector('[data-act="inc"]')?.addEventListener("click", () => changeQty(i, +1));
    row.querySelector('[data-act="rm"]')?.addEventListener("click", () => removeFromCart(i));

    refs.cartList.appendChild(row);
  });

  refs.cartTotal.textContent = money(cartSubtotalCents());
}

/* ---------- drawer ---------- */
function openDrawer() {
  refs.drawer?.classList.add("open");
}
function closeDrawer() {
  refs.drawer?.classList.remove("open");
}

/* ---------- shipping quote ---------- */
async function quoteShipping() {
  try {
    refs.shipQuote.textContent = "Cotizando…";
    const payload = {
      items: cart.items.map((it) => ({ ...it })),
      shipping: cart.shipping,
    };
    const res = await fetch(CONFIG.endpoints.quoteShipping, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudo cotizar envío");

    refs.shipQuote.textContent = data?.label || "OK";
    cart.shipping.quote = data;
    persistCart();
  } catch (e) {
    refs.shipQuote.textContent = "—";
    toast(e.message || "Error cotizando envío", "bad");
  }
}

/* ---------- promo ---------- */
function applyPromo(code) {
  const c = (code || "").trim().toUpperCase();
  if (!c) {
    cart.promo = null;
    refs.promoBadge.textContent = "—";
    persistCart();
    return;
  }

  const promos = catalog?.promos || [];
  const p = promos.find((x) => (x.code || "").toUpperCase() === c);

  if (!p) {
    toast("Cupón no válido", "warn");
    return;
  }

  cart.promo = p;
  refs.promoBadge.textContent = `${p.code} (${p.type} ${p.value})`;
  toast("Cupón aplicado ✅", "ok");
  persistCart();
}

function promoDiscountCents(subtotal) {
  const p = cart.promo;
  if (!p) return 0;

  if (p.type === "percent") {
    return Math.round(subtotal * (Number(p.value || 0) / 100));
  }
  if (p.type === "amount") {
    return Math.min(subtotal, Number(p.value_cents || 0));
  }
  return 0;
}

/* ---------- checkout ---------- */
async function checkout() {
  try {
    if (!cart.items.length) return toast("Tu carrito está vacío", "warn");

    const subtotal = cartSubtotalCents();
    const discount = promoDiscountCents(subtotal);

    const payload = {
      items: cart.items.map((it) => ({ ...it })),
      promo: cart.promo ? { code: cart.promo.code } : null,
      shipping: cart.shipping,
      totals: {
        subtotal_cents: subtotal,
        discount_cents: discount,
      },
    };

    refs.checkoutBtn.disabled = true;
    refs.checkoutBtn.textContent = "Procesando…";

    const res = await fetch(CONFIG.endpoints.checkout, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "No se pudo iniciar checkout");

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error("Checkout sin URL");
  } catch (e) {
    toast(e.message || "Error checkout", "bad");
  } finally {
    refs.checkoutBtn.disabled = false;
    refs.checkoutBtn.textContent = "Pagar";
  }
}

/* ---------- init ---------- */
async function init() {
  try {
    catalog = await loadJSON(CONFIG.catalogUrl);

    // promos optional
    try {
      const promos = await loadJSON("/data/promos.json");
      catalog.promos = promos?.promos || promos || [];
    } catch {
      catalog.promos = [];
    }

    showCategories();
    showProducts(null);
    renderCart();

    // restore UI
    refs.shipMode.value = cart.shipping?.mode || "pickup";
    refs.shipPostal.value = cart.shipping?.postal_code || "";
    refs.promoBadge.textContent = cart.promo ? `${cart.promo.code} (${cart.promo.type} ${cart.promo.value})` : "—";

    // events
    refs.cartBtn?.addEventListener("click", openDrawer);
    refs.drawerClose?.addEventListener("click", closeDrawer);

    refs.shipMode?.addEventListener("change", () => {
      cart.shipping.mode = refs.shipMode.value;
      persistCart();
      quoteShipping();
    });

    refs.shipPostal?.addEventListener("input", () => {
      cart.shipping.postal_code = refs.shipPostal.value.trim();
      persistCart();
    });

    refs.shipPostal?.addEventListener("change", quoteShipping);

    refs.promoApply?.addEventListener("click", () => applyPromo(refs.promoInput.value));
    refs.checkoutBtn?.addEventListener("click", checkout);

  } catch (e) {
    console.error(e);
    toast("No se pudo cargar el catálogo", "bad");
  }
}

document.addEventListener("DOMContentLoaded", init);