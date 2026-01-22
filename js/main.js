/* SCORE STORE LOGIC — FINAL RACING PRO v4.0 */
(function () {
  "use strict";
  const CFG = window.__SCORE__ || {};
  const API_BASE = (location.hostname === "localhost") ? "/api" : "/.netlify/functions";
  const CART_KEY = "score_cart_prod_final";
  
  // LOGICA COMERCIAL
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 4.5;
  const FALLBACK_COST_MX = 250;
  const FALLBACK_COST_US = 800;

  let cart = [];
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };
  let catalogData = { products: [] };
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hide")) {
      s.classList.add("hide");
      setTimeout(() => { try { s.remove(); } catch {} }, 600);
    }
  }

  async function init() {
    setTimeout(hideSplash, 4500); // Safety timeout
    await loadCatalog();
    loadCart();
    setupUI();
    updateCartUI();
    hideSplash();
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch { catalogData = { products: [] }; }
  }

  window.openCatalog = (sectionId) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = "COLECCIÓN OFICIAL";
    const container = $("catContent");
    if(!container) return;
    
    if(!items.length) container.innerHTML = `<div style="text-align:center;padding:40px;">Agotado.</div>`;
    else {
      const grid = document.createElement("div");
      grid.className = "grid";
      items.forEach(p => {
        const price = Number(p.baseMXN || 0);
        const fake = Math.round(price * FAKE_MARKUP_FACTOR);
        const priceHtml = PROMO_ACTIVE 
          ? `<div class="pPriceRow"><span class="pOldPrice">${money(fake)}</span><span class="pNewPrice">${money(price)}</span></div>`
          : `<div class="pNewPrice">${money(price)}</div>`;
        const img = p.img || (p.images && p.images[0]) || "";
        const sizes = p.sizes || ["Unitalla"];
        
        const card = document.createElement("div");
        card.className = "pCard";
        card.innerHTML = `
          <div class="pMedia">
            ${PROMO_ACTIVE ? '<div class="promo-badge-card">-80%</div>' : ''}
            <img src="${cleanUrl(img)}" loading="lazy" alt="${p.name}">
          </div>
          <div class="pBody">
            <div class="pName">${p.name}</div>
            ${priceHtml}
            <select class="pSize" id="size_${p.id}">${sizes.map(s => `<option value="${s}">${s}</option>`).join("")}</select>
            <button class="btn primary full small" onclick="addToCart('${p.id}')">AGREGAR</button>
          </div>`;
        grid.appendChild(card);
      });
      container.innerHTML = ""; container.appendChild(grid);
    }
    $("modalCatalog").classList.add("active"); $("overlay").classList.add("active");
  };

  window.addToCart = (id) => {
    const p = catalogData.products.find(x => x.id === id);
    if(!p) return;
    const size = $(`size_${id}`) ? $(`size_${id}`).value : "Unitalla";
    const item = cart.find(i => i.id === id && i.size === size);
    if(item) item.qty++; else cart.push({ id, size, qty:1, price: Number(p.baseMXN), name: p.name, img: p.img });
    
    saveCart(); updateCartUI();
    
    // RACING VIBRATION
    const btn = document.querySelector(".cartBtn");
    btn.classList.add("cart-rev");
    setTimeout(() => btn.classList.remove("cart-rev"), 400);
    
    if(typeof fbq === 'function') fbq('track', 'AddToCart');
    $("modalCatalog").classList.remove("active"); $("overlay").classList.remove("active");
    window.toast("🏁 Agregado a Pits");
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar?")) { cart=[]; saveCart(); updateCartUI(); } };

  function setupUI() {
    document.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", (e) => {
        const m = e.target.value;
        shippingState.mode = m;
        const form = $("shipForm");
        const cp = $("cp");
        form.style.display = "none"; shippingState.cost = 0;

        if (m === "pickup") shippingState.label = "Gratis (Fábrica)";
        else if (m === "tj") { shippingState.cost = 200; shippingState.label = "Local Express"; form.style.display = "block"; }
        else {
          shippingState.label = "Calculando..."; form.style.display = "block";
          if (cp && cp.value.length >= 5) quoteShipping(cp.value, m);
          else { shippingState.cost = (m === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US; shippingState.label = "Estándar (Pendiente CP)"; }
        }
        updateCartUI();
      });
    });
    const cp = $("cp");
    if(cp) cp.addEventListener("blur", () => {
      const m = shippingState.mode;
      if ((m === 'mx' || m === 'us') && cp.value.length >= 5) quoteShipping(cp.value, m);
    });
  }

  async function quoteShipping(zip, mode) {
    if(!cart.length) return;
    $("shipTotal").innerHTML = '<span class="start-lights">Cotizando</span>';
    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, country: (mode === 'us') ? 'US' : 'MX', items: cart.reduce((a, b) => a + b.qty, 0) })
      });
      if (!res.ok) throw new Error("API Error");
      const data = await res.json();
      if (data.success && data.cost) { shippingState.cost = Number(data.cost); shippingState.label = data.label || "Express"; }
      else throw new Error("No quotes");
    } catch (e) {
      shippingState.cost = (mode === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US;
      shippingState.label = "Envío Estándar";
    }
    updateCartUI();
  }

  function updateCartUI() {
    const el = $("cartItems"); if(!el) return;
    let sub = 0, qty = 0;
    if(!cart.length) { el.innerHTML = `<div style="text-align:center;padding:20px;color:#999;">Vacío</div>`; $("cartEmpty").style.display = "block"; }
    else {
      $("cartEmpty").style.display = "none";
      el.innerHTML = cart.map((i, idx) => {
        sub += i.price * i.qty; qty += i.qty;
        return `<div class="cartItem"><div style="width:50px;"><img src="${cleanUrl(i.img)}" style="width:100%;aspect-ratio:1;object-fit:contain;"></div><div style="flex:1;"><div style="font-weight:700;font-size:13px;">${i.name}</div><div style="font-size:11px;opacity:.7;">${i.size}</div><div>${money(i.price)} x ${i.qty}</div></div><button class="btnGhost" onclick="removeFromCart(${idx})">✕</button></div>`;
      }).join("");
    }
    $("cartCount").innerText = qty; $("subTotal").innerText = money(sub);
    $("shipTotal").innerText = shippingState.label; $("grandTotal").innerText = money(sub + shippingState.cost);
  }

  window.checkout = async () => {
    if(!cart.length) return window.toast("Carrito vacío");
    const btn = $("checkoutBtn");
    if(shippingState.mode !== 'pickup' && (!$("name").value || !$("addr").value || !$("cp").value)) return window.toast("Faltan datos");
    
    btn.innerText = "INICIANDO CARRERA"; btn.classList.add("start-lights"); btn.disabled = true;
    if(typeof fbq === 'function') fbq('track', 'InitiateCheckout');
    try {
      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart, mode: shippingState.mode, promoCode: "LANZAMIENTO80", customer: { name: $("name").value, address: $("addr").value, postal_code: $("cp").value } })
      });
      const data = await res.json();
      if(data.url) location.href = data.url; else throw new Error(data.error);
    } catch (e) { window.toast("Error, intenta de nuevo"); btn.innerText = "PAGAR AHORA"; btn.classList.remove("start-lights"); btn.disabled = false; }
  };

  window.toast = (msg) => { const t = $("toast"); t.innerText = msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 3000); };
  window.closeAll = () => { document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active")); };
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) try{cart=JSON.parse(s)}catch{} }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  document.addEventListener("DOMContentLoaded", init);
})();
