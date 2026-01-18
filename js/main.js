/* SCORE STORE LOGIC — CONNECTED TO UNICO OS v2.0 */

// --- CONFIGURACIÓN DE SUPABASE (Inyectada por Variables de Entorno en Netlify si fuera posible, o manual aquí) ---
// IMPORTANTE: REEMPLAZA ESTO CON TUS CLAVES REALES DE SUPABASE ANTES DE SUBIR
const SUPABASE_URL = "https://TU_PROYECTO.supabase.co"; 
const SUPABASE_KEY = "TU_CLAVE_ANON_LARGA_AQUI";

const API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "/api" : "/.netlify/functions";

const CART_KEY = "score_cart_prod_v2";
let PROMO_ACTIVE = false; // Se sobrescribe desde DB
let FAKE_MARKUP_FACTOR = 1.0; 

let cart = [];
// Estructura compatible con el diseño original
let catalogData = { products: [], sections: [] };
let shippingState = { mode: "pickup", cost: 0, label: "Gratis (Fábrica)" };
let selectedSizeByProduct = {};
let supabase = null;

const $ = (id) => document.getElementById(id);
const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

/* ================= INIT ================= */

async function init() {
  if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Conexión a Único OS establecida");
  } else {
    console.error("❌ Supabase SDK no cargado");
  }

  initSplash();
  loadCart();
  
  // Carga Inteligente: Intenta DB, si falla, usa local (Fallover)
  try {
    await loadCatalogFromDB();
    await loadSiteConfig();
  } catch (e) {
    console.error("Error conectando a Nube, usando respaldo local...", e);
    await loadCatalogLocal(); 
  }

  setupListeners();
  updateCartUI();
  initScrollReveal();

  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago exitoso! Gracias por tu compra.");
    emptyCart(true);
    window.history.replaceState({}, document.title, "/");
  }
}

function initSplash() {
  const splash = $("splash-screen");
  if (splash) setTimeout(() => { splash.classList.add("hidden"); }, 2500);
}

function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

/* ================= DATA LAYER (NUBE) ================= */

async function loadSiteConfig() {
  if (!supabase) return;
  // Obtenemos configuración de Score Store
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
  if(!org) return;

  const { data: config } = await supabase.from('site_settings').select('*').eq('org_id', org.id).single();
  
  if (config) {
    // 1. Título
    const h1 = $("hero-title");
    if(h1 && config.hero_title) h1.innerHTML = config.hero_title; // Permite HTML simple

    // 2. Promo Bar
    if (config.promo_active) {
      PROMO_ACTIVE = true;
      FAKE_MARKUP_FACTOR = 1.3; // Activa markup visual si hay promo
      const bar = $("promo-bar");
      if(bar) {
        bar.style.display = "flex";
        $("promo-text").innerHTML = config.promo_text || "🔥 OFERTA ACTIVA 🔥";
      }
    }

    // 3. Pixel Injection
    if (config.pixel_id) {
      console.log("Inyectando Pixel:", config.pixel_id);
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', config.pixel_id);
      fbq('track', 'PageView');
    }
  }
}

async function loadCatalogFromDB() {
  if (!supabase) throw new Error("No client");
  
  const { data: org } = await supabase.from('organizations').select('id').eq('slug', 'score-store').single();
  
  // Traer productos activos
  const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', org.id)
      .eq('active', true);

  // Mapear DB simple a Estructura Compleja del Frontend
  catalogData.products = products.map(p => ({
    id: p.id,
    name: p.name,
    baseMXN: p.price,
    sectionId: p.category || 'BAJA_1000', // Default a Baja 1000 si no tiene categoría
    img: p.image_url || '/assets/logo-score.webp',
    images: [p.image_url || '/assets/logo-score.webp'], // Array de 1 imagen por compatibilidad
    sizes: ["S","M","L","XL","2XL"], // Tallas hardcoded por ahora para no romper UI
    sku: p.sku
  }));

  // Secciones estáticas (no cambian mucho)
  catalogData.sections = [
    { "id": "BAJA_1000", "title": "BAJA 1000", "logo": "/assets/logo-baja1000.webp" },
    { "id": "BAJA_500", "title": "BAJA 500", "logo": "/assets/logo-baja500.webp" },
    { "id": "BAJA_400", "title": "BAJA 400", "logo": "/assets/logo-baja400.webp" },
    { "id": "SF_250", "title": "SAN FELIPE 250", "logo": "/assets/logo-sf250.webp" }
  ];
}

