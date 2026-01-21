/* SCORE STORE LOGIC — DARK RACING PRO v15.0 */

(function () {
  // --- CONFIGURACIÓN ---
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
  const STRIPE_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_v15";

  // --- FLAGS DE LANZAMIENTO (80% OFF) ---
  const PROMO_ACTIVE = true;
  const FAKE_MARKUP_FACTOR = 5; // Precio Lista = Precio Real * 5 (Para simular 80% descuento)

  // Estado
  let cart = [];
  let catalogData = { products: [], sections: [] };
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
  let selectedSizeByProduct = {};
  let db = null;
  let stripe = null;

  // Helpers
  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (url) => url ? encodeURI(url.trim()) : "";

  // --- SPLASH SCREEN (SAFETY FIRST) ---
  function hideSplash() {
    const s = $("splash-screen");
    if (!s || s.classList.contains("hidden")) return;
    s.classList.add("hidden");
    document.body.classList.remove("modalOpen"); // Desbloquear scroll
    setTimeout(() => { try { s.remove(); } catch {} }, 800);
  }
  // Garantía absoluta: Se quita a los 3.5s pase lo que pase
  setTimeout(hideSplash, 3500); 
  window.addEventListener("load", () => setTimeout(hideSplash, 1000));

  // --- INIT ---
  async function init() {
    if (typeof Stripe !== 'undefined') stripe = Stripe(STRIPE_KEY);
    if (window.supabase) {
        try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){}
    }

    // Cargar datos
    await Promise.all([loadCatalog()]);
    loadCart();
    
    // UI Init
    setupListeners();
    updateCartUI();
    initScrollReveal();

    // Actualizar Promo Bar
    const promoText = $("promo-text");
    if(promoText) promoText.innerText = "🔥 80% DE DESCUENTO POR LANZAMIENTO - SOLO HOY 🔥";
    const promoBar = $("promo-bar");
    if(promoBar) promoBar.style.display = "flex";

    hideSplash();
  }

  async function loadCatalog() {
    try {
      // Intentar cargar de DB si existe, sino local
      if(db) {
         // Aquí iría lógica DB, por ahora usamos JSON local para velocidad y robustez inicial
      }
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch { catalogData = { products: [] }; }
  }

  // --- CATALOG MODAL ---
  window.openCatalog = (sectionId, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").innerText = title;
    
    const container = $("catContent");
    if(!container) return;
    container.innerHTML = "";

    if(!items.length) {
        container.innerHTML = `<p style="text-align:center;padding:40px;color:#ccc;">Agotado.</p>`;
    } else {
        const grid = document.createElement("div");
        grid.className = "grid"; 
        
        items.forEach(p => {
            const card = document.createElement("div");
            card.className = "champItem prodCard"; // Mezcla estilos para asegurar layout
            card.style.height = "auto"; // Auto height para contenido
            card.style.minHeight = "420px";

            const defSize = (p.sizes && p.sizes[0]) ? p.sizes[0] : "Unitalla";
            
            // Lógica de Precios (Oferta 80%)
            const sellPrice = Number(p.baseMXN);
            const listPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            
            const priceHtml = `
                <div class="price-container" style="display:flex; gap:10px; justify-content:center; align-items:baseline; margin:10px 0;">
                     <span style="text-decoration:line-through; color:#666; font-size:18px;">${money(listPrice)}</span>
                     <span style="color:#E10600; font-weight:bold; font-size:24px; font-family:'Teko'">${money(sellPrice)}</span>
                </div>`;

            // Carrusel de Imágenes
            const images = p.images && p.images.length ? p.images : [p.img];
            const slidesHtml = images.map(src => 
                `<div class="prod-slide" style="min-width:100%;"><img src="${cleanUrl(src)}" class="prodImg" style="width:100%;height:250px;object-fit:contain;" loading="lazy"></div>`
            ).join("");

            // Tallas
            const sizesHtml = (p.sizes || ["Unitalla"]).map((s,i) => 
                `<button class="size-pill ${i===0?'active':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</button>`
            ).join("");

            card.innerHTML = `
                <div class="metallic-frame" style="position:relative; overflow:hidden; border-radius:12px; margin-bottom:10px;">
                    <div class="promo-badge" style="position:absolute; top:0; right:0; background:#E10600; color:white; padding:4px 10px; font-weight:bold; z-index:10;">-80%</div>
                    <div class="prod-slider" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory;">
                        ${slidesHtml}
                    </div>
                </div>
                <div style="text-align:center; padding:10px;">
                    <div style="font-weight:800; color:#111; margin-bottom:5px;">${p.name}</div>
                    ${priceHtml}
                    <div class="sizeRow" id="sizes-${p.id}" style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap; margin-bottom:15px;">
                        ${sizesHtml}
                    </div>
                    <button onclick="addToCart('${p.id}')" style="background:#E10600; color:white; border:none; padding:12px; width:100%; font-weight:bold; border-radius:6px; cursor:pointer;">AGREGAR</button>
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
      // Navegar DOM relativo para no afectar otros productos
      const container = btn.closest('.sizeRow');
      container.querySelectorAll('.size-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.closest('.prodCard').dataset.selSize = size;
  };

  /* --- CART & CHECKOUT --- */
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      
      // Encontrar el card en el DOM para saber la talla seleccionada
      // Usamos un selector inteligente basado en el botón clickeado
      const allBtns = document.querySelectorAll(`button[onclick="addToCart('${pid}')"]`);
      // Como puede haber duplicados, buscamos el que está visible en el modal
      let card = null;
      allBtns.forEach(b => {
          if(b.closest('#modalCatalog')) card = b.closest('.prodCard');
      });
      
      const size = card ? card.dataset.selSize : "Unitalla";
      const cartId = `${pid}-${size}`;
      
      const exist = cart.find(x => x.cartItemId === cartId);
      if(exist) exist.qty++;
      else cart.push({
          id: p.id, name: p.name, price: Number(p.baseMXN), 
          img: p.img, size: size, qty: 1, cartItemId: cartId, sku: p.sku
      });
      
      saveCart(); updateCartUI(); showToast("Agregado al carrito");
      
      // Cerrar catálogo y abrir carrito para flujo rápido
      closeAll();
      openDrawer();
  };

  window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar carrito?")) { cart=[]; saveCart(); updateCartUI(); } };

  function setupListeners() {
      // Shipping Radios
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              shippingState.mode = r.value;
              const form = $("shipForm");
              
              if(r.value === 'pickup') {
                  shippingState.cost = 0; 
                  shippingState.label = "Gratis";
                  form.style.display = "none";
              } else {
                  // Tarifas Fijas Actualizadas
                  shippingState.cost = (r.value === 'mx') ? 250 : 800;
                  shippingState.label = (r.value === 'mx') ? "Envío Nacional" : "Envío USA";
                  form.style.display = "block";
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
            <div style="display:flex; gap:10px; padding:10px; border-bottom:1px solid #eee; align-items:center;">
                <img src="${cleanUrl(it.img)}" style="width:60px; height:60px; object-fit:contain; background:#fff; border-radius:4px;">
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:14px; color:#111;">${it.name}</div>
                    <div style="font-size:12px; color:#666;">${it.size} x ${it.qty}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:#E10600;">${money(it.price * it.qty)}</div>
                    <div onclick="removeFromCart(${idx})" style="color:#999; font-size:12px; cursor:pointer; margin-top:4px;">Eliminar</div>
                </div>
            </div>`;
      });

      if($("cartCount")) $("cartCount").innerText = cart.reduce((a,b)=>a+b.qty,0);
      if($("subTotal")) $("subTotal").innerText = money(sub);
      if($("shipTotal")) $("shipTotal").innerText = shippingState.mode === 'pickup' ? 'Gratis' : money(shippingState.cost);
      if($("grandTotal")) $("grandTotal").innerText = money(sub + shippingState.cost);
  }

  window.checkout = async () => {
      if(!cart.length) return;
      const btn = $("checkoutBtn");
      
      // Validar Envío
      if(shippingState.mode !== 'pickup') {
          if(!$("cp").value || !$("name").value || !$("addr").value) {
              alert("Por favor completa los datos de envío."); return;
          }
      }

      btn.disabled = true; btn.innerText = "PROCESANDO...";

      try {
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: 'POST', 
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  cart, 
                  shippingMode: shippingState.mode,
                  promoCode: "LANZAMIENTO80",
                  shippingData: { 
                      cp: $("cp")?.value, 
                      name: $("name")?.value, 
                      address: $("addr")?.value 
                  }
              })
          });
          const data = await res.json();
          if(data.url) location.href = data.url;
          else throw new Error(data.error || "Error al iniciar pago");
      } catch(e) {
          alert("Error: " + e.message);
          btn.disabled = false; btn.innerText = "PAGAR AHORA";
      }
  };

  /* --- UTILS --- */
  window.openDrawer = () => { 
      $("drawer").classList.add("active"); 
      $("overlay").classList.add("active");
      document.body.classList.add("modalOpen");
  };
  
  window.closeAll = () => {
      document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active"));
      document.body.classList.remove("modalOpen");
  };
  
  window.scrollToId = (id) => { const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'}); };

  function showToast(m) {
      const t = $("toast"); t.innerText=m; t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 2000);
  }

  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { try{ cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch{cart=[];} }
  
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      const io = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting) e.target.classList.add("visible") }));
      els.forEach(el => io.observe(el));
  }

  document.addEventListener("DOMContentLoaded", init);
})();