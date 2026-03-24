/* ========================================================= SCORE STORE — main.js (Repo-aligned) — v2026-03-04 Objetivo:

Nada roto: modales, carrito, checkout, cotización real

Assets blindados (BAJA_500 vs BAJA500, etc.)

Carruseles controlados (snap settle + hint) ========================================================= */ (() => { "use strict";


const APP_VERSION = window.APP_VERSION || "2026.03.04.SCORESTORE"; const $ = (sel, root = document) => root.querySelector(sel); const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel)); const debounce = (fn, wait = 160) => { let t = null; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }; const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const money = (cents) => { const n = Number(cents); const v = Number.isFinite(n) ? n : 0; return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2, }).format(v / 100); };

const escapeHtml = (s) => String(s || "") .replaceAll("&", "&") .replaceAll("<", "<") .replaceAll(">", ">") .replaceAll('"', """) .replaceAll("'", "'");

// ✅ Normaliza diferencias REALES de carpetas del repo vs DB/JSON const safeUrl = (u) => { const s0 = String(u || "").trim(); if (!s0) return ""; if (s0.startsWith("http://") || s0.startsWith("https://") || s0.startsWith("data:")) return s0;

const s1 = s0
  .replaceAll("assets/BAJA_500/", "assets/BAJA500/")
  .replaceAll("assets/BAJA_400/", "assets/BAJA400/")
  .replaceAll("assets/SF_250/", "assets/SF250/")
  .replaceAll("assets/BAJA_1000/", "assets/EDICION_2025/");

if (s1.startsWith("/")) return s1;
if (s1.startsWith("assets/") || s1.startsWith("css/") || s1.startsWith("js/") || s1.startsWith("data/")) return `/${s1}`;
return s1;

};

const normCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

// ========================================================= // DOM refs (ID’s reales del index) // ========================================================= const splash = $("#splash"); const overlay = $("#overlay");

const sideMenu = $("#sideMenu"); const openMenuBtn = $("#openMenuBtn"); const closeMenuBtn = $("#closeMenuBtn");

const cartDrawer = $("#cartDrawer"); const openCartBtn = $("#openCartBtn"); const closeCartBtn = $("#closeCartBtn"); const navOpenCart = $("#navOpenCart");

const assistantModal = $("#assistantModal"); const openAssistantBtn = $("#openAssistantBtn"); const floatingAssistantBtn = $("#floatingAssistantBtn"); const navOpenAssistant = $("#navOpenAssistant"); const assistantClose = $("#assistantClose"); const assistantOutput = $("#assistantOutput"); const assistantInput = $("#assistantInput"); const assistantSendBtn = $("#assistantSendBtn");

const scrollToCategoriesBtn = $("#scrollToCategoriesBtn");

const categoryGrid = $("#categoryGrid"); const categoryHint = $("#categoryHint");

const catalogCarouselSection = $("#catalogCarouselSection"); const carouselTitle = $("#carouselTitle"); const scrollLeftBtn = $("#scrollLeftBtn"); const scrollRightBtn = $("#scrollRightBtn");

const productGrid = $("#productGrid"); const statusRow = $("#statusRow");

const searchInput = $("#searchInput"); const mobileSearchBtn = $("#mobileSearchBtn"); const mobileSearchWrap = $("#mobileSearchWrap"); const mobileSearchInput = $("#mobileSearchInput"); const closeMobileSearchBtn = $("#closeMobileSearchBtn"); const sortSelect = $("#sortSelect"); const menuSearchInput = $("#menuSearchInput");

const promoBar = $("#promoBar"); const promoBarText = $("#promoBarText"); const promoBarClose = $("#promoBarClose");

const activeFilterRow = $("#activeFilterRow"); const activeFilterLabel = $("#activeFilterLabel"); const clearFilterBtn = $("#clearFilterBtn");

const cartCount = $("#cartCount"); const cartItemsEl = $("#cartItems"); const cartSubtotalEl = $("#cartSubtotal"); const shippingLineEl = $("#shippingLine"); const discountLineWrap = $("#discountLineWrap"); const discountLineEl = $("#discountLine"); const cartTotalEl = $("#cartTotal");

const shipModePickup = $("#shipModePickup"); const shipModeDelivery = $("#shipModeDelivery"); const shipPostal = $("#shipPostal"); const shipQuoteBtn = $("#shipQuoteBtn"); const shipQuoteStatus = $("#shipQuoteStatus"); const shipQuoteEl = $("#shipQuoteEl");

const checkoutForm = $("#checkoutForm"); const checkoutName = $("#checkoutName"); const checkoutEmail = $("#checkoutEmail"); const checkoutPhone = $("#checkoutPhone"); const checkoutAddress = $("#checkoutAddress"); const checkoutPostal = $("#checkoutPostal"); const checkoutNotes = $("#checkoutNotes"); const checkoutPaySelect = $("#checkoutPaySelect"); const checkoutSubmitBtn = $("#checkoutSubmitBtn"); const checkoutMsg = $("#checkoutMsg"); const checkoutLoader = $("#checkoutLoader");

const productModal = $("#productModal"); const pmBackBtn = $("#pmBackBtn"); const pmClose = $("#pmClose"); const pmCarousel = $("#pmCarousel"); const pmTitle = $("#pmTitle"); const pmChips = $("#pmChips"); const pmPrice = $("#pmPrice"); const pmDesc = $("#pmDesc"); const pmShareBtn = $("#pmShareBtn"); const pmAdd = $("#pmAdd"); const pmSizePills = $("#pmSizePills"); const pmQtyDec = $("#pmQtyDec"); const pmQtyInc = $("#pmQtyInc"); const pmQtyDisplay = $("#pmQtyDisplay"); const pmStockBadge = $("#pmStockBadge");

const sizeGuideModal = $("#sizeGuideModal"); const openSizeGuideBtn = $("#openSizeGuideBtn"); const closeSizeGuideBtn = $("#closeSizeGuideBtn"); const understandSizeBtn = $("#understandSizeBtn");

const cookieBanner = $("#cookieBanner"); const cookieAccept = $("#cookieAccept"); const cookieReject = $("#cookieReject");

const scrollTopBtn = $("#scrollTopBtn");

const toast = $("#toast"); const appVersionLabel = $("#appVersionLabel");

const salesNotification = $("#salesNotification"); const salesName = $("#salesName"); const salesAction = $("#salesAction");

// ========================================================= // Storage keys // ========================================================= const STORAGE_KEYS = { cart: "scorestore_cart_v2_pro", ship: "scorestore_ship_v2", consent: "scorestore_consent_v2", promoDismiss: "scorestore_promo_dismissed", seenSwipe: "scorestore_seen_product_swipe", };

// ========================================================= // Config / Category mapping (real) // ========================================================= const CATEGORY_CONFIG = [ { uiId: "BAJA1000", name: "BAJA 1000", logo: "assets/logo-baja1000.webp", mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES"] }, { uiId: "BAJA500", name: "BAJA 500", logo: "assets/logo-baja500.webp", mapFrom: ["BAJA500", "BAJA_500"] }, { uiId: "BAJA400", name: "BAJA 400", logo: "assets/logo-baja400.webp", mapFrom: ["BAJA400", "BAJA_400"] }, { uiId: "SF250",  name: "SAN FELIPE 250", logo: "assets/logo-sf250.webp", mapFrom: ["SF250", "SF_250"] }, ];

const normalizeSectionIdToUi = (sectionId) => { const sid = String(sectionId || "").trim(); const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid)); return found ? found.uiId : "BAJA1000"; }; const getLogoForSection = (uiId) => (CATEGORY_CONFIG.find((c) => c.uiId === uiId)?.logo || "assets/logo-baja1000.webp");

const inferCollection = (p) => { const sid = String(p?.sectionId || p?.section_id || p?.section || "").trim(); if (sid === "EDICION_2025") return "Edición 2025"; if (sid === "OTRAS_EDICIONES") return "Ediciones Clásicas"; return ""; };

const normalizeProduct = (p) => { const sku = String(p?.sku || p?.id || "").trim(); const title = String(p?.title || p?.name || "Producto Oficial").trim(); const priceCents = Number.isFinite(Number(p?.price_cents)) ? Math.round(Number(p.price_cents)) : 0;

const images = Array.isArray(p?.images) ? p.images : (p?.img ? [p.img] : []);
const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["S", "M", "L", "XL", "XXL"];
const rawSection = String(p?.sectionId || p?.categoryId || p?.section || "").trim();
const uiSection = normalizeSectionIdToUi(rawSection);

return {
  sku,
  title,
  description: String(p?.description || "").trim(),
  priceCents,
  images: images.map(safeUrl).filter(Boolean),
  img: images?.[0] ? safeUrl(images[0]) : "",
  sizes: sizes.map((s) => String(s || "").trim()).filter(Boolean),
  rawSection,
  uiSection,
  collection: inferCollection(p),
  rank: Number.isFinite(Number(p?.rank)) ? Number(p.rank) : 999,
  stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
};

};

// ========================================================= // State // ========================================================= let catalog = null; let products = []; let promosData = { rules: [] }; let activePromo = null;

let activeCategory = null; let searchQuery = ""; let sortMode = "featured";

let cart = []; let shipMode = "pickup"; let shippingQuoted = 0; let shippingMeta = null; let currentProduct = null; let selectedQty = 1; let selectedSize = ""; let siteSettings = { promo_active: false, promo_text: "", pixel_id: "", hero_title: null, contact: null }; let loadingCatalog = false;

const isTouch = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

// ========================================================= // Helpers: modal/drawer // ========================================================= const anyLayerOpen = () => [sideMenu, cartDrawer, assistantModal, productModal, sizeGuideModal].some((el) => el && !el.hidden); const isModal = (el) => [assistantModal, productModal, sizeGuideModal].includes(el);

const openOverlay = () => { if (!overlay) return; overlay.hidden = false; document.documentElement.classList.add("no-scroll"); };

const closeOverlayIfNeeded = () => { if (!anyLayerOpen()) { if (overlay) overlay.hidden = true; document.documentElement.classList.remove("no-scroll"); } };

const openLayer = (el) => { if (!el) return; openOverlay(); el.hidden = false; requestAnimationFrame(() => { if (isModal(el)) el.classList.add("modal--open"); }); };

const closeLayer = (el) => { if (!el) return; if (isModal(el)) { el.classList.remove("modal--open"); setTimeout(() => { el.hidden = true; closeOverlayIfNeeded(); }, 260); return; } el.hidden = true; closeOverlayIfNeeded(); };

// ========================================================= // Fetchers // ========================================================= const fetchJsonFirstOk = async (urls) => { const list = Array.isArray(urls) ? urls : []; let lastErr = null; for (const u of list) { try { const res = await fetch(u, { headers: { "cache-control": "no-store" } }); if (!res.ok) { lastErr = new Error(HTTP ${res.status}); continue; } const j = await res.json().catch(() => null); if (j) return j; } catch (e) { lastErr = e; } } throw lastErr || new Error("No se pudo cargar JSON"); };

const fetchCatalog = async () => { const cv = encodeURIComponent(APP_VERSION); return await fetchJsonFirstOk([ /api/catalog?cv=${cv}, data/catalog.json?cv=${cv}, ]); };

const fetchPromos = async () => { const cv = encodeURIComponent(APP_VERSION); try { promosData = await fetchJsonFirstOk([ /api/promos?cv=${cv}, data/promos.json?cv=${cv}, ]); if (!promosData || !Array.isArray(promosData.rules)) promosData = { rules: [] }; } catch { promosData = { rules: [] }; } };

// ========================================================= // Site settings + Pixel + Promo bar (si existe function) // ========================================================= const loadMetaPixel = (pixelId) => { const id = String(pixelId || "").trim(); if (!id) return; if (document.getElementById("metaPixelScript")) return;

const script = document.createElement("script");
script.id = "metaPixelScript";
script.type = "text/javascript";
script.text = `
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
  (window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${id.replace("'", "")}');
  fbq('track', 'PageView');
`;
document.head.appendChild(script);

const ns = document.createElement("noscript");
ns.innerHTML = `<img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${encodeURIComponent(id)}&ev=PageView&noscript=1"/>`;
document.body.appendChild(ns);

};

const applySiteSettings = (s) => { if (!s) return; siteSettings.promo_active = !!s.promo_active; siteSettings.promo_text = String(s.promo_text || "").trim(); siteSettings.pixel_id = String(s.pixel_id || "").trim();

const dismissed = localStorage.getItem(STORAGE_KEYS.promoDismiss) === "1";
if (promoBar && promoBarText && siteSettings.promo_active && siteSettings.promo_text && !dismissed) {
  promoBarText.textContent = siteSettings.promo_text;
  promoBar.hidden = false;
} else if (promoBar) {
  promoBar.hidden = true;
}

if (siteSettings.pixel_id) {
  const consent = localStorage.getItem(STORAGE_KEYS.consent);
  if (consent === "accept") loadMetaPixel(siteSettings.pixel_id);
}

};

const fetchSiteSettings = async () => { const cv = encodeURIComponent(APP_VERSION); try { const j = await fetchJsonFirstOk([/api/site_settings?cv=${cv}]); applySiteSettings(j); } catch {} };

// ========================================================= // Render: Categories // ========================================================= const renderCategories = () => { if (!categoryGrid) return; categoryGrid.innerHTML = "";

const counts = new Map();
products.forEach((p) => counts.set(p.uiSection, (counts.get(p.uiSection) || 0) + 1));

const frag = document.createDocumentFragment();
for (const cat of CATEGORY_CONFIG) {
  const count = counts.get(cat.uiId) || 0;

  const card = document.createElement("button");
  card.className = "catcard hover-fx";
  card.type = "button";
  card.setAttribute("data-cat", cat.uiId);

  card.innerHTML = `
    <div class="catcard__bg" aria-hidden="true"></div>
    <div class="catcard__inner">
      <img class="catcard__logo" src="${safeUrl(cat.logo)}" alt="${escapeHtml(cat.name)}" loading="lazy" decoding="async">
      <div class="catcard__meta">
        <div class="catcard__title tech-text">${escapeHtml(cat.name)}</div>
        <div class="catcard__sub">${count} productos</div>
      </div>
      <div class="catcard__btn">Explorar</div>
    </div>
  `;

  card.addEventListener("click", () => {
    $$(".catcard").forEach((x) => x.classList.remove("active"));
    card.classList.add("active");

    activeCategory = cat.uiId;
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    if (mobileSearchInput) mobileSearchInput.value = "";
    if (menuSearchInput) menuSearchInput.value = "";
    updateResults();

    carouselTitle && (carouselTitle.textContent = cat.name);
    if (catalogCarouselSection) {
      catalogCarouselSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  frag.appendChild(card);
}

categoryGrid.appendChild(frag);
if (categoryHint) categoryHint.hidden = false;

};

// ========================================================= // Render: Products / cards // ========================================================= const getProductImages = (p) => { const imgs = Array.isArray(p?.images) ? p.images.filter(Boolean) : []; if (imgs.length) return imgs.map(safeUrl).filter(Boolean); const one = safeUrl(p?.img || ""); return one ? [one] : []; };

const getProductName = (p) => String(p?.title || p?.name || "Producto Oficial");

const getProductPriceCents = (p) => { const n = Number(p?.priceCents ?? p?.price_cents ?? p?.price ?? 0); return Number.isFinite(n) ? Math.round(n) : 0; };

const getProductSku = (p) => String(p?.sku || p?.id || "");

const getProductSizes = (p) => { const sizes = Array.isArray(p?.sizes) ? p.sizes : []; return sizes.map((s) => String(s || "").trim()).filter(Boolean); };

const getProductSectionUi = (p) => p?.uiSection || normalizeSectionIdToUi(p?.sectionId || p?.section || p?.categoryId || "");

const getStockLabel = (p) => { const stock = Number(p?.stock); if (!Number.isFinite(stock)) return ""; if (stock <= 0) return "Agotado"; if (stock <= 3) return "Últimas piezas"; return Stock ${stock}; };

const getSizeAvailability = (p) => { const stock = Number(p?.stock); if (!Number.isFinite(stock)) return true; return stock > 0; };

const getCardBadge = (p) => { const stockLabel = getStockLabel(p); const collection = inferCollection(p); const bits = []; if (stockLabel) bits.push(<span class="pill pill--red">${escapeHtml(stockLabel)}</span>); if (collection) bits.push(<span class="pill">${escapeHtml(collection)}</span>); return bits.join(""); };

const productCardHTML = (p) => { const imgs = getProductImages(p); const title = escapeHtml(getProductName(p)); const sku = escapeHtml(getProductSku(p)); const price = money(getProductPriceCents(p)); const badge = getCardBadge(p); const first = imgs[0] || ""; const count = imgs.length;

return `
  <article class="card" data-sku="${sku}">
    <div class="card__media">
      <div class="card__track" data-track>
        ${imgs.length ? imgs.map((src) => `<img src="${escapeHtml(src)}" alt="${title}" loading="lazy" decoding="async">`).join("") : `<img src="${escapeHtml(first)}" alt="${title}" loading="lazy" decoding="async">`}
      </div>
      ${count > 1 ? `<button class="card__nav card__nav--prev" type="button" aria-label="Anterior">‹</button><button class="card__nav card__nav--next" type="button" aria-label="Siguiente">›</button><div class="card__dots">${imgs.map((_, i) => `<span class="card__dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div><div class="card__swipe-hint" aria-hidden="true">Desliza</div>` : ""}
    </div>
    <div class="card__body">
      <div>
        <div class="card__title">${title}</div>
        <div class="card__chips">${badge}</div>
      </div>
      <div class="card__row">
        <div class="price">${price}</div>
        <button class="btn btn--primary btn--tiny" type="button" data-open-product="${sku}">Ver</button>
      </div>
    </div>
  </article>
`;

};

const attachCardEvents = (cardEl, p) => { const track = cardEl.querySelector("[data-track]"); const prev = cardEl.querySelector(".card__nav--prev"); const next = cardEl.querySelector(".card__nav--next"); const dots = Array.from(cardEl.querySelectorAll(".card__dot")); const hint = cardEl.querySelector(".card__swipe-hint");

const setDot = (idx) => dots.forEach((d, i) => d.classList.toggle("active", i === idx));
const page = () => Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));

const settle = debounce(() => {
  const idx = clamp(page(), 0, Math.max(0, dots.length - 1));
  track.scrollTo({ left: idx * (track.clientWidth || 1), behavior: "smooth" });
  setDot(idx);
}, 70);

prev?.addEventListener("click", (e) => {
  e.stopPropagation();
  const idx = clamp(page() - 1, 0, Math.max(0, dots.length - 1));
  track.scrollTo({ left: idx * (track.clientWidth || 1), behavior: "smooth" });
  setDot(idx);
});

next?.addEventListener("click", (e) => {
  e.stopPropagation();
  const idx = clamp(page() + 1, 0, Math.max(0, dots.length - 1));
  track.scrollTo({ left: idx * (track.clientWidth || 1), behavior: "smooth" });
  setDot(idx);
});

track?.addEventListener("scroll", settle, { passive: true });
hint?.addEventListener("transitionend", () => { if (hint.dataset.hide === "1") hint.remove(); });

if (dots.length > 1) {
  dots.forEach((d, i) => d.addEventListener("click", (e) => {
    e.stopPropagation();
    track.scrollTo({ left: i * (track.clientWidth || 1), behavior: "smooth" });
    setDot(i);
  }));
}

};

const buildSort = (arr) => { const list = [...arr]; switch (sortMode) { case "price_asc": return list.sort((a, b) => getProductPriceCents(a) - getProductPriceCents(b)); case "price_desc": return list.sort((a, b) => getProductPriceCents(b) - getProductPriceCents(a)); case "name_asc": return list.sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es")); case "featured": default: return list.sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999) || getProductName(a).localeCompare(getProductName(b), "es")); } };

const matchesSearch = (p, q) => { if (!q) return true; const hay = [ getProductName(p), p?.description, p?.sku, p?.sectionId, p?.section, p?.categoryId, inferCollection(p), ].map((x) => normCode(x)).join("|"); return hay.includes(normCode(q)); };

const matchesCategory = (p) => { if (!activeCategory) return true; return getProductSectionUi(p) === activeCategory; };

const filteredProducts = () => buildSort(products.filter((p) => matchesCategory(p) && matchesSearch(p, searchQuery)));

const updateStatus = (count) => { if (!statusRow) return; const n = Number(count) || 0; statusRow.innerHTML = <span class="status">${n} producto${n === 1 ? "" : "s"} encontrado${n === 1 ? "" : "s"}</span>; };

const renderProducts = () => { if (!productGrid) return; const list = filteredProducts(); productGrid.innerHTML = list.map(productCardHTML).join(""); updateStatus(list.length);

$$(".card", productGrid).forEach((cardEl) => {
  const sku = cardEl.getAttribute("data-sku") || "";
  const p = products.find((x) => getProductSku(x) === sku);
  if (p) attachCardEvents(cardEl, p);
  cardEl.addEventListener("click", () => openProduct(sku));
  cardEl.querySelectorAll("button[data-open-product]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openProduct(sku);
    });
  });
});

};

// ========================================================= // Swipe hint // ========================================================= const maybeShowSwipeHint = () => { try { const seen = localStorage.getItem(STORAGE_KEYS.seenSwipe) === "1"; if (seen) { document.getElementById("productSwipeHint")?.remove(); return; } } catch {}

if (document.getElementById("productSwipeHint")) return;

const el = document.createElement("div");
el.id = "productSwipeHint";
el.className = "product-swipe-hint";
el.setAttribute("aria-hidden", "true");
el.innerHTML = `<span class="product-swipe-hint__txt">Desliza para ver más</span><span class="product-swipe-hint__arr">→</span>`;
document.body.appendChild(el);

const dismiss = () => {
  try { localStorage.setItem(STORAGE_KEYS.seenSwipe, "1"); } catch {}
  el.classList.add("is-hide");
  setTimeout(() => el.remove(), 350);
  productGrid?.removeEventListener?.("scroll", dismiss);
};

productGrid?.addEventListener?.("scroll", dismiss, { passive: true });
setTimeout(() => { if (document.body.contains(el)) el.classList.add("is-pulse"); }, 900);

};

// ========================================================= // Stock text (real) // ========================================================= const getScarcityText = (p) => { const stock = Number(p?.stock); if (!Number.isFinite(stock)) return ""; if (stock <= 0) return "⏳ Sin stock por ahora. Confirma por WhatsApp si quieres apartar."; if (stock <= 3) return "🔥 Últimas piezas disponibles."; return ""; };

// ========================================================= // Modal: Producto // ========================================================= const openProduct = (sku) => { const p = products.find((x) => getProductSku(x) === sku); if (!p) return;

currentProduct = p;
selectedQty = 1;
selectedSize = "";

if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
if (pmTitle) pmTitle.textContent = getProductName(p);
if (pmPrice) pmPrice.textContent = money(getProductPriceCents(p));

if (pmStockBadge) {
  const stock = Number(p.stock);
  if (Number.isFinite(stock)) {
    pmStockBadge.hidden = false;
    pmStockBadge.textContent = stock > 0 ? `Stock: ${stock}` : "AGOTADO";
    pmStockBadge.style.borderColor = stock > 0 ? "rgba(0,0,0,0.1)" : "var(--red)";
  } else {
    pmStockBadge.hidden = true;
  }
}

if (pmDesc) {
  const scarcity = getScarcityText(p);
  pmDesc.innerHTML =
    `<p>${escapeHtml(p.description || "Merch oficial Score Store.")}</p>` +
    (scarcity ? `<p style="color:var(--red); font-weight:bold; margin-top:10px;">${escapeHtml(scarcity)}</p>` : "");
}

if (pmChips) {
  pmChips.innerHTML = `<span class="pill pill--logo"><img src="${safeUrl(getLogoForSection(getProductSectionUi(p)))}" width="30" height="16" alt="Logo"></span>`;
  if (inferCollection(p)) pmChips.innerHTML += `<span class="pill pill--red">${escapeHtml(inferCollection(p))}</span>`;
}

if (pmSizePills) {
  pmSizePills.innerHTML = "";
  const sizes = getProductSizes(p);
  const canSell = getSizeAvailability(p);
  sizes.forEach((s) => {
    const size = String(s || "").trim();
    if (!size) return;

    const btn = document.createElement("button");
    btn.className = "size-pill";
    btn.textContent = size;

    if (!canSell) {
      btn.classList.add("out-of-stock");
      btn.setAttribute("aria-disabled", "true");
      btn.title = "Sin stock";
      btn.onclick = () => showToast("Por ahora no hay stock registrado. Si necesitas apartar, contáctanos por WhatsApp.", "error");
    } else {
      btn.onclick = () => {
        $$(".size-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedSize = size;
      };
    }

    pmSizePills.appendChild(btn);
  });
}

if (pmCarousel) {
  const imgs = getProductImages(p);
  pmCarousel.innerHTML = `
    <div class="pm__track" id="pmTrack">
      ${imgs.length ? imgs.map((src) => `<img src="${escapeHtml(src)}" width="400" height="500" loading="lazy" alt="${escapeHtml(getProductName(p))}">`).join("") : `<img src="" width="400" height="500" loading="lazy" alt="${escapeHtml(getProductName(p))}">`}
    </div>
    ${imgs.length > 1 ? `<div class="pm__dots">${imgs.map((_, i) => `<span class="pm__dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div>` : ""}
  `;

  const track = pmCarousel.querySelector("#pmTrack");
  const dots = Array.from(pmCarousel.querySelectorAll(".pm__dot"));
  const setDot = (idx) => dots.forEach((d, i) => d.classList.toggle("active", i === idx));
  const snap = debounce(() => {
    const idx = Math.round((track.scrollLeft || 0) / (track.clientWidth || 1));
    const k = clamp(idx, 0, Math.max(0, dots.length - 1));
    track.scrollTo({ left: k * (track.clientWidth || 1), behavior: "smooth" });
    setDot(k);
  }, 90);

  dots.forEach((d, i) => d.addEventListener("click", () => {
    track.scrollTo({ left: i * (track.clientWidth || 1), behavior: "smooth" });
    setDot(i);
  }));

  track?.addEventListener("scroll", debounce(() => {
    const idx = clamp(Math.round((track.scrollLeft || 0) / (track.clientWidth || 1)), 0, Math.max(0, dots.length - 1));
    setDot(idx);
  }, 80), { passive: true });

  if (track) setTimeout(() => snap(), 30);
}

openLayer(productModal);

};

const closeProduct = () => closeLayer(productModal);

// ========================================================= // Cart // ========================================================= const persistCart = () => { try { localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); } catch {} };

const loadCart = () => { try { const raw = localStorage.getItem(STORAGE_KEYS.cart); cart = raw ? JSON.parse(raw) : []; if (!Array.isArray(cart)) cart = []; } catch { cart = []; } };

const getCartSubtotal = () => cart.reduce((acc, item) => acc + Number(item.price_cents || 0) * Number(item.qty || 0), 0);

const getDiscountAmount = () => { if (!activePromo) return 0; const subtotal = getCartSubtotal();

if (activePromo.type === "percentage") {
  return Math.round(subtotal * (Number(activePromo.value || 0) / 100));
}

if (activePromo.type === "fixed") {
  return Math.min(subtotal, Math.round(Number(activePromo.value || 0)));
}

return 0;

};

const getShippingAmount = () => { if (shipMode === "pickup") return 0; return Number(shippingQuoted || 0); };

const getCartTotal = () => Math.max(0, getCartSubtotal() - getDiscountAmount() + getShippingAmount());

const updateCartBadge = () => { if (!cartCount) return; const n = cart.reduce((a, i) => a + Number(i.qty || 0), 0); cartCount.textContent = String(n); cartCount.hidden = n <= 0; };

const renderCart = () => { if (!cartItemsEl) return; cartItemsEl.innerHTML = "";

if (!cart.length) {
  cartItemsEl.innerHTML = `<div class="status">Tu carrito está vacío.</div>`;
  updateCartBadge();
  if (cartSubtotalEl) cartSubtotalEl.textContent = money(0);
  if (shippingLineEl) shippingLineEl.textContent = money(getShippingAmount());
  if (discountLineEl) discountLineEl.textContent = `-${money(getDiscountAmount())}`;
  if (cartTotalEl) cartTotalEl.textContent = money(getCartTotal());
  return;
}

cart.forEach((item, idx) => {
  const row = document.createElement("div");
  row.className = "cartitem";
  row.innerHTML = `
    <div class="cartitem__img">
      <img src="${escapeHtml(safeUrl(item.image || ""))}" alt="${escapeHtml(item.name || "Producto")}" loading="lazy">
    </div>
    <div class="cartitem__content" style="flex:1;">
      <h4 class="cartitem__title">${escapeHtml(item.name || "Producto")}</h4>
      <div class="cartitem__meta">${item.size ? `Talla: ${escapeHtml(item.size)} · ` : ""}${money(item.price_cents || 0)}</div>
      <div class="cartitem__controls">
        <div class="qty" data-qty="${idx}">
          <button type="button" data-dec>-</button>
          <span>${Number(item.qty || 1)}</span>
          <button type="button" data-inc>+</button>
        </div>
        <button class="trash" type="button" data-remove="${idx}">✕</button>
      </div>
    </div>
  `;
  cartItemsEl.appendChild(row);
});

cartItemsEl.querySelectorAll("[data-dec]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const idx = Number(btn.closest("[data-qty]")?.getAttribute("data-qty") || 0);
    cart[idx].qty = Math.max(1, Number(cart[idx].qty || 1) - 1);
    persistCart();
    renderCart();
  });
});

cartItemsEl.querySelectorAll("[data-inc]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const idx = Number(btn.closest("[data-qty]")?.getAttribute("data-qty") || 0);
    cart[idx].qty = Math.min(99, Number(cart[idx].qty || 1) + 1);
    persistCart();
    renderCart();
  });
});

cartItemsEl.querySelectorAll("[data-remove]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const idx = Number(btn.getAttribute("data-remove") || 0);
    cart.splice(idx, 1);
    persistCart();
    renderCart();
    showToast("Producto eliminado.", "ok");
  });
});

if (cartSubtotalEl) cartSubtotalEl.textContent = money(getCartSubtotal());
if (shippingLineEl) shippingLineEl.textContent = money(getShippingAmount());
if (discountLineEl) discountLineEl.textContent = `-${money(getDiscountAmount())}`;
if (discountLineWrap) discountLineWrap.hidden = getDiscountAmount() <= 0;
if (cartTotalEl) cartTotalEl.textContent = money(getCartTotal());
updateCartBadge();

};

const addToCart = (p, qty = 1, size = "") => { const sku = getProductSku(p); const existing = cart.find((x) => x.sku === sku && String(x.size || "") === String(size || ""));

if (existing) {
  existing.qty = Math.min(99, Number(existing.qty || 0) + Number(qty || 1));
} else {
  cart.push({
    sku,
    name: getProductName(p),
    price_cents: getProductPriceCents(p),
    image: getProductImages(p)[0] || "",
    size: size || "",
    qty: clamp(Number(qty || 1), 1, 99),
  });
}

persistCart();
renderCart();

};

// ========================================================= // Promo // ========================================================= const findPromo = (code) => { const c = normCode(code); const rules = Array.isArray(promosData?.rules) ? promosData.rules : []; return rules.find((r) => normCode(r?.code) === c) || null; };

const applyPromoCode = async (code) => { const c = normCode(code); if (!c) return null;

try {
  const res = await fetch(`/api/promos?code=${encodeURIComponent(code)}`, {
    headers: { "cache-control": "no-store" },
  });
  if (res.ok) {
    const j = await res.json().catch(() => null);
    if (j?.valid && j?.promo) {
      activePromo = j.promo;
      renderCart();
      showToast("Cupón aplicado.", "ok");
      return j.promo;
    }
  }
} catch {}

const local = findPromo(c);
if (local) {
  activePromo = local;
  renderCart();
  showToast("Cupón aplicado.", "ok");
  return local;
}

activePromo = null;
renderCart();
showToast("Cupón no válido.", "error");
return null;

};

// ========================================================= // Shipping quote (REAL): /api/quote_shipping // ========================================================= const quoteShipping = async () => { const postal = String(checkoutPostal?.value || shipPostal?.value || "").trim(); const subtotal = getCartSubtotal();

if (shipMode === "pickup") {
  shippingQuoted = 0;
  shippingMeta = { mode: "pickup", amount: 0, label: "Pickup" };
  renderCart();
  if (shipQuoteStatus) shipQuoteStatus.textContent = "Recojo en tienda / pickup";
  if (shipQuoteEl) shipQuoteEl.textContent = money(0);
  return shippingMeta;
}

if (postal.length < 5) {
  showToast("Captura un código postal válido.", "error");
  return null;
}

if (!cart.length) {
  showToast("Agrega productos al carrito antes de cotizar.", "error");
  return null;
}

try {
  const res = await fetch("/api/quote_shipping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postal, subtotal_cents: subtotal, items: cart }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(j?.error || `HTTP ${res.status}`);

  shippingQuoted = Number(j.amount_cents || j.amount || 0) || 0;
  shippingMeta = j;
  renderCart();
  if (shipQuoteStatus) shipQuoteStatus.textContent = j.service || j.carrier || "Cotización lista";
  if (shipQuoteEl) shipQuoteEl.textContent = money(shippingQuoted);
  showToast("Cotización actualizada.", "ok");
  return j;
} catch (err) {
  shippingQuoted = 0;
  shippingMeta = null;
  renderCart();
  if (shipQuoteStatus) shipQuoteStatus.textContent = "No fue posible cotizar";
  if (shipQuoteEl) shipQuoteEl.textContent = money(0);
  showToast(err?.message || "Error al cotizar envío.", "error");
  return null;
}

};

// ========================================================= // Checkout (REAL): /api/create_checkout // ========================================================= const submitCheckout = async (ev) => { ev?.preventDefault();

if (!cart.length) {
  showToast("Tu carrito está vacío.", "error");
  return;
}

const name = String(checkoutName?.value || "").trim();
const email = String(checkoutEmail?.value || "").trim();
const phone = String(checkoutPhone?.value || "").trim();
const address = String(checkoutAddress?.value || "").trim();
const postal = String(checkoutPostal?.value || "").trim();
const notes = String(checkoutNotes?.value || "").trim();
const payment_method = String(checkoutPaySelect?.value || "").trim();

if (!name || !email || !phone) {
  showToast("Completa nombre, correo y teléfono.", "error");
  return;
}

if (shipMode === "delivery" && (!address || postal.length < 5)) {
  showToast("Completa dirección y CP para envío.", "error");
  return;
}

if (shipMode === "delivery" && !shippingQuoted) {
  await quoteShipping();
  if (!shippingQuoted) return;
}

const payload = {
  customer: { name, email, phone, address, postal, notes },
  shipping: {
    mode: shipMode,
    amount_cents: getShippingAmount(),
    quote: shippingMeta,
  },
  promo: activePromo,
  payment_method,
  items: cart,
  totals: {
    subtotal_cents: getCartSubtotal(),
    discount_cents: getDiscountAmount(),
    shipping_cents: getShippingAmount(),
    total_cents: getCartTotal(),
  },
  source: {
    app_version: APP_VERSION,
    location: location.href,
  },
};

try {
  if (checkoutLoader) checkoutLoader.hidden = false;
  if (checkoutSubmitBtn) checkoutSubmitBtn.disabled = true;

  const res = await fetch("/api/create_checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(j?.error || `HTTP ${res.status}`);

  if (j.url) {
    window.location.href = j.url;
    return;
  }

  if (j.checkout_url) {
    window.location.href = j.checkout_url;
    return;
  }

  if (j.message) {
    showToast(j.message, "ok");
  } else {
    showToast("Checkout creado.", "ok");
  }
} catch (err) {
  showToast(err?.message || "No fue posible crear el checkout.", "error");
} finally {
  if (checkoutLoader) checkoutLoader.hidden = true;
  if (checkoutSubmitBtn) checkoutSubmitBtn.disabled = false;
}

};

// ========================================================= // Assistant (REAL): /api/chat // ========================================================= const addAssistantMessage = (text, role = "ai") => { if (!assistantOutput) return; const msg = document.createElement("div"); msg.className = msg ${role === "me" ? "msg--me" : "msg--ai"}; msg.innerHTML = <div>${escapeHtml(text)}</div><div class="msg__meta">${role === "me" ? "Tú" : "Asistente"}</div>; assistantOutput.appendChild(msg); assistantOutput.scrollTop = assistantOutput.scrollHeight; };

const sendAssistant = async () => { const q = String(assistantInput?.value || "").trim(); if (!q) return;

addAssistantMessage(q, "me");
if (assistantInput) assistantInput.value = "";

try {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: q,
      context: {
        app: "Score Store",
        version: APP_VERSION,
        cart: cart,
        activeCategory,
        shippingMode: shipMode,
      },
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(j?.error || `HTTP ${res.status}`);
  addAssistantMessage(j.reply || j.message || "Listo.", "ai");
} catch (err) {
  addAssistantMessage(err?.message || "No fue posible responder.", "ai");
}

};

// ========================================================= // Promo bar / cookie banner / notifications // ========================================================= const showToast = (text, type = "ok") => { if (!toast) return; toast.textContent = String(text || ""); toast.className = toast show ${type === "error" ? "toast--error" : type === "success" ? "toast--success" : ""}; clearTimeout(showToast._t); showToast._t = setTimeout(() => { toast.className = "toast"; }, 2200); };

const setCookieConsent = (value) => { try { localStorage.setItem(STORAGE_KEYS.consent, value); } catch {} if (cookieBanner) cookieBanner.hidden = true; if (siteSettings.pixel_id && value === "accept") loadMetaPixel(siteSettings.pixel_id); };

const initCookieBanner = () => { if (!cookieBanner) return; const consent = localStorage.getItem(STORAGE_KEYS.consent); if (consent === "accept" || consent === "reject") { cookieBanner.hidden = true; return; } cookieBanner.hidden = false; };

const initSalesNotification = () => { if (!salesNotification || !salesName || !salesAction) return; const names = ["S. López", "C. Ramírez", "M. Torres", "A. García", "J. Morales"]; const actions = ["compró una gorra", "agregó una playera", "finalizó un pedido", "aplicó un cupón", "cotizó envío"]; let idx = 0; setInterval(() => { salesName.textContent = names[idx % names.length]; salesAction.textContent = actions[idx % actions.length]; salesNotification.classList.add("show"); clearTimeout(initSalesNotification._t); initSalesNotification._t = setTimeout(() => salesNotification.classList.remove("show"), 3800); idx += 1; }, 18000); };

const syncAppVersion = () => { if (appVersionLabel) appVersionLabel.textContent = APP_VERSION; };

// ========================================================= // Events // ========================================================= const bindEvents = () => { openMenuBtn?.addEventListener("click", () => openLayer(sideMenu)); closeMenuBtn?.addEventListener("click", () => closeLayer(sideMenu));

openCartBtn?.addEventListener("click", () => openLayer(cartDrawer));
closeCartBtn?.addEventListener("click", () => closeLayer(cartDrawer));
navOpenCart?.addEventListener("click", () => openLayer(cartDrawer));

openAssistantBtn?.addEventListener("click", () => openLayer(assistantModal));
floatingAssistantBtn?.addEventListener("click", () => openLayer(assistantModal));
navOpenAssistant?.addEventListener("click", () => openLayer(assistantModal));
assistantClose?.addEventListener("click", () => closeLayer(assistantModal));

pmBackBtn?.addEventListener("click", closeProduct);
pmClose?.addEventListener("click", closeProduct);

openSizeGuideBtn?.addEventListener("click", () => openLayer(sizeGuideModal));
closeSizeGuideBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));
understandSizeBtn?.addEventListener("click", () => closeLayer(sizeGuideModal));

scrollToCategoriesBtn?.addEventListener("click", () => categoryGrid?.scrollIntoView({ behavior: "smooth", block: "start" }));

scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

promoBarClose?.addEventListener("click", () => {
  try { localStorage.setItem(STORAGE_KEYS.promoDismiss, "1"); } catch {}
  if (promoBar) promoBar.hidden = true;
});

cookieAccept?.addEventListener("click", () => setCookieConsent("accept"));
cookieReject?.addEventListener("click", () => setCookieConsent("reject"));

shipModePickup?.addEventListener("change", () => {
  shipMode = "pickup";
  try { localStorage.setItem(STORAGE_KEYS.ship, shipMode); } catch {}
  shippingQuoted = 0;
  renderCart();
});

shipModeDelivery?.addEventListener("change", () => {
  shipMode = "delivery";
  try { localStorage.setItem(STORAGE_KEYS.ship, shipMode); } catch {}
  renderCart();
});

shipQuoteBtn?.addEventListener("click", quoteShipping);

checkoutForm?.addEventListener("submit", submitCheckout);
assistantSendBtn?.addEventListener("click", sendAssistant);
assistantInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendAssistant();
  }
});

pmQtyDec?.addEventListener("click", () => {
  selectedQty = clamp(selectedQty - 1, 1, 99);
  if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
});
pmQtyInc?.addEventListener("click", () => {
  selectedQty = clamp(selectedQty + 1, 1, 99);
  if (pmQtyDisplay) pmQtyDisplay.textContent = String(selectedQty);
});
pmAdd?.addEventListener("click", () => {
  if (!currentProduct) return;
  addToCart(currentProduct, selectedQty, selectedSize);
  closeProduct();
  showToast("Agregado al carrito.", "ok");
});

pmShareBtn?.addEventListener("click", async () => {
  if (!currentProduct) return;
  const url = `${location.origin}${location.pathname}#sku=${encodeURIComponent(getProductSku(currentProduct))}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: getProductName(currentProduct), url });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast("Link copiado.", "ok");
    }
  } catch {}
});

searchInput?.addEventListener("input", debounce((e) => {
  searchQuery = String(e.target.value || "");
  if (menuSearchInput && menuSearchInput.value !== searchQuery) menuSearchInput.value = searchQuery;
  if (mobileSearchInput && mobileSearchInput.value !== searchQuery) mobileSearchInput.value = searchQuery;
  updateResults();
}, 120));

mobileSearchInput?.addEventListener("input", debounce((e) => {
  searchQuery = String(e.target.value || "");
  if (searchInput && searchInput.value !== searchQuery) searchInput.value = searchQuery;
  if (menuSearchInput && menuSearchInput.value !== searchQuery) menuSearchInput.value = searchQuery;
  updateResults();
}, 120));

menuSearchInput?.addEventListener("input", debounce((e) => {
  searchQuery = String(e.target.value || "");
  if (searchInput && searchInput.value !== searchQuery) searchInput.value = searchQuery;
  if (mobileSearchInput && mobileSearchInput.value !== searchQuery) mobileSearchInput.value = searchQuery;
  updateResults();
}, 120));

closeMobileSearchBtn?.addEventListener("click", () => {
  if (mobileSearchWrap) mobileSearchWrap.hidden = true;
});

mobileSearchBtn?.addEventListener("click", () => {
  if (mobileSearchWrap) mobileSearchWrap.hidden = !mobileSearchWrap.hidden;
  mobileSearchInput?.focus();
});

sortSelect?.addEventListener("change", (e) => {
  sortMode = String(e.target.value || "featured");
  updateResults();
});

clearFilterBtn?.addEventListener("click", () => {
  activeCategory = null;
  searchQuery = "";
  if (searchInput) searchInput.value = "";
  if (mobileSearchInput) mobileSearchInput.value = "";
  if (menuSearchInput) menuSearchInput.value = "";
  $$(".catcard").forEach((x) => x.classList.remove("active"));
  updateResults();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLayer(sideMenu);
    closeLayer(cartDrawer);
    closeLayer(assistantModal);
    closeProduct();
    closeLayer(sizeGuideModal);
    if (mobileSearchWrap) mobileSearchWrap.hidden = true;
  }
});

overlay?.addEventListener("click", () => {
  closeLayer(sideMenu);
  closeLayer(cartDrawer);
  closeLayer(assistantModal);
  closeProduct();
  closeLayer(sizeGuideModal);
  if (mobileSearchWrap) mobileSearchWrap.hidden = true;
});

window.addEventListener("scroll", () => {
  if (scrollTopBtn) scrollTopBtn.hidden = window.scrollY < 500;
}, { passive: true });

};

// ========================================================= // Router / hash // ========================================================= const applyHashSku = () => { const hash = String(location.hash || ""); const m = hash.match(/sku=([^&]+)/i); if (!m) return; const sku = decodeURIComponent(m[1] || ""); if (sku) setTimeout(() => openProduct(sku), 250); };

// ========================================================= // Update results // ========================================================= const updateResults = () => { renderProducts(); maybeShowSwipeHint();

if (activeFilterLabel) {
  const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
  activeFilterLabel.textContent = activeCategory ? (cat?.name || activeCategory) : "Todos los productos";
}

if (activeFilterRow) activeFilterRow.hidden = !activeCategory && !searchQuery;

if (carouselTitle) {
  const cat = CATEGORY_CONFIG.find((c) => c.uiId === activeCategory);
  carouselTitle.textContent = activeCategory ? (cat?.name || "Productos") : "Productos destacados";
}

};

// ========================================================= // Init catalog data // ========================================================= const loadCatalog = async () => { if (loadingCatalog) return; loadingCatalog = true;

try {
  const data = await fetchCatalog();
  catalog = data;
  const rawProducts = Array.isArray(data?.products) ? data.products : Array.isArray(data?.items) ? data.items : [];
  products = rawProducts.map(normalizeProduct).filter((p) => p.sku || p.title);
  renderCategories();
  updateResults();
  if (statusRow) statusRow.hidden = false;
} catch (err) {
  products = [];
  renderCategories();
  updateResults();
  showToast(err?.message || "No fue posible cargar el catálogo.", "error");
} finally {
  loadingCatalog = false;
}

};

// ========================================================= // Bootstrap // ========================================================= const boot = async () => { syncAppVersion(); loadCart();

try {
  const savedShip = localStorage.getItem(STORAGE_KEYS.ship);
  if (savedShip === "pickup" || savedShip === "delivery") shipMode = savedShip;
} catch {}

if (shipModePickup) shipModePickup.checked = shipMode === "pickup";
if (shipModeDelivery) shipModeDelivery.checked = shipMode === "delivery";

bindEvents();
initCookieBanner();
renderCart();
updateCartBadge();

await Promise.allSettled([fetchPromos(), fetchSiteSettings(), loadCatalog()]);

renderCart();
updateResults();
applyHashSku();
if (splash) setTimeout(() => { splash.hidden = true; }, 700);
initSalesNotification();

};

document.addEventListener("DOMContentLoaded", boot);

// ========================================================= // Exports mínimas para debug interno // ========================================================= window.SCORESTORE = { version: APP_VERSION, get catalog() { return catalog; }, get products() { return products; }, get cart() { return cart; }, get shipMode() { return shipMode; }, get activeCategory() { return activeCategory; }, get activePromo() { return activePromo; }, }; })();