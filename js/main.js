/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD_UNIFIED - FIXED)
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n || 0)
  );

// --- INTRO LOGIC ---
function removeIntro() {
  const intro = document.getElementById("intro");
  if (intro) {
    intro.setAttribute("aria-hidden", "true");
    setTimeout(() => { intro.style.display = "none"; }, 500);
  }
}
setTimeout(removeIntro, 2500);
document.getElementById("introSkip")?.addEventListener("click", removeIntro);

// ESTADO
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v5") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  filter: "ALL",
};

// AUDIO
let __audioCtx = null;
const getAudioCtx = () => {
  if (__audioCtx) return __audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  __audioCtx = new Ctx();
  return __audioCtx;
};
const playSound = (type) => {
  const ctx = getAudioCtx();
  if (!ctx || ctx.state === "closed") return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  if (type === "pop") {
    osc.type = "sine"; osc.frequency.setValueAtTime(800, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now); osc.stop(now + 0.13);
  } else {
    osc.type = "triangle"; osc.frequency.setValueAtTime(450, now);
    g.gain.exponentialRampToValueAtTime(0.10, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now); osc.stop(now + 0.29);
  }
};

const toast = (msg) => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  playSound("pop");
  setTimeout(() => t.classList.remove("show"), 3000);
};

const digitsOnly = (s) => String(s || "").replace(/\D+/g, "");
const normalizeQty = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 1)));
const modeToCountry = (mode) => (String(mode || "mx").toLowerCase() === "us" ? "US" : "MX");
const cartItemsForQuote = () => (state.cart || []).map((i) => ({ qty: normalizeQty(i.qty) }));

// --- CATALOGO ---
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json").catch(() => null);
    if (r && r.ok) {
      const data = await r.json();
      state.products = data.products || [];
    }
    renderGrid(getFilteredProducts());
  } catch (e) {
    $("#productsGrid").innerHTML = "<p>Error cargando catálogo.</p>";
  }
}

function getFilteredProducts() {
  if (!state.filter || state.filter === "ALL") return state.products;
  return (state.products || []).filter(
    (p) => String(p.sectionId || "").toUpperCase() === String(state.filter).toUpperCase()
  );
}

function renderGrid(list) {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!list || list.length === 0) {
    grid.innerHTML = "<p style='grid-column:1/-1;text-align:center;opacity:0.6'>No hay productos disponibles.</p>";
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    // --- LOGICA IMAGENES (Fix Cuadro Blanco) ---
    // Si p.images existe y tiene items, usalo. Si no, si p.img existe, usalo. Si no, array vacío.
    const images = (p.images && p.images.length > 0) ? p.images : (p.img ? [p.img] : []);
    
    let mediaHtml = "";
    if (images.length > 0) {
        if (images.length > 1) {
          // Slider
          const slides = images.map(src => `<div class="carousel-item"><img src="${src}" loading="lazy" alt="${p.name}"></div>`).join("");
          const dots = images.map((_, i) => `<div class="dot ${i===0?'active':''}" data-idx="${i}"></div>`).join("");
          mediaHtml = `
            <div class="cardMedia">
              <div class="carousel" onscroll="updateDots(this, '${p.id}')">${slides}</div>
              <div class="carousel-dots" id="dots-${p.id}">${dots}</div>
            </div>`;
        } else {
          // Single Image
          mediaHtml = `
            <div class="cardMedia">
              <div class="carousel-item"><img src="${images[0]}" loading="lazy" alt="${p.name}"></div>
            </div>`;
        }
    }
    // Si images.length es 0, mediaHtml es "", no se renderiza nada (sin cuadro blanco).

    card.innerHTML = `
      ${mediaHtml}
      <div class="cardBody">
        <div>
            <div class="cardTitle">${p.name}</div>
            <div class="cardPrice">${fmtMXN(p.baseMXN)}</div>
        </div>
        <div class="cardControls">
          <label for="size-${p.id}" class="sr-only">Talla</label>
          <select id="size-${p.id}">
            ${(p.sizes || ["Unitalla"]).map((s) => `<option value="${s}">${s}</option>`).join("")}
          </select>
          <button type="button" onclick="addToCart('${p.id}')" aria-label="Agregar">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

window.updateDots = (carousel, id) => {
  const width = carousel.offsetWidth;
  const idx = Math.round(carousel.scrollLeft / width);
  const dotsContainer = document.getElementById(`dots-${id}`);
  if(dotsContainer) {
    const dots = dotsContainer.querySelectorAll('.dot');
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  }
};

// --- CART ---
window.addToCart = (id) => {
  const p = state.products.find((x) => x.id === id);
  if (!p) return toast("Producto no disponible");
  const size = $(`#size-${id}`)?.value || "Unitalla";
  const key = `${id}-${size}`;
  const ex = state.cart.find((i) => i.key === key);
  if (ex) ex.qty++;
  else state.cart.push({ key, id: p.id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });
  openCart();
  toast("Agregado al equipo");
};