async function loadCatalogLocal() {
  const res = await fetch("/data/catalog.json");
  const data = await res.json();
  catalogData = data;
}

/* ================= CART & LOGIC (PRESERVADO) ================= */
function loadCart() {
  const saved = localStorage.getItem(CART_KEY);
  if (saved) try { cart = JSON.parse(saved); } catch (e) {}
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

/* ================= UI RENDERERS ================= */

window.openCatalog = (sectionId, titleFallback) => {
  const items = catalogData.products.filter(p => {
    // Búsqueda flexible: coincide si el ID o la categoría contienen el texto
    return (p.sectionId === sectionId) || (p.name.toUpperCase().includes(sectionId.replace('_',' ')));
  });
  
  const titleEl = $("catTitle");
  const sectionInfo = catalogData.sections.find(s => s.id === sectionId);
  
  if (sectionInfo && sectionInfo.logo) {
    titleEl.innerHTML = `<img src="${sectionInfo.logo}" style="height:80px;width:auto;">`;
  } else {
    titleEl.innerText = titleFallback || "COLECCIÓN";
  }
  
  const container = $("catContent");
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:50px;color:#666;">Próximamente...</div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "catGrid";
    
    items.forEach(p => {
      const sizes = p.sizes || ["Unitalla"];
      if (!selectedSizeByProduct[p.id]) selectedSizeByProduct[p.id] = sizes[0];

      const sizesHtml = sizes.map(sz => {
        const active = (selectedSizeByProduct[p.id] === sz) ? "active" : "";
        return `<button class="size-pill ${active}" data-pid="${p.id}" data-size="${sz}">${sz}</button>`;
      }).join("");

      const sellPrice = p.baseMXN;
      const fakeOldPrice = Math.round(sellPrice * (PROMO_ACTIVE ? FAKE_MARKUP_FACTOR : 1));
      
      const priceHtml = PROMO_ACTIVE 
        ? `<div class="price-container"><span class="old-price">${money(fakeOldPrice)}</span><span class="new-price">${money(sellPrice)}</span></div>`
        : `<div class="prodPrice">${money(sellPrice)}</div>`;

      const el = document.createElement("div");
      el.className = "prodCard";
      el.innerHTML = `
        <div class="metallic-frame">
          ${PROMO_ACTIVE ? '<div class="promo-badge">OFERTA</div>' : ''}
          <div class="prod-slider"><div class="prod-slide"><img src="${p.img}" class="prodImg" loading="lazy"></div></div>
        </div>
        <div class="prodName">${p.name}</div>
        ${priceHtml}
        <div class="sizeRow">${sizesHtml}</div>
        <button class="btn-add" data-add="${p.id}">AGREGAR</button>
      `;
      grid.appendChild(el);
    });
    container.appendChild(grid);
  }
  openModal("modalCatalog");
};

/* ================= LISTENERS ================= */
function setupListeners() {
  // Manejo de Tallas y Add to Cart
  const catContent = $("catContent");
  if (catContent) {
    catContent.addEventListener("click", (e) => {
      const btnSize = e.target.closest("[data-size]");
      if (btnSize) {
        const pid = btnSize.dataset.pid;
        const size = btnSize.dataset.size;
        selectedSizeByProduct[pid] = size;
        // Visual update
        btnSize.parentElement.querySelectorAll(".size-pill").forEach(p => p.classList.remove("active"));
        btnSize.classList.add("active");
        return;
      }
      const btnAdd = e.target.closest("[data-add]");
      if (btnAdd) {
        const pid = btnAdd.dataset.add;
        const size = selectedSizeByProduct[pid] || "Unitalla";
        addToCart(pid, size);
      }
    });
  }
  
  // Shipping Listeners
  document.getElementsByName("shipMode").forEach(r => {
    r.addEventListener("change", (e) => handleShipModeChange(e.target.value));
  });
}

// ... RESTO DE FUNCIONES DEL CARRITO (addToCart, updateCartUI, handleShipModeChange) SE MANTIENEN IGUALES ...
// Solo asegúrate de copiar las funciones addToCart, removeFromCart, changeQty, updateCartUI, handleShipModeChange, quoteShipping del archivo original.
// Por brevedad, asumo que las tienes. Si no, avísame y las pego completas.

/* ================= CHECKOUT ================= */
window.checkout = async () => {
  const btn = $("checkoutBtn");
  if (cart.length === 0) return toast("Tu carrito está vacío");

  const mode = shippingState.mode;
  const name = $("name")?.value.trim();
  const addr = $("addr")?.value.trim();
  const cp = $("cp")?.value.trim();

  if (mode !== "pickup") {
    if (!name || !addr || !cp) return toast("Completa los datos de envío");
  }

  btn.disabled = true;
  btn.innerText = "Procesando...";

  try {
    const payload = {
      items: cart,
      mode,
      customer: { name, address: addr, postal_code: cp },
      promo: PROMO_ACTIVE 
    };

    const res = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error iniciando pago");
    }

  } catch (err) {
    console.error(err);
    toast("Error: " + err.message);
    btn.disabled = false;
    btn.innerText = "PAGAR AHORA";
  }
};

/* UTILS */
window.openModal = (id) => { $(id)?.classList.add("active"); $("overlay")?.classList.add("active"); };
window.closeAll = () => { document.querySelectorAll(".active").forEach(e => e.classList.remove("active")); };
window.addToCart = (id, size) => {
  const existing = cart.find(i => i.id === id && i.size === size);
  if (existing) existing.qty++; else cart.push({ id, size, qty: 1 });
  saveCart(); updateCartUI(); toast("Agregado"); window.openDrawer();
  if(typeof fbq === 'function') fbq('track', 'AddToCart', { content_ids: [id], content_type: 'product' });
};
window.removeFromCart = (idx) => { cart.splice(idx, 1); saveCart(); updateCartUI(); };
window.changeQty = (idx, delta) => { if(cart[idx]) { cart[idx].qty += delta; if(cart[idx].qty<1) cart[idx].qty=1; saveCart(); updateCartUI(); } };
window.emptyCart = (silent) => { if(silent || confirm("¿Vaciar?")) { cart=[]; saveCart(); updateCartUI(); }};
window.toast = (m) => { const t=$("toast"); t.innerText=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),3000); };
window.openDrawer = () => { $("drawer").classList.add("active"); $("overlay").classList.add("active"); };
window.handleShipModeChange = (mode) => {
    shippingState.mode = mode;
    $("shipForm").style.display = (mode === "pickup") ? "none" : "block";
    shippingState.cost = (mode === "tj") ? 200 : 0; 
    shippingState.label = (mode === "pickup") ? "Gratis" : (mode==="tj"?"$200 Local":"Cotizar");
    updateCartUI();
};
// Update UI Simplified
function updateCartUI() {
    const c = $("cartItems");
    let total = 0, q = 0;
    c.innerHTML = cart.map((i, idx) => {
        const p = catalogData.products.find(x => x.id == i.id); 
        if(!p) return ""; 
        const st = p.baseMXN * i.qty; total+=st; q+=i.qty;
        return `<div class="cartItem"><div><b>${p.name}</b><br>${i.size}</div><div>${money(st)} <button onclick="removeFromCart(${idx})">x</button></div></div>`;
    }).join("");
    $("cartCount").innerText = q;
    $("subTotal").innerText = money(total);
    $("grandTotal").innerText = money(total + shippingState.cost);
}
