/* =========================================================
   SCORE STORE / UnicOs — main.js (PROD)
   - No placeholder
   - No cuadro vacío si no hay imagen
   - Carrusel estilo Facebook (swipe + dots + arrows desktop)
   - Auto-detect cuando subes imágenes (retry sin recargar)
   ========================================================= */

const CONFIG = {
  storageKey: "score_cart_2026",
  catalogUrl: "/data/catalog.json",
  endpoints: {
    checkout: "/api/checkout",
    quote: "/api/quote", // <- respeta tu routing típico
  },
  locale: "es-MX",
  currency: "MXN",
  imgRetryMs: 45000,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  // variantes de layout (soporta ambos)
  productsGrid: $("#productsGrid") || $("#products-grid") || $("#products"),
  categoryView: $("#category-view") || $("#categoryView"),
  categoryFilters: $("#categoryFilters") || $("#category-filters") || $("#categoryFiltersWrap"),

  openCartBtn: $("#openCartBtn") || $("#btnCart") || $("#cartBtn"),
  cartDrawer: $("#cartDrawer") || $("#drawer") || $("#cart"),
  closeCartBtn: $("#closeCartBtn") || $("#drawerClose") || $("#cartClose"),
  cartList: $("#cartItemsList") || $("#cartList") || $("#cartItems"),
  cartSubtotal: $("#cartSubtotal") || $("#cartTotal") || $("#subtotal"),

  shipMode: $("#shipMode"),
  postalCode: $("#postalCode") || $("#shipPostal"),
  quoteBtn: $("#quoteBtn"),
  shippingQuote: $("#shippingQuote") || $("#shipQuote"),

  promoInput: $("#promoCodeInput") || $("#promoCode"),
  applyPromoBtn: $("#applyPromoBtn") || $("#promoApply"),
  checkoutBtn: $("#checkoutBtn") || $("#btnCheckout"),
};

let catalog = null;
let cart = readLS(CONFIG.storageKey, { items: [], promo: null, shipping: { mode: "pickup", postal_code: "" } });

/* ---------------- utils ---------------- */

