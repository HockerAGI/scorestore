/* =========================================================
   SCORE STORE — MASTER JS PROD 2026 (UNIFIED + FIXED)
   Version: 2026_PROD_UNIFIED_402
   - Catalog normalization (baseMXN or price_cents)
   - PWA stable cache
   - Shipping quote + checkout integration
   ========================================================= */

const VERSION = "2026_PROD_UNIFIED_402";

const API = {
  checkout: "/api/checkout",
  quote: "/api/quote",
  chat: "/api/chat"
};

const STORAGE = {
  cart: "score_cart_2026",
  cookies: "score_cookie_ok"
};

const CATALOG_URL = "/data/catalog.json";
const PROMOS_URL = "/data/promos.json";

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const fmtMoney = (cents, currency = "mxn") => {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format((cents || 0) / 100);
  } catch {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  }
};

// Encode URLs safely (assets in this repo include some filenames with spaces)
const safeUrl = (u) => (typeof u === "string" ? encodeURI(u) : u);

const STATE = {
  sections: [],
  products: [],
  currentSection: null,
  cart: [],
  promo: { code: "", discount_mxn: 0, label: "" },
  shipping: { mode: "pickup", postal_code: "", quote_mxn: 0, provider: "" }
};

// ---------- Catalog normalization ----------
function normalizeCatalog(raw) {
  const out = { sections: [], products: [] };
  if (!raw || typeof raw !== "object") return out;

  // Sections
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const sectionCoverMap = {
    "BAJA_1000": "/assets/logo-baja1000.webp",
    "BAJA_500": "/assets/logo-baja500.webp",
    "BAJA_400": "/assets/logo-baja400.webp",
    "SF_250": "/assets/logo-sf250.webp",
    "EDICION_2025": "/assets/logo-score.webp",
    "OTRAS_EDICIONES": "/assets/logo-score.webp",
    "SCORE": "/assets/logo-score.webp"
  };

  out.sections = sections.map((s) => {
    const id = String(s.id || s.sectionId || s.key || "").trim() || "SCORE";
    const name = String(s.name || s.title || id).trim();
    const subtitle = String(s.subtitle || s.tagline || "").trim();
    const cover = String(s.cover || s.logo || sectionCoverMap[id] || "/assets/logo-score.webp").trim();
    return { id, name, subtitle, cover };
  });

  // Products
  const products = Array.isArray(raw.products) ? raw.products : [];
  out.products = products.map((p) => {
    const sku = String(p.sku || p.id || p.code || "").trim();
    const id = String(p.id || sku).trim() || sku;

    let price_cents = Number.isFinite(p.price_cents) ? Number(p.price_cents) : null;
    if (price_cents == null) {
      const mxn = Number(p.baseMXN ?? p.priceMXN ?? p.price ?? p.base ?? 0);
      price_cents = Math.round((Number.isFinite(mxn) ? mxn : 0) * 100);
    }
    const currency = String(p.currency || "mxn").toLowerCase();

    const sectionId = String(p.sectionId || p.section || "SCORE").toUpperCase();
    const name = String(p.name || p.title || sku).trim();
    const desc = String(p.desc || p.description || p.short || "").trim();

    const sizes = Array.isArray(p.sizes) ? p.sizes : (typeof p.sizes === "string" ? [p.sizes] : []);
    const normalizedSizes = (sizes.length ? sizes : ["Unitalla"]).map((s) => String(s).trim()).filter(Boolean);

    const img = String(p.img || p.image || p.image_url || "").trim();
    const images = Array.isArray(p.images) ? p.images : [];
    const allImages = [img, ...images].filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());

    return {
      id,
      sku: sku || id,
      name,
      desc,
      sectionId,
      price_cents,
      currency,
      sizes: normalizedSizes,
      img: allImages[0] || "/assets/logo-score.webp",
      images: allImages.length ? allImages : ["/assets/logo-score.webp"]
    };
  });

  if (!out.sections.length && out.products.length) {
    const ids = Array.from(new Set(out.products.map((p) => p.sectionId))).filter(Boolean);
    out.sections = ids.map((id) => ({
      id,
      name: id.replace(/_/g, " "),
      subtitle: "",
      cover: sectionCoverMap[id] || "/assets/logo-score.webp"
    }));
  }

  return out;
}

// ---------- Storage ----------
function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE.cart);
    STATE.cart = raw ? JSON.parse(raw) : [];
  } catch {
    STATE.cart = [];
  }
  updateCartBadge();
}

function saveCart() {
  localStorage.setItem(STORAGE.cart, JSON.stringify(STATE.cart));
  updateCartBadge();
}

