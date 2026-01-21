(function () {
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const STRIPE_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_v_final";

  // --- CONFIG 80% OFF ---
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 5; // Multiplica precio real x5 para tacharlo

  let cart = [];
  let catalogData = { products: [] };
  let shipMode = 'pickup';
  let shipCost = 0;
  let db = null;
  let stripe = null;
  let selectedSizeByProduct = {};

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const cleanUrl = (url) => url ? encodeURI(url.trim()) : "";

  // --- SPLASH SAFETY ---
  function hideSplash() {
    const s = $("splash-screen");
    if (!s || s.classList.contains("hidden")) return;
    s.classList.add("hidden");
    document.body.classList.remove("modalOpen");
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

  // --- CATALOG MODAL (CON CARRUSEL & 80% OFF) ---
  window.openCatalog = (sectionId, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = title;
    
    const container = $("catContent");
    if(!container) return;
    container.innerHTML = "";

    if(!items.length) {
        container.innerHTML = `<p style="text-align:center;padding:30px;">Próximamente.</p>`;
    } else {
        const grid = document.createElement("div");
        grid.className = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
        
        items.forEach(p => {
            const card = document.createElement("div");
            card.className = "prodCard"; // Usamos tus estilos de tarjeta
            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            
            // Lógica 80% OFF Visual
            const sellPrice = Number(p.baseMXN);
            const listPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            
            const priceHtml = `
                <div class="price-container" style="display:flex; gap:10px; justify-content:center; align-items:baseline; margin:10px 0;">
                     <span class="old-price" style="text-decoration:line-through; color:#666; font-size:18px;">${money(listPrice)}</span>
                     <span class="new-price" style="color:#E10600; font-weight:bold; font-size:24px; font-family:'Teko'">${money(sellPrice)}</span>
                </div>`;

            // Lógica Carrusel (Imágenes deslizables)
            const images = p.images && p.images.length ? p.images : [p.img];
            const slidesHtml = images.map(src => 
                `<div class="prod-slide" style="min-width:100%; display:flex; justify-content:center;">
                    <img src="${cleanUrl(src)}" class="prodImg" style="width:100%; height:250px; object-fit:contain; mix-blend-mode:multiply;" loading="lazy">
                 </div>`
            ).join("");

            // Botones Talla
            const sizesHtml = (p.sizes || ["Unitalla"]).map((s,i) => 
                `<div class="size-pill ${i===0?'active':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</div>`
            ).join("");

            card.innerHTML = `
                <div class="metallic-frame" style="position:relative; overflow:hidden; border-radius:12px; margin-bottom:10px;">
                    <div class="promo-badge" style="position:absolute; top:0; right:0; background:#E10600; color:white; padding:4px 10px; font-weight:bold; z-index:10; font-family:'Teko'; font-size:18px;">-80%</div>
                    <div class="prod-slider" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;">
                        ${slidesHtml}
                    </div>
                    ${images.length > 1 ? '<div class="slider-dots" style="position:absolute; bottom:5px; width:100%; text-align:center; font-size:10px; color:#999; pointer-events:none;">● ● ●</div>' : ''}
                </div>
                <div style="text-align:center; padding:10px;">
                    <div class="prodName" style="font-weight:800; color:#111; margin-bottom:5px;">${p.name}</div>
                    ${priceHtml}
                    <div class="sizeRow" id="sizes-${p.id}" style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap; margin-bottom:15px;">
                        ${sizesHtml}
                    </div>
                    <button onclick="addToCart('${p.id}')" class="btn-add" style="background:#fff; border:2px solid #E10600; color:#E10600; width:100%; padding:12px; font-weight:900; border-radius:8px; cursor:pointer;">AGREGAR AL PEDIDO</button>
                </div>
            `;
            card.dataset.selSize = defSize;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
    
    // Abrir Modal
    const modal = $("modalCatalog");
    const overlay = $("overlay");
    modal.classList.add("active");
    overlay.classList.add("active");
    document.body.classList.add("modalOpen");
  };

  window.selectSize = (btn, pid, size) => {
      const container = btn.closest('.sizeRow');
      container.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.closest('.prodCard').dataset.selSize = size;
  };

  /* --- CART & SHIPPING --- */
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      
      const cardBtn = document.querySelector(`button[onclick="addToCart('${pid}')"]`);
      const card = cardBtn ? cardBtn.closest('.prodCard') : null;
      const size = card ? card.dataset.selSize : "Unitalla";
      
      const cartId = `${pid}-${size}`;
      const existing = cart.find(x => x.cartItemId === cartId);
      
      if(existing) existing.qty++;
      else cart.push({
          id: p.id, name: p.name, price: Number(p.baseMXN), 
          img: p.img, size: size, qty: 1, cartItemId: cartId, sku: p.sku
      });
      
      saveCart(); updateCartUI(); showToast("Agregado al pedido");
      // Abrir carrito automáticamente
      $("drawer").classList.add("active");
      $("overlay").classList.add("active");
  };

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
  }

  function updateCartUI() {
      const box = $("cartItems");
      if(!box) return;
      box.innerHTML = "";
      let sub = 0;

      if(!cart.length) {
          $("cartEmpty").style.display = "block";
      } else {
          $("cartEmpty").style.display = "none";
      }

      cart.forEach((it, idx) => {
          sub += it.price * it.qty;
          box.innerHTML += `
            <div class="cartItem" style="display:grid; grid-template-columns:70px 1fr 26px; gap:12px; padding:14px 0; border-bottom:1px solid #eee; align-items:center;">
                <img src="${cleanUrl(it.img)}" class="cartThumb" style="width:70px; height:90px; object-fit:contain; background:#fff; border-radius:10px;">
                <div class="cInfo">
                    <div class="cName" style="font-weight:900; font-size:14px; color:#111;">${it.name}</div>
                    <div class="cMeta" style="font-size:12px; color:#666;">Talla: ${it.size}</div>
                    <div class="qtyRow" style="margin-top:5px;">x${it.qty}</div>
                </div>
                <div onclick="removeFromCart(${idx})" style="color:#ccc; cursor:pointer;">✕</div>
            </div>`;
      });
      
      $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      $("subTotal").innerText = money(sub);
      $("shipTotal").innerText = shipMode === 'pickup' ? 'Gratis' : money(shipCost);
      $("grandTotal").innerText = money(sub + shipCost);
  }

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar pedido?")) { cart=[]; saveCart(); updateCartUI(); } };

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
              method: 'POST', 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  cart, shippingMode: shipMode,
                  promoCode: "LANZAMIENTO80", // Código interno para backend
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

  /* --- UTILS --- */
  window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); document.body.classList.add("modalOpen"); };
  window.closeAll = () => { document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active")); document.body.classList.remove("modalOpen"); };
  window.scrollToId = (id) => { const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'}); };
  
  function showToast(m) {
      const t = $("toast"); t.innerText=m; t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 2000);
  }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { try{ cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch{cart=[];} }
  
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      const observer = new IntersectionObserver(entries => {
          entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("visible"); });
      }, { threshold: 0.1 });
      els.forEach(el => observer.observe(el));
  }

  document.addEventListener("DOMContentLoaded", init);
})();