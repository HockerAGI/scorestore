/* =========================================================
   SCORE STORE — main.js (2026_PROD)
   - Catálogo + filtros + validación de imagen (no cards vacías)
   - Carrito premium + swipe cerrar + micro-interacciones
   - Cotización envío (tiempo real) via Netlify Function /api/quote
   - Checkout via Netlify Function /api/checkout
   - Legal modal única (dinámica) + sonido sutil
   - IA (Gemini) via /api/chat + fallback si no hay API KEY
   - Notificaciones de compra (sutiles) + sonidos
========================================================= */

const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];

const state = {
  catalog: null,
  promos: null,
  filter: "ALL",
  cart: [],
  promoApplied: null,
  shipping: { mode: "pickup", zip: "", quote: 0, label: "" },
  sounds: {
    enabled: true,
    volume: 0.16, // <= 20%
  }
};

const STORAGE_CART = "score_cart_v3";
const STORAGE_INTRO = "score_intro_seen_v1";
const STORAGE_SOUND = "score_sounds_enabled_v1";

const fmtMXN = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function toast(msg, type="info"){
  const t = $("#toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._to);
  toast._to = setTimeout(() => t.classList.remove("show"), 2400);
  if(type === "ok") sfx("ok");
  if(type === "warn") sfx("tap");
  if(type === "err") sfx("err");
}

function loadCart(){
  try{
    const raw = localStorage.getItem(STORAGE_CART);
    state.cart = raw ? JSON.parse(raw) : [];
  } catch(e){
    state.cart = [];
  }
}

function saveCart(){
  try{ localStorage.setItem(STORAGE_CART, JSON.stringify(state.cart)); } catch(e){}
}

function setSoundsEnabled(on){
  state.sounds.enabled = !!on;
  try{ localStorage.setItem(STORAGE_SOUND, on ? "1" : "0"); } catch(e){}
}

function loadSoundsEnabled(){
  try{
    const v = localStorage.getItem(STORAGE_SOUND);
    if(v === null) return; // default true
    state.sounds.enabled = v === "1";
  } catch(e){}
}

/* =========================
   SFX — WebAudio (no assets)
========================= */
let _audioCtx = null;

function audioCtx(){
  if(_audioCtx) return _audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  _audioCtx = new AC();
  return _audioCtx;
}

function sfx(name){
  if(!state.sounds.enabled) return;
  const ctx = audioCtx();
  if(!ctx) return;

  // iOS/Android autoplay policy: resume on first gesture
  if(ctx.state === "suspended"){ ctx.resume().catch(()=>{}); }

  const now = ctx.currentTime;
  const vol = state.sounds.volume;

  // helpers
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(ctx.destination);

  function env(a=0.005, d=0.08, peak=vol){
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + a + d);
  }

  // noise
  function noiseBurst(duration=0.08, hp=1400){
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    src.connect(filter);
    filter.connect(gain);
    src.start(now);
    src.stop(now + duration);
  }

  if(name === "whoosh"){
    // soft whoosh: filtered noise + short envelope
    env(0.01, 0.14, vol * 0.14);
    noiseBurst(0.14, 800);
    return;
  }

  if(name === "tap"){
    // soft click: short sine
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(520, now);
    o.frequency.exponentialRampToValueAtTime(260, now + 0.06);
    o.connect(gain);
    env(0.004, 0.06, vol * 0.18);
    o.start(now);
    o.stop(now + 0.07);
    return;
  }

  if(name === "paper"){
    // paper/slide: tiny noise burst
    env(0.01, 0.10, vol * 0.12);
    noiseBurst(0.10, 1200);
    return;
  }

  if(name === "ok"){
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(660, now);
    o.frequency.setValueAtTime(880, now + 0.06);
    o.connect(gain);
    env(0.004, 0.10, vol * 0.20);
    o.start(now);
    o.stop(now + 0.12);
    return;
  }

  if(name === "err"){
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(240, now);
    o.frequency.exponentialRampToValueAtTime(120, now + 0.16);
    o.connect(gain);
    env(0.004, 0.18, vol * 0.18);
    o.start(now);
    o.stop(now + 0.18);
    return;
  }

  // default
  env(0.005, 0.08, vol * 0.12);
  noiseBurst(0.08, 1000);
}