function updateCartBadge() {
  const qty = STATE.cart.reduce((a, it) => a + (Number(it.qty) || 0), 0);
  $$(".cartCount").forEach((el) => (el.textContent = String(qty)));
}

// ---------- UI ----------
function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

function openCart() {
  $("#cartDrawer")?.classList.add("open");
  $("#overlay")?.classList.remove("hidden");
  $("#overlay")?.classList.add("show");
  renderCart();
}
function closeCart() {
  $("#cartDrawer")?.classList.remove("open");
  $("#overlay")?.classList.add("hidden");
  $("#overlay")?.classList.remove("show");
}
window.openCart = openCart;
window.closeCart = closeCart;

window.scrollToCatalog = () => {
  document.getElementById("catalogos")?.scrollIntoView({ behavior: "smooth" });
};

// ---------- Promos ----------
async function fetchPromos() {
  try {
    const res = await fetch(PROMOS_URL, { cache: "no-store" });
    if (!res.ok) return;
    const promos = await res.json();

    const banner = $("#promoBanner");
    if (promos?.active && promos?.banner && banner) {
      banner.textContent = promos.banner;
      show(banner);
    } else if (banner) {
      hide(banner);
    }

    STATE._promos = promos;
  } catch {}
}

function applyPromo() {
  const input = $("#promoInput");
  const hint = $("#promoHint");
  const code = String(input?.value || "").trim().toUpperCase();
  if (!code) {
    STATE.promo = { code: "", discount_mxn: 0, label: "" };
    if (hint) hint.textContent = "";
    renderCart();
    return;
  }

  const codes = Array.isArray(STATE._promos?.codes) ? STATE._promos.codes : [];
  const found = codes.find((c) => String(c.code || "").toUpperCase() === code);

  if (!found) {
    STATE.promo = { code: "", discount_mxn: 0, label: "" };
    if (hint) hint.textContent = "Código inválido.";
  } else {
    STATE.promo = {
      code,
      discount_mxn: Number(found.discount_mxn) || 0,
      label: String(found.label || "")
    };
    if (hint) hint.textContent = `Aplicado: ${STATE.promo.label || code}`;
  }

  renderCart();
}
window.applyPromo = applyPromo;

// ---------- Shipping ----------
function readShipMode() {
  const selected = document.querySelector('input[name="shipMode"]:checked');
  return String(selected?.value || "pickup");
}

function setShipMode(mode) {
  STATE.shipping.mode = mode;
  const wrap = $("#shipPostalWrap");
  const hint = $("#shipQuoteHint");

  if (mode === "envia_mx" || mode === "envia_us") {
    show(wrap);
    if (hint) hint.textContent = "Ingresa tu CP y cotiza.";
  } else {
    hide(wrap);
    if (hint) hint.textContent = "";
    STATE.shipping.postal_code = "";
    STATE.shipping.quote_mxn = mode === "local_tj" ? 200 : 0;
    STATE.shipping.provider = mode === "local_tj" ? "local" : "pickup";
  }

  renderCart();
}

async function quoteShipping() {
  const mode = readShipMode();
  const postal = String($("#shipPostal")?.value || "").trim();

  STATE.shipping.mode = mode;
  STATE.shipping.postal_code = postal;

  const hint = $("#shipQuoteHint");
  if (hint) hint.textContent = "Cotizando...";

  try {
    const items_qty = STATE.cart.reduce((a, it) => a + (Number(it.qty) || 0), 0) || 1;

    const res = await fetch(API.quote, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        postal_code: postal,
        items_qty,
        country_code: mode === "envia_us" ? "US" : "MX"
      })
    });

    const data = await res.json();
    if (!data?.ok) {
      STATE.shipping.quote_mxn = 0;
      STATE.shipping.provider = "error";
      if (hint) hint.textContent = "No se pudo cotizar. Revisa el CP.";
    } else {
      STATE.shipping.quote_mxn = Number(data.cost) || 0;
      STATE.shipping.provider = data.provider || "envia";
      if (hint) hint.textContent = `Envío: $${STATE.shipping.quote_mxn} MXN (${STATE.shipping.provider})`;
    }
  } catch (e) {
    STATE.shipping.quote_mxn = 350;
    STATE.shipping.provider = "manual_fallback";
    if (hint) hint.textContent = "Fallback: $350 MXN (temporal)";
  }

  renderCart();
}
window.quoteShipping = quoteShipping;

// ---------- Catalog UI ----------
function setTopHeroFromCatalog(catalog) {
  const title = $("#heroTitle");
  const subtitle = $("#heroSubtitle");

  if (catalog?.hero?.title && title) title.textContent = catalog.hero.title;
  if (catalog?.hero?.subtitle && subtitle) subtitle.textContent = catalog.hero.subtitle;
}