function escapeHTML(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneyFromCents(cents, currency = "MXN") {
  const v = (Number(cents || 0) / 100);
  try {
    return new Intl.NumberFormat(CONFIG.locale, { style: "currency", currency }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function toCentsFromMXN(valueMXN) {
  const n = Number(valueMXN || 0);
  return Math.round(n * 100);
}

function safePath(p) {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const s = p.startsWith("/") ? p : `/${p}`;
  return encodeURI(s); // soporta espacios si existen
}

function looksLikePlaceholder(url) {
  const u = String(url || "").toLowerCase();
  return u.includes("placeholder") || u.includes("imagen-pendiente");
}

function isImageUrl(url) {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(String(url || ""));
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar JSON: ${url}`);
  return res.json();
}

function saveLS(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
}

function readLS(k, fallback) {
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

/* ---------------- catalog normalize ---------------- */

function getCategories(cat) {
  return cat?.categories || cat?.sections || [];
}

function normalizeProduct(p) {
  // soporta catálogos con price_cents o baseMXN
  const price_cents =
    Number(p?.price_cents) ||
    (p?.baseMXN ? toCentsFromMXN(p.baseMXN) : 0);

  return {
    id: String(p?.id || p?.sku || ""),
    sku: String(p?.sku || p?.id || ""),
    name: String(p?.name || "Producto"),
    desc: String(p?.desc || ""),
    sectionId: String(p?.sectionId || p?.section || p?.categoryId || ""),
    currency: String((p?.currency || "mxn")).toLowerCase(),
    price_cents,
    sizes: Array.isArray(p?.sizes) ? p.sizes : (Array.isArray(p?.tallas) ? p.tallas : []),
    img: p?.img ? safePath(p.img) : "",
    images: Array.isArray(p?.images) ? p.images.map(safePath) : [],
  };
}

function productImages(p) {
  const raw = [];
  if (p.img) raw.push(p.img);
  if (Array.isArray(p.images)) raw.push(...p.images);

  const cleaned = uniq(raw)
    .filter((u) => u && isImageUrl(u))
    .filter((u) => !looksLikePlaceholder(u));

  return cleaned;
}

/* ---------------- carousel ---------------- */

function renderCarouselHTML(images, alt, cid) {
  const imgs = Array.isArray(images) ? images : [];
  const one = imgs.length <= 1;
  const encoded = encodeURIComponent(JSON.stringify(imgs));

  return `
    <div class="p-carousel ${one ? "one" : ""}" data-carousel="${escapeHTML(cid)}" data-all="${encoded}">
      <div class="p-track">
        ${imgs.map((src, i) => `
          <div class="p-slide" data-src="${escapeHTML(src)}">
            <img src="${escapeHTML(src)}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async" data-idx="${i}">
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

function setupCarousel(carouselEl) {
  if (!carouselEl) return;

  const media = carouselEl.closest(".p-media") || carouselEl.closest(".product-media");
  const track = $(".p-track", carouselEl);

  let all = [];
  try {
    all = JSON.parse(decodeURIComponent(carouselEl.dataset.all || "[]"));
  } catch {
    all = [];
  }

  let active = [...all];
  const missing = new Set();

  const clamp = (n, max) => Math.max(0, Math.min(max - 1, n));

  function rebuild() {
    if (!track) return;

    // si ya no hay imágenes activas, elimina media (no cuadro vacío)
    if (!active.length) {
      media?.classList.add("no-media");
      return;
    }

    media?.classList.remove("no-media");

    track.innerHTML = active.map((src, i) => `
      <div class="p-slide" data-src="${escapeHTML(src)}">
        <img src="${escapeHTML(src)}" alt="" loading="lazy" decoding="async" data-idx="${i}">
      </div>
    `).join("");

    const dotsWrap = $(".p-dots", carouselEl);
    if (dotsWrap) {
      dotsWrap.innerHTML = active.map((_, i) =>
        `<button type="button" class="p-dot ${i===0 ? "active" : ""}" data-go="${i}" aria-label="Imagen ${i+1}"></button>`
      ).join("");
    }

    carouselEl.classList.toggle("one", active.length <= 1);

    // bind errors: si falla, la quitamos y si se queda en 0, se borra el bloque
    $$("img", track).forEach((img) => {
      img.addEventListener("error", () => {
        const slide = img.closest(".p-slide");
        const src = slide?.dataset?.src || img.getAttribute("src") || "";
        if (!src) return;

        missing.add(src);
        active = active.filter((x) => x !== src);
        rebuild();
      }, { once: true });
    });
  }

  function setActiveDot(i) {
    $$(".p-dot", carouselEl).forEach((d, idx) => d.classList.toggle("active", idx === i));
  }

  function goTo(i) {
    if (!track) return;
    const idx = clamp(i, active.length);
    track.scrollTo({ left: idx * track.clientWidth, behavior: "smooth" });
    setActiveDot(idx);
  }

  // click dots / arrows (delegado)
  carouselEl.addEventListener("click", (e) => {
    const dot = e.target.closest(".p-dot");
    if (dot && dot.dataset.go != null) return goTo(parseInt(dot.dataset.go, 10) || 0);

    const nav = e.target.closest(".p-nav");
    if (nav && nav.dataset.step != null) {
      const step = parseInt(nav.dataset.step, 10) || 0;
      const idx = Math.round((track.scrollLeft || 0) / Math.max(1, track.clientWidth));
      return goTo(idx + step);
    }
  });

  // scroll => dot activo
  let raf = 0;
  track?.addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const idx = Math.round((track.scrollLeft || 0) / Math.max(1, track.clientWidth));
      setActiveDot(clamp(idx, active.length));
    });
  }, { passive: true });

  // auto-retry: si subes la imagen luego, aparece sola
  const timer = setInterval(() => {
    const stillMissing = all.filter((x) => !active.includes(x));
    if (!stillMissing.length) return;

    stillMissing.forEach((src) => {
      const probe = new Image();
      probe.onload = () => {
        missing.delete(src);
        if (!active.includes(src)) active.push(src);
        rebuild();
      };
      probe.onerror = () => { /* sigue missing */ };
      probe.src = `${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`; // cache-bust
    });
  }, CONFIG.imgRetryMs);

  // si el nodo se elimina, limpia timer
  const obs = new MutationObserver(() => {
    if (!document.body.contains(carouselEl)) {
      clearInterval(timer);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // primer render
  rebuild();
}

/* ---------------- render ---------------- */

function renderCategories() {
  const cats = getCategories(catalog);

  // Variante 1: category cards
  if (els.categoryView) {
    els.categoryView.innerHTML = "";
    cats.forEach((c) => {
      const id = String(c.id || c.slug || c.name || "");
      const btn = document.createElement("button");
      btn.className = "cat-card";
      btn.type = "button";
      btn.innerHTML = `<strong>${escapeHTML(c.name || "Categoría")}</strong>`;
      btn.addEventListener("click", () => renderProducts(id));
      els.categoryView.appendChild(btn);
    });
  }

  // Variante 2: filtros
  if (els.categoryFilters) {
    els.categoryFilters.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = "filter active";
    allBtn.type = "button";
    allBtn.textContent = "Todo";
    allBtn.addEventListener("click", () => {
      $$(".filter", els.categoryFilters).forEach((b) => b.classList.remove("active"));
      allBtn.classList.add("active");
      renderProducts(null);
    });
    els.categoryFilters.appendChild(allBtn);

    cats.forEach((c) => {
      const id = String(c.id || c.slug || c.name || "");
      const b = document.createElement("button");
      b.className = "filter";
      b.type = "button";
      b.textContent = c.name || "Categoría";
      b.addEventListener("click", () => {
        $$(".filter", els.categoryFilters).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        renderProducts(id);
      });
      els.categoryFilters.appendChild(b);
    });
  }
}

function renderProducts(sectionId) {
  if (!els.productsGrid) return;

  const products = (catalog?.products || []).map(normalizeProduct);
  const list = sectionId ? products.filter((p) => p.sectionId === sectionId) : products;

  els.productsGrid.innerHTML = "";

  list.forEach((p) => {
    const images = productImages(p);

    const card = document.createElement("div");
    card.className = "product-card";

    const media = document.createElement("div");
    media.className = "p-media";
    // si no hay imágenes, eliminamos el bloque completo (no cuadro vacío)
    if (!images.length) {
      media.classList.add("no-media");
    } else {
      media.innerHTML = renderCarouselHTML(images, p.name, `car_${p.id}_${Math.random().toString(16).slice(2)}`);
    }

    const body = document.createElement("div");
    body.className = "p-body";
    body.innerHTML = `
      <div class="p-title">${escapeHTML(p.name)}</div>
      <div class="p-desc">${escapeHTML(p.desc)}</div>
      <div class="p-row">
        <div class="p-price">${moneyFromCents(p.price_cents, p.currency.toUpperCase())}</div>
        <button class="p-btn-add" type="button">Agregar</button>
      </div>
    `;

    const addBtn = $(".p-btn-add", body);
    addBtn?.addEventListener("click", () => addToCart(p.id));

    card.appendChild(media);
    card.appendChild(body);
    els.productsGrid.appendChild(card);

    // activa carrusel si existe
    const car = $(".p-carousel", media);
    if (car) setupCarousel(car);
  });
}

/* ---------------- cart ---------------- */

function findProduct(productId) {
  const products = (catalog?.products || []).map(normalizeProduct);
  return products.find((x) => x.id === productId || x.sku === productId);
}

function persistCart() {
  saveLS(CONFIG.storageKey, cart);
  renderCart();
}

function addToCart(productId) {
  const p = findProduct(productId);
  if (!p) return;

  const size = (p.sizes && p.sizes.length) ? p.sizes[0] : "";
  const idx = cart.items.findIndex((it) => it.id === p.id && (it.size || "") === size);

  if (idx >= 0) cart.items[idx].qty += 1;
  else cart.items.push({ id: p.id, qty: 1, size });

  persistCart();
  openCart();
}

function changeQty(i, delta) {
  cart.items[i].qty += delta;
  if (cart.items[i].qty <= 0) cart.items.splice(i, 1);
  persistCart();
}

function removeItem(i) {
  cart.items.splice(i, 1);
  persistCart();
}

function cartSubtotalCents() {
  return cart.items.reduce((sum, it) => {
    const p = findProduct(it.id);
    if (!p) return sum;
    return sum + (p.price_cents * Number(it.qty || 0));
  }, 0);
}

function renderCart() {
  if (!els.cartList) return;

  els.cartList.innerHTML = "";

  if (!cart.items.length) {
    els.cartList.innerHTML = `<div class="small">Tu carrito está vacío.</div>`;
    if (els.cartSubtotal) els.cartSubtotal.textContent = moneyFromCents(0, CONFIG.currency);
    return;
  }

  cart.items.forEach((it, i) => {
    const p = findProduct(it.id);
    if (!p) return;

    const row = document.createElement("div");
    row.className = "cart-item";

    const images = productImages(p);
    const thumbUrl = images[0] || "";

    const left = document.createElement("div");
    if (thumbUrl) {
      left.innerHTML = `<img src="${escapeHTML(thumbUrl)}" alt="${escapeHTML(p.name)}" loading="lazy" decoding="async">`;
      const img = $("img", left);
      // si falla: quitamos img y ponemos fallback minimal (no “placeholder image”)
      img?.addEventListener("error", () => {
        left.innerHTML = `<div class="cart-thumb-fallback">${escapeHTML(p.name.slice(0,1).toUpperCase())}</div>`;
      }, { once: true });
    } else {
      left.innerHTML = `<div class="cart-thumb-fallback">${escapeHTML(p.name.slice(0,1).toUpperCase())}</div>`;
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <strong>${escapeHTML(p.name)}</strong>
      ${it.size ? `<span>Talla: ${escapeHTML(it.size)}</span>` : `<span></span>`}
      <span>${moneyFromCents(p.price_cents, p.currency.toUpperCase())} x ${Number(it.qty || 0)}</span>
    `;

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.innerHTML = `
      <div class="qty">
        <button type="button" data-act="dec">-</button>
        <span>${Number(it.qty || 0)}</span>
        <button type="button" data-act="inc">+</button>
      </div>
      <button class="btn" type="button" data-act="rm">Quitar</button>
    `;

    actions.querySelector('[data-act="dec"]')?.addEventListener("click", () => changeQty(i, -1));
    actions.querySelector('[data-act="inc"]')?.addEventListener("click", () => changeQty(i, +1));
    actions.querySelector('[data-act="rm"]')?.addEventListener("click", () => removeItem(i));

    row.appendChild(left);
    row.appendChild(meta);
    row.appendChild(actions);
    els.cartList.appendChild(row);
  });

  if (els.cartSubtotal) els.cartSubtotal.textContent = moneyFromCents(cartSubtotalCents(), CONFIG.currency);
}

function openCart() {
  els.cartDrawer?.classList.add("open");
}
function closeCart() {
  els.cartDrawer?.classList.remove("open");
}

/* ---------------- shipping + checkout ---------------- */

async function quoteShipping() {
  if (!els.shippingQuote) return;

  try {
    els.shippingQuote.textContent = "Cotizando…";
    const payload = {
      items: cart.items,
      shipping: cart.shipping,
    };

    const res = await fetch(CONFIG.endpoints.quote, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No se pudo cotizar envío");

    els.shippingQuote.textContent = data?.label || "OK";
    cart.shipping.quote = data;
    persistCart();
  } catch (e) {
    els.shippingQuote.textContent = "—";
    console.error(e);
  }
}

async function checkout() {
  if (!els.checkoutBtn) return;

  try {
    if (!cart.items.length) return;

    els.checkoutBtn.disabled = true;
    const payload = {
      items: cart.items.map((it) => ({ ...it })), // el backend mapea por id/sku
      promo: cart.promo ? { code: cart.promo.code } : null,
      shipping: cart.shipping,
    };

    const res = await fetch(CONFIG.endpoints.checkout, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Checkout falló");

    if (data?.url) window.location.href = data.url;
  } catch (e) {
    console.error(e);
    alert(e.message || "Error checkout");
  } finally {
    els.checkoutBtn.disabled = false;
  }
}

/* ---------------- init ---------------- */

async function init() {
  catalog = await loadJSON(CONFIG.catalogUrl);

  renderCategories();
  renderProducts(null);
  renderCart();

  // eventos UI
  els.openCartBtn?.addEventListener("click", openCart);
  els.closeCartBtn?.addEventListener("click", closeCart);

  els.shipMode?.addEventListener("change", () => {
    cart.shipping.mode = els.shipMode.value;
    persistCart();
    quoteShipping();
  });

  if (els.postalCode) {
    els.postalCode.addEventListener("input", () => {
      cart.shipping.postal_code = String(els.postalCode.value || "").trim();
      persistCart();
    });
    els.postalCode.addEventListener("change", quoteShipping);
  }

  els.quoteBtn?.addEventListener("click", quoteShipping);
  els.checkoutBtn?.addEventListener("click", checkout);
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => {
    console.error(e);
    alert("No se pudo cargar el catálogo.");
  });
});