/* =========================
   INTRO
========================= */
async function runIntro(){
  const intro = $("#intro");
  if(!intro) return;

  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = localStorage.getItem(STORAGE_INTRO) === "1";

  // show once per device (unless user clears storage)
  if(seen || prefersReduced){
    intro.classList.remove("show");
    return;
  }

  intro.classList.add("show");
  intro.setAttribute("aria-hidden","false");

  const bar = $("#introBarFill");
  const skip = $("#introSkip");

  let done = false;

  function closeIntro(){
    if(done) return;
    done = true;
    localStorage.setItem(STORAGE_INTRO,"1");
    intro.classList.remove("show");
    intro.setAttribute("aria-hidden","true");
    sfx("paper");
  }

  if(skip){
    skip.addEventListener("click", () => closeIntro(), { once:true });
  }

  // animate progress
  const total = 1700;
  const start = performance.now();
  (function tick(t){
    if(done) return;
    const p = Math.min(1, (t - start) / total);
    if(bar) bar.style.width = `${Math.round(p*100)}%`;
    if(p >= 1){
      closeIntro();
      return;
    }
    requestAnimationFrame(tick);
  })(start);

  // allow click background to skip
  intro.addEventListener("click", (e) => {
    // don't close if click on button
    if(e.target && (e.target.closest && e.target.closest("#introSkip"))) return;
    closeIntro();
  });
}

/* =========================
   CATALOG LOAD + RENDER
========================= */
async function fetchJSON(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function normalizeSectionId(id){
  return String(id || "").trim();
}

function productMatchesFilter(p){
  if(state.filter === "ALL") return true;
  return normalizeSectionId(p.sectionId) === normalizeSectionId(state.filter);
}

function createEl(tag, cls){
  const el = document.createElement(tag);
  if(cls) el.className = cls;
  return el;
}

function safeText(s){ return String(s ?? ""); }

function validateImage(url){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now(); // bypass stale
  });
}

