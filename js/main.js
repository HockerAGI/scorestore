/* SCORE STORE — HYBRID ENGINE v7.1 (STABLE) */
(function () {
  // 1. SAFETY FIRST: Definir y ejecutar el desbloqueo visual INMEDIATAMENTE
  // Esto garantiza que si el código falla más abajo, la tienda igual se muestra a los 3 segs.
  const $ = (id) => document.getElementById(id);
  
  function hideSplash() {
    const s = $("splash-screen");
    if (!s) return;
    if (s.classList.contains("hidden")) return; // Ya oculto
    
    s.classList.add("hidden");
    document.body.classList.remove("noScroll");
    setTimeout(() => { try { s.remove(); } catch {} }, 900);
  }

  // Fallback de seguridad (se ejecuta pase lo que pase)
  setTimeout(hideSplash, 3000);
  window.addEventListener("load", () => setTimeout(hideSplash, 500));

  // --- CONFIGURACIÓN ---
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const STRIPE_PUBLIC_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_prod_v12";

  // --- ESTADO ---
  let stripe = null; // Se inicia de forma segura
  let cart = [];
  let catalogData = { products: [], sections: [] };
  let promoRules = [];
  let activePromo = null; 
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
  let selectedSizeByProduct = {};
  let db = null;
  let _listenersBound = false;

  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const cleanUrl = (url) => (url ? encodeURI(String(url)) : "");
  const safeText = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* ---------------- Boot ---------------- */
  async function init() {
    // 1. Inicializar Stripe de forma segura
    if (typeof Stripe !== 'undefined') {
        try { stripe = Stripe(STRIPE_PUBLIC_KEY); } catch (e) { console.warn("Stripe error:", e); }
    } else {
        console.warn("Stripe SDK not loaded yet.");
    }

    // 2. Inicializar Supabase
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
      try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (err) { console.error("DB Error", err); }
    }
    
    // 3. Cargar Datos
    await Promise.all([loadCatalogLocal(), loadPromosLocal()]);
    loadCart();
    updateCartUI();
    setupListeners();
    initScrollReveal();

    // 4. Enriquecer con DB (si hay conexión)
    if (db) { await enrichWithDB(); }

    handleQueryActions();
    
    // 5. Ocultar Splash (Salida exitosa)
    hideSplash();
  }

  /* ---------------- Data Loaders ---------------- */
  async function loadCatalogLocal() {
    try {
      const res = await fetch("/data/catalog.json");
      const json = await res.json();
      catalogData = json || { products: [], sections: [] };
    } catch (e) { catalogData = { products: [], sections: [] }; }
  }

  async function loadPromosLocal() {
    try {
        const res = await fetch("/data/promos.json");
        const json = await res.json();
        promoRules = json.rules || [];
    } catch (e) {}
  }

  async function enrichWithDB() {
    try {
      const { data: org, error: orgErr } = await db.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
      if(orgErr || !org) return;

      const { data: dbProducts, error } = await db
        .from("products")
        .select("id, sku, price, active, name, image_url")
        .eq("org_id", org.id)
        .eq("active", true);

      if (error || !dbProducts || !dbProducts.length) return;

      const bySku = new Map();
      dbProducts.forEach((p) => { if (p.sku) bySku.set(String(p.sku), p); });

      catalogData.products = (catalogData.products || []).map((localP) => {
          const match = localP.sku ? bySku.get(String(localP.sku)) : null;
          if (match) {
            return {
              ...localP,
              baseMXN: Number(match.price ?? localP.baseMXN ?? 0),
              active: match.active,
              db_id: match.id,
              image_url: match.image_url || localP.img, 
            };
          }
          return localP;
        });
    } catch (err) { console.warn("DB enrich failed:", err); }
  }

  /* ---------------- Catalog UI ---------------- */
  window.openCatalog = (sectionId, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sectionId);
    if($("catTitle")) $("catTitle").textContent = title;
    
    const container = $("catContent");
    container.innerHTML = ""; // Limpiar
    
    // Skeleton temporal
    container.innerHTML = `<div class="productGrid" style="opacity:0.5"><div class="loader"></div></div>`;
    openModal("modalCatalog");

    // Render real
    setTimeout(() => {
        container.innerHTML = "";
        if(!items.length) {
            container.innerHTML = '<p style="text-align:center;padding:20px;">Próximamente disponible.</p>';
        } else {
            const grid = document.createElement("div");
            grid.className = "productGrid";
            items.forEach(p => {
                const card = document.createElement("div");
                card.className = "pCard";
                const defSize = p.sizes[0] || "Unitalla";
                const img = cleanUrl(p.img);
                
                const sizeBtns = (p.sizes || ["Unitalla"]).map(s => 
                    `<button class="sizePill ${s===defSize?'selected':''}" onclick="selectSize(this, '${p.id}', '${s}')">${s}</button>`
                ).join("");

                card.innerHTML = `
                    <div class="pImgWrap">
                        <span class="badge">${p.subSection}</span>
                        <img src="${img}" class="pImg" loading="lazy" alt="${p.name}">
                    </div>
                    <div class="pMeta">
                        <div class="pName">${p.name}</div>
                        <div class="pPrice">${money(p.baseMXN)}</div>
                        <div class="pSizes" id="sizes-${p.id}">${sizeBtns}</div>
                        <button class="btn primary full" style="margin-top:10px;font-size:14px;" onclick="addToCart('${p.id}')">AGREGAR</button>
                    </div>
                `;
                card.dataset.selectedSize = defSize;
                grid.appendChild(card);
            });
            container.appendChild(grid);
        }
        bindStorefrontControls();
    }, 150);
  };

  function bindStorefrontControls() {
      // Futuro: bind search/sort
  }

  window.selectSize = (btn, pid, size) => {
      btn.parentNode.querySelectorAll(".sizePill").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      btn.closest(".pCard").dataset.selectedSize = size;
  };

  /* ---------------- Cart Logic ---------------- */
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;
      
      const sizeContainer = document.getElementById(`sizes-${pid}`);
      let size = "Unitalla";
      if(sizeContainer) {
          const sel = sizeContainer.querySelector(".selected");
          if(sel) size = sel.innerText;
      }
      
      const cartId = `${pid}-${size}`;
      const exist = cart.find(x => x.cartItemId === cartId);
      
      if(exist) exist.qty++;
      else cart.push({
          id: p.id, name: p.name, price: p.baseMXN, img: p.img, 
          qty: 1, size: size, cartItemId: cartId, sku: p.sku
      });
      
      saveCart(); updateCartUI(); showToast("Agregado al carrito");
  };

  window.removeFromCart = (cid) => {
      cart = cart.filter(x => x.cartItemId !== cid);
      saveCart(); updateCartUI();
  };

  window.changeQty = (cid, delta) => {
      const item = cart.find(x => x.cartItemId === cid);
      if(item) {
          item.qty += delta;
          if(item.qty <= 0) removeFromCart(cid);
          else { saveCart(); updateCartUI(); }
      }
  };

  function updateCartUI() {
      const count = cart.reduce((a,b) => a+b.qty, 0);
      if($("cartCount")) $("cartCount").innerText = count;
      
      const wrap = $("cartItems");
      if(!wrap) return;
      wrap.innerHTML = "";
      
      if(!cart.length) {
          $("cartEmpty").style.display = "block";
          $("cartFooter").style.display = "none";
          return;
      }
      
      $("cartEmpty").style.display = "none";
      $("cartFooter").style.display = "block";
      
      let sub = 0;
      cart.forEach(it => {
          sub += it.price * it.qty;
          const row = document.createElement("div");
          row.className = "cartRow";
          row.innerHTML = `
            <img src="${it.img}" class="cartThumb">
            <div class="cartInfo">
                <div class="cartName">${it.name}</div>
                <div class="cartMeta">${it.size}</div>
                <div class="qtyRow">
                    <button class="qtyBtn" onclick="changeQty('${it.cartItemId}', -1)">-</button>
                    <span style="margin:0 8px">${it.qty}</span>
                    <button class="qtyBtn" onclick="changeQty('${it.cartItemId}', 1)">+</button>
                    <span style="margin-left:auto;font-weight:700;">${money(it.price*it.qty)}</span>
                </div>
            </div>
            <button class="rmBtn" onclick="removeFromCart('${it.cartItemId}')">✕</button>
          `;
          wrap.appendChild(row);
      });
      
      let disc = 0;
      if(activePromo) disc = sub * activePromo.value;
      
      const total = sub - disc + shippingState.cost;
      
      $("subTotal").innerText = money(sub);
      $("grandTotal").innerText = money(total);
      $("shipTotal").innerText = shippingState.cost === 0 ? "Gratis" : money(shippingState.cost);
      
      if(disc > 0) {
          $("rowDiscount").style.display = "flex";
          $("discVal").innerText = `-${money(disc)}`;
      } else {
          $("rowDiscount").style.display = "none";
      }
  }

  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { 
      try {
        const s = localStorage.getItem(CART_KEY); 
        if(s) cart = JSON.parse(s); 
        if(!Array.isArray(cart)) cart = [];
      } catch { cart = []; }
  }

  /* ---------------- Logistics ---------------- */
  async function quoteShipping() {
      const cp = $("cp")?.value;
      const qty = cart.reduce((a,b)=>a+b.qty,0);
      if(!cp || cp.length < 5) return;
      
      try {
          const res = await fetch(`${API_BASE}/quote_shipping`, {
              method: "POST", body: JSON.stringify({
                  zip: cp, items: qty, country: shippingState.mode === 'us' ? 'US' : 'MX'
              })
          });
          const data = await res.json();
          if(data.ok) {
              shippingState.cost = data.cost;
              shippingState.label = data.label;
              updateCartUI();
          }
      } catch(e) { console.log(e); }
  }

  function setupListeners() {
      if(_listenersBound) return;
      _listenersBound = true;

      const cp = $("cp");
      if(cp) {
          let t;
          cp.addEventListener("input", () => {
              clearTimeout(t);
              t = setTimeout(() => { if (shippingState.mode !== "pickup") quoteShipping(); }, 800);
          });
      }
      
      document.querySelectorAll('input[name="shipMode"]').forEach(r => {
          r.addEventListener("change", () => {
              shippingState.mode = r.value;
              if(r.value === 'pickup') {
                  shippingState.cost = 0; shippingState.label = "Gratis (Fábrica)";
                  $("shipForm").style.display = "none";
              } else {
                  $("shipForm").style.display = "block";
                  quoteShipping();
              }
              updateCartUI();
          });
      });
  }

  /* ---------------- Promo & Checkout ---------------- */
  window.applyPromo = () => {
      const code = $("promoCodeInput").value.trim().toUpperCase();
      const rule = promoRules.find(r => r.code === code && r.active);
      if(rule) { activePromo = rule; showToast("Cupón aplicado"); } 
      else { activePromo = null; showToast("Cupón inválido"); }
      updateCartUI();
  };

  window.checkout = async () => {
      // Asegurar que Stripe existe antes de usarlo
      if (!stripe) {
          try { stripe = Stripe(STRIPE_PUBLIC_KEY); } 
          catch (e) { alert("Error cargando Stripe. Recarga la página."); return; }
      }

      if(!cart.length) return toast("Carrito vacío");
      
      // Validación Envío
      if(shippingState.mode !== "pickup") {
          const cp = $("cp")?.value;
          const name = $("name")?.value;
          const addr = $("addr")?.value;
          if(!cp || cp.length < 5 || !name || !addr) return toast("Completa los datos de envío");
      }

      const btn = $("checkoutBtn");
      btn.disabled = true; btn.innerText = "PROCESANDO...";
      
      try {
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: "POST", body: JSON.stringify({
                  cart, shippingMode: shippingState.mode, promoCode: activePromo?.code,
                  shippingData: { cp: $("cp")?.value, name: $("name")?.value, address: $("addr")?.value }
              })
          });
          const data = await res.json();
          if(data.url) location.href = data.url;
          else throw new Error(data.error || "Error desconocido");
      } catch(e) {
          alert("Error: " + e.message);
          btn.disabled = false; btn.innerText = "PAGAR AHORA";
      }
  };

  /* ---------------- Helpers ---------------- */
  window.openDrawer = () => openModal("drawer");
  window.closeAll = () => {
      document.querySelectorAll(".modal, .drawer").forEach(e => e.classList.remove("open"));
      $("overlay").classList.remove("show");
      document.body.classList.remove("noScroll");
  };
  window.openLegal = (id) => {
      document.querySelectorAll(".legalBlock").forEach(e => e.style.display="none");
      const b = document.getElementById(`legal-${id}`);
      if(b) b.style.display="block";
      openModal("legalModal");
  };
  function openModal(id) {
      $(id).classList.add("open");
      $("overlay").classList.add("show");
      document.body.classList.add("noScroll");
  }
  function showToast(m) {
      const t = $("toast"); t.innerText = m; t.classList.add("show");
      setTimeout(()=>t.classList.remove("show"), 3000);
  }
  function initScrollReveal() {
      const els = document.querySelectorAll(".scroll-reveal");
      if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("revealed")); return; }
      const io = new IntersectionObserver(e => e.forEach(en => { if(en.isIntersecting) en.target.classList.add("revealed"); }), {threshold:0.1});
      els.forEach(el => io.observe(el));
  }
  function handleQueryActions() {
      const qs = new URLSearchParams(location.search);
      if (qs.get("openCart") === "1") openDrawer();
      if (qs.get("status") === "success") {
          toast("¡Pedido Confirmado! ✅"); cart=[]; saveCart(); updateCartUI();
          history.replaceState({},"", "/");
      }
  }
  window.emptyCart = () => { if(confirm("¿Vaciar carrito?")) { cart=[]; activePromo=null; saveCart(); updateCartUI(); } };

  function escapeJS(s) { return String(s).replace(/'/g, "\\'"); }

  // Init protegido
  document.addEventListener("DOMContentLoaded", () => {
    Promise.resolve(init()).catch(e => { console.error("Init failed:", e); hideSplash(); });
  });
})();