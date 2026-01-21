(function () {
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const STRIPE_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  
  const CART_KEY = "score_cart_prod_v12";
  const API_BASE = "/.netlify/functions";

  // FLAGS 80% DESCUENTO
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 5; // Para simular 80% off: precio real * 5 = precio "antiguo"

  let cart = [];
  let catalogData = { products: [] };
  let shipMode = 'pickup';
  let shipCost = 0;
  let db = null;
  let stripe = null;
  let _currentCatalogItems = [];
  let selectedSizeByProduct = {};

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const cleanUrl = (url) => (url ? encodeURI(String(url)) : "");
  const safeText = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // --- SPLASH SAFETY ---
  function hideSplash() {
    const s = $("splash-screen");
    if (!s || s.classList.contains("hidden")) return;
    s.classList.add("hidden");
    document.body.classList.remove("noScroll");
    setTimeout(() => { try{s.remove()}catch{} }, 600);
  }
  setTimeout(hideSplash, 3000);
  window.addEventListener("load", () => setTimeout(hideSplash, 500));

  // --- INIT ---
  async function init() {
    if (typeof Stripe !== 'undefined') stripe = Stripe(STRIPE_KEY);
    if (window.supabase) {
        try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){}
    }

    await loadCatalog();
    loadCart();
    setupListeners();
    hideSplash();
  }

  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch { catalogData = { products: [] }; }
  }

  // --- CATALOG UI (MODAL) ---
  window.openCatalog = (sectionId, title) => {
    _currentCatalogItems = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = title;
    
    const container = $("catContent");
    if(!container) return;
    container.innerHTML = "";

    if(!_currentCatalogItems.length) {
        container.innerHTML = `<p style="text-align:center;padding:30px;">Próximamente disponible.</p>`;
    } else {
        const grid = document.createElement("div");
        grid.className = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
        
        _currentCatalogItems.forEach(p => {
            const card = document.createElement("div");
            card.className = "prodCard";
            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            const img = cleanUrl(p.img || "/assets/logo-score.webp");
            
            // Sizes
            const sizesHtml = (p.sizes || ["Unitalla"]).map((s,i) => 
                `<div class="size-pill ${i===0?'active':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</div>`
            ).join("");

            // Precios con "Fake Markup" para efecto oferta 80% OFF
            const sellPrice = p.baseMXN;
            const fakeOldPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            
            const priceHtml = PROMO_ACTIVE 
                ? `<div class="price-container">
                     <span class="old-price">${money(fakeOldPrice)}</span>
                     <span class="new-price">${money(sellPrice)}</span>
                   </div>`
                : `<div class="new-price" style="text-align:center">${money(sellPrice)}</div>`;

            // CARRUSEL DE IMÁGENES (Facebook Style)
            const images = p.images && p.images.length ? p.images : [p.img];
            const slidesHtml = images.map(src => 
                `<div class="prod-slide"><img src="${cleanUrl(src)}" class="prodImg" loading="lazy"></div>`
            ).join("");

            // Badge de oferta
            const badgeHtml = PROMO_ACTIVE 
                ? '<div class="promo-badge">-80%</div>' 
                : '';

            card.innerHTML = `
                <div class="metallic-frame">
                    ${badgeHtml}
                    <!-- Contenedor deslizable -->
                    <div class="prod-slider">
                        ${slidesHtml}
                    </div>
                    ${images.length > 1 ? '<div class="slider-dots" style="text-align:center;font-size:10px;color:#999">Desliza para ver más</div>' : ''}
                </div>
                <div class="prodName">${p.name}</div>
                ${priceHtml}
                <div class="sizeRow" id="sizes-${p.id}">${sizesHtml}</div>
                <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR AL PEDIDO</button>
            `;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
    
    openModal("modalCatalog");
  };

  window.selectSize = (btn, pid, size) => {
      const parent = btn.parentNode;
      parent.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.closest('.prodCard').dataset.selSize = size;
  };

  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      
      // Buscar en el DOM del modal abierto
      const cardBtn = document.querySelector(`button[onclick="addToCart('${pid}')"]`);
      const card = cardBtn ? cardBtn.closest('.prodCard') : null;
      const size = card ? card.dataset.selSize : "Unitalla";
      
      const cartId = `${pid}-${size}`;
      const existing = cart.find(x => x.cartItemId === cartId);
      
      if(existing) existing.qty++;
      else cart.push({
          id: p.id, name: p.name, price: p.baseMXN, img: p.img, 
          qty: 1, size: size, cartItemId: cartId, sku: p.sku
      });
      
      saveCart(); updateCartUI(); showToast("Agregado al pedido");
      openDrawer();
  };

  // --- CART & SHIPPING ---
  function setupListeners() {
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              shipMode = r.value;
              if(shipMode === 'pickup') {
                  shipCost = 0; $("shipForm").style.display = 'none';
              } else if(shipMode === 'mx') {
                  shipCost = 250; $("shipForm").style.display = 'block';
              } else {
                  shipCost = 800; $("shipForm").style.display = 'block';
              }
              updateCartUI();
          });
      });
      
      // Promo bar marquee logic if needed
      const marquee = document.getElementById("promo-text");
      if(marquee) marquee.innerText = "PIT-LANE ABIERTO · DROP LIMITADO · 80% OFF POR LANZAMIENTO";
  }

  function updateCartUI() {
      const box = $("cartItems");
      box.innerHTML = "";
      let sub = 0;
      
      if(!cart.length) {
          $("cartEmpty").style.display = "block";
          $("dFoot").style.display = "none"; // Ocultar footer si vacio? Mejor no, solo checkout btn
      } else {
          $("cartEmpty").style.display = "none";
      }

      cart.forEach((it, idx) => {
          sub += it.price * it.qty;
          box.innerHTML += `
            <div class="cartItem">
                <img src="${it.img}" class="cartThumb">
                <div class="cInfo">
                    <div class="cName">${it.name}</div>
                    <div class="cMeta">Talla: ${it.size}</div>
                    <div class="qtyRow">
                        <button class="qtyBtn" onclick="changeQty('${it.cartItemId}', -1)">-</button>
                        <span class="qtyVal">${it.qty}</span>
                        <button class="qtyBtn" onclick="changeQty('${it.cartItemId}', 1)">+</button>
                    </div>
                </div>
                <div class="cPrice">${money(it.price * it.qty)}</div>
                <div class="cart-remove" onclick="removeFromCart(${idx})">✕</div>
            </div>`;
      });
      
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      $("subTotal").innerText = money(sub);
      $("shipTotal").innerText = shipMode === 'pickup' ? 'Gratis' : money(shipCost);
      $("grandTotal").innerText = money(sub + shipCost);
  }

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.changeQty = (cid, d) => {
      const it = cart.find(x => x.cartItemId === cid);
      if(it) { it.qty += d; if(it.qty<=0) removeFromCart(cart.indexOf(it)); else {saveCart(); updateCartUI();} }
  };
  window.emptyCart = () => { if(confirm("¿Vaciar pedido?")) { cart=[]; saveCart(); updateCartUI(); } };

  // --- CHECKOUT ---
  window.checkout = async () => {
      if(!cart.length) return;
      const btn = $("checkoutBtn");

      if(shipMode !== 'pickup') {
          if(!$("cp").value || !$("name").value || !$("addr").value) {
              alert("Completa los datos de envío."); return;
          }
      }

      btn.disabled = true; btn.innerText = "PROCESANDO...";

      try {
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: 'POST', body: JSON.stringify({
                  cart, shippingMode: shipMode,
                  shippingData: { cp: $("cp").value, name: $("name").value, address: $("addr").value }
              })
          });
          const data = await res.json();
          if(data.url) location.href = data.url;
          else throw new Error(data.error);
      } catch(e) {
          alert("Error: " + e.message);
          btn.disabled = false; btn.innerText = "PAGAR AHORA";
      }
  };

  // --- UTILS ---
  window.openDrawer = () => openModal("drawer");
  window.closeAll = () => {
      document.querySelectorAll(".modal, .drawer").forEach(e => e.classList.remove("active"));
      $("overlay").classList.remove("active");
      document.body.classList.remove("noScroll");
  };
  function openModal(id) {
      $(id).classList.add("active");
      $("overlay").classList.add("active");
      document.body.classList.add("noScroll");
  }
  function showToast(m) {
      const t = $("toast"); t.innerText=m; t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 2000);
  }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { try{ cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch{cart=[];} }
  
  // Scroll reveal
  const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('visible'); });
  });
  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));

  function handleQueryActions() {
      const p = new URLSearchParams(location.search);
      if(p.get("status") === "success") {
          toast("¡Pedido Confirmado! Gracias.");
          cart = []; saveCart(); updateCartUI();
          history.replaceState({},"", "/");
      }
  }

  // BOOT
  document.addEventListener("DOMContentLoaded", init);

})();