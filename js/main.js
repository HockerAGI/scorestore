/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD_UNIFIED)
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n || 0)
  );

// ESTADO
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v5") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  promo: { code: "", applied: false },
  filter: "ALL",
};

// ... (LEGAL_CONTENT y AUDIO igual que antes, omitido por brevedad, no afecta lógica) ...
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
  }
  if (type === "success") {
    osc.type = "triangle"; osc.frequency.setValueAtTime(450, now);
    osc.frequency.linearRampToValueAtTime(720, now + 0.18);
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

// --------------------
// CATALOGO + CAROUSEL LOGIC
// --------------------
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json", { cache: "no-store" });
    const data = await r.json();
    state.products = data.products || [];
    renderGrid(getFilteredProducts());
  } catch (e) {
    $("#productsGrid").innerHTML = "<p>Error cargando catálogo.</p>";
    console.error(e);
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

    // CAROUSEL LOGIC
    let mediaHtml = "";
    // Usar p.images si existe y tiene más de 1, si no, usar array de p.img
    const images = (p.images && p.images.length > 0) ? p.images : [p.img];
    
    if (images.length > 1) {
      // Múltiples imágenes: Slider con scroll snap
      const slides = images.map(src => 
        `<div class="carousel-item"><img src="${src}" loading="lazy" alt="${p.name}" width="300" height="300"></div>`
      ).join("");
      
      const dots = images.map((_, i) => 
        `<div class="dot ${i === 0 ? 'active' : ''}" data-idx="${i}"></div>`
      ).join("");

      mediaHtml = `
        <div class="cardMedia" id="media-${p.id}">
          <div class="carousel" onscroll="updateDots(this, '${p.id}')">
            ${slides}
          </div>
          <div class="carousel-dots" id="dots-${p.id}">
            ${dots}
          </div>
        </div>`;
    } else {
      // Imagen única
      mediaHtml = `
        <div class="cardMedia">
          <img src="${images[0]}" loading="lazy" alt="${p.name}" width="300" height="300" style="object-fit:cover;width:100%;height:100%">
        </div>`;
    }

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

// Función global para actualizar los puntitos al hacer scroll
window.updateDots = (carousel, id) => {
  const width = carousel.offsetWidth;
  const scrollLeft = carousel.scrollLeft;
  const idx = Math.round(scrollLeft / width);
  
  const dotsContainer = document.getElementById(`dots-${id}`);
  if(dotsContainer) {
    const dots = dotsContainer.querySelectorAll('.dot');
    dots.forEach((d, i) => {
      if(i === idx) d.classList.add('active');
      else d.classList.remove('active');
    });
  }
};

// --------------------
// CART & SHIPPING
// --------------------
window.addToCart = (id) => {
  const p = state.products.find((x) => x.id === id);
  if (!p) return toast("Producto no disponible");

  const sizeEl = $(`#size-${id}`);
  const size = sizeEl ? sizeEl.value : "Unitalla";
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
  $("#cartCount").textContent = cnt;

  const box = $("#cartItems");
  if (!box) return;
  box.innerHTML = "";
  
  let sub = 0;
  state.cart.forEach((i, idx) => {
    sub += Number(i.price) * normalizeQty(i.qty);
    box.innerHTML += `
      <div class="cartRow">
        <div class="cartThumb"><img src="${i.img}" alt=""></div>
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
  if (state.shipping.mode === "pickup") shipEl.textContent = "Gratis";
  else if (ship > 0) shipEl.textContent = fmtMXN(ship);
  else shipEl.textContent = "Pendiente";

  $("#cartTotal").textContent = fmtMXN(sub + ship);
  $("#miniShipLabel").textContent = state.shipping.label || "";
}

window.modQty = (i, d) => {
  if (!state.cart[i]) return;
  state.cart[i].qty += d;
  if (state.cart[i].qty <= 0) state.cart.splice(i, 1);
  
  if (state.shipping.mode !== "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Cotiza de nuevo";
  }
  saveCart();
};

window.openCart = () => { $("#cartDrawer")?.classList.add("open"); $("#backdrop")?.classList.add("show"); saveCart(); };
window.closeCart = () => { $("#cartDrawer")?.classList.remove("open"); $("#backdrop")?.classList.remove("show"); };

// SHIPPING LOGIC
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

// Cotizador MINI (Carrito)
window.quoteShippingMini = async () => {
  const zipRaw = $("#miniZip")?.value || "";
  const zip = digitsOnly(zipRaw);
  const mode = $("#shippingMode")?.value || "pickup";

  if (mode === "pickup") return;
  if (zip.length < 4) return toast("Ingresa un CP válido");

  $("#miniShipLabel").textContent = "Cotizando...";

  try {
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, country: modeToCountry(mode), items: cartItemsForQuote() }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error);

    state.shipping = { mode, quote: d.cost, label: d.label };
    saveCart();
    toast("Envío actualizado");
    playSound("success");
  } catch (e) {
    console.error(e);
    toast("Error al cotizar");
    state.shipping.label = "Error. Intenta de nuevo.";
    saveCart();
  }
};

// Cotizador GRANDE (Landing)
window.quoteShippingUI = async () => {
  const country = $("#shipCountry")?.value || "MX";
  const zip = digitsOnly($("#shipZip")?.value || "");
  const out = $("#shipQuote");

  if (zip.length < 4) {
    if (out) out.textContent = "Ingresa un código postal válido.";
    return;
  }
  if (out) out.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cotizando...';

  try {
    // Simulamos items si el carrito está vacío para dar una idea al usuario
    const items = cartItemsForQuote().length ? cartItemsForQuote() : [{qty:1}];

    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, country, items }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error);

    out.innerHTML = `<b>${d.label}</b> · ${fmtMXN(d.cost)}`;
    playSound("success");
  } catch (e) {
    console.error(e);
    out.textContent = "No se encontró tarifa. Intenta otro CP.";
  }
};

// CHECKOUT
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

// ... Resto de lógica de UI (Legal, Filtros, Init) igual ...
// BOOT
document.addEventListener("DOMContentLoaded", () => {
  loadCatalog();
  // ... resto de tu init code ...
  
  // Filtros
  $$(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderGrid(getFilteredProducts());
    });
  });

  // Init shipping visibility
  const m = $("#shippingMode")?.value || "pickup";
  const mz = $("#miniZip");
  if(mz) mz.style.display = m === "pickup" ? "none" : "block";

  saveCart();
  
  // Stripe Status
  const params = new URLSearchParams(location.search);
  if (params.get("status") === "success") {
    toast("Pago confirmado 🏁");
    state.cart = [];
    localStorage.removeItem("score_cart_v5");
    saveCart();
    history.replaceState({}, document.title, "/");
  }
});
