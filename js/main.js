/* SCORE STORE LOGIC — FIXED SLIDER & GLASS MODAL v2026 */
(function () {
  "use strict";

  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_fixed";
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 4.5; // 80% OFF Psychology

  let cart = [];
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };
  let catalogData = { products: [], sections: [] };

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
    setTimeout(hideSplash, 4000); // Safety
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
      
      // Asegurar logos de secciones (Path Corregido)
      if(!catalogData.sections) {
         catalogData.sections = [
            {id: "BAJA_1000", logo: "/assets/logo-baja1000.webp"},
            {id: "BAJA_500", logo: "/assets/logo-baja500.webp"},
            {id: "BAJA_400", logo: "/assets/logo-baja400.webp"},
            {id: "SF_250", logo: "/assets/logo-sf250.webp"}
         ];
      }
    } catch { catalogData = { products: [], sections: [] }; }
  }

  // --- CATALOGO (CON SLIDER & LOGOS) ---
  window.openCatalog = (sectionId) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    const sectionInfo = catalogData.sections.find(s => s.id === sectionId);
    
    // 1. LOGO EN VEZ DE TEXTO EN EL HEADER
    const titleEl = $("catTitle");
    if(sectionInfo && sectionInfo.logo) {
       titleEl.innerHTML = `<img src="${sectionInfo.logo}" class="modal-logo" alt="${sectionId}">`;
    } else {
       titleEl.innerText = "COLECCIÓN";
    }

    const container = $("catContent");
    container.innerHTML = "";
    
    if(!items.length) {
      container.innerHTML = `<div style="text-align:center;padding:50px;">Agotado.</div>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "grid"; 
      
      items.forEach(p => {
        // Precios
        const price = Number(p.baseMXN || 0);
        const fake = Math.round(price * FAKE_MARKUP_FACTOR);
        const priceHtml = `<div class="p-prices"><span class="p-old">${money(fake)}</span><span class="p-new">${money(price)}</span></div>`;

        // 2. SLIDER DE IMÁGENES (Lógica recuperada)
        // Soporta p.images (array) o p.img (string)
        let images = [];
        if(p.images && Array.isArray(p.images)) images = p.images;
        else if(p.img) images = [p.img];
        else images = ["/assets/logo-score.webp"];

        const slides = images.map(src => 
            `<div class="prod-slide"><img src="${cleanUrl(src)}" class="prod-img" loading="lazy"></div>`
        ).join("");
        
        const dots = images.length > 1 ? 
            `<div class="slider-dots">${images.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join("")}</div>` : '';

        const sizes = p.sizes || ["Unitalla"];

        const card = document.createElement("div");
        card.className = "prodCard";
        card.innerHTML = `
          <div class="prod-slider-container">
            <div class="promo-badge" style="position:absolute;top:0;right:0;background:#E10600;color:#fff;padding:4px 8px;font-weight:bold;z-index:5;">-80%</div>
            <div class="prod-slider">${slides}</div>
            ${dots}
          </div>
          <div class="p-info">
            <div style="font-weight:800;color:#111;margin-bottom:5px;">${p.name}</div>
            ${priceHtml}
            <div class="p-actions">
              <select class="p-size" id="size_${p.id}">${sizes.map(s => `<option value="${s}">${s}</option>`).join("")}</select>
              <button class="p-add" onclick="addToCart('${p.id}')">AGREGAR</button>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
      container.appendChild(grid);
    }
    
    $("modalCatalog").classList.add("active");
    $("overlay").classList.add("active");
  };

  window.addToCart = (id) => {
    const p = catalogData.products.find(x => x.id === id);
    if(!p) return;
    const size = $(`size_${id}`) ? $(`size_${id}`).value : "Unitalla";
    const item = cart.find(i => i.id === id && i.size === size);
    if(item) item.qty++;
    else cart.push({ id, size, qty:1, price: Number(p.baseMXN), name: p.name, img: p.img });
    
    saveCart(); updateCartUI();
    window.toast("Agregado al Carrito");
    window.openDrawer();
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };

  // --- UI & SHIPPING ---
  function setupUI() {
    document.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", (e) => {
        const m = e.target.value;
        shippingState.mode = m;
        const form = $("shipForm");
        form.style.display = (m === "pickup") ? "none" : "block";
        
        // Fallback Costos
        if(m === "pickup") shippingState.cost = 0;
        else if(m === "tj") shippingState.cost = 200;
        else shippingState.cost = (m === 'mx') ? 250 : 800; 
        
        updateCartUI();
      });
    });
  }

  function updateCartUI() {
    const el = $("cartItems");
    if(!el) return;
    
    if(!cart.length) $("cartEmpty").style.display = "block";
    else $("cartEmpty").style.display = "none";

    let sub = 0, qty = 0;
    el.innerHTML = cart.map((i, idx) => {
        sub += i.price * i.qty; qty += i.qty;
        return `
          <div class="cart-item">
             <img src="${cleanUrl(i.img)}" class="cart-thumb">
             <div style="flex:1;">
               <div style="font-weight:700;font-size:14px;">${i.name}</div>
               <div style="font-size:12px;color:#aaa;">${i.size}</div>
               <div style="color:#E10600;font-weight:bold;">${money(i.price)} x ${i.qty}</div>
             </div>
             <div onclick="removeFromCart(${idx})" style="cursor:pointer;padding:10px;">✕</div>
          </div>
        `;
    }).join("");
    
    $("cartCount").innerText = qty;
    $("grandTotal").innerText = money(sub + shippingState.cost);
  }

  window.toast = (msg) => { const t=$("toast"); t.innerText=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 3000); };
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active")); };
  function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) try{cart=JSON.parse(s)}catch{} }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  document.addEventListener("DOMContentLoaded", init);
})();