function renderEditions() {
  const grid = $("#editionGrid");
  if (!grid) return;

  grid.innerHTML = "";

  STATE.sections.forEach((sec) => {
    const card = document.createElement("div");
    card.className = "editionCard";
    card.innerHTML = `
      <div class="editionMedia">
        <img src="${safeUrl(sec.cover)}" alt="${sec.name}">
      </div>
      <div class="editionBody">
        <div class="editionTitle">${sec.name}</div>
        <div class="editionSub">${sec.subtitle || ""}</div>
      </div>
    `;
    card.onclick = () => openSection(sec.id);
    grid.appendChild(card);
  });
}

function openSection(sectionId) {
  STATE.currentSection = sectionId;
  $("#currentEditionTitle").textContent = (STATE.sections.find(s => s.id === sectionId)?.name) || sectionId.replace(/_/g, " ");
  $("#currentEditionSubtitle").textContent = (STATE.sections.find(s => s.id === sectionId)?.subtitle) || "";

  hide($("#catalogos"));
  show($("#productos"));
  renderProducts();
}
window.backToEditions = () => {
  STATE.currentSection = null;
  show($("#catalogos"));
  hide($("#productos"));
};

function renderProducts() {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const list = STATE.products.filter((p) => p.sectionId === STATE.currentSection);
  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "productCard";
    card.innerHTML = `
      <div class="productMedia">
        <img src="${safeUrl(p.img)}" alt="${p.name}">
      </div>
      <div class="productBody">
        <div class="productName">${p.name}</div>
        <div class="productDesc">${p.desc || ""}</div>
        <div class="productBottom">
          <div class="priceTag">${fmtMoney(p.price_cents, p.currency)}</div>
          <button class="addBtn" data-sku="${p.sku}">Ver</button>
        </div>
      </div>
    `;
    card.querySelector(".addBtn").onclick = () => openProduct(p.sku);
    grid.appendChild(card);
  });
}

function openProduct(sku) {
  const p = STATE.products.find((x) => x.sku === sku);
  if (!p) return;

  $("#modalName").textContent = p.name;
  $("#modalDesc").textContent = p.desc || "";
  $("#modalPrice").textContent = fmtMoney(p.price_cents, p.currency);

  const mainImg = $("#modalMainImg");
  const thumbs = $("#modalThumbs");
  if (mainImg) mainImg.src = safeUrl(p.images?.[0] || p.img);

  if (thumbs) {
    thumbs.innerHTML = "";
    (p.images || [p.img]).forEach((img) => {
      const t = document.createElement("img");
      t.src = safeUrl(img);
      t.onclick = () => (mainImg.src = safeUrl(img));
      thumbs.appendChild(t);
    });
  }

  const sel = $("#modalSize");
  if (sel) {
    sel.innerHTML = "";
    (p.sizes || ["Unitalla"]).forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      sel.appendChild(o);
    });
  }

  const btn = $("#modalAddBtn");
  if (btn) {
    btn.onclick = () => {
      addToCart(p.sku, $("#modalSize")?.value || "Unitalla");
      closeProduct();
      openCart();
    };
  }

  show($("#productModal"));
}
function closeProduct() {
  hide($("#productModal"));
}
window.closeProduct = closeProduct;

// ---------- Cart ----------
function addToCart(sku, size) {
  const p = STATE.products.find((x) => x.sku === sku);
  if (!p) return;

  const key = `${sku}::${String(size || "Unitalla")}`;
  const existing = STATE.cart.find((it) => it.key === key);

  if (existing) existing.qty += 1;
  else {
    STATE.cart.push({
      key,
      sku,
      id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      currency: p.currency,
      img: p.img,
      size: String(size || "Unitalla"),
      qty: 1
    });
  }

  saveCart();
}

function changeQty(key, delta) {
  const it = STATE.cart.find((x) => x.key === key);
  if (!it) return;
  it.qty = Math.max(1, (Number(it.qty) || 1) + delta);
  saveCart();
  renderCart();
}

function removeItem(key) {
  STATE.cart = STATE.cart.filter((x) => x.key !== key);
  saveCart();
  renderCart();
}

function computeTotals() {
  const subtotal = STATE.cart.reduce((a, it) => a + (Number(it.price_cents) || 0) * (Number(it.qty) || 0), 0);

  const mode = readShipMode();
  let shipping_mxn = 0;
  if (mode === "pickup") shipping_mxn = 0;
  if (mode === "local_tj") shipping_mxn = 200;
  if (mode === "envia_mx" || mode === "envia_us") shipping_mxn = Number(STATE.shipping.quote_mxn) || 0;

  const shipping_cents = Math.round(shipping_mxn * 100);

  const discount_cents = Math.round((Number(STATE.promo.discount_mxn) || 0) * 100);

  const total = Math.max(0, subtotal + shipping_cents - discount_cents);

  return { subtotal, shipping_cents, discount_cents, total, shipping_mxn, mode };
}

