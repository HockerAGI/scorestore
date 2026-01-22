/* =========================================
   SCORE STORE LOGIC — DARK RACING PRO v5.0
   - Lógica: API First + Fallback Seguro
   - Animaciones: Integración con CSS Racing Pack
   ========================================= */

(function () {
  "use strict";

  // --- CONFIGURACIÓN ---
  const API_BASE = (location.hostname === "localhost") ? "/api" : "/.netlify/functions";
  const CART_KEY = "score_cart_final_v10";
  
  // LÓGICA COMERCIAL (Rescatada de archivos viejos)
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 4.5; // Factor para precios tachados (Psicología)
  
  // COSTOS DE RESPALDO (Safety Net)
  // Solo se usan si la API falla o tarda mucho
  const FALLBACK_COST_MX = 250; 
  const FALLBACK_COST_US = 800;

  // Estado Global
  let cart = [];
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica TJ)" };
  let catalogData = { products: [] }; // Se llenará con el JSON

  // Helpers DOM
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  // --- 1. SPLASH SCREEN (Safety Logic) ---
  function hideSplash() {
    const s = $("splash-screen");
    if (s && !s.classList.contains("hide")) {
      s.classList.add("hide");
      // Detener scroll lock si existiera
      document.body.classList.remove("no-scroll");
      setTimeout(() => { try { s.remove(); } catch {} }, 700);
    }
  }

  async function init() {
    // Timeout de seguridad: Si algo falla, abre la tienda en 4s
    setTimeout(hideSplash, 4000);

    await loadCatalog();
    loadCart();
    setupUI();
    updateCartUI();
    
    // Pixel Init
    if(typeof fbq === 'function') fbq('track', 'ViewContent');

    // Todo listo, quitar splash
    hideSplash();
  }

  // --- 2. GESTIÓN DE DATOS ---
  async function loadCatalog() {
    try {
      // Usamos JSON estático para velocidad máxima
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch (e) {
      console.error("Error catálogo", e);
      catalogData.products = [];
    }
  }

  function loadCart() {
    const s = localStorage.getItem(CART_KEY);
    if(s) try { cart = JSON.parse(s); } catch {}
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  // --- 3. UI & ANIMACIONES ---
  
  // Abrir Catálogo (Renderizado Dinámico)
  window.openCatalog = (sectionId) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    const container = $("catContent");
    const titleEl = $("catTitle");
    if(titleEl) titleEl.innerText = "COLECCIÓN OFICIAL";

    if(!container) return;
    
    if(!items.length) {
      container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Agotado temporalmente.</div>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "grid"; 
      
      items.forEach(p => {
        // Lógica de Precios Tachados
        const price = Number(p.baseMXN || 0);
        const fakePrice = Math.round(price * FAKE_MARKUP_FACTOR);
        const priceHtml = PROMO_ACTIVE 
          ? `<div class="pPrices"><span class="pOld">${money(fakePrice)}</span><span class="pNew">${money(price)}</span></div>`
          : `<div class="pPrices"><span class="pNew">${money(price)}</span></div>`;

        const img = p.img || (p.images && p.images[0]) || "";
        const sizes = p.sizes || ["Unitalla"];

        const card = document.createElement("div");
        card.className = "pCard";
        card.innerHTML = `
          <div class="pMedia">
            ${PROMO_ACTIVE ? '<div class="pBadge">-80%</div>' : ''}
            <img src="${cleanUrl(img)}" class="pImg" loading="lazy" alt="${p.name}">
          </div>
          <div class="pBody">
            <div class="pName">${p.name}</div>
            ${priceHtml}
            <div class="pActions">
              <select class="pSize" id="size_${p.id}">
                ${sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
              <button class="pAdd" onclick="addToCart('${p.id}')">AGREGAR</button>
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

  // Añadir al Carrito con Efecto
  window.addToCart = (id) => {
    const p = catalogData.products.find(x => x.id === id);
    if(!p) return;
    
    const sizeEl = $(`size_${id}`);
    const size = sizeEl ? sizeEl.value : (p.sizes?.[0] || "Unitalla");
    
    const item = cart.find(i => i.id === id && i.size === size);
    if(item) item.qty++;
    else cart.push({ id, size, qty:1, price: Number(p.baseMXN), name: p.name, img: p.img });
    
    saveCart(); updateCartUI();
    
    // VFX: Vibración del botón del carrito
    const btn = document.querySelector(".cartBtn");
    if(btn) {
      btn.classList.add("cart-rev"); // Clase de animación en CSS
      setTimeout(() => btn.classList.remove("cart-rev"), 400);
    }
    
    if(typeof fbq === 'function') fbq('track', 'AddToCart');
    
    // Cerrar modal y mostrar feedback
    $("modalCatalog").classList.remove("active");
    $("overlay").classList.remove("active");
    document.body.classList.remove("no-scroll");
    window.toast("🏁 AGREGADO AL PEDIDO");
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar todo?")) { cart=[]; saveCart(); updateCartUI(); } };

  // --- 4. ENVÍOS (Lógica API First) ---
  function setupUI() {
    document.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", (e) => {
        const m = e.target.value;
        shippingState.mode = m;
        const form = $("shipForm");
        const cp = $("cp");
        
        // Reset
        form.style.display = "none";
        shippingState.cost = 0;

        if (m === "pickup") {
          shippingState.label = "Gratis (Fábrica)";
        } 
        else if (m === "tj") {
          shippingState.cost = 200; 
          shippingState.label = "Local Express";
          form.style.display = "block";
        }
        else {
          // Nacional o USA
          shippingState.label = "Calculando...";
          form.style.display = "block";
          
          if (cp && cp.value.length >= 5) {
            quoteShipping(cp.value, m);
          } else {
            // Mostrar costo "Base" mientras escriben
            shippingState.cost = (m === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US;
            shippingState.label = "Estándar (Pendiente CP)";
          }
        }
        updateCartUI();
      });
    });

    // Escuchar input de CP
    const cp = $("cp");
    if(cp) {
      cp.addEventListener("blur", () => {
        const m = shippingState.mode;
        if ((m === 'mx' || m === 'us') && cp.value.length >= 5) quoteShipping(cp.value, m);
      });
    }
  }

  async function quoteShipping(zip, mode) {
    if(!cart.length) return;
    $("shipTotal").innerHTML = '<span class="start-lights">Cotizando</span>'; // Animación luces

    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, country: (mode === 'us') ? 'US' : 'MX', items: cart.reduce((a,b)=>a+b.qty,0) })
      });
      
      if (!res.ok) throw new Error("API Error");
      
      const data = await res.json();
      if (data.success && data.cost) {
        shippingState.cost = Number(data.cost);
        shippingState.label = data.label || "Express (Envia.com)";
      } else {
        throw new Error("No quote");
      }
    } catch (e) {
      // FALLBACK SILENCIOSO
      shippingState.cost = (mode === 'mx') ? FALLBACK_COST_MX : FALLBACK_COST_US;
      shippingState.label = "Envío Estándar";
    }
    updateCartUI();
  }

  // --- 5. RENDERIZADO CARRITO ---
  function updateCartUI() {
    const el = $("cartItems");
    if(!el) return;
    
    let sub = 0, qty = 0;
    
    if(!cart.length) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#666;">Tu carrito está vacío.<br>Aprovecha el 80% OFF.</div>`;
      $("cartEmpty").style.display = "block";
    } else {
      $("cartEmpty").style.display = "none";
      el.innerHTML = cart.map((i, idx) => {
        sub += i.price * i.qty;
        qty += i.qty;
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

  // --- 6. CHECKOUT ---
  window.checkout = async () => {
    if(!cart.length) return window.toast("Carrito vacío");
    const btn = $("checkoutBtn");
    
    if(shippingState.mode !== 'pickup') {
      if(!$("name").value || !$("addr").value || !$("cp").value) return window.toast("Faltan datos de envío");
    }
    
    btn.innerText = "INICIANDO CARRERA";
    btn.classList.add("start-lights");
    btn.disabled = true;
    
    if(typeof fbq === 'function') fbq('track', 'InitiateCheckout');

    try {
      const payload = {
        items: cart,
        mode: shippingState.mode,
        promoCode: "LANZAMIENTO80",
        customer: { name: $("name").value, address: $("addr").value, postal_code: $("cp").value }
      };

      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if(data.url) location.href = data.url;
      else throw new Error(data.error);
      
    } catch (e) {
      window.toast("Error, intenta de nuevo");
      btn.innerText = "PAGAR AHORA";
      btn.classList.remove("start-lights");
      btn.disabled = false;
    }
  };

  // --- 7. UTILS ---
  window.toast = (msg) => {
    const t = $("toast");
    t.innerText = msg; t.classList.add("show");
    setTimeout(()=>t.classList.remove("show"), 3000);
  };
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); document.body.classList.add("no-scroll"); };
  window.closeAll = () => { 
    document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active")); 
    document.body.classList.remove("no-scroll");
  };
  window.scrollToId = (id) => document.getElementById(id).scrollIntoView({behavior:'smooth'});

  // BOOT
  document.addEventListener("DOMContentLoaded", init);
})();
