/* =========================================================
SCORE STORE — main.js (PROD FIX)

Catálogo sin “cuadros vacíos”
Carrito premium + swipe-to-close
Cotización envío realtime (debounce)
IA con fallback local (no truena)
Notificaciones de compra + sonidos sutiles
Metatags + Pixel
Powered by Único OS
========================================================= */

/* ---------------------------
0) Helpers base
--------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function moneyMXN(n) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
  } catch {
    return `$${(n || 0).toFixed(2)}`;
  }
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function debounce(fn, wait = 450) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function safeJSONParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/* ---------------------------
1) PUBLIC CONFIG
(Credenciales inyectadas estratégicamente)
--------------------------- */
function metaContent(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el ? (el.getAttribute("content") || "").trim() : "";
} 

const PUBLIC = {
  // Credenciales Públicas (Seguras para frontend)
  SUPABASE_URL: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",
  STRIPE_PK: "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh",
  FB_PIXEL: "4249947775334413",

  BRAND: {
    maker: "Único Uniformes",
    os: "Único OS",
    legalEntity: "BAJATEX, S. de R.L. de C.V.",
    email: "ventas.unicotextil@gmail.com", // Corregido según datos proporcionados
    whatsapp: "+52 664 236 8701", // Mantenido del original, confirmar si cambia
    address: "Palermo 6106 Interior JK, Colonia Anexa Roma, C.P. 22614, Tijuana, Baja California, México."
  }
};

/* ---------------------------
2) Ensure Meta Tags / Theme / OG (fallback)
--------------------------- */
function ensureMeta() {
  const head = document.head;

  const upsert = (selector, createTag) => {
    let el = head.querySelector(selector);
    if (!el) {
      el = createTag();
      head.appendChild(el);
    }
    return el;
  };

  upsert('meta[name="theme-color"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    m.setAttribute("content", "#E10600");
    return m;
  });

  upsert('meta[name="description"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "description");
    m.setAttribute("content", "Mercancía oficial de SCORE International Off-Road Racing. Fabricado y operado por Único Uniformes (BAJATEX).");
    return m;
  });

  upsert('meta[property="og:title"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:title");
    m.setAttribute("content", "SCORE STORE · Tienda Oficial");
    return m;
  });

  upsert('meta[property="og:description"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:description");
    m.setAttribute("content", "Equípate con la mercancía oficial de las carreras off-road más icónicas.");
    return m;
  });

  upsert('meta[property="og:image"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("property", "og:image");
    m.setAttribute("content", `${location.origin}/assets/hero.webp`);
    return m;
  });
  
  // Facebook Domain Verification
  upsert('meta[name="facebook-domain-verification"]', () => {
    const m = document.createElement("meta");
    m.setAttribute("name", "facebook-domain-verification");
    m.setAttribute("content", "wuo7x5sxsjcer1t0epn1id5xgjp8su");
    return m;
  });
}
ensureMeta();

/* ---------------------------
3) Facebook Pixel (fallback)
--------------------------- */
function ensureFBPixel() {
  if (window.fbq) return;
  const pid = PUBLIC.FB_PIXEL;
  if (!pid) return;

  /* Pixel loader oficial-style, pero con guard */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", pid);
  window.fbq("track", "PageView");
}
ensureFBPixel();

/* ---------------------------
4) Audio (WebAudio) — sutil, low volume
--------------------------- */
const AudioFX = (() => {
  let ctx = null;
  let unlocked = false;
  const V = 0.16; // volumen general bajo (<20%)

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }

  async function unlock() {
    if (unlocked) return true;
    init();
    if (!ctx) return false;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      // ping silencioso
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.01);
      unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone({ freq = 440, dur = 0.06, type = "sine", gain = V * 0.25 } = {}) {
    if (!ctx || !unlocked) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;

    o.connect(g).connect(ctx.destination); 
    const t = ctx.currentTime; 
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01); 
    g.gain.exponentialRampToValueAtTime(0.0002, t + dur); 
    o.start(t); 
    o.stop(t + dur + 0.02); 
  }

  function click() { tone({ freq: 520, dur: 0.05, type: "triangle", gain: V * 0.22 }); }
  function whoosh() { tone({ freq: 180, dur: 0.09, type: "sawtooth", gain: V * 0.18 }); }
  function paper() { tone({ freq: 320, dur: 0.07, type: "square", gain: V * 0.12 }); }
  function ok() { tone({ freq: 660, dur: 0.07, type: "sine", gain: V * 0.22 }); }
  function bad() { tone({ freq: 140, dur: 0.08, type: "sine", gain: V * 0.22 }); }

  return { unlock, click, whoosh, paper, ok, bad };
})();

["pointerdown", "touchstart", "mousedown", "keydown"].forEach((evt) => {
  window.addEventListener(evt, () => AudioFX.unlock(), { once: true, passive: true });
});

