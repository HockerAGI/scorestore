/* SCORE STORE — RETAIL ENGINE v8.0 */
(function () {
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const ORG_SLUG = CFG.orgSlug || "score-store";
  const STRIPE_PUBLIC_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  
  let stripe = null;
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_retail_v8";

  // State
  let cart = [];
  let catalogData = { products: [], sections: [] };
  let promoRules = [];
  let activePromo = null; 
  let shippingState = { mode: "pickup", cost: 0, label: "Gratis" };
  let db = null;

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

  // --- INIT ---
  async function init() {
    if (typeof Stripe !== 'undefined') stripe = Stripe(STRIPE_PUBLIC_KEY);
    
    if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
      try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) { console.error(e); }
    }

    await Promise.all([loadCatalog(), loadPromos()]);
    loadCart();
    
    // Si hay DB, enriquecer datos
    if (db) await enrichCatalog();

    renderCatalog("all");
    updateCartTotals();
  }

  // --- DATA ---
  async function loadCatalog() {
    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch (e) { console.error("Catalog error"); }
  }

  async function loadPromos() {
    try {
        const res = await fetch("/data/promos.json");
        const json = await res.json();
        promoRules = json.rules || [];
    } catch (e) {}
  }

  async function enrichCatalog() {
    try {
        const { data: org } = await db.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
        if(!org) return;
        const { data: prods } = await db.from("products").select("sku, price, active").eq("org_id", org.id).eq("active", true);
        
        if(prods) {
            const priceMap = new Map(prods.map(p => [p.sku, p.price]));
            catalogData.products.forEach(p => {
                if(priceMap.has(p.sku)) p.baseMXN = Number(priceMap.get(p.sku));
            });
            // Re-render
            renderCatalog($("category-filter").value);
        }
    } catch(e) { console.log("DB sync skipped"); }
  }

  // --- RENDER ---
  window.filterProducts = (category) => renderCatalog(category);

  function renderCatalog(filter) {
    const grid = $("products-grid");
    if(!grid) return;
    grid.innerHTML = "";

    const items = filter === "all" 
        ? catalogData.products 
        : catalogData.products.filter(p => p.subSection === filter);

    if(!items.length) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; padding:40px;">No hay productos disponibles en esta categoría.</p>';
        return;
    }

    items.forEach(p => {
        const defSize = p.sizes[0] || "Unitalla";
        const card = document.createElement("div");
        card.className = "product-card";
        
        // Generar botones de talla
        const sizesHtml = p.sizes.map((s, i) => 
            `<button class="size-btn ${i===0?'selected':''}" onclick="selectSize(this, '${s}')">${s}</button>`
        ).join("");

        card.innerHTML = `
            <div class="p-image-container">
                <span class="p-badge">${p.subSection}</span>
                <img src="${p.img}" alt="${p.name}" class="p-image" loading="lazy">
            </div>
            <div class="p-info">
                <div class="p-category">SCORE OFFICIAL</div>
                <div class="p-title">${p.name}</div>
                <div class="p-price">${money(p.baseMXN)}</div>
                
                <div class="p-actions">
                    <div class="size-selector" id="size-${p.id}">${sizesHtml}</div>
                    <button class="btn btn-primary btn-full" onclick="addToCart('${p.id}')">
                        AÑADIR AL CARRITO
                    </button>
                </div>
            </div>
        `;
        // Guardar estado inicial en el DOM del card
        card.dataset.selectedSize = defSize;
        grid.appendChild(card);
    });
  }

  window.selectSize = (btn, size) => {
      const parent = btn.parentNode;
      parent.querySelectorAll(".size-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      // Subir al card padre
      btn.closest(".product-card").dataset.selectedSize = size;
  };

  // --- CART ---
  window.addToCart = (pid) => {
      const p = catalogData.products.find(x => x.id === pid);
      if(!p) return;

      // Buscar talla seleccionada en el DOM (truco para no usar React state)
      // Buscamos el elemento size-selector específico
      const selector = document.getElementById(`size-${pid}`);
      let size = "Unitalla";
      if(selector) {
          const selBtn = selector.querySelector(".selected");
          if(selBtn) size = selBtn.innerText;
      }

      const cartId = `${pid}-${size}`;
      const exist = cart.find(i => i.cartItemId === cartId);

      if(exist) exist.qty++;
      else cart.push({
          id: p.id, name: p.name, price: p.baseMXN, img: p.img, 
          qty: 1, size: size, cartItemId: cartId, sku: p.sku
      });

      saveCart();
      updateCartTotals();
      openCart();
      showToast("Producto agregado");
  };

  window.removeFromCart = (cid) => {
      cart = cart.filter(i => i.cartItemId !== cid);
      saveCart(); updateCartTotals();
  };

  window.changeQty = (cid, delta) => {
      const item = cart.find(i => i.cartItemId === cid);
      if(item) {
          item.qty += delta;
          if(item.qty <= 0) removeFromCart(cid);
          else { saveCart(); updateCartTotals(); }
      }
  };

  window.updateCartTotals = () => {
      // 1. Render items
      const container = $("cart-items");
      if(!container) return;
      container.innerHTML = "";
      
      let subtotal = 0;
      let count = 0;

      if(!cart.length) {
          container.innerHTML = `<p style="text-align:center; color:#999; margin-top:20px;">Tu carrito está vacío.</p>`;
          $("checkout-btn").disabled = true;
      } else {
          $("checkout-btn").disabled = false;
          cart.forEach(item => {
              subtotal += item.price * item.qty;
              count += item.qty;
              
              const div = document.createElement("div");
              div.className = "cart-item";
              div.innerHTML = `
                  <div onclick="removeFromCart('${item.cartItemId}')" class="cart-remove"><i class="fa-solid fa-trash"></i></div>
                  <img src="${item.img}" class="cart-item-img">
                  <div class="cart-item-details">
                      <h4>${item.name}</h4>
                      <div class="cart-item-meta">Talla: ${item.size}</div>
                      <div class="cart-qty-controls">
                          <button class="qty-btn" onclick="changeQty('${item.cartItemId}', -1)">-</button>
                          <span>${item.qty}</span>
                          <button class="qty-btn" onclick="changeQty('${item.cartItemId}', 1)">+</button>
                          <span style="margin-left:auto; font-weight:bold;">${money(item.price * item.qty)}</span>
                      </div>
                  </div>
              `;
              container.appendChild(div);
          });
      }

      $("cart-total-items").innerText = count;
      $("cart-count").innerText = count;

      // 2. Shipping logic
      const radios = document.getElementsByName("shipMode");
      let mode = "pickup";
      for(let r of radios) if(r.checked) mode = r.value;
      shippingState.mode = mode;

      if(mode === "pickup") {
          shippingState.cost = 0;
          $("shipping-price").innerText = "Gratis";
          $("shipping-address-form").style.display = "none";
      } else if(mode === "mx") {
          shippingState.cost = 180;
          $("shipping-price").innerText = "$180.00";
          $("shipping-address-form").style.display = "block";
      } else {
          shippingState.cost = 600;
          $("shipping-price").innerText = "$600.00";
          $("shipping-address-form").style.display = "block";
      }

      // 3. Totals
      let discount = 0;
      if(activePromo) {
          discount = subtotal * activePromo.value;
          $("discount-row").style.display = "flex";
          $("discount-price").innerText = `-${money(discount)}`;
      } else {
          $("discount-row").style.display = "none";
      }

      const total = subtotal - discount + shippingState.cost;
      $("subtotal-price").innerText = money(subtotal);
      $("total-price").innerText = money(total);
  };

  // --- CHECKOUT ---
  window.checkout = async () => {
      if(!cart.length) return;
      
      // Validar shipping
      if(shippingState.mode !== "pickup") {
          const cp = $("cp").value;
          const name = $("name").value;
          const addr = $("addr").value;
          if(!cp || !name || !addr) { alert("Por favor completa los datos de envío."); return; }
      }

      const btn = $("checkout-btn");
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PROCESANDO...';
      btn.disabled = true;

      try {
          const items = cart.map(i => ({
              id: i.id, qty: i.qty, size: i.size,
              price: i.price, name: i.name, img: i.img, sku: i.sku // Pass data for safety
          }));

          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  cart: items,
                  shippingMode: shippingState.mode,
                  promoCode: activePromo?.code,
                  shippingData: {
                      cp: $("cp")?.value,
                      name: $("name")?.value,
                      address: $("addr")?.value
                  }
              })
          });
          const data = await res.json();
          if(data.id) {
              stripe.redirectToCheckout({ sessionId: data.id });
          } else {
              throw new Error(data.error);
          }
      } catch(e) {
          alert("Error: " + e.message);
          btn.disabled = false;
          btn.innerText = "PAGAR AHORA";
      }
  };

  window.applyPromo = () => {
      const code = $("promo-code").value.trim().toUpperCase();
      const rule = promoRules.find(r => r.code === code && r.active);
      if(rule) { activePromo = rule; showToast("Cupón aplicado"); }
      else { activePromo = null; showToast("Cupón inválido"); }
      updateCartTotals();
  };

  // --- UI ---
  window.openCart = () => { $("cart-overlay").classList.add("open"); document.body.style.overflow = "hidden"; };
  window.closeCart = () => { $("cart-overlay").classList.remove("open"); document.body.style.overflow = ""; };
  window.toggleMenu = () => {
      const m = $("mobile-menu");
      if(m.classList.contains("active")) m.classList.remove("active");
      else m.classList.add("active");
  };
  function showToast(msg) {
      const t = $("toast"); t.innerText = msg; t.classList.add("active");
      setTimeout(() => t.classList.remove("active"), 3000);
  }
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart=[]; } }

  // Init
  window.addEventListener("DOMContentLoaded", init);

})();