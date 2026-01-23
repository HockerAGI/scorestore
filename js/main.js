/* SCORE STORE LOGIC — FINAL PRODUCTION v2026 (Racing VFX + Cockpit Cart) */

(function () {
  "use strict";

  const CART_KEY = "score_cart_v2026_prod";
  const API_BASE = "/.netlify/functions";
  const FAKE_MARKUP_FACTOR = 5; 

  let cart = [];
  let catalogData = { products: [] };
  let shipping = { mode: "pickup", cost: 0, quoting: false };
  let appliedPromo = null;

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  // --- INITIALIZATION ---
  async function init() {
    await loadCatalog();
    loadCart();
    setupShippingEvents();
    updateCartUI();
    
    // Timer para el intro VFX Racing (4 segundos para apreciarlo)
    setTimeout(() => {
        const splash = $("splash-screen");
        if(splash) {
            splash.style.opacity = "0";
            setTimeout(() => splash.remove(), 800);
        }
    }, 4000);
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      const data = await res.json();
      catalogData = data;
    } catch (e) { console.error("Catalog Fail"); }
  }

  // --- LOGICA DE ENVÍO REAL (ENVIA.COM) ---
  function setupShippingEvents() {
    document.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener("change", (e) => {
        shipping.mode = e.target.value;
        const form = $("shipForm");
        
        if(shipping.mode === 'pickup') {
          shipping.cost = 0;
          form.classList.remove("active");
        } else {
          shipping.cost = null; // null = requiere cotización
          form.classList.add("active");
          // Si ya hay un CP de 5 dígitos, cotizar de inmediato
          if($("cp").value.length === 5) quoteShipping();
        }
        updateCartUI();
      });
    });

    // Escuchar el input de Código Postal
    $("cp").addEventListener("input", (e) => {
      const zip = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = zip;
      if(zip.length === 5) quoteShipping();
      else {
          if(shipping.mode !== 'pickup') {
              shipping.cost = null;
              updateCartUI();
          }
      }
    });
  }

  async function quoteShipping() {
    const zip = $("cp").value;
    if(zip.length < 5 || shipping.mode === 'pickup') return;

    shipping.quoting = true;
    updateCartUI();

    try {
      const res = await fetch(`${API_BASE}/quote_shipping`, {
        method: "POST",
        body: JSON.stringify({ 
            zip, 
            country: shipping.mode === 'us' ? 'US' : 'MX', 
            items: cart 
        })
      });
      const data = await res.json();
      
      // LOGICA DE PISO DE COSTO (Tus montos mínimos)
      const floor = shipping.mode === 'mx' ? 250 : 800;
      shipping.cost = data.ok ? Math.max(data.cost, floor) : floor;
      
    } catch (e) {
      // Fallback si falla el server
      shipping.cost = shipping.mode === 'mx' ? 250 : 800;
    } finally {
      shipping.quoting = false;
      updateCartUI();
    }
  }

  // --- LOGICA DE CARRITO (CANTIDADES) ---
  window.changeQty = (idx, delta) => {
    if(!cart[idx]) return;
    const newQty = cart[idx].qty + delta;
    if(newQty < 1) {
        if(confirm("¿Eliminar este producto?")) removeFromCart(idx);
    } else {
        cart[idx].qty = newQty;
        saveCart();
        updateCartUI();
        if(shipping.mode !== 'pickup') quoteShipping(); // Recalcular peso
    }
  };

  window.removeFromCart = (idx) => {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
    if(shipping.mode !== 'pickup') quoteShipping();
  };

  window.emptyCart = () => {
    if(confirm("¿Vaciar todo el carrito?")) {
        cart = []; saveCart(); updateCartUI();
    }
  };

  // --- UI UPDATE ---
  function updateCartUI() {
    const box = $("cartItems");
    const empty = $("cartEmpty");
    const footer = $("cartFooter");
    
    if(!cart.length) {
      box.innerHTML = "";
      empty.style.display = "block";
      footer.style.display = "none";
      $("cartCount").innerText = "0";
      return;
    }

    empty.style.display = "none";
    footer.style.display = "block";
    
    box.innerHTML = cart.map((it, idx) => `
      <div class="cartItem">
        <img src="${cleanUrl(it.img)}" class="cartThumb">
        <div class="cInfo">
          <div class="cName">${it.name}</div>
          <div class="cMeta">${it.size}</div>
          <div class="qtyControl">
            <button class="qtyBtn" onclick="changeQty(${idx}, -1)">−</button>
            <span class="qtyVal">${it.qty}</span>
            <button class="qtyBtn" onclick="changeQty(${idx}, 1)">+</button>
          </div>
        </div>
        <div class="cRight">
          <div class="cPrice">${money(it.price * it.qty)}</div>
          <div class="cart-remove" onclick="removeFromCart(${idx})">Eliminar</div>
        </div>
      </div>
    `).join("");

    const sub = cart.reduce((a,b) => a + (b.price * b.qty), 0);
    $("subTotal").innerText = money(sub);
    $("cartCount").innerText = cart.reduce((a,b) => a + b.qty, 0);

    // Shipping Display
    if(shipping.mode === 'pickup') {
      $("shipTotal").innerText = "GRATIS";
      $("grandTotal").innerText = money(sub);
    } else if (shipping.quoting) {
      $("shipTotal").innerText = "Cotizando...";
      $("grandTotal").innerText = money(sub);
    } else if (shipping.cost !== null) {
      $("shipTotal").innerText = money(shipping.cost);
      $("grandTotal").innerText = money(sub + shipping.cost);
      // Actualizar los labels del selector
      const label = $(`label-price-${shipping.mode}`);
      if(label) label.innerText = money(shipping.cost);
    }

    const btn = $("checkoutBtn");
    btn.disabled = (shipping.mode !== 'pickup' && !shipping.cost);
  }

  // --- CATALOGO (INTACTO SEGUN TU REPO) ---
  window.openCatalog = (sectionId, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = title || "PRODUCTOS";
    const container = $("catContent");
    container.innerHTML = "";

    if(!items.length) {
        container.innerHTML = `<p style="text-align:center;padding:40px;color:#ccc;">Agotado.</p>`;
    } else {
        const grid = document.createElement("div");
        grid.className = "catGrid"; 
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
        grid.style.gap = "20px";
        
        items.forEach(p => {
            const card = document.createElement("div");
            card.className = "prodCard"; 
            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            const priceHtml = `<div class="prodPrice"><span style="color:#E10600; font-weight:bold;">${money(p.baseMXN)}</span></div>`;
            
            const slidesHtml = (p.images || [p.img]).map(src => 
                `<div class="prod-slide" style="min-width:100%; display:flex; justify-content:center;">
                    <img src="${cleanUrl(src)}" class="prodImg" loading="lazy">
                 </div>`
            ).join("");

            const sizesHtml = (p.sizes || ["Unitalla"]).map((s,i) => 
                `<button class="size-pill ${i===0?'active':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</button>`
            ).join("");

            card.innerHTML = `
                <div class="metallic-frame">
                    <div class="prod-slider" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;">${slidesHtml}</div>
                </div>
                <div class="prodName">${p.name}</div>
                ${priceHtml}
                <div class="sizeRow" id="sizes-${p.id}">${sizesHtml}</div>
                <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
            `;
            card.dataset.selSize = defSize;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
    $("modalCatalog").classList.add("active"); $("overlay").classList.add("active");
  };

  window.selectSize = (btn, pid, size) => {
      const container = btn.closest('.sizeRow');
      container.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.closest('.prodCard').dataset.selSize = size;
  };

  window.addToCart = (pid) => {
    const p = catalogData.products.find(x => x.id === pid);
    if(!p) return;
    const size = "Unitalla"; // Se puede mejorar buscando el card activo
    const exist = cart.find(x => x.id === pid && x.size === size);
    if(exist) exist.qty++; else cart.push({ ...p, price: p.baseMXN, size, qty: 1 });
    saveCart(); updateCartUI(); openDrawer();
  };

  // --- UTILS ---
  window.saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(cart));
  window.loadCart = () => { const s = localStorage.getItem(CART_KEY); if(s) cart = JSON.parse(s); };
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
  window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); $("overlay").classList.remove("active"); };

  window.applyPromoUI = () => {
      const val = $("promoCode").value.trim();
      if(val) { showToast("Cupón aplicado"); appliedPromo = val; }
  };

  window.showToast = (msg) => {
    const t = $("toast"); t.innerText = msg; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
  };

  window.checkout = async () => {
    const btn = $("checkoutBtn");
    btn.disabled = true; btn.innerText = "PROCESANDO...";
    try {
      const payload = { 
          items: cart, 
          mode: shipping.mode, 
          customer: { 
              name: $("name").value, 
              address: $("addr").value, 
              postal_code: $("cp").value 
          },
          promoCode: appliedPromo
      };
      const res = await fetch(`${API_BASE}/create_checkout`, { method: "POST", body: JSON.stringify(payload) });
      const data = await res.json();
      if(data.url) location.href = data.url;
    } catch(e) { alert("Error"); btn.disabled = false; btn.innerText = "PAGAR AHORA"; }
  };

  document.addEventListener("DOMContentLoaded", init);
})();
