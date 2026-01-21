/* SCORE STORE LOGIC — UNIFIED v3.0 (FINAL PRODUCTION) */

(function() {
  // --- 1. SAFETY SPLASH (ANTIBLOQUEO) ---
  // Se ejecuta inmediatamente para garantizar acceso
  const safeHideSplash = () => {
    const s = document.getElementById("splash-screen");
    if (s && !s.classList.contains("hidden")) {
      s.classList.add("hidden");
      document.body.classList.remove("modalOpen"); // Desbloquear scroll del CSS
      console.log("🚀 Motor iniciado (Safety Check)");
    }
  };
  // Forzar entrada máxima a los 3.5 segundos pase lo que pase
  setTimeout(safeHideSplash, 3500);
  window.addEventListener("load", () => setTimeout(safeHideSplash, 800));

  // --- 2. CONFIGURACIÓN ---
  // Prioriza la config inyectada en el HTML, fallback a hardcoded
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";
  // Stripe Public Key Real
  const STRIPE_KEY = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";

  const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "/api" : "/.netlify/functions";
  const CART_KEY = "score_cart_prod_v5";

  // Flags de Negocio
  let PROMO_ACTIVE = true;
  let FAKE_MARKUP_FACTOR = 1.3; // Simula precio "antes" para el descuento
  
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

  /* ---------------- INIT ---------------- */
  async function init() {
    // Inicializar SDKs
    if (typeof Stripe !== 'undefined') stripe = Stripe(STRIPE_KEY);
    if (window.supabase) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    loadCart();
    setupListeners();
    initScrollReveal();

    // Carga de Datos (Híbrida: DB > Local)
    try {
      if (db) {
         await Promise.all([loadCatalogFromDB(), loadSiteConfig()]);
      } else {
         throw new Error("No DB client");
      }
    } catch (e) {
      console.warn("Usando catálogo local (Fallback):", e);
      await loadCatalogLocal();
    }

    updateCartUI();
    handleQueryActions();
    
    // Éxito: Quitar Splash
    safeHideSplash();
  }

  /* ---------------- DATA LAYERS ---------------- */
  async function loadSiteConfig() {
    if (!db) return;
    try {
        const { data: org } = await db.from('organizations').select('id').eq('slug', 'score-store').single();
        if(!org) return;
        
        const { data: config } = await db.from('site_settings').select('*').eq('org_id', org.id).single();
        if (config) {
            if (config.hero_title) {
                const h1 = $("hero-title");
                if(h1) h1.innerHTML = config.hero_title;
            }
            // Control de Promo Bar
            const bar = $("promo-bar");
            if (config.promo_active) {
                PROMO_ACTIVE = true;
                if(bar) {
                    bar.style.display = "flex";
                    const txt = $("promo-text");
                    if(txt) txt.innerHTML = config.promo_text || "🔥 OFERTAS ACTIVAS 🔥";
                }
            } else {
                PROMO_ACTIVE = false;
                if(bar) bar.style.display = "none";
            }
        }
    } catch (e) { console.log("Config load skip"); }
  }

  async function loadCatalogFromDB() {
    const { data: org } = await db.from('organizations').select('id').eq('slug', 'score-store').single();
    if(!org) throw new Error("Org not found");

    const { data: products } = await db.from('products').select('*').eq('org_id', org.id).eq('active', true);
    if(!products) throw new Error("No products");

    catalogData.products = products.map(p => ({
      id: p.id, 
      name: p.name, 
      baseMXN: Number(p.price), 
      sectionId: p.category || 'BAJA_1000',
      // Lógica de imágenes (Array o Single)
      img: p.image_url,
      images: p.images && p.images.length > 0 ? p.images : [p.image_url], 
      sizes: p.sizes || ["S","M","L","XL","2XL"], 
      sku: p.sku
    }));

    // Secciones estáticas (Identidad Visual)
    catalogData.sections = [
       { "id": "BAJA_1000", "logo": "/assets/logo-baja1000.webp" },
       { "id": "BAJA_500", "logo": "/assets/logo-baja500.webp" },
       { "id": "BAJA_400", "logo": "/assets/logo-baja400.webp" },
       { "id": "SF_250", "logo": "/assets/logo-sf250.webp" }
    ];
  }

  async function loadCatalogLocal() {
    const res = await fetch("/data/catalog.json");
    const json = await res.json();
    catalogData = json;
  }

  /* ---------------- CATALOG UI (CARRUSEL & MODAL) ---------------- */
  window.openCatalog = (sectionId, titleFallback) => {
    // Filtrado Flexible (ID exacto o coincidencia de texto)
    const items = catalogData.products.filter(p => 
        (p.sectionId === sectionId) || 
        (p.name && p.name.toUpperCase().includes(sectionId.replace('_',' ')))
    );

    // Header del Modal
    const titleEl = $("catTitle");
    const sectionInfo = catalogData.sections.find(s => s.id === sectionId);
    
    if (sectionInfo && sectionInfo.logo) {
        titleEl.innerHTML = `<img src="${cleanUrl(sectionInfo.logo)}" style="height:60px;width:auto;filter:brightness(0) invert(1);">`;
    } else {
        titleEl.innerText = titleFallback || "COLECCIÓN";
    }

    const container = $("catContent");
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Inventario agotado o no disponible.</div>`;
    } else {
        const grid = document.createElement("div"); 
        grid.className = "grid"; // Usa tu clase .grid del CSS
        grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))"; // Override para modal

        items.forEach(p => {
            // Tallas
            const sizes = p.sizes || ["Unitalla"];
            if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];
            
            const sizesHtml = sizes.map(sz => {
                const active = (selectedSizeByProduct[p.id] === sz) ? "active" : "";
                return `<button class="size-pill ${active}" onclick="selectSize('${p.id}', '${sz}')">${sz}</button>`;
            }).join("");

            // Precios con "Fake Markup" para efecto oferta
            const sellPrice = p.baseMXN;
            const fakeOldPrice = Math.round(sellPrice * FAKE_MARKUP_FACTOR);
            
            const priceHtml = PROMO_ACTIVE 
                ? `<div class="price-container">
                     <span class="old-price">${money(fakeOldPrice)}</span>
                     <span class="new-price">${money(sellPrice)}</span>
                   </div>`
                : `<div class="new-price" style="text-align:center">${money(sellPrice)}</div>`;

            // CARRUSEL DE IMÁGENES (Facebook Style)
            // Generamos múltiples slides si hay array, si no, solo 1
            const images = p.images && p.images.length ? p.images : [p.img];
            const slidesHtml = images.map(src => 
                `<div class="prod-slide"><img src="${cleanUrl(src)}" class="prodImg" loading="lazy"></div>`
            ).join("");

            // Badge de oferta
            const badgeHtml = PROMO_ACTIVE 
                ? '<div class="promo-badge">-30%</div>' 
                : '';

            const card = document.createElement("div"); 
            card.className = "prodCard"; // Tu clase CSS
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
                <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR</button>
            `;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }
    
    // Mostrar Modal
    const modal = $("modalCatalog");
    const overlay = $("overlay");
    modal.classList.add("active");
    overlay.classList.add("active");
    document.body.classList.add("modalOpen");
  };

  // Helper para selección de talla (Global para onclick inline)
  window.selectSize = (pid, size) => {
    selectedSizeByProduct[pid] = size;
    // Actualizar UI visualmente sin recargar todo
    const row = document.getElementById(`sizes-${pid}`);
    if(row) {
        row.querySelectorAll('.size-pill').forEach(btn => {
            if(btn.innerText === size) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
  };

  /* ---------------- CART LOGIC ---------------- */
  function loadCart() { try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch(e){ cart=[]; } }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return toast("Producto no encontrado");

      const size = selectedSizeByProduct[pid] || (p.sizes ? p.sizes[0] : "Unitalla");
      const cartId = `${pid}-${size}`;
      
      const existing = cart.find(x => x.cartItemId === cartId);
      if(existing) existing.qty++;
      else cart.push({
          id: p.id, name: p.name, price: p.baseMXN, 
          img: p.img || (p.images?p.images[0]:""), 
          size: size, qty: 1, cartItemId: cartId, sku: p.sku
      });

      saveCart();
      updateCartUI();
      toast("Agregado al pedido");
      openDrawer(); // Auto-abrir carrito
  };

  window.removeFromCart = (idx) => {
      cart.splice(idx, 1);
      saveCart();
      updateCartUI();
  };

  window.emptyCart = () => {
      if(confirm("¿Estás seguro de vaciar el carrito?")) {
          cart = []; saveCart(); updateCartUI();
      }
  };

  function updateCartUI() {
      const box = $("cartItems");
      box.innerHTML = "";
      let subtotal = 0;
      let count = 0;

      if(cart.length === 0) {
          $("cartEmpty").style.display = "block";
          // Ocultar totales si está vacío
          $("cartFooter") && ($("cartFooter").style.display = "none"); 
      } else {
          $("cartEmpty").style.display = "none";
          // Mostrar items
          cart.forEach((it, idx) => {
              subtotal += it.price * it.qty;
              count += it.qty;
              box.innerHTML += `
                <div class="cartItem">
                    <img src="${cleanUrl(it.img)}" class="cartThumb">
                    <div class="cInfo">
                        <div class="cName">${it.name}</div>
                        <div class="cMeta">Talla: ${it.size}</div>
                        <div class="qtyRow">x${it.qty}</div>
                    </div>
                    <div class="cPrice">${money(it.price * it.qty)}</div>
                    <button class="linkDanger" style="margin-left:10px" onclick="removeFromCart(${idx})">x</button>
                </div>
              `;
          });
      }

      // Totales
      if($("cartCount")) $("cartCount").innerText = count;
      if($("subTotal")) $("subTotal").innerText = money(subtotal);
      
      // Calculo final con envío
      const total = subtotal + shippingState.cost;
      if($("grandTotal")) $("grandTotal").innerText = money(total);
      if($("shipTotal")) $("shipTotal").innerText = shippingState.mode === 'pickup' ? 'Gratis' : money(shippingState.cost);
  }

  /* ---------------- SHIPPING & CHECKOUT ---------------- */
  function setupListeners() {
      // Radio Buttons Envío
      document.getElementsByName("shipMode").forEach(r => {
          r.addEventListener("change", (e) => {
              const mode = e.target.value;
              const form = $("shipForm");
              shippingState.mode = mode;

              if(mode === 'pickup') {
                  shippingState.cost = 0;
                  shippingState.label = "Gratis (Fábrica)";
                  form.style.display = "none";
              } else if(mode === 'tj') {
                  shippingState.cost = 200; // Local
                  shippingState.label = "Local Express";
                  form.style.display = "block";
              } else if(mode === 'mx') {
                  shippingState.cost = 250; // Nacional
                  shippingState.label = "Envío Nacional";
                  form.style.display = "block";
                  // Aquí podríamos activar cotizador real si hay CP
              } else if(mode === 'us') {
                  shippingState.cost = 800; // USA
                  shippingState.label = "USA Standard";
                  form.style.display = "block";
              }
              updateCartUI();
          });
      });

      // CP input debounce para cotizar (Opcional, usa fallback por ahora)
      const cpInput = $("cp");
      if(cpInput) {
          cpInput.addEventListener("input", (e) => {
              if(shippingState.mode !== 'pickup' && e.target.value.length >= 5) {
                   quoteShipping(e.target.value, shippingState.mode === 'us' ? 'US' : 'MX');
              }
          });
      }
  }

  async function quoteShipping(zip, country) {
      if($("shipTotal")) $("shipTotal").innerText = "...";
      try {
          const qty = cart.reduce((a,b)=>a+b.qty, 0);
          const res = await fetch(`${API_BASE}/quote_shipping`, { 
              method: "POST", 
              body: JSON.stringify({ zip, items: qty, country }) 
          });
          const data = await res.json();
          if(data.ok) {
              shippingState.cost = data.cost;
              shippingState.label = data.label;
          }
      } catch(e) { /* Fallback ya establecido por radio buttons */ }
      updateCartUI();
  }

  window.checkout = async () => {
      if(!cart.length) return toast("Carrito vacío");
      
      // Validar campos si es envío
      if(shippingState.mode !== 'pickup') {
          if(!$("cp").value || !$("addr").value || !$("name").value) {
              return toast("Completa los datos de envío");
          }
      }

      const btn = $("checkoutBtn");
      btn.disabled = true; btn.innerText = "PROCESANDO...";

      try {
          const payload = {
              cart, 
              shippingMode: shippingState.mode,
              shippingData: {
                  cp: $("cp")?.value,
                  name: $("name")?.value,
                  address: $("addr")?.value
              }
          };
          
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: "POST", 
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify(payload) 
          });
          
          const data = await res.json();
          if(data.url) window.location.href = data.url;
          else throw new Error(data.error || "Error al iniciar pago");
          
      } catch(e) {
          alert("Error: " + e.message);
          btn.disabled = false; btn.innerText = "PAGAR AHORA";
      }
  };

  /* ---------------- UI UTILS ---------------- */
  window.openDrawer = () => { 
      $("drawer").classList.add("active"); 
      $("overlay").classList.add("active");
      document.body.classList.add("modalOpen");
  };
  
  window.closeAll = () => {
      document.querySelectorAll(".modal, .drawer, .page-overlay").forEach(e => e.classList.remove("active"));
      document.body.classList.remove("modalOpen");
  };

  window.scrollToId = (id) => {
      const el = $(id); if(el) el.scrollIntoView({behavior:'smooth'});
  };

  window.openLegal = (type) => {
      document.querySelectorAll('.legalBlock').forEach(b => b.style.display='none');
      const blk = document.querySelector(`[data-legal-block="${type}"]`);
      if(blk) blk.style.display='block';
      $("legalModal").classList.add("active");
      $("overlay").classList.add("active");
  };

  window.toast = (msg) => {
      const t = $("toast");
      t.innerText = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 3000);
  };
  
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      const observer = new IntersectionObserver(entries => {
          entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("visible"); });
      }, { threshold: 0.1 });
      els.forEach(el => observer.observe(el));
  }

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