function renderCart() {
  const itemsWrap = $("#cartItems");
  if (!itemsWrap) return;

  if (!STATE.cart.length) {
    itemsWrap.innerHTML = `<p class="muted" style="text-align:center;padding:18px">Tu carrito está vacío</p>`;
  } else {
    itemsWrap.innerHTML = "";

    STATE.cart.forEach((it) => {
      const row = document.createElement("div");
      row.className = "cartRow";
      row.innerHTML = `
        <img src="${safeUrl(it.img)}" alt="${it.name}">
        <div>
          <div class="cartName">${it.name}</div>
          <div class="cartMeta">${fmtMoney(it.price_cents, it.currency)} · Talla: ${it.size}</div>
          <div class="qtyRow">
            <button class="qtyBtn" data-act="dec">−</button>
            <div><strong>${it.qty}</strong></div>
            <button class="qtyBtn" data-act="inc">+</button>
          </div>
        </div>
        <button class="removeBtn" title="Eliminar">✕</button>
      `;

      row.querySelector('[data-act="dec"]').onclick = () => changeQty(it.key, -1);
      row.querySelector('[data-act="inc"]').onclick = () => changeQty(it.key, +1);
      row.querySelector(".removeBtn").onclick = () => removeItem(it.key);

      itemsWrap.appendChild(row);
    });
  }

  const totals = computeTotals();

  $("#cartSubtotal").textContent = fmtMoney(totals.subtotal, "mxn");
  $("#cartShipping").textContent = totals.shipping_cents ? fmtMoney(totals.shipping_cents, "mxn") : "Gratis";
  $("#cartDiscount").textContent = totals.discount_cents ? `- ${fmtMoney(totals.discount_cents, "mxn")}` : "$0";
  $("#cartTotal").textContent = fmtMoney(totals.total, "mxn");
}

// ---------- Checkout ----------
async function checkout() {
  if (!STATE.cart.length) return alert("Tu carrito está vacío.");

  const btn = $("#checkoutBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Procesando...";

  const totals = computeTotals();

  try {
    const postal = String($("#shipPostal")?.value || "").trim();
    const payload = {
      cart: STATE.cart.map((it) => ({ sku: it.sku, qty: it.qty, size: it.size })),
      shipping_mode: totals.mode,
      shipping_cost_mxn: totals.shipping_mxn,
      shipping_postal_code: (totals.mode === "envia_mx" || totals.mode === "envia_us") ? postal : "",
      promo_code: STATE.promo.code || "",
      discount_mxn: Number(STATE.promo.discount_mxn) || 0
    };

    const res = await fetch(API.checkout, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data?.url) throw new Error("No se pudo iniciar el checkout.");

    window.location.href = data.url;
  } catch (e) {
    alert(e?.message || "Error de checkout.");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
window.checkout = checkout;

// ---------- Cookies ----------
function maybeShowCookieBanner() {
  const ok = localStorage.getItem(STORAGE.cookies) === "1";
  if (!ok) show($("#cookieBanner"));
}
function acceptCookies() {
  localStorage.setItem(STORAGE.cookies, "1");
  hide($("#cookieBanner"));
}
window.acceptCookies = acceptCookies;

// ---------- Init ----------
async function loadCatalogAndPromos() {
  try {
    const resCat = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!resCat.ok) throw new Error(`Catalog fetch failed: ${resCat.status}`);
    const catalogJson = await resCat.json();
    setTopHeroFromCatalog(catalogJson);

    const normalized = normalizeCatalog(catalogJson);
    STATE.sections = normalized.sections;
    STATE.products = normalized.products;

    renderEditions();
  } catch (e) {
    console.error("Error loading catalog", e);
  }

  await fetchPromos();
}

function initShippingUI() {
  $$('input[name="shipMode"]').forEach((r) => {
    r.addEventListener("change", () => setShipMode(readShipMode()));
  });
  setShipMode(readShipMode());
}

function initSplash() {
  const splash = $("#splash");
  if (!splash) return;
  setTimeout(() => {
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), 460);
  }, 1200);
}

function initPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(`/sw.js?v=${VERSION}`).catch(() => null);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  window.__SCORE_VERSION = VERSION;
  loadCart();
  initSplash();
  initPWA();
  maybeShowCookieBanner();
  initShippingUI();
  await loadCatalogAndPromos();
});