/* ---------------------------
5) Toast
--------------------------- */
function toast(msg, ms = 2200) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), ms);
}

/* ---------------------------
6) Intro (Tipo A PRO)
--------------------------- */
const Intro = (() => {
  const el = $("#intro");
  const fill = $("#introBarFill");
  const skip = $("#introSkip");

  let done = false;

  function close() {
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    done = true;
    try { localStorage.setItem("score_intro_done", "1"); } catch {}
  }

  function run() {
    if (!el || !fill) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const already = (() => {
      try { return localStorage.getItem("score_intro_done") === "1"; } catch { return false; }
    })();

    if (already || reduced) { close(); return; } 
    el.classList.add("show"); 
    el.setAttribute("aria-hidden", "false"); 
    const total = 1600; 
    const start = performance.now(); 
    const loop = (t) => { 
      if (done) return; 
      const p = clamp((t - start) / total, 0, 1); 
      fill.style.width = `${Math.round(p * 100)}%`; 
      if (p < 1) requestAnimationFrame(loop); 
      else setTimeout(close, 220); 
    }; 
    requestAnimationFrame(loop); 
    if (skip) { skip.addEventListener("click", () => { AudioFX.paper(); close(); }, { once: true }); } 
    // click anywhere to skip (sutil) 
    el.addEventListener("click", (e) => { 
      if (e.target === el || e.target.classList.contains("introBg")) { AudioFX.paper(); close(); } 
    }, { passive: true }); 
  }

  return { run, close };
})();

/* ---------------------------
7) Legal Modal (card única) — dinámico
--------------------------- */
const LEGAL_TEXT = {
  privacy: {
    title: "Aviso de Privacidad",
    html: `
      <p><b>${PUBLIC.BRAND.legalEntity}</b>, con nombre comercial <b>${PUBLIC.BRAND.maker}</b>, es responsable del uso y protección de los datos personales recabados a través de SCORE Store.</p>
      <h3>Finalidades</h3> <ul> <li>Procesar pedidos y pagos.</li> <li>Gestionar envíos y entregas.</li> <li>Emitir facturación electrónica (CFDI).</li> <li>Atención al cliente y seguimiento postventa.</li> <li>Cumplimiento de obligaciones legales y fiscales.</li> </ul> <h3>Derechos ARCO</h3> <p>El titular de los datos puede ejercer sus Derechos ARCO enviando una solicitud al correo:</p> <div class="legalBox"><p>📧 <b>${PUBLIC.BRAND.email}</b></p></div> <p>${PUBLIC.BRAND.legalEntity} se reserva el derecho de modificar el presente aviso para cumplir con actualizaciones legales o mejoras en sus procesos internos.</p> 
    ` 
  },
  terms: {
    title: "Términos y Condiciones",
    html: `
      <p><b>SCORE STORE · TIENDA OFICIAL</b></p>
      <p>Mercancía oficial de SCORE International Off-Road Racing.</p>
      <p>Fabricado, operado y comercializado por <b>${PUBLIC.BRAND.maker}</b>, patrocinador oficial.</p>
      <h3>Pagos y seguridad</h3> <p>Los pagos se procesan a través de <b>Stripe</b>, plataforma internacional con altos estándares de seguridad. SCORE Store no almacena información bancaria sensible; los datos de pago son cifrados y gestionados directamente por Stripe.</p> <h3>Envíos</h3> <p>Realizamos envíos dentro de México y hacia Estados Unidos. Los envíos se gestionan mediante <b>Envia.com</b>, plataforma logística que conecta con múltiples paqueterías nacionales e internacionales. Los tiempos de entrega son estimados y pueden variar según destino y condiciones logísticas.</p> <p>Pickup disponible en Tijuana, previa confirmación.</p> <h3>Cambios y devoluciones</h3> <p>Se aceptan cambios o devoluciones dentro de los 30 días naturales posteriores a la recepción del pedido, siempre que el producto:</p> <ul> <li>No haya sido utilizado ni lavado.</li> <li>Conserve etiquetas y empaques originales.</li> <li>Se encuentre en perfectas condiciones.</li> </ul> <p>No se aceptan cambios ni devoluciones en:</p> <ul> <li>Productos personalizados.</li> <li>Ediciones especiales fabricadas bajo pedido.</li> <li>Productos adquiridos con descuentos finales o en liquidación.</li> </ul> <p>Para iniciar un proceso, comunícate vía correo o WhatsApp.</p> <h3>Facturación (CFDI)</h3> <p>La factura debe solicitarse dentro del mismo mes fiscal de la compra. Enviar Constancia de Situación Fiscal y número de pedido a:</p> <div class="legalBox"><p>📧 <b>${PUBLIC.BRAND.email}</b></p></div> 
    ` 
  },
  legal: {
    title: "Información Legal y Comercial",
    html: `
      <p><b>INFORMACIÓN COMERCIAL</b></p>
      <p>Razón social: ${PUBLIC.BRAND.legalEntity}</p>
      <p>Nombre comercial: ${PUBLIC.BRAND.maker}</p>
      <p>Domicilio comercial: ${PUBLIC.BRAND.address}</p>
      <p>Correo: ${PUBLIC.BRAND.email}</p>
      <p>WhatsApp: ${PUBLIC.BRAND.whatsapp}</p>
      <h3>Sobre SCORE International</h3> <p>SCORE International es la organización líder a nivel mundial en competencias off-road de larga distancia (Baja 1000, Baja 500, Baja 400, San Felipe 250). Marcas, logotipos y nombres de eventos son propiedad de SCORE International, LLC y se usan con autorización para comercializar mercancía oficial.</p> <h3>Propiedad intelectual</h3> <p>Todo el contenido del sitio (textos, imágenes, diseños, logotipos, marcas) está protegido por leyes de propiedad intelectual. Queda prohibida su reproducción o uso sin autorización expresa de BAJATEX o SCORE International, según corresponda.</p> <h3>Uso del sitio</h3> <p>El uso de SCORE Store está limitado a fines lícitos. Queda estrictamente prohibido el uso del sitio para actividades fraudulentas o ilegales.</p> 
    ` 
  },
  contact: {
    title: "Contacto",
    html: `<div class="legalBox"> <p><b>${PUBLIC.BRAND.maker}</b><br> 📍 ${PUBLIC.BRAND.address}</p> </div> <div class="legalBox"> <p>📧 <b>${PUBLIC.BRAND.email}</b><br> 💬 <b>${PUBLIC.BRAND.whatsapp}</b></p> </div> <p>Para facturación: envía tu Constancia de Situación Fiscal + número de pedido dentro del mes fiscal.</p>` 
  }
};