function saveCart() {
  localStorage.setItem("score_cart_v5", JSON.stringify(state.cart));
  const cnt = state.cart.reduce((a, b) => a + normalizeQty(b.qty), 0);
  const counter = $("#cartCount");
  if(counter) counter.textContent = cnt;

  const box = $("#cartItems");
  if (!box) return;
  box.innerHTML = "";
  
  let sub = 0;
  state.cart.forEach((i, idx) => {
    sub += Number(i.price) * normalizeQty(i.qty);
    box.innerHTML += `
      <div class="cartRow">
        <div class="cartThumb"><img src="${i.img || ''}" alt=""></div>
        <div class="cartInfo">
          <div class="name">${i.name}</div>
          <div class="price">${i.size} | ${fmtMXN(i.price)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          <button class="qtyBtn" onclick="modQty(${idx},-1)">-</button>
          <span style="font-weight:900;font-size:13px">${normalizeQty(i.qty)}</span>
          <button class="qtyBtn" onclick="modQty(${idx},1)">+</button>
        </div>
      </div>`;
  });

  const ship = Number(state.shipping.quote || 0);
  $("#cartSubtotal").textContent = fmtMXN(sub);
  
  const shipEl = $("#cartShipping");
  if (shipEl) {
      if (state.shipping.mode === "pickup") shipEl.textContent = "Gratis";
      else if (ship > 0) shipEl.textContent = fmtMXN(ship);
      else shipEl.textContent = "Pendiente";
  }
  $("#cartTotal").textContent = fmtMXN(sub + ship);
  const lbl = $("#miniShipLabel");
  if(lbl) lbl.textContent = state.shipping.label || "";
}

window.modQty = (i, d) => {
  if (!state.cart[i]) return;
  state.cart[i].qty += d;
  if (state.cart[i].qty <= 0) state.cart.splice(i, 1);
  if (state.shipping.mode !== "pickup") { state.shipping.quote = 0; state.shipping.label = "Cotiza de nuevo"; }
  saveCart();
};

window.openCart = () => { $("#cartDrawer")?.classList.add("open"); $("#backdrop")?.classList.add("show"); saveCart(); };
window.closeCart = () => { $("#cartDrawer")?.classList.remove("open"); $("#backdrop")?.classList.remove("show"); };