async function renderCatalog(){
  const grid = $("#productsGrid");
  if(!grid || !state.catalog) return;

  grid.innerHTML = "";

  // filter products
  const products = (state.catalog.products || []).filter(productMatchesFilter);

  // render with image validation; skip if missing
  const tasks = products.map(async (p) => {
    const imgOk = p.img ? await validateImage(p.img) : false;
    if(!imgOk) return null;

    const card = createEl("article","card");

    const imgWrap = createEl("div","cardImg");
    const img = createEl("img");
    img.alt = safeText(p.name);
    img.loading = "lazy";
    img.decoding = "async";
    img.src = p.img;
    imgWrap.appendChild(img);

    const body = createEl("div","cardBody");

    const title = createEl("div","cardTitle");
    title.textContent = safeText(p.name);

    const meta = createEl("div","cardMeta");
    meta.textContent = safeText(p.subSection || "");

    const price = createEl("div","cardPrice");
    price.textContent = fmtMXN(p.baseMXN);

    const controls = createEl("div","cardControls");

    const sel = createEl("select");
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];
    sizes.forEach(s => {
      const opt = createEl("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });

    const btn = createEl("button","btn primary");
    btn.type = "button";
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> Agregar`;
    btn.addEventListener("click", () => {
      addToCart(p, sel.value);
      sfx("tap");
      toast("Agregado a tu pedido", "ok");
      // soft bounce cart icon
      const cartBtn = $("#cartBtn");
      if(cartBtn){
        cartBtn.animate(
          [{ transform:"scale(1)" }, { transform:"scale(1.08)" }, { transform:"scale(1)" }],
          { duration: 260, easing: "ease-out" }
        );
      }
    });

    controls.appendChild(sel);
    controls.appendChild(btn);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(price);
    body.appendChild(controls);

    card.appendChild(imgWrap);
    card.appendChild(body);

    return card;
  });

  const cards = (await Promise.all(tasks)).filter(Boolean);
  if(!cards.length){
    const empty = createEl("div");
    empty.style.padding = "14px 0";
    empty.style.fontWeight = "900";
    empty.style.color = "rgba(15,15,16,.65)";
    empty.textContent = "No hay productos disponibles en esta sección.";
    grid.appendChild(empty);
    return;
  }

  cards.forEach(c => grid.appendChild(c));
}

/* =========================
   FILTERS
========================= */
function bindFilters(){
  $$(".chip").forEach(btn => {
    btn.addEventListener("click", async () => {
      $$(".chip").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.getAttribute("data-filter") || "ALL";
      sfx("tap");
      await renderCatalog();
    });
  });
}

/* =========================
   CART
========================= */
function cartKey(p, size){
  return `${p.id}__${size}`;
}

function addToCart(p, size){
  const key = cartKey(p, size);
  const idx = state.cart.findIndex(i => i.key === key);
  if(idx >= 0){
    state.cart[idx].qty += 1;
  } else {
    state.cart.push({
      key,
      id: p.id,
      sku: p.sku,
      name: p.name,
      sectionId: p.sectionId,
      size,
      price: Number(p.baseMXN || 0),
      img: p.img || "",
      qty: 1
    });
  }
  saveCart();
  updateCartUI();
}

function removeItem(key){
  state.cart = state.cart.filter(i => i.key !== key);
  saveCart();
  updateCartUI();
}

function changeQty(key, delta){
  const it = state.cart.find(i => i.key === key);
  if(!it) return;
  it.qty += delta;
  if(it.qty <= 0){
    removeItem(key);
    return;
  }
  saveCart();
  updateCartUI();
}

function cartSubtotal(){
  return state.cart.reduce((s, i) => s + (i.price * i.qty), 0);
}

function promoDiscount(subtotal){
  if(!state.promoApplied) return 0;
  const p = state.promoApplied;
  if(p.type === "percent"){
    return Math.round(subtotal * (p.value/100));
  }
  if(p.type === "fixed"){
    return Math.min(subtotal, Number(p.value || 0));
  }
  return 0;
}

function cartTotal(){
  const sub = cartSubtotal();
  const disc = promoDiscount(sub);
  const ship = Number(state.shipping.quote || 0);
  return Math.max(0, sub - disc) + ship;
}

function updateCartCount(){
  const count = state.cart.reduce((s,i)=> s + i.qty, 0);
  const el = $("#cartCount");
  if(el) el.textContent = String(count);
}

function updateCartUI(){
  updateCartCount();

  const items = $("#cartItems");
  if(items){
    items.innerHTML = "";
    if(!state.cart.length){
      const empty = createEl("div");
      empty.style.padding = "14px 6px";
      empty.style.fontWeight = "950";
      empty.style.color = "rgba(255,255,255,.82)";
      empty.textContent = "Tu pedido está vacío. Elige tu merch y vuelve aquí.";
      items.appendChild(empty);
    } else {
      state.cart.forEach(it => {
        const row = createEl("div","cartRow");

        const thumb = createEl("div","cartThumb");
        const img = createEl("img");
        img.alt = safeText(it.name);
        img.loading = "lazy";
        img.src = it.img || "/assets/hero.webp";
        thumb.appendChild(img);

        const info = createEl("div","cartInfo");
        const nm = createEl("div","name"); nm.textContent = safeText(it.name);
        const meta = createEl("div","meta"); meta.textContent = `Talla: ${it.size}`;
        const pr = createEl("div","price"); pr.textContent = fmtMXN(it.price);
        info.appendChild(nm);
        info.appendChild(meta);
        info.appendChild(pr);

        const qty = createEl("div","qty");
        const minus = createEl("button","qtyBtn");
        minus.type = "button";
        minus.textContent = "−";
        minus.addEventListener("click", () => { changeQty(it.key, -1); sfx("tap"); });

        const num = createEl("div","qtyNum");
        num.textContent = String(it.qty);

        const plus = createEl("button","qtyBtn");
        plus.type = "button";
        plus.textContent = "+";
        plus.addEventListener("click", () => { changeQty(it.key, +1); sfx("tap"); });

        const rm = createEl("button","removeBtn");
        rm.type = "button";
        rm.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
        rm.addEventListener("click", () => { removeItem(it.key); sfx("err"); toast("Eliminado", "warn"); });

        qty.appendChild(minus);
        qty.appendChild(num);
        qty.appendChild(plus);

        row.appendChild(thumb);
        row.appendChild(info);
        row.appendChild(qty);
        row.appendChild(rm);

        items.appendChild(row);
      });
    }
  }

  const subEl = $("#cartSubtotal");
  const shipEl = $("#cartShipping");
  const totalEl = $("#cartTotal");
  if(subEl) subEl.textContent = fmtMXN(cartSubtotal() - promoDiscount(cartSubtotal()));
  if(shipEl) shipEl.textContent = fmtMXN(state.shipping.quote || 0);
  if(totalEl) totalEl.textContent = fmtMXN(cartTotal());

  // Update mini label
  const mini = $("#miniShipLabel");
  if(mini) mini.textContent = state.shipping.label || "";
}

function openCart(){
  const d = $("#cartDrawer");
  const b = $("#backdrop");
  if(!d || !b) return;

  d.classList.add("open");
  d.setAttribute("aria-hidden","false");
  b.classList.add("show");

  sfx("whoosh");

  // lock body scroll
  document.body.style.overflow = "hidden";
}

function closeCart(){
  const d = $("#cartDrawer");
  const b = $("#backdrop");
  if(!d || !b) return;

  d.classList.remove("open");
  d.setAttribute("aria-hidden","true");
  b.classList.remove("show");

  sfx("tap");

  // unlock scroll
  document.body.style.overflow = "";
}

function bindCart(){
  const btn = $("#cartBtn");
  if(btn) btn.addEventListener("click", () => openCart());

  // close with Esc
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      if($("#legalModal")?.classList.contains("show")) closeLegal();
      else if($("#aiChatModal")?.classList.contains("show")) toggleAiAssistant(false);
      else closeCart();
    }
  });

  // swipe right to close
  const drawer = $("#cartDrawer");
  if(drawer){
    let x0 = null;
    drawer.addEventListener("touchstart", (e) => {
      if(!drawer.classList.contains("open")) return;
      x0 = e.touches[0].clientX;
    }, { passive:true });

    drawer.addEventListener("touchmove", (e) => {
      if(x0 === null) return;
      const x = e.touches[0].clientX;
      const dx = x - x0;
      if(dx > 40){
        closeCart();
        x0 = null;
      }
    }, { passive:true });

    drawer.addEventListener("touchend", () => { x0 = null; }, { passive:true });
  }
}

/* =========================
   PROMOS
========================= */
function findPromo(code){
  if(!state.promos?.promos) return null;
  const c = String(code || "").trim().toUpperCase();
  return state.promos.promos.find(p => String(p.code).toUpperCase() === c) || null;
}

window.applyPromo = function applyPromo(){
  const inp = $("#promoCode");
  const code = String(inp?.value || "").trim();
  if(!code){
    state.promoApplied = null;
    toast("Cupón vacío", "warn");
    return;
  }
  const p = findPromo(code);
  if(!p){
    state.promoApplied = null;
    toast("Cupón no válido", "err");
    return;
  }
  state.promoApplied = p;
  toast("Cupón aplicado", "ok");
  sfx("ok");
  updateCartUI();
};

/* =========================
   SHIPPING — realtime quote
   Fix crítico: no depende de SUPABASE_URL
========================= */
function shippingModeToCountry(mode){
  if(mode === "us") return "US";
  return "MX";
}

function getMiniZip(){
  const z = $("#miniZip");
  return String(z?.value || "").trim();
}

async function quoteShipping(country, zip){
  if(!zip || zip.length < 4) throw new Error("Código postal inválido");

  // build items
  const items = state.cart.map(i => ({
    id: i.id,
    qty: i.qty,
    price_mxn: i.price
  }));

  if(!items.length) throw new Error("Agrega productos para cotizar");

  const body = {
    country,
    zip,
    items
  };

  const r = await fetch("/api/quote", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });

  const data = await r.json().catch(()=> ({}));
  if(!r.ok || data.ok === false){
    const msg = data?.detail || data?.error || `Error cotizando`;
    throw new Error(msg);
  }
  return data;
}

window.quoteShippingUI = async function quoteShippingUI(){
  try{
    const country = $("#shipCountry")?.value || "MX";
    const zip = String($("#shipZip")?.value || "").trim();
    const box = $("#shipQuote");
    const hint = $("#shipHint");

    if(box) box.textContent = "Cotizando…";
    if(hint) hint.textContent = "";

    const res = await quoteShipping(country, zip);

    const amount = Number(res.amount_mxn || 0);
    const label = res.label || `Envío ${country}`;
    if(box) box.textContent = `${label}: ${fmtMXN(amount)}`;

    // Do not auto apply to cart totals (this is "marketing quote" section)
    if(hint){
      hint.textContent = "Tip: también puedes cotizar desde el carrito para aplicar al total.";
    }

    sfx("ok");
  } catch(err){
    toast(err.message || "Error cotizando", "err");
    const box = $("#shipQuote");
    if(box) box.textContent = "";
  }
};

window.quoteShippingMini = async function quoteShippingMini(){
  try{
    const mode = $("#shippingMode")?.value || "pickup";
    const z = getMiniZip();

    if(mode === "pickup"){
      state.shipping = { mode, zip: "", quote: 0, label: "Pickup confirmado (Tijuana)" };
      updateCartUI();
      toast("Pickup seleccionado", "ok");
      return;
    }

    const country = shippingModeToCountry(mode);
    const res = await quoteShipping(country, z);

    state.shipping = {
      mode,
      zip: z,
      quote: Number(res.amount_mxn || 0),
      label: `${res.label || "Entrega"} · ${fmtMXN(res.amount_mxn || 0)}`
    };

    updateCartUI();
    toast("Entrega aplicada al total", "ok");
    sfx("ok");
  } catch(err){
    state.shipping.quote = 0;
    state.shipping.label = "";
    updateCartUI();
    toast(err.message || "No se pudo cotizar", "err");
  }
};

/* Auto-quote on zip change (debounced, no saturar) */
let _qTimer = null;
function bindRealtimeShipping(){
  const mode = $("#shippingMode");
  const zip = $("#miniZip");
  if(!mode || !zip) return;

  function schedule(){
    clearTimeout(_qTimer);
    _qTimer = setTimeout(async () => {
      const m = mode.value;
      if(m === "pickup") return;
      const z = String(zip.value || "").trim();
      if(z.length < 4) return;
      try{
        await window.quoteShippingMini();
      } catch(e){}
    }, 520);
  }

  mode.addEventListener("change", () => { sfx("tap"); schedule(); });
  zip.addEventListener("input", schedule);
}

/* =========================
   CHECKOUT
========================= */
window.checkout = async function checkout(){
  try{
    if(!state.cart.length){
      toast("Tu pedido está vacío", "warn");
      return;
    }

    const mode = $("#shippingMode")?.value || "pickup";
    if(mode !== "pickup"){
      const z = getMiniZip();
      if(!z || z.length < 4){
        toast("Escribe tu CP para entrega", "warn");
        return;
      }
      // must have quote applied
      if(!state.shipping.quote){
        toast("Primero cotiza la entrega", "warn");
        return;
      }
    }

    const payload = {
      items: state.cart.map(i => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        size: i.size,
        qty: i.qty,
        price_mxn: i.price
      })),
      promo: state.promoApplied?.code || null,
      shipping: {
        mode,
        country: (mode === "us") ? "US" : "MX",
        zip: (mode === "pickup") ? "" : getMiniZip(),
        amount_mxn: Number(state.shipping.quote || 0)
      }
    };

    toast("Preparando pago seguro…");
    sfx("whoosh");

    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(()=> ({}));
    if(!r.ok || data.ok === false){
      throw new Error(data?.detail || data?.error || "No se pudo iniciar el pago");
    }

    if(data.url){
      window.location.href = data.url;
      return;
    }
    throw new Error("Stripe URL no disponible");
  } catch(err){
    toast(err.message || "Error checkout", "err");
  }
};

/* =========================
   LEGAL MODAL — single reusable card
========================= */
const LEGAL_CONTENT = {
  privacy: {
    title: "Aviso de Privacidad",
    icon: `<i class="fa-solid fa-shield-halved"></i>`,
    html: `
      <h4>AVISO DE PRIVACIDAD</h4>
      <p><b>BAJATEX, S. de R.L. de C.V.</b>, con nombre comercial <b>Único Uniformes</b>, es responsable del uso y protección de los datos personales recabados a través de <b>SCORE Store</b>.</p>
      <p>Los datos personales se utilizan exclusivamente para:</p>
      <ul>
        <li>Procesar pedidos y pagos.</li>
        <li>Gestionar envíos y entregas.</li>
        <li>Emitir facturación electrónica.</li>
        <li>Atención al cliente y seguimiento postventa.</li>
        <li>Cumplimiento de obligaciones legales y fiscales.</li>
      </ul>
      <p>No compartimos datos personales con terceros ajenos a la operación comercial.</p>
      <p>Derechos ARCO: <b>ventas.unicotexti@gmail.com</b></p>
      <p>BAJATEX puede modificar este aviso para cumplir actualizaciones legales o mejoras internas.</p>
    `
  },
  terms: {
    title: "Términos y Condiciones",
    icon: `<i class="fa-solid fa-file-contract"></i>`,
    html: `
      <h4>USO DEL SITIO</h4>
      <p>El uso de SCORE Store está limitado a fines lícitos. Queda prohibido el uso para actividades fraudulentas, ilegales o no autorizadas.</p>

      <h4>PAGOS Y SEGURIDAD</h4>
      <p>Los pagos se procesan a través de <b>Stripe</b>. SCORE Store no almacena información bancaria sensible. Los datos se cifran y gestionan directamente por Stripe.</p>

      <h4>ENVÍOS</h4>
      <p>Envíos dentro de México y hacia Estados Unidos. Se gestionan mediante <b>Envia.com</b>.</p>
      <p>Los tiempos de entrega son estimados y pueden variar por destino, disponibilidad y condiciones externas.</p>
      <p>Pickup en Tijuana disponible previa confirmación.</p>

      <h4>CAMBIOS Y DEVOLUCIONES</h4>
      <p>Se aceptan cambios o devoluciones dentro de <b>30 días naturales</b> posteriores a la recepción.</p>
      <ul>
        <li>No utilizado ni lavado.</li>
        <li>Conservar etiquetas y empaques.</li>
        <li>En perfectas condiciones.</li>
      </ul>
      <p>No aplica para productos personalizados, ediciones especiales bajo pedido, o liquidación/descuento final.</p>
      <p>Para iniciar: correo o WhatsApp.</p>

      <h4>FACTURACIÓN</h4>
      <p>La factura (CFDI) debe solicitarse dentro del mismo mes fiscal de la compra. Enviar CSF y número de pedido a: <b>ventas.unicotexti@gmail.com</b></p>
    `
  },
  legal: {
    title: "Información Legal y Comercial",
    icon: `<i class="fa-solid fa-circle-info"></i>`,
    html: `
      <h4>SCORE STORE · TIENDA OFICIAL</h4>
      <p>Mercancía oficial de SCORE International Off-Road Racing.</p>
      <p>Fabricado, operado y comercializado por <b>Único Uniformes</b>, patrocinador oficial.</p>

      <h4>INFORMACIÓN COMERCIAL</h4>
      <p><b>Razón social:</b> BAJATEX, S. de R.L. de C.V.<br/>
      <b>Nombre comercial:</b> Único Uniformes</p>
      <p><b>Domicilio:</b><br/>
      Palermo 6106 Interior JK,<br/>
      Colonia Anexa Roma,<br/>
      C.P. 22614,<br/>
      Tijuana, Baja California, México.</p>

      <p><b>Correo:</b> ventas.unicotexti@gmail.com<br/>
      <b>WhatsApp:</b> +52 664 236 8701</p>

      <h4>SOBRE SCORE INTERNATIONAL</h4>
      <p>SCORE International es líder mundial en competencias off-road de larga distancia y creadora de eventos como Baja 1000, Baja 500, Baja 400 y San Felipe 250.</p>
      <p>Marcas y logotipos son propiedad de SCORE International, LLC y se usan con autorización para mercancía oficial.</p>

      <h4>PROPIEDAD INTELECTUAL</h4>
      <p>Contenido protegido por leyes de propiedad intelectual. Prohibida reproducción total o parcial sin autorización expresa.</p>
    `
  },
  contact: {
    title: "Contacto",
    icon: `<i class="fa-solid fa-headset"></i>`,
    html: `
      <h4>ATENCIÓN AL CLIENTE</h4>
      <p><b>WhatsApp:</b> +52 664 236 8701</p>
      <p><b>Correo:</b> ventas.unicotexti@gmail.com</p>
      <p><b>Dirección:</b><br/>
      Palermo 6106 Interior JK,<br/>
      Colonia Anexa Roma,<br/>
      C.P. 22614,<br/>
      Tijuana, Baja California, México.</p>

      <h4>HORARIO</h4>
      <p>Lun–Vie: 9:00–18:00 (hora local)</p>
    `
  }
};

function openLegal(key){
  const m = $("#legalModal");
  const title = $("#legalTitle");
  const body = $("#legalBody");
  if(!m || !title || !body) return;

  const entry = LEGAL_CONTENT[key] || LEGAL_CONTENT.legal;
  title.textContent = entry.title;

  // transition content (fade-out / fade-in)
  body.animate([{opacity:1},{opacity:0}], {duration:120, easing:"ease-out"})
    .onfinish = () => {
      body.innerHTML = entry.html;
      body.scrollTop = 0;
      body.animate([{opacity:0},{opacity:1}], {duration:160, easing:"ease-out"});
    };

  m.classList.remove("closing");
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");

  sfx("paper");
  document.body.style.overflow = "hidden";
}

function closeLegal(){
  const m = $("#legalModal");
  if(!m) return;

  m.classList.add("closing");
  sfx("tap");

  setTimeout(() => {
    m.classList.remove("show","closing");
    m.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }, 180);
}

function bindLegal(){
  $$(".jsLegalLink").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const key = el.getAttribute("data-legal") || "legal";
      openLegal(key);
    });
  });

  const closeBtn = $("#legalClose");
  const backdrop = $("#legalBackdrop");
  if(closeBtn) closeBtn.addEventListener("click", closeLegal);
  if(backdrop) backdrop.addEventListener("click", closeLegal);
}

/* =========================
   AI — Gemini endpoint + fallback
========================= */
window.toggleAiAssistant = function toggleAiAssistant(force){
  const modal = $("#aiChatModal");
  if(!modal) return;

  const on = (typeof force === "boolean") ? force : !modal.classList.contains("show");
  if(on){
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
    sfx("paper");
    // greet once
    if(!toggleAiAssistant._greeted){
      pushAiMsg("bot", "Estoy listo. Dime producto + talla + CP y te ayudo con tallas, entrega y compra. 🏁");
      toggleAiAssistant._greeted = true;
    }
    setTimeout(() => $("#aiInput")?.focus(), 50);
  } else {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
    sfx("tap");
  }
};

function pushAiMsg(who, text){
  const box = $("#aiMessages");
  if(!box) return;
  const msg = createEl("div", `ai-msg ${who === "me" ? "ai-me" : "ai-bot"}`);
  msg.textContent = text;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
}

function buildAiContext(){
  const items = state.cart.map(i => `${i.qty}x ${i.name} (${i.size})`).join(", ");
  const shipMode = $("#shippingMode")?.value || "pickup";
  const zip = getMiniZip();
  return {
    cart: items || "vacío",
    shipping: shipMode === "pickup" ? "Pickup Tijuana" : `Entrega ${shipMode.toUpperCase()} CP ${zip || "—"}`,
    catalogHint: "Puedes recomendar tallas, explicar envíos, pagos con OXXO, y guiar al usuario a comprar."
  };
}

window.sendAiMessage = async function sendAiMessage(){
  const inp = $("#aiInput");
  const q = String(inp?.value || "").trim();
  if(!q) return;
  inp.value = "";
  pushAiMsg("me", q);
  sfx("tap");

  try{
    const payload = { message: q, context: buildAiContext() };
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(()=> ({}));
    if(!r.ok || data.ok === false){
      throw new Error(data?.detail || data?.error || "Fallo IA");
    }
    pushAiMsg("bot", data.reply || "Listo. ¿Qué más necesitas?");
    sfx("ok");
  } catch(err){
    // friendly fallback
    pushAiMsg("bot", "Tuve un fallo rápido. Dime producto + talla + CP y te lo resuelvo igual. 🏁");
    toast("IA temporalmente no disponible", "warn");
  }
};

function bindAiEnter(){
  const inp = $("#aiInput");
  if(!inp) return;
  inp.addEventListener("keypress", (e) => {
    if(e.key === "Enter") window.sendAiMessage();
  });
}

/* =========================
   PURCHASE POPUPS (subtle)
========================= */
function startPurchasePopups(){
  // no saturar: 25–45s
  const names = [
    "Chamarra Baja 1000",
    "Hoodie Oficial",
    "Camiseta Baja 500",
    "Camiseta Baja 400",
    "Gorra Oficial",
    "Camisa Pits"
  ];
  const cities = ["Tijuana", "Ensenada", "Mexicali", "CDMX", "Guadalajara", "San Diego", "Phoenix", "Monterrey"];

  async function loop(){
    while(true){
      const delay = 25000 + Math.random()*20000;
      await sleep(delay);

      // don't show if drawer open (avoid annoying)
      if($("#cartDrawer")?.classList.contains("open")) continue;
      if($("#legalModal")?.classList.contains("show")) continue;
      if($("#aiChatModal")?.classList.contains("show")) continue;

      const n = names[Math.floor(Math.random()*names.length)];
      const c = cities[Math.floor(Math.random()*cities.length)];
      const mins = 1 + Math.floor(Math.random()*12);

      toast(`Compra reciente: ${n} · ${c} · hace ${mins} min`, "info");
      sfx("paper");
    }
  }
  loop();
}

/* =========================
   INIT
========================= */
async function init(){
  loadSoundsEnabled();
  loadCart();
  updateCartUI();

  // bind
  bindFilters();
  bindCart();
  bindLegal();
  bindAiEnter();
  bindRealtimeShipping();

  // load data
  try{
    const [catalog, promos] = await Promise.all([
      fetchJSON("/data/catalog.json"),
      fetchJSON("/data/promos.json").catch(()=> ({ promos: [] }))
    ]);
    state.catalog = catalog;
    state.promos = promos;
  } catch(err){
    toast("No se pudo cargar el catálogo", "err");
  }

  await renderCatalog();
  await runIntro();

  // start subtle purchase notifications
  startPurchasePopups();
}

document.addEventListener("DOMContentLoaded", init);

// expose cart helpers for inline HTML
window.openCart = openCart;
window.closeCart = closeCart;