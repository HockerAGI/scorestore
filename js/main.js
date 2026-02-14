/* SCORE STORE — FRONTEND LOGIC (UNIFIED) v2026_PROD_UNIFIED_361 */

// === Public Supabase (anon) ===
const SUPABASE_URL = "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

// === API routing (Netlify redirects: /api/* -> functions) ===
const API_CANDIDATES = ["/api", "/.netlify/functions"];
let API_BASE = API_CANDIDATES[0];

const APP_VER = "2026_PROD_UNIFIED_361";
const CART_KEY = "score_cart_prod_v5";

let cart = [];
let catalogData = { products: [], sections: [] };
let selectedSizeByProduct = {};
let PROMO_ACTIVE = false;
let FAKE_MARKUP_FACTOR = 1.0;
let supabase = null;

let shippingState = {
  mode: "pickup",
  cost: 0,
  label: "Gratis (Fábrica TJ)",
};

const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(n || 0));

const cleanUrl = (url) => {
  if (!url) return "";
  return encodeURI(String(url).trim());
};

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

async function apiJson(fnName, payload) {
  const body = JSON.stringify(payload || {});
  const opts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  };

  // 1) try cached base
  let res = await fetch(`${API_BASE}/${fnName}`, opts);

  // 2) fallback if 404 or method mismatch
  if (!res.ok && (res.status === 404 || res.status === 405)) {
    for (const base of API_CANDIDATES) {
      if (base === API_BASE) continue;
      const rr = await fetch(`${base}/${fnName}`, opts);
      if (rr.ok) {
        API_BASE = base;
        res = rr;
        break;
      }
    }
  }

  const txt = await res.text();
  const data = safeJsonParse(txt, { ok: false, error: txt });
  if (!res.ok) throw new Error(data?.error || `API ${fnName} (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) {
    const parsed = safeJsonParse(saved, null);
    if (Array.isArray(parsed)) cart = parsed;
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function findProduct(id) {
  return catalogData.products.find((p) => String(p.id) === String(id));
}

function cartQty() {
  return cart.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
}

function cartSubtotal() {
  let total = 0;
  for (const i of cart) {
    const p = findProduct(i.id);
    if (!p) continue;
    total += Number(p.baseMXN || 0) * (Number(i.qty) || 0);
  }
  return total;
}

function setOverlay(on) {
  const overlay = $("overlay");
  if (overlay) overlay.classList.toggle("active", !!on);
  document.body.classList.toggle("modalOpen", !!on);
}

function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add("active");
  setOverlay(true);
}

function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("active");
}

function openDrawer() {
  const d = $("drawer");
  if (!d) return;
  d.classList.add("active");
  setOverlay(true);
}

function closeDrawer() {
  const d = $("drawer");
  if (!d) return;
  d.classList.remove("active");
}

// Expose for inline handlers
window.openDrawer = openDrawer;

window.closeAll = () => {
  closeModal("modalCatalog");
  closeDrawer();

  // If nothing is open, turn overlay off
  const anyOpen =
    $("modalCatalog")?.classList.contains("active") ||
    $("drawer")?.classList.contains("active");

  if (!anyOpen) setOverlay(false);
};

window.emptyCart = (silent) => {
  if (silent || confirm("¿Vaciar carrito?")) {
    cart = [];
    saveCart();
    updateCartUI();
  }
};

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  saveCart();
  updateCartUI();
};

window.incQty = (idx) => {
  if (!cart[idx]) return;
  cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
  saveCart();
  updateCartUI();
};

window.decQty = (idx) => {
  if (!cart[idx]) return;
  cart[idx].qty = Math.max(1, (Number(cart[idx].qty) || 1) - 1);
  saveCart();
  updateCartUI();
};

window.addToCart = (id, size) => {
  const pid = String(id);
  const p = findProduct(pid);
  if (!p) return toast("Producto no disponible");

  const sizes = p.sizes?.length ? p.sizes : ["Unitalla"];
  const sz = size || selectedSizeByProduct[pid] || sizes[0];

  const existing = cart.find((i) => String(i.id) === pid && String(i.size) === String(sz));
  if (existing) existing.qty = (Number(existing.qty) || 0) + 1;
  else cart.push({ id: pid, size: sz, qty: 1 });

  saveCart();
  updateCartUI();
  toast("Agregado");
  openDrawer();

  if (typeof fbq === "function") {
    fbq("track", "AddToCart", { content_ids: [pid], content_type: "product" });
  }
};

function renderProductSlider(images, dotsId) {
  const imgs = (images || []).filter(Boolean);
  if (imgs.length <= 1) {
    return {
      sliderHtml: `<div class="prod-slider"><div class="prod-slide"><img src="${cleanUrl(imgs[0] || "/assets/logo-score.webp")}" class="prodImg" loading="lazy"></div></div>`,
      dotsHtml: "",
      dotsId: null,
    };
  }

  const slides = imgs
    .map(
      (src) =>
        `<div class="prod-slide"><img src="${cleanUrl(src)}" class="prodImg" loading="lazy"></div>`
    )
    .join("");

  const dots = imgs
    .map((_, i) => `<span class="slider-dot ${i === 0 ? "active" : ""}" data-dot="${i}"></span>`)
    .join("");

  return {
    sliderHtml: `<div class="prod-slider" data-dots="${dotsId}">${slides}</div>`,
    dotsHtml: `<div class="slider-dots" id="${dotsId}">${dots}</div>`,
    dotsId,
  };
}

function wireSliders(rootEl) {
  rootEl.querySelectorAll(".prod-slider[data-dots]").forEach((slider) => {
    const dotsId = slider.getAttribute("data-dots");
    const dotsWrap = dotsId ? document.getElementById(dotsId) : null;
    if (!dotsWrap) return;

    const onScroll = () => {
      const idx = Math.round(slider.scrollLeft / Math.max(1, slider.clientWidth));
      dotsWrap.querySelectorAll(".slider-dot").forEach((d, i) => d.classList.toggle("active", i === idx));
    };

    slider.addEventListener("scroll", () => {
      window.requestAnimationFrame(onScroll);
    });

    // Tap on dots
    dotsWrap.addEventListener("click", (e) => {
      const dot = e.target.closest("[data-dot]");
      if (!dot) return;
      const i = Number(dot.getAttribute("data-dot"));
      slider.scrollTo({ left: i * slider.clientWidth, behavior: "smooth" });
    });
  });
}

window.openCatalog = (sectionId, titleFallback) => {
  const sid = String(sectionId || "");

  const sectionInfo = catalogData.sections.find((s) => String(s.id) === sid);
  const titleEl = $("catTitle");
  if (titleEl) {
    if (sectionInfo?.logo) {
      titleEl.innerHTML = `<img src="${cleanUrl(sectionInfo.logo)}" style="height:80px;width:auto;">`;
    } else {
      titleEl.textContent = titleFallback || "COLECCIÓN";
    }
  }

  const items = catalogData.products.filter((p) => String(p.sectionId) === sid);
  const container = $("catContent");
  if (!container) return;

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
    openModal("modalCatalog");
    return;
  }

  const grid = document.createElement("div");
  grid.className = "catGrid";

  items.forEach((p) => {
    const sizes = p.sizes?.length ? p.sizes : ["Unitalla"];
    if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];

    const sizesHtml = sizes
      .map((sz) => {
        const active = selectedSizeByProduct[p.id] === sz ? "active" : "";
        return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
      })
      .join("");

    const sellPrice = Number(p.baseMXN || 0);
    const fakeOldPrice = Math.round(sellPrice * (PROMO_ACTIVE ? FAKE_MARKUP_FACTOR : 1));
    const priceHtml = PROMO_ACTIVE
      ? `<div class="price-container"><span class="old-price">${money(fakeOldPrice)}</span><span class="new-price">${money(sellPrice)}</span></div>`
      : `<div class="price-container"><span class="new-price">${money(sellPrice)}</span></div>`;

    const images = (p.images && p.images.length ? p.images : [p.img]).filter(Boolean);
    const dotsId = `dots_${String(p.id).replace(/[^a-z0-9_\-]/gi, "_")}`;
    const { sliderHtml, dotsHtml } = renderProductSlider(images, dotsId);

    const el = document.createElement("div");
    el.className = "prodCard";

    el.innerHTML = `
      <div class="metallic-frame">
        ${PROMO_ACTIVE ? '<div class="promo-badge">OFERTA</div>' : ''}
        ${sliderHtml}
        ${dotsHtml}
      </div>
      <div class="prodName">${p.name}</div>
      ${priceHtml}
      <div class="sizeRow">${sizesHtml}</div>
      <button class="btn-add" data-add="${p.id}">AGREGAR</button>
    `;

    grid.appendChild(el);
  });

  container.appendChild(grid);

  // Wire size + add
  container.onclick = (e) => {
    const btnSize = e.target.closest("[data-size]");
    if (btnSize) {
      const pid = btnSize.getAttribute("data-pid");
      const size = btnSize.getAttribute("data-size");
      selectedSizeByProduct[pid] = size;
      btnSize.parentElement.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
      btnSize.classList.add("active");
      return;
    }

    const btnAdd = e.target.closest("[data-add]");
    if (btnAdd) {
      const pid = btnAdd.getAttribute("data-add");
      addToCart(pid, selectedSizeByProduct[pid]);
    }
  };

  // sliders
  wireSliders(container);

  openModal("modalCatalog");
};

function initScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll(".scroll-reveal").forEach((el) => observer.observe(el));
}

function initSplash() {
  const splash = $("splash-screen");
  if (splash) setTimeout(() => splash.classList.add("hidden"), 2000);
  setTimeout(() => {
    if (splash && !splash.classList.contains("hidden")) splash.classList.add("hidden");
  }, 4500);
}

async function loadCatalogLocal() {
  const res = await fetch(`/data/catalog.json?v=${APP_VER}`);
  if (!res.ok) throw new Error("catalog.json no disponible");
  const data = await res.json();
  if (!data?.products?.length) throw new Error("catalog vacío");
  catalogData = data;
}

async function loadCatalogFromDB() {
  if (!supabase) throw new Error("No supabase client");

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (orgErr || !org?.id) throw new Error("org no disponible");

  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, name, price, category, image_url, sku")
    .eq("org_id", org.id)
    .eq("active", true);

  if (pErr || !Array.isArray(products) || !products.length) throw new Error("products no disponible");

  catalogData.products = products.map((p) => ({
    id: p.id,
    sku: p.sku || null,
    name: p.name,
    baseMXN: Number(p.price || 0),
    sectionId: p.category || "BAJA_1000",
    img: p.image_url || "/assets/logo-score.webp",
    images: [p.image_url || "/assets/logo-score.webp"],
    sizes: ["S", "M", "L", "XL", "2XL"],
  }));

  // Sections are static (UI)
  catalogData.sections = [
    { id: "BAJA_1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp" },
    { id: "BAJA_500", title: "BAJA 500", logo: "/assets/logo-baja500.webp" },
    { id: "BAJA_400", title: "BAJA 400", logo: "/assets/logo-baja400.webp" },
    { id: "SF_250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp" },
  ];
}

async function loadSiteConfig() {
  if (!supabase) return;

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (!org?.id) return;

  const { data: config } = await supabase
    .from("site_settings")
    .select("*")
    .eq("org_id", org.id)
    .single();

  if (!config) return;

  const h1 = $("hero-title");
  if (h1 && config.hero_title) h1.textContent = config.hero_title;

  if (config.promo_active) {
    PROMO_ACTIVE = true;
    FAKE_MARKUP_FACTOR = 1.3;
    const bar = $("promo-bar");
    const txt = $("promo-text");
    if (bar) bar.style.display = "flex";
    if (txt) txt.innerHTML = config.promo_text || "🔥 OFERTA ACTIVA 🔥";
  }

  // Optional Pixel injection
  if (config.pixel_id && typeof window.fbq !== "function") {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', config.pixel_id);
    fbq('track', 'PageView');
    /* eslint-enable */
  }
}

function updateCartUI() {
  const countEl = $("cartCount");
  if (countEl) countEl.textContent = String(cartQty());

  const itemsEl = $("cartItems");
  const emptyEl = $("cartEmpty");

  if (emptyEl) emptyEl.style.display = cart.length ? "none" : "block";

  if (itemsEl) {
    itemsEl.innerHTML = cart
      .map((i, idx) => {
        const p = findProduct(i.id);
        if (!p) return "";
        const qty = Number(i.qty) || 1;
        const line = Number(p.baseMXN || 0) * qty;
        const img = cleanUrl(p.img || "/assets/logo-score.webp");

        return `
          <div class="cartItem">
            <img src="${img}" alt="${p.name}" style="width:70px;height:70px;object-fit:contain;background:#fff;border-radius:10px;border:1px solid #eee;padding:6px;" loading="lazy" />
            <div>
              <div style="font-weight:900; color:#111;">${p.name}</div>
              <div style="color:#666; font-size:12px; margin-top:2px;">Talla: <b>${i.size || "—"}</b></div>
              <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
                <button onclick="decQty(${idx})" style="width:28px;height:28px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">−</button>
                <b style="min-width:18px;text-align:center;">${qty}</b>
                <button onclick="incQty(${idx})" style="width:28px;height:28px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">+</button>
                <span style="margin-left:auto; font-weight:900; color:#111;">${money(line)}</span>
              </div>
            </div>
            <button onclick="removeFromCart(${idx})" style="background:none;border:none;color:#E10600;font-size:18px;cursor:pointer;">✕</button>
          </div>
        `;
      })
      .join("");
  }

  const sub = cartSubtotal();
  const ship = Number(shippingState.cost || 0);
  const grand = sub + ship;

  const subEl = $("subTotal");
  const shipEl = $("shipTotal");
  const grandEl = $("grandTotal");

  if (subEl) subEl.textContent = money(sub);
  if (shipEl) shipEl.textContent = shippingState.label || money(ship);
  if (grandEl) grandEl.textContent = money(grand);
}

function handleShipModeChange(mode) {
  shippingState.mode = mode;

  const shipForm = $("shipForm");
  if (shipForm) shipForm.style.display = mode === "pickup" ? "none" : "block";

  if (mode === "pickup") {
    shippingState.cost = 0;
    shippingState.label = "Gratis (Fábrica TJ)";
  } else if (mode === "tj") {
    shippingState.cost = 200;
    shippingState.label = money(200) + " Local Express";
  } else if (mode === "mx") {
    shippingState.cost = 0;
    shippingState.label = "Cotizar (CP)";
  } else if (mode === "us") {
    shippingState.cost = 0;
    shippingState.label = "Cotizar (ZIP)";
  }

  // Re-quote if cp already set
  const cp = $("cp")?.value?.trim();
  if (cp && (mode === "mx" || mode === "us")) {
    quoteShipping(cp, mode === "us" ? "US" : "MX");
  }

  updateCartUI();
}

let quoteTimer = null;
async function quoteShipping(zip, country) {
  if (!zip) return;

  shippingState.label = "Cotizando…";
  updateCartUI();

  const qty = cartQty();
  const itemsPayload = cart.map((i) => ({ id: i.id, qty: i.qty }));

  try {
    const data = await apiJson("quote_shipping", {
      zip,
      country,
      items: itemsPayload,
      items_qty: qty,
    });

    const cost = Number(data.cost ?? data.amount_mxn ?? 0);
    shippingState.cost = cost;
    shippingState.label = data.label || money(cost);
  } catch (e) {
    // Fallback
    const fallback = country === "US" ? 800 : 250;
    shippingState.cost = fallback;
    shippingState.label = money(fallback) + " Estándar";
  }

  updateCartUI();
}

function setupListeners() {
  // Shipping radio
  document.getElementsByName("shipMode").forEach((r) => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });

  // CP / ZIP input
  const cpInput = $("cp");
  if (cpInput) {
    cpInput.addEventListener("input", (e) => {
      const mode = shippingState.mode;
      const raw = String(e.target.value || "");
      const val = raw.replace(/[^0-9-]/g, "").slice(0, 10);
      e.target.value = val;

      if (!(mode === "mx" || mode === "us")) return;

      clearTimeout(quoteTimer);
      quoteTimer = setTimeout(() => {
        if (mode === "mx" && val.length === 5) quoteShipping(val, "MX");
        if (mode === "us" && val.length >= 5) quoteShipping(val, "US");
      }, 350);
    });
  }

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.closeAll();
  });
}

window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (!btn) return;

  if (!cart.length) return toast("Carrito vacío");

  const mode = shippingState.mode;
  const name = $("name")?.value?.trim() || "";
  const addr = $("addr")?.value?.trim() || "";
  const cp = $("cp")?.value?.trim() || "";

  const country = mode === "us" ? "US" : "MX";

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Faltan datos de envío");
  }

  btn.disabled = true;
  btn.textContent = "Procesando…";

  if (typeof fbq === "function") {
    fbq("track", "InitiateCheckout", {
      num_items: cartQty(),
      currency: "MXN",
      value: 0,
    });
  }

  try {
    const payload = {
      items: cart,
      shipping: {
        mode,
        cost: Number(shippingState.cost || 0),
        label: shippingState.label,
        postal_code: cp,
        country,
      },
      customer: {
        name,
        address: addr,
        postal_code: cp,
        country,
      },
      promo: PROMO_ACTIVE,
    };

    const data = await apiJson("create_checkout", payload);

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error(data?.error || "No se recibió URL de pago");
  } catch (err) {
    toast("Error: " + (err?.message || String(err)));
    btn.disabled = false;
    btn.textContent = "PAGAR AHORA";
  }
};

async function init() {
  if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  initSplash();
  loadCart();

  // Load catalog + config
  try {
    await loadCatalogFromDB();
    await loadSiteConfig();
  } catch (e) {
    console.warn("Fallback local catalog", e);
    await loadCatalogLocal();
  }

  setupListeners();
  updateCartUI();
  initScrollReveal();

  // Checkout return
  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago exitoso! Gracias.");
    if (typeof fbq === "function") fbq("track", "Purchase", { currency: "MXN", value: 0 });
    window.emptyCart(true);
    window.history.replaceState({}, document.title, "/");
  }
}

document.addEventListener("DOMContentLoaded", init);