// --- SHIPPING ---
$("#shippingMode")?.addEventListener("change", (e) => {
  const m = e.target.value;
  const miniZip = $("#miniZip");
  if (m === "pickup") {
    miniZip.style.display = "none";
    state.shipping = { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" };
  } else {
    miniZip.style.display = "block";
    miniZip.placeholder = m === "us" ? "ZIP Code (USA)" : "Código Postal (MX)";
    state.shipping = { mode: m, quote: 0, label: "Ingresa CP y cotiza" };
  }
  saveCart();
});

window.quoteShippingMini = async () => {
  const zip = digitsOnly($("#miniZip")?.value || "");
  const mode = $("#shippingMode")?.value || "pickup";
  if (mode === "pickup") return;
  if (zip.length < 4) return toast("Ingresa un CP válido");
  $("#miniShipLabel").textContent = "Cotizando...";
  try {
    const res = await fetch("/api/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, country: modeToCountry(mode), items: cartItemsForQuote() }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error);
    state.shipping = { mode, quote: d.cost, label: d.label };
    saveCart();
    toast("Envío actualizado");
    playSound("success");
  } catch (e) {
    state.shipping.label = "Error. Intenta de nuevo.";
    saveCart();
  }
};

window.quoteShippingUI = async () => {
  const country = $("#shipCountry")?.value || "MX";
  const zip = digitsOnly($("#shipZip")?.value || "");
  const out = $("#shipQuote");
  if (zip.length < 4) { if (out) out.innerText = "Ingresa un código postal válido."; return; }
  out.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cotizando...';
  try {
    const items = cartItemsForQuote().length ? cartItemsForQuote() : [{qty:1}];
    const res = await fetch("/api/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, country, items }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error);
    out.innerHTML = `<b>${d.label}</b> · ${fmtMXN(d.cost)}`;
    playSound("success");
  } catch (e) {
    out.textContent = "No se encontró tarifa. Intenta otro CP.";
  }
};

// --- CHECKOUT & AI ---
window.checkout = async () => {
  if (!state.cart.length) return toast("Carrito vacío");
  const mode = state.shipping.mode;
  const zip = digitsOnly($("#miniZip")?.value);
  if (mode !== "pickup") {
    if (!zip || zip.length < 4) return toast("Falta código postal");
    if (!state.shipping.quote) return toast("Cotiza el envío primero");
  }
  const btn = $("#checkoutBtn");
  btn.innerHTML = "PROCESANDO...";
  try {
    const res = await fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart: state.cart,
        shippingMode: mode,
        shippingData: { postal_code: zip },
        promoCode: $("#promoCode")?.value
      }),
    });
    const d = await res.json();
    if (d.url) window.location.href = d.url;
    else throw new Error(d.error);
  } catch (e) {
    toast("Error iniciando pago");
    btn.innerHTML = "PAGAR SEGURO";
  }
};

window.toggleAiAssistant = () => $("#aiChatModal")?.classList.toggle("show");
window.sendAiMessage = async () => {
  const input = $("#aiInput");
  const txt = input?.value.trim();
  if (!txt) return;
  const box = $("#aiMessages");
  if (box) box.innerHTML += `<div class="ai-msg ai-me">${txt}</div>`;
  input.value = "";
  try {
    // CONEXION A LA API REAL DE GEMINI
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: txt }),
    });
    const d = await res.json();
    if (box) box.innerHTML += `<div class="ai-msg ai-bot">${d.reply || "Error"}</div>`;
  } catch (e) {
    if (box) box.innerHTML += `<div class="ai-msg ai-bot">Error de conexión.</div>`;
  }
};

// --- LEGAL MODALS & BOOT ---
const LEGAL_CONTENT = {
  privacy: { title: "Privacidad", html: "<p>Tus datos están protegidos por UNICO UNIFORMES.</p>" },
  terms: { title: "Términos", html: "<p>Términos y condiciones de Score Store.</p>" },
  legal: { title: "Legal", html: "<p>Razón Social: BAJATEX S. de R.L.</p>" },
  contact: { title: "Contacto", html: "<p>Email: ventas.unicotextil@gmail.com</p>" }
};

document.addEventListener("DOMContentLoaded", () => {
  loadCatalog();
  saveCart();
  
  // Bind filters
  $$(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderGrid(getFilteredProducts());
    });
  });

  // Bind Legal
  $$(".jsLegalLink").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.legal;
      if (LEGAL_CONTENT[type]) {
        $("#legalTitle").textContent = LEGAL_CONTENT[type].title;
        $("#legalBody").innerHTML = LEGAL_CONTENT[type].html;
        $("#legalModal").classList.add("show");
      }
    });
  });
  $("#legalClose")?.addEventListener("click", () => $("#legalModal").classList.remove("show"));
  $("#legalBackdrop")?.addEventListener("click", () => $("#legalModal").classList.remove("show"));

  // Check success
  const params = new URLSearchParams(location.search);
  if (params.get("status") === "success") {
    toast("Pago confirmado 🏁");
    state.cart = [];
    localStorage.removeItem("score_cart_v5");
    saveCart();
    history.replaceState({}, document.title, "/");
  }
});
