/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD_UNIFIED)
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

// --- INTRO LOGIC (PRIORIDAD ALTA) ---
// Se ejecuta inmediatamente para garantizar que se oculte
function hideIntro() {
  const intro = document.getElementById("intro");
  if (intro) {
    intro.style.opacity = "0";
    intro.style.pointerEvents = "none";
    setTimeout(() => { intro.style.display = "none"; }, 500);
  }
}
// Forzar ocultar a los 3 segundos pase lo que pase (backup del CSS)
setTimeout(hideIntro, 3000);

// --- ESTADO GLOBAL ---
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v5") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  promo: { code: "", applied: false },
  filter: "ALL",
};

// --- AUDIO CONTEXT (Seguro) ---
let __audioCtx = null;
const getAudioCtx = () => {
  if (__audioCtx) return __audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  __audioCtx = new Ctx();
  return __audioCtx;
};

const playSound = (type) => {
  try {
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
  } catch(e) { /* Audio error safe */ }
};

const toast = (msg) => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  playSound("pop");
  setTimeout(() => t.classList.remove("show"), 3000);
};

// --- CATALOGO ---
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json", { cache: "no-store" });
    if(!r.ok) throw new Error("404");
    const data = await r.json();
    state.products = data.products || [];
    renderGrid(getFilteredProducts());
  } catch (e) {
    console.error("Catalog Error:", e);
    $("#productsGrid").innerHTML = "<p>Error cargando productos. Intenta recargar.</p>";
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
    grid.innerHTML = "<p style='grid-column:1/-1;text-align:center;'>No hay productos disponibles.</p>";
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    // Carousel Logic
    let mediaHtml = "";
    const images = (p.images && p.images.length > 0) ? p.images : [p.img];
    
    if (images.length > 1) {
      const slides = images.map(src => `<div class="carousel-item"><img src="${src}" loading="lazy" alt="${p.name}"></div>`).join("");
      const dots = images.map((_, i) => `<div class="dot ${i===0?'active':''}" data-idx="${i}"></div>`).join("");
      
      mediaHtml = `
        <div class="cardMedia">
          <div class="carousel" onscroll="updateDots(this, '${p.id}')">
            ${slides}
          </div>
          <div class="carousel-dots" id="dots-${p.id}">${dots}</div>
        </div>`;
    } else {
      mediaHtml = `<div class="cardMedia"><img src="${images[0]}" loading="lazy" alt="${p.name}"></div>`;
    }

    card.innerHTML = `
      ${mediaHtml}
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMXN(p.baseMXN)}</div>
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

// Global para el scroll del carrusel
window.updateDots = (carousel, id) => {
  const width = carousel.offsetWidth;
  const idx = Math.round(carousel.scrollLeft / width);
  const dots = document.querySelectorAll(`#dots-${id} .dot`);
  dots.forEach((d, i) => {
    if(i === idx) d.classList.add('active');
    else d.classList.remove('active');
  });
};

// --- CART & ACTIONS ---
window.addToCart = (id) => {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;
  const size = $(`#size-${id}`)?.value || "Unitalla";
  const key = `${id}-${size}`;
  const ex = state.cart.find((i) => i.key === key);
  
  if (ex) ex.qty++;
  else state.cart.push({ key, id: p.id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });

  openCart();
  toast("Agregado");
};

function saveCart() {
  localStorage.setItem("score_cart_v5", JSON.stringify(state.cart));
  const cnt = state.cart.reduce((a, b) => a + Math.max(1, b.qty||1), 0);
  $("#cartCount").textContent = cnt;
  
  const box = $("#cartItems");
  if(box) {
    box.innerHTML = "";
    let sub = 0;
    state.cart.forEach((i, idx) => {
      sub += i.price * i.qty;
      box.innerHTML += `
        <div class="cartRow">
          <div class="cartThumb"><img src="${i.img}" alt=""></div>
          <div style="flex:1">
            <div style="font-weight:800;font-size:13px">${i.name}</div>
            <div style="font-size:12px;color:#666">${i.size} | ${fmtMXN(i.price)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <button class="qtyBtn" onclick="modQty(${idx},-1)">-</button>
            <span style="font-weight:900;font-size:13px">${i.qty}</span>
            <button class="qtyBtn" onclick="modQty(${idx},1)">+</button>
          </div>
        </div>`;
    });
    $("#cartSubtotal").textContent = fmtMXN(sub);
    const ship = state.shipping.quote || 0;
    $("#cartShipping").textContent = state.shipping.mode==="pickup"?"Gratis": (ship?fmtMXN(ship):"Pendiente");
    $("#cartTotal").textContent = fmtMXN(sub + Number(ship));
  }
}

window.modQty = (i, d) => {
  if(!state.cart[i]) return;
  state.cart[i].qty += d;
  if(state.cart[i].qty <= 0) state.cart.splice(i, 1);
  if(state.shipping.mode !== "pickup") { state.shipping.quote = 0; state.shipping.label="Recotizar"; }
  saveCart();
};

window.openCart = () => { $("#cartDrawer")?.classList.add("open"); $("#backdrop")?.classList.add("show"); saveCart(); };
window.closeCart = () => { $("#cartDrawer")?.classList.remove("open"); $("#backdrop")?.classList.remove("show"); };

// --- BOOT ---
document.addEventListener("DOMContentLoaded", () => {
  // Asegurar ocultar intro
  $("#introSkip")?.addEventListener("click", hideIntro);
  
  loadCatalog();
  saveCart();

  // Filtros
  $$(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderGrid(getFilteredProducts());
    });
  });

  // Shipping Logic
  $("#shippingMode")?.addEventListener("change", (e) => {
    const m = e.target.value;
    const mz = $("#miniZip");
    if(m === "pickup") { mz.style.display="none"; state.shipping={mode:"pickup", quote:0, label:"Pickup"}; }
    else { mz.style.display="block"; state.shipping={mode:m, quote:0, label:"Cotizar"}; }
    saveCart();
  });
});

// Helper de cotización mini
window.quoteShippingMini = async () => {
  const zip = $("#miniZip").value.replace(/\D/g,"");
  if(zip.length < 4) return toast("CP Inválido");
  
  $("#miniShipLabel").textContent = "Cotizando...";
  try {
    const res = await fetch("/api/quote", { 
      method:"POST", 
      body: JSON.stringify({zip, country: state.shipping.mode==="us"?"US":"MX", items: state.cart}) 
    });
    const d = await res.json();
    state.shipping.quote = d.cost || 0;
    state.shipping.label = d.label;
    saveCart();
  } catch(e) { toast("Error cotizando"); }
};

window.checkout = async () => {
  if(!state.cart.length) return toast("Vacío");
  const btn = $("#checkoutBtn");
  btn.innerText = "Procesando...";
  try {
    const res = await fetch("/api/checkout", {
      method:"POST",
      body: JSON.stringify({ 
        cart: state.cart, 
        shippingMode: state.shipping.mode, 
        shippingData: { postal_code: $("#miniZip").value } 
      })
    });
    const d = await res.json();
    if(d.url) window.location.href = d.url;
    else alert("Error: " + d.error);
  } catch(e) { btn.innerText = "Intentar de nuevo"; }
};