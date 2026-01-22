/* SCORE STORE LOGIC — DARK RACING SUPREME (UNIFIED vFINAL) */

(function () {
  "use strict";

  // --- CONFIGURACIÓN & CREDENCIALES ---
  const CFG = window.__SCORE__ || {};
  const API_BASE = (location.hostname === "localhost") ? "/api" : "/.netlify/functions";
  const CART_KEY = "score_cart_supreme_v1";
  
  // LÓGICA COMERCIAL
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 4.5;
  const FALLBACK_COST_MX = 250;
  const FALLBACK_COST_US = 800;

  // ESTADO GLOBAL
  let cart = [];
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };
  let catalogData = { products: [], sections: [] };

  // --- HELPERS (Rescatados de main.txt) ---
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  
  // Fix para URLs de imágenes en móviles
  const cleanUrl = (url) => {
    if (!url) return "";
    return encodeURI(url.trim());
  };

  // --- 1. INICIALIZACIÓN BLINDADA ---
  async function init() {
    initSplash(); // Inicia monitoreo de carga
    
    try {
        await loadCatalog();
    } catch (e) {
        console.error("Error crítico cargando catálogo", e);
        // Fallback de emergencia si todo falla
        catalogData = { products: [], sections: [] };
    }

    loadCart();
    setupUI();
    updateCartUI();
    
    // Pixel ViewContent
    if(typeof fbq === 'function') fbq('track', 'ViewContent');

    // Desbloquear splash
    hideSplash();
  }

  // Lógica Splash de Seguridad (Del archivo viejo)
  function initSplash() {
    // Seguro de vida: Si en 4.5s no ha cargado, forzar entrada
    setTimeout(() => {
        const s = $("splash-screen");
        if (s && !s.classList.contains("hide")) {
            console.warn("⚠️ Splash forzado por tiempo de espera.");
            hideSplash();
        }
    }, 4500);
  }

  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hide")) {
      s.classList.add("hide");
      document.body.classList.remove("no-scroll");
      setTimeout(() => { try { s.remove(); } catch {} }, 700);
    }
  }

  // --- 2. GESTIÓN DE DATOS ---
  async function loadCatalog() {
    // Intentamos cargar JSON local (más rápido y estable)
    const res = await fetch("/data/catalog.json");
    if (!res.ok) throw new Error("404 Catalog");
    const data = await res.json();
    catalogData = data;

    // Asegurar estructura de secciones si no viene en el JSON
    if(!catalogData.sections || catalogData.sections.length === 0) {
       catalogData.sections = [
          {id: "BAJA_1000", logo: "/assets/logo-baja1000.webp"},
          {id: "BAJA_500", logo: "/assets/logo-baja500.webp"},
          {id: "BAJA_400", logo: "/assets/logo-baja400.webp"},
          {id: "SF_250", logo: "/assets/logo-sf250.webp"}
       ];
    }
  }

  // --- 3. RENDERIZADO (Estilo Supreme + Lógica Vieja) ---
  window.openCatalog = (sectionId) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    const sectionInfo = catalogData.sections.find(s => s.id === sectionId);
    
    // Header del Modal con Logo (Estilo Supreme)
    const titleEl = $("catTitle");
    if(sectionInfo && sectionInfo.logo) {
       titleEl.innerHTML = `<img src="${cleanUrl(sectionInfo.logo)}" class="modal-logo" alt="${sectionId}">`;
    } else {
       titleEl.innerText = "COLECCIÓN OFICIAL";
    }

    const container = $("catContent");
    if(!container) return;
    
    if(!items.length) {
      container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Agotado temporalmente.</div>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "grid"; 
      
      items.forEach(p => {
        // Lógica de Precios (Fake Markup)
        const price = Number(p.baseMXN || 0);
        const fakePrice = Math.round(price * FAKE_MARKUP_FACTOR);
        const priceHtml = PROMO_ACTIVE 
          ? `<div class="p-prices"><span class="p-old">${money(fakePrice)}</span><span class="p-new">${money(price)}</span></div>`
          : `<div class="p-prices"><span class="p-new">${money(price)}</span></div>`;

        // Slider de Imágenes (Recuperado del archivo viejo)
        const images = (p.images && p.images.length) ? p.images : [p.img || ""];
        const slidesHtml = images.map(img => `<div class="prod-slide"><img src="${cleanUrl(img)}" class="prodImg" loading="lazy"></div>`).join("");
        
        // Dots
        const dotsHtml = images.length > 1 ? 
           `<div class="slider-dots">${images.map((_, i) => `<div class="dot ${i===0?'active':''}"></div>`).join("")}</div>` : '';

        const sizes = p.sizes || ["Unitalla"];

        // Card "White Metallic"
        const card = document.createElement("div");
        card.className = "prodCard"; 
        card.innerHTML = `
          <div class="metallic-frame">
            ${PROMO_ACTIVE ? '<div class="promo-badge">-80%</div>' : ''}
            <div class="prod-slider">${slidesHtml}</div>
            ${dotsHtml}
          </div>
          <div class="p-info">
            <div class="p-name">${p.name}</div>
            ${priceHtml}
            <div class="p-actions">
              <select class="p-size" id="size_${p.id}">
                ${sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
              <button class="p-add" onclick="addToCart('${p.id}')">AGREGAR</button>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
      container.innerHTML = "";
      container.appendChild(grid);
    }
    
    $("modalCatalog").classList.add("active");
    $("overlay").classList.add("active");
    document.body.classList.add("no-scroll");
  };

  window.addToCart = (id) => {
    const p = catalogData.products.find(x => x.id === id);
    if(!p) return;
    
    const sizeEl = $(`size_${id}`);
    const size = sizeEl ? sizeEl.value : "Unitalla";
    
    const item = cart.find(i => i.id === id && i.size === size);
    if(item) item.qty++;
    else cart.push({ id, size, qty:1, price: Number(p.baseMXN), name: p.name, img: p.img });
    
    saveCart(); updateCartUI();
    
    // VFX: Vibración Motor
    const btn = document.querySelector(".cartBtn");
    if(btn) {
       btn.classList.add("cart-rev");
       setTimeout(()=>btn.classList.remove("cart-rev"), 400);
    }
    
    if(typeof fbq === 'function') fbq('track', 'AddToCart');
    
    $("modalCatalog").classList.remove("active");
    $("overlay").classList.remove("active");
    document.body.classList.remove("no-scroll");
    window.toast("🏁 MOTOR EN MARCHA: AGREGADO");
  };

  // --- 4. ENVÍOS (Lógica API First + Fallback) ---
  function setupUI() {
    document.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", (e) => {
        const m = e.target.value;
        shippingState.mode = m;
        const form = $("shipForm");
        
        if(form) form.style.display = (m === "pickup") ? "none" : "block";
        
        // Reset Costos
        if (m === "pickup") {
            shippingState.cost = 0; 
            shippingState.label = "Gratis (Fábrica)";
        } else if (m === "tj") { 
            shippingState.cost = 200; 
            shippingState.label = "Local Express"; 
        } else {
            // Nacional o USA
            shippingState.label = "Calculando...";
            const cp = $("cp");
            // Si ya hay CP, cotizar. Si no, mostrar fallback visual temporal.
            if (cp && cp.value.length >= 5) quoteShipping(cp.value, m);
            else { 
                shippingState.cost = (m === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US; 
                shippingState.label = "Estándar (Pendiente CP)"; 
            }
        }
        updateCartUI();
      });
    });
    
    // Listener CP
    const cp = $("cp");
    if(cp) cp.addEventListener("blur", () => {
       if(["mx","us"].includes(shippingState.mode) && cp.value.length >= 5) {
           quoteShipping(cp.value, shippingState.mode);
       }
    });
  }

  async function quoteShipping(zip, mode) {
    if(!cart.length) return;
    $("shipTotal").innerHTML = '<span class="start-lights">...</span>';
    
    try {
      const countryCode = (mode === 'us') ? 'US' : 'MX';
      const qty = cart.reduce((a,b)=>a+b.qty,0);

      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, country: countryCode, items: qty })
      });
      
      if(!res.ok) throw new Error("API Error");
      
      const data = await res.json();
      if (data.success && data.cost) { 
          shippingState.cost = Number(data.cost); 
          shippingState.label = data.label || "Express (Envia.com)"; 
      } else {
          throw new Error("No quote data");
      }
    } catch (e) {
      console.warn("Shipping Fallback Active");
      shippingState.cost = (mode === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US;
      shippingState.label = "Estándar (Backup)";
    }
    updateCartUI();
  }

  // --- 5. RENDER Y UTILS ---
  function updateCartUI() {
    const el = $("cartItems"); if(!el) return;
    let sub = 0, qty = 0;
    
    if(!cart.length) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#999;">Tu carrito está vacío.</div>`;
      $("cartEmpty").style.display = "block";
    } else {
      $("cartEmpty").style.display = "none";
      el.innerHTML = cart.map((i, idx) => {
        sub += i.price * i.qty; qty += i.qty;
        return `
          <div class="cart-item">
             <img src="${cleanUrl(i.img)}" class="cart-thumb">
             <div class="cart-details">
               <div class="cart-title">${i.name}</div>
               <div class="cart-meta">${i.size}</div>
               <div class="cart-price">${money(i.price)} x ${i.qty}</div>
             </div>
             <div class="cart-remove" onclick="removeFromCart(${idx})">✕</div>
          </div>
        `;
      }).join("");
    }
    
    $("cartCount").innerText = qty;
    $("subTotal").innerText = money(sub);
    $("shipTotal").innerText = shippingState.label;
    $("grandTotal").innerText = money(sub + shippingState.cost);
  }

  window.checkout = async () => {
    if(!cart.length) return window.toast("Carrito vacío");
    const btn = $("checkoutBtn");
    
    if(shippingState.mode !== 'pickup' && (!$("name").value || !$("addr").value)) return window.toast("Faltan datos");
    
    btn.innerText = "INICIANDO..."; btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            items: cart, 
            mode: shippingState.mode, 
            promoCode: "LANZAMIENTO80", 
            customer: { name: $("name").value, address: $("addr").value, postal_code: $("cp").value } 
        })
      });
      const data = await res.json();
      if(data.url) location.href = data.url; else throw new Error(data.error);
    } catch { window.toast("Error de conexión"); btn.innerText = "PAGAR AHORA"; btn.disabled = false; }
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar todo?")) { cart=[]; saveCart(); updateCartUI(); } };
  window.toast = (msg) => { const t = $("toast"); t.innerText = msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"), 3000); };
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); document.body.classList.add("no-scroll"); };
  window.closeAll = () => { document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active")); document.body.classList.remove("no-scroll"); };
  window.scrollToId = (id) => { const el=document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth'}); };
  
  function loadCart() { const s = localStorage.getItem(CART_KEY); if(s) try{cart=JSON.parse(s)}catch{} }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  
  document.addEventListener("DOMContentLoaded", init);
})();