window.openLegal = function openLegal(key) {
  const overlay = $("#legalOverlay");
  const card = $("#legalCard");
  const title = $("#legalTitle");
  const body = $("#legalBody");
  if (!overlay || !card || !title || !body) return;

  const data = LEGAL_TEXT[key] || LEGAL_TEXT.legal;

  AudioFX.paper();

  // animación cambio sección (fade-out/in texto)
  body.style.opacity = "0";
  setTimeout(() => {
    title.textContent = data.title;
    body.innerHTML = data.html;
    body.style.opacity = "1";
  }, 90);

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  card.classList.remove("closing");

  // focus accesible
  setTimeout(() => {
    const btn = $(".legalClose", card);
    btn && btn.focus && btn.focus();
  }, 60);
};

window.closeLegal = function closeLegal() {
  const overlay = $("#legalOverlay");
  const card = $("#legalCard");
  if (!overlay || !card) return;

  AudioFX.paper();
  card.classList.add("closing");
  setTimeout(() => {
    overlay.classList.remove("show");
    overlay.setAttribute("aria-hidden", "true");
    card.classList.remove("closing");
  }, 170);
};

/* ---------------------------
8) Catalog + Filters
--------------------------- */
let CATALOG = null;
let PRODUCTS = [];
let FILTER = "ALL";

const productsGrid = $("#productsGrid");
const catalogEmpty = $("#catalogEmpty");

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/** Verifica si una imagen carga (sin HEAD) */
function imageExists(url, timeoutMs = 2200) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;

    const finish = (ok) => { if (done) return; done = true; img.onload = null; img.onerror = null; resolve(ok); }; 
    const t = setTimeout(() => finish(false), timeoutMs); 
    img.onload = () => { clearTimeout(t); finish(true); }; 
    img.onerror = () => { clearTimeout(t); finish(false); }; 
    // bust cache para detectar 404 rápido en algunos CDNs 
    img.src = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`; 
  });
}

function sectionFromId(id) {
  if (!CATALOG?.sections) return null;
  return CATALOG.sections.find(s => s.id === id) || null;
}

function productCardHTML(p) {
  const sec = sectionFromId(p.sectionId);
  const badge = sec?.badge || "OFICIAL";
  const title = p.name || "Producto";
  const price = moneyMXN(p.baseMXN || 0);

  const sizes = (p.sizes || []).map(sz => `<option value="${sz}">${sz}</option>`).join("");

  return `
    <article class="card" data-id="${p.id}" data-filter="${p.sectionId}"> 
      <div class="cardImg"> <img loading="lazy" decoding="async" src="${p.img}" alt="${title}"> </div> 
      <div class="cardBody"> 
        <div class="cardTitle">${title}</div> 
        <div class="cardMeta"> <span class="badge"><i class="fa-solid fa-tag"></i> ${badge}</span> ${p.subSection ? ` · ${p.subSection}`: ""} </div> 
        <div class="cardPrice">${price}</div> 
        <div class="cardControls"> 
          <select class="sizeSelect" aria-label="Talla"> ${(p.sizes && p.sizes.length) ? sizes : `<option value="Unitalla">Unitalla</option>`} </select> 
          <button class="btn primary addBtn" type="button"><i class="fa-solid fa-plus"></i> Agregar</button> 
        </div> 
      </div> 
    </article>
  `;
}

async function renderCatalog() {
  if (!productsGrid) return;
  productsGrid.innerHTML = "";
  catalogEmpty && (catalogEmpty.hidden = false);

  // filtro
  const list = (FILTER === "ALL")
  ? PRODUCTS
  : PRODUCTS.filter(p => (p.sectionId || "").toUpperCase() === FILTER);

  // SIN cuadros vacíos: render solo los que pasan imagenExists
  const fragments = [];
  for (const p of list) {
    const ok = await imageExists(p.img);
    if (!ok) continue;
    fragments.push(productCardHTML(p));
  }

  productsGrid.innerHTML = fragments.join("");

  catalogEmpty && (catalogEmpty.hidden = true);

  // listeners add-to-cart
  $$(".addBtn", productsGrid).forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".card");
      if (!card) return;
      const id = card.getAttribute("data-id");
      const size = $(".sizeSelect", card)?.value || "Unitalla";
      addToCart(id, size);
      AudioFX.ok();
      toast("Agregado al carrito ✅");
      try { window.fbq && window.fbq("track", "AddToCart"); } catch {}
    });
  });
}

function initFilters() {
  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      FILTER = chip.dataset.filter || "ALL"; 
      AudioFX.click(); 
      await renderCatalog(); 
    }); 
  });
}

/* ---------------------------
9) Cart (localStorage)
--------------------------- */
const CART_KEY = "score_cart_v1";
const cartBtn = $("#cartBtn");
const cartDrawer = $("#cartDrawer");
const backdrop = $("#backdrop");
const cartItems = $("#cartItems");
const cartCount = $("#cartCount");
const cartSubtotal = $("#cartSubtotal");
const cartShipping = $("#cartShipping");
const cartTotal = $("#cartTotal");
const miniZip = $("#miniZip");
const shippingMode = $("#shippingMode");
const miniShipLabel = $("#miniShipLabel");
const promoCode = $("#promoCode");

let CART = [];
let SHIPPING = { mode: "pickup", zip: "", amount: 0, label: "Pickup (Tijuana)" };
let PROMO = { code: "", off: 0 };

function loadCart() {
  const raw = (() => { try { return localStorage.getItem(CART_KEY); } catch { return null; } })();
  const data = raw ? safeJSONParse(raw, null) : null;
  if (data && Array.isArray(data.items)) {
    CART = data.items;
    SHIPPING = data.shipping || SHIPPING;
    PROMO = data.promo || PROMO;
  }
  syncCartUI();
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({ items: CART, shipping: SHIPPING, promo: PROMO }));
  } catch {}
}

function findProduct(id) {
  return PRODUCTS.find(p => p.id === id) || null;
}

function addToCart(id, size) {
  const p = findProduct(id);
  if (!p) return;

  const key = `${id}__${size}`;
  const existing = CART.find(i => i.key === key);
  if (existing) existing.qty += 1;
  else CART.push({ key, id, size, qty: 1 });

  saveCart();
  syncCartUI();
}

function incItem(key) {
  const it = CART.find(i => i.key === key);
  if (!it) return;
  it.qty += 1;
  saveCart();
  syncCartUI();
}
function decItem(key) {
  const it = CART.find(i => i.key === key);
  if (!it) return;
  it.qty -= 1;
  if (it.qty <= 0) CART = CART.filter(i => i.key !== key);
  saveCart();
  syncCartUI();
}
function removeItem(key) {
  CART = CART.filter(i => i.key !== key);
  saveCart();
  syncCartUI();
}

function calcSubtotal() {
  let sum = 0;
  for (const it of CART) {
    const p = findProduct(it.id);
    if (!p) continue;
    sum += (p.baseMXN || 0) * (it.qty || 1);
  }
  return sum;
}

function applyPromoInternal(code) {
  const c = (code || "").trim().toUpperCase();
  // Si tienes /data/promos.json, aquí se puede cargar y validar.
  // Por ahora: ejemplo SCORE25 => 10% (ajústalo a lo real)
  if (!c) { PROMO = { code: "", off: 0 }; return; }

  if (c === "SCORE25") {
    PROMO = { code: c, off: 0.10 };
  } else {
    PROMO = { code: c, off: 0 };
  }
}

function calcDiscount(subtotal) {
  if (!PROMO?.off) return 0;
  return Math.round(subtotal * PROMO.off);
}

function syncCartUI() {
  if (cartCount) cartCount.textContent = String(CART.reduce((a, b) => a + (b.qty || 0), 0));

  if (!cartItems) return;

  if (!CART.length) {
    cartItems.innerHTML = `<div style="opacity:.92;font-weight:900;line-height:1.35"> Tu carrito está vacío.<br> <span style="opacity:.78;font-weight:800">Agrega tu merch oficial y armamos tu envío al instante.</span> </div>`;
  } else {
    cartItems.innerHTML = CART.map((it) => {
      const p = findProduct(it.id);
      if (!p) return "";
      const price = moneyMXN((p.baseMXN || 0) * (it.qty || 1));
      const meta = `Talla: ${it.size} · ${moneyMXN(p.baseMXN || 0)}`;
      const img = p.img || "/assets/hero.webp";
      return `<div class="cartRow" data-key="${it.key}"> <div class="cartLeft"> <div class="cartThumb"><img src="${img}" alt=""></div> <div class="cartInfo"> <div class="name">${p.name || "Producto"}</div> <div class="meta">${meta}</div> </div> </div> <div class="cartRight"> <button class="qtyBtn" data-act="dec" aria-label="menos">−</button> <div class="qtyVal">${it.qty}</div> <button class="qtyBtn" data-act="inc" aria-label="más">+</button> <button class="removeBtn" data-act="rm" aria-label="eliminar">✕</button> </div> </div>`;
    }).join("");

    $$(".cartRow", cartItems).forEach(row => { 
      const key = row.getAttribute("data-key"); 
      $$(".qtyBtn,.removeBtn", row).forEach(btn => { 
        btn.addEventListener("click", () => { 
          const act = btn.getAttribute("data-act"); 
          AudioFX.click(); 
          if (act === "inc") incItem(key); 
          if (act === "dec") decItem(key); 
          if (act === "rm") removeItem(key); 
        }); 
      }); 
    }); 
  }

  // Totales
  const sub = calcSubtotal();
  const disc = calcDiscount(sub);
  const ship = SHIPPING?.amount || 0;
  const total = Math.max(0, sub - disc + ship);

  cartSubtotal && (cartSubtotal.textContent = moneyMXN(sub - disc));
  cartShipping && (cartShipping.textContent = moneyMXN(ship));
  cartTotal && (cartTotal.textContent = moneyMXN(total));

  // Persist UI fields
  if (shippingMode) shippingMode.value = SHIPPING.mode || "pickup";
  if (miniZip) miniZip.value = SHIPPING.zip || "";
  if (miniShipLabel) miniShipLabel.textContent = SHIPPING.label || "";
  if (promoCode) promoCode.value = PROMO.code || "";
}

/* Drawer open/close */
window.openCart = function openCart() {
  if (!cartDrawer || !backdrop) return;
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  backdrop.classList.add("show");
  AudioFX.whoosh();
  try { window.fbq && window.fbq("track", "ViewContent"); } catch {}
};
window.closeCart = function closeCart() {
  if (!cartDrawer || !backdrop) return;
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  backdrop.classList.remove("show");
  AudioFX.click();
};

if (cartBtn) cartBtn.addEventListener("click", () => window.openCart());
if (backdrop) backdrop.addEventListener("click", () => window.closeCart());

/* Swipe to close (mobile) */
(function enableSwipeClose() {
  if (!cartDrawer) return;
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  cartDrawer.addEventListener("touchstart", (e) => {
    if (!cartDrawer.classList.contains("open")) return;
    const t = e.touches[0];
    startX = t.clientX;
    currentX = startX;
    dragging = true;
  }, { passive: true });

  cartDrawer.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    currentX = t.clientX;
  }, { passive: true });

  cartDrawer.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    const dx = currentX - startX;
    if (dx > 80) window.closeCart();
  }, { passive: true });
})();

/* Promo */
window.applyPromo = function applyPromo() {
  const code = promoCode ? promoCode.value : "";
  applyPromoInternal(code);
  saveCart();
  syncCartUI();
  AudioFX.ok();
  toast(PROMO.off ? "Cupón aplicado ✅" : "Cupón no válido");
};

/* ---------------------------
10) Shipping Quote (Real-time)
--------------------------- */
async function quoteShipping({ mode, zip, country }) {
  // Pickup: no cotiza
  if (mode === "pickup") {
    return { ok: true, amount: 0, label: "Pickup (Tijuana)" };
  }

  // si no hay zip: no cotiza
  const z = (zip || "").trim();
  if (!z || z.length < 4) {
    return { ok: false, error: "Ingresa un código postal válido." };
  }

  const payload = {
    country: country || (mode === "us" ? "US" : "MX"),
    zip: z,
    items: CART.map(it => {
      const p = findProduct(it.id);
      return {
        id: it.id,
        sku: p?.sku || it.id,
        qty: it.qty || 1
      };
    })
  };

  try {
    const res = await fetch("/.netlify/functions/quote_shipping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({})); 
    if (!res.ok || !data?.ok) { 
      return { ok: false, error: data?.error || `No se pudo cotizar (HTTP ${res.status})`, detail: data?.detail }; 
    } 
    return { ok: true, amount: Number(data.amount || 0), label: data.label || "Envío estimado" }; 

  } catch (e) {
    return { ok: false, error: "Error de conexión cotizando envío.", detail: String(e?.message || e) };
  }
}

function setShippingState(next) {
  SHIPPING = { ...SHIPPING, ...next };
  saveCart();
  syncCartUI();
}

/* UI section quote */
window.quoteShippingUI = async function quoteShippingUI() {
  const country = ($("#shipCountry")?.value || "MX").toUpperCase();
  const zip = ($("#shipZip")?.value || "").trim();
  const out = $("#shipQuote");

  AudioFX.click();
  if (out) out.textContent = "Cotizando…";

  const mode = country === "US" ? "us" : "mx";
  const r = await quoteShipping({ mode, zip, country });

  if (!r.ok) {
    AudioFX.bad();
    if (out) out.textContent = r.detail ? `${r.error} (${r.detail})` : r.error;
    return;
  }

  AudioFX.ok();
  if (out) out.textContent = `${r.label}: ${moneyMXN(r.amount)}`;
  toast("Envío calculado ✅");

  // Solo lo aplicamos al carrito si hay items (para evitar confusión)
  if (CART.length) {
    setShippingState({ mode, zip, amount: r.amount, label: `${r.label} · ${moneyMXN(r.amount)}` });
  }
};

/* Mini quote in cart (realtime) */
window.quoteShippingMini = async function quoteShippingMini() {
  const mode = (shippingMode?.value || "pickup");
  const zip = (miniZip?.value || "").trim();
  AudioFX.click();

  if (miniShipLabel) miniShipLabel.textContent = "Cotizando…";

  const r = await quoteShipping({ mode, zip, country: mode === "us" ? "US" : "MX" });

  if (!r.ok) {
    AudioFX.bad();
    if (miniShipLabel) miniShipLabel.textContent = r.detail ? `${r.error} (${r.detail})` : r.error;
    setShippingState({ mode, zip, amount: 0, label: "Envío pendiente" });
    return;
  }

  AudioFX.ok();
  setShippingState({ mode, zip, amount: r.amount, label: `${r.label} · ${moneyMXN(r.amount)}` });
  if (miniShipLabel) miniShipLabel.textContent = SHIPPING.label;
};

const quoteMiniDebounced = debounce(() => {
  const mode = (shippingMode?.value || "pickup");
  const zip = (miniZip?.value || "").trim();
  if (mode === "pickup") {
    setShippingState({ mode, zip: "", amount: 0, label: "Pickup (Tijuana)" });
    if (miniShipLabel) miniShipLabel.textContent = "Pickup (Tijuana)";
    return;
  }
  if (zip.length >= 4) window.quoteShippingMini();
}, 520);

if (shippingMode) shippingMode.addEventListener("change", () => {
  AudioFX.click();
  quoteMiniDebounced();
});
if (miniZip) miniZip.addEventListener("input", quoteMiniDebounced);

/* ---------------------------
11) Checkout (server-side)
--------------------------- */
window.checkout = async function checkout() {
  if (!CART.length) {
    AudioFX.bad();
    toast("Tu carrito está vacío.");
    return;
  }

  AudioFX.click();
  toast("Preparando pago…");

  const subtotal = calcSubtotal();
  const discount = calcDiscount(subtotal);

  const payload = {
    currency: "MXN",
    items: CART.map(it => {
      const p = findProduct(it.id);
      return {
        id: it.id,
        sku: p?.sku || it.id,
        name: p?.name || "Producto",
        qty: it.qty || 1,
        unitAmount: Number(p?.baseMXN || 0),
        size: it.size || "Unitalla",
        img: p?.img || ""
      };
    }),
    shipping: SHIPPING,
    promo: PROMO,
    totals: {
      subtotal,
      discount,
      shipping: SHIPPING.amount || 0
    },
    // datos comerciales (Único OS)
    merchant: {
      maker: PUBLIC.BRAND.maker,
      legalEntity: PUBLIC.BRAND.legalEntity,
      email: PUBLIC.BRAND.email
    }
  };

  try {
    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.ok) {
      AudioFX.bad();
      toast(data?.error || `No se pudo iniciar checkout (HTTP ${res.status})`);
      return;
    }

    // Redirige a Stripe Checkout (URL creada server-side)
    if (data?.url) {
      try { window.fbq && window.fbq("track", "InitiateCheckout"); } catch {}
      location.href = data.url;
      return;
    }

    AudioFX.bad();
    toast("Checkout sin URL. Revisa create_checkout.");
  } catch (e) {
    AudioFX.bad();
    toast("Error de conexión preparando el pago.");
  }
};

/* ---------------------------
   12) AI Assistant (SCORE AI) — robusto con fallback local
--------------------------- */
const AI = (() => {
  const modal = $("#aiChatModal");
  const body = $("#aiMessages");
  const input = $("#aiInput");

  function addMsg(who, text) {
    if (!body) return;
    const div = document.createElement("div");
    div.className = "ai-msg";
    div.innerHTML = `<div class="who">${who}:</div><div class="text">${text}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function normalize(s) {
    return (s || "").toLowerCase().trim();
  }

  function fallbackAnswer(q) {
    const t = normalize(q);

    // reglas rápidas
    if (t.includes("talla") || t.includes("tallas")) {
      return `Manejamos tallas: S, M, L, XL, 2XL (según producto). En cada card eliges tu talla y lo agregas al carrito. Si me dices el producto + tu altura/peso te recomiendo talla.`;
    }
    if (t.includes("envío") || t.includes("envio") || t.includes("enviar") || t.includes("shipping")) {
      return `Envíos a México y USA por Envia.com. En el carrito puedes cotizar con tu CP en tiempo real. También hay Pickup en Tijuana (previa confirmación).`;
    }
    if (t.includes("pago") || t.includes("oxxo") || t.includes("tarjeta")) {
      return `Pagos seguros por Stripe: tarjeta y OXXO. SCORE Store no guarda datos bancarios.`;
    }
    if (t.includes("factura") || t.includes("cfdi")) {
      return `Facturación (CFDI): envía Constancia de Situación Fiscal + número de pedido dentro del mismo mes fiscal a ${PUBLIC.BRAND.email}.`;
    }
    if (t.includes("cambio") || t.includes("devol") || t.includes("reembolso")) {
      return `Cambios/devoluciones: hasta 30 días naturales. Sin uso/lavado, con etiquetas/empaque. No aplica a personalizados, bajo pedido o liquidación. Escríbenos a ${PUBLIC.BRAND.whatsapp}.`;
    }
    if (t.includes("contacto") || t.includes("whats") || t.includes("correo") || t.includes("dirección") || t.includes("direccion")) {
      return `Contacto: ${PUBLIC.BRAND.email} · WhatsApp: ${PUBLIC.BRAND.whatsapp} · ${PUBLIC.BRAND.address}`;
    }

    // genérico pro
    return `Dime 3 datos y te lo resuelvo rápido: producto + talla + CP (si es envío). 🏁`;
  }

  async function callRemote(q) {
    // endpoint opcional. Si no existe o falla, fallbackAnswer
    try {
      const res = await fetch("/.netlify/functions/ai_assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q,
          cart: CART,
          shipping: SHIPPING,
          promo: PROMO
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.answer) return null;
      return String(data.answer);
    } catch {
      return null;
    }
  }

  async function send() {
    const q = (input?.value || "").trim();
    if (!q) return;

    AudioFX.click();
    input.value = "";
    addMsg("Tú", q);

    // intenta remoto
    let ans = await callRemote(q);
    if (!ans) ans = fallbackAnswer(q);

    addMsg("SCORE AI", ans);
  }

  function toggle() {
    if (!modal) return;
    const show = !modal.classList.contains("show");
    modal.classList.toggle("show", show);
    modal.setAttribute("aria-hidden", show ? "false" : "true");
    show ? AudioFX.whoosh() : AudioFX.click();

    if (show && body && !body.children.length) {
      addMsg("SCORE AI", "Estoy listo. Dime producto + talla + CP y lo hacemos fácil. 🏁");
    }
    if (show) setTimeout(() => input?.focus && input.focus(), 80);
  }

  return { toggle, send };
})();

window.toggleAiAssistant = () => AI.toggle();
window.sendAiMessage = () => AI.send();

/* ---------------------------
   13) Live Purchase Pops (notificaciones sutiles)
--------------------------- */
const LivePops = (() => {
  const el = $("#popBuy");
  if (!el) return { start() {}, stop() {} };

  let timer = null;

  const names = [
    "Carlos", "Andrea", "Luis", "Sofía", "Miguel", "Valeria", "Jorge", "Fernanda",
    "Diego", "Mariana", "Roberto", "Ana", "Héctor", "Paola", "Iván", "Lucía"
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickProductName() {
    // usa catálogo real si está cargado
    if (PRODUCTS?.length) return pick(PRODUCTS).name || "Merch oficial";
    return pick([
      "Camiseta Oficial", "Hoodie Oficial", "Chamarra Oficial", "Gorra Oficial",
      "Camisa Pits", "Tank Top"
    ]);
  }

  function formatAgo() {
    const mins = [1, 2, 3, 4, 6, 8, 10, 12, 15];
    const m = pick(mins);
    return `hace ${m} min`;
  }

  function showOnce() {
    const who = pick(names);
    const what = pickProductName();
    const when = formatAgo();

    el.innerHTML = `
      <div class="pbIcon"><i class="fa-solid fa-bolt"></i></div>
      <div class="pbTxt">
        <div class="pbTop"><b>${who}</b> compró <b>${what}</b></div>
        <div class="pbSub">${when} · SCORE STORE</div>
      </div>
    `;

    el.classList.add("show");
    AudioFX.ok();

    // auto-hide
    setTimeout(() => el.classList.remove("show"), 5200);

    // next schedule (no saturar)
    const next = Math.floor(18000 + Math.random() * 16000); // 18–34s
    timer = setTimeout(showOnce, next);
  }

  function start() {
    if (timer) return;
    // primer pop: 10–16s después de cargar
    timer = setTimeout(showOnce, Math.floor(10000 + Math.random() * 6000));
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { start, stop };
})();

/* ---------------------------
   14) Inject CSS for popBuy
--------------------------- */
(function ensurePopBuyStyles() {
  if (!$("#popBuy")) return;
  // si ya tienes reglas, no duplicamos
  if (document.getElementById("popbuy-style")) return;

  const style = document.createElement("style");
  style.id = "popbuy-style";
  style.textContent = `
    .popBuy{
      position: fixed;
      left: 14px;
      bottom: 18px;
      z-index: 140;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 12px;
      border-radius: 18px;
      color: #fff;
      background: rgba(10,10,10,.55);
      border: 1px solid rgba(255,255,255,.14);
      backdrop-filter: blur(14px);
      box-shadow: 0 30px 90px rgba(0,0,0,.28);
      transform: translateY(16px);
      opacity: 0;
      pointer-events: none;
      transition: transform .22s ease, opacity .22s ease;
      max-width: min(360px, 92vw);
    }
    .popBuy.show{
      transform: translateY(0);
      opacity: 1;
    }
    .popBuy .pbIcon{
      width: 42px; height: 42px;
      border-radius: 16px;
      display: grid;
      place-items: center;
      background: rgba(225,6,0,.22);
      border: 1px solid rgba(225,6,0,.32);
      box-shadow: 0 18px 40px rgba(225,6,0,.18);
      flex: 0 0 auto;
    }
    .popBuy .pbTop{ font-weight: 950; font-size: 12.5px; line-height: 1.2; }
    .popBuy .pbSub{ margin-top: 4px; font-weight: 800; font-size: 11px; opacity: .82; }
    @media (max-width: 420px){
      .popBuy{ left: 10px; right: 10px; max-width: unset; }
    }
  `;
  document.head.appendChild(style);
})();

/* ---------------------------
   15) Boot
--------------------------- */
async function boot() {
  // Intro
  Intro.run();

  // Filtros
  initFilters();

  // Cart load
  loadCart();

  // Si el URL trae openCart=1
  try {
    const u = new URL(location.href);
    if (u.searchParams.get("openCart") === "1") window.openCart();
  } catch {}

  // Carga catálogo real
  try {
    CATALOG = await fetchJSON("/data/catalog.json");
    PRODUCTS = Array.isArray(CATALOG?.products) ? CATALOG.products : [];
  } catch (e) {
    PRODUCTS = [];
    console.warn("No se pudo cargar catalog.json", e);
  }

  // Render catálogo
  if (!PRODUCTS.length) {
    catalogEmpty && (catalogEmpty.hidden = false);
    productsGrid && (productsGrid.innerHTML = "");
    toast("Catálogo no disponible. Revisa /data/catalog.json");
  } else {
    await renderCatalog();
  }

  // Notificaciones de compra (sutil)
  LivePops.start();

  // Autocotizar si ya hay modo/zip guardados
  if (CART.length && SHIPPING?.mode && SHIPPING.mode !== "pickup" && (SHIPPING.zip || "").length >= 4) {
    // actualiza label a "Cotizando…" y recalcula
    if (miniShipLabel) miniShipLabel.textContent = "Cotizando…";
    const r = await quoteShipping({ mode: SHIPPING.mode, zip: SHIPPING.zip, country: SHIPPING.mode === "us" ? "US" : "MX" });
    if (r.ok) setShippingState({ amount: r.amount, label: `${r.label} · ${moneyMXN(r.amount)}` });
    else setShippingState({ amount: 0, label: "Envío pendiente" });
  }
}

document.addEventListener("DOMContentLoaded", boot);
