(function () {
  /* CONFIG */
  const CFG = window.__SCORE__ || {};
  const SUPABASE_URL = CFG.supabaseUrl || "";
  const SUPABASE_KEY = CFG.supabaseAnonKey || "";
  const STRIPE_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_v2026_final";
  const FAKE_MARKUP = 5; 

  let cart = [];
  let catalogData = { products: [] };
  let shipping = { cost: 0, label: 'Gratis' };
  let db = null;
  let stripe = null;

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  const cleanUrl = (u) => u ? encodeURI(u.trim()) : "";

  /* INTRO */
  function runIntro() {
    setTimeout(() => { $('aguja').style.transform = 'rotate(80deg)'; }, 800);
    setTimeout(() => { $('intro-brand').style.opacity = '1'; }, 1800);
    setTimeout(() => { $('intro-fab').style.opacity = '1'; $('intro-fab').style.transform = 'translateY(0)'; }, 2600);
    setTimeout(() => { $('intro-layer').style.opacity = '0'; }, 3400);
    setTimeout(() => { $('intro-layer').style.visibility = 'hidden'; document.body.classList.remove('noScroll'); }, 4000);
  }

  /* INIT */
  async function init() {
    runIntro();
    if (typeof Stripe !== 'undefined') stripe = Stripe(STRIPE_KEY);
    if (window.supabase) try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){}

    try {
      const res = await fetch("/data/catalog.json");
      catalogData = await res.json();
    } catch { 
        // Fallback robusto para evitar tienda vacía
        catalogData = { products: [
             {id:'b1k-jacket', sectionId:'BAJA_1000', name:'Chamarra Oficial Baja 1000', baseMXN:1890, img:'/assets/EDICION_2025/chamarra-baja1000.webp', images:['/assets/EDICION_2025/chamarra-baja1000.webp']},
             {id:'b1k-tee', sectionId:'BAJA_1000', name:'Jersey Racing', baseMXN:650, img:'/assets/EDICION_2025/jersey-baja1000.webp', images:[]},
             {id:'sf250-tank', sectionId:'SF_250', name:'Tank Top San Felipe', baseMXN:440, img:'/assets/SF250/camiseta-negra-sinmangas-SF250.webp', images:[]}
        ]};
    }
    
    loadCart();
    updateCartUI();
    setInterval(showSocialProof, 35000);
  }

  /* CATALOG MODAL */
  window.openCatalog = (sid, title) => {
    const items = catalogData.products.filter(p => p.sectionId === sid);
    $('catTitle').innerText = title;
    const box = $('catContent');
    box.innerHTML = '<div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); padding:0; margin:0">';
    
    items.forEach(p => {
      const listPrice = p.baseMXN * FAKE_MARKUP;
      const slides = (p.images && p.images.length > 0 ? p.images : [p.img]).map(img => `<div class="prod-slide"><img src="${cleanUrl(img)}" class="prodImg" loading="lazy"></div>`).join('');
      
      box.querySelector('.grid').innerHTML += `
        <div class="prodCard">
          <div class="metallic-frame">
            <div class="promo-badge">-80%</div>
            <div class="prod-slider">${slides}</div>
          </div>
          <div class="prodName">${p.name}</div>
          <div style="margin:10px 0; display:flex; gap:10px; justify-content:center; align-items:baseline;">
            <span class="price-old">${money(listPrice)}</span>
            <span class="price-new">${money(p.baseMXN)}</span>
          </div>
          <button class="btn-add" onclick="addToCart('${p.id}')">AGREGAR AL PEDIDO</button>
        </div>`;
    });
    $('modalCatalog').classList.add('active'); $('overlay').classList.add('active');
  };

  /* CART & CHECKOUT */
  window.addToCart = (pid) => {
    const p = catalogData.products.find(x => x.id === pid);
    const exist = cart.find(x => x.id === pid);
    if(exist) exist.qty++; else cart.push({...p, qty: 1});
    saveCart(); updateCartUI(); toast("¡Producto Añadido!");
  };

  window.checkout = async () => {
    if(!cart.length) return toast("Carrito vacío");
    const btn = $('checkoutBtn');
    btn.disabled = true; btn.innerText = "PROCESANDO...";
    try {
      const res = await fetch(`${API_BASE}/create_checkout`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ cart, mode: document.querySelector('input[name="ship"]:checked').value })
      });
      const data = await res.json();
      if(data.url) location.href = data.url;
      else throw new Error("Error en pago");
    } catch(e) { btn.disabled = false; btn.innerText = "PAGAR AHORA"; toast("Error de conexión"); }
  };

  function updateCartUI() {
    const box = $('cartItems'); box.innerHTML = ''; let total = 0;
    if(cart.length === 0) box.innerHTML = '<p style="text-align:center; padding:40px; color:#999;">Tu carrito está vacío.</p>';
    
    cart.forEach((it, i) => {
      total += it.baseMXN * it.qty;
      box.innerHTML += `
        <div class="cart-card">
          <div class="cart-img-box"><img src="${cleanUrl(it.img)}"></div>
          <div class="cart-info">
            <div class="cart-name">${it.name}</div>
            <div class="cart-price-row">
               <div class="qty-ctrl"><button class="qty-btn" onclick="modQty(${i},-1)">-</button><b>${it.qty}</b><button class="qty-btn" onclick="modQty(${i},1)">+</button></div>
               <div class="cart-price">${money(it.baseMXN * it.qty)}</div>
            </div>
          </div>
          <button class="btn-remove" onclick="modQty(${i},-999)">✕</button>
        </div>`;
    });
    $('subTotal').innerText = money(total);
    $('grandTotal').innerText = money(total + shipping.cost);
    $('cartCount').innerText = cart.reduce((a,b)=>a+b.qty, 0);
  }

  /* UTILS */
  window.toggleCart = () => { $('cartDrawer').classList.toggle('active'); $('overlay').classList.toggle('active'); };
  window.closeAll = () => { document.querySelectorAll('.active').forEach(e => e.classList.remove('active')); };
  window.scrollToId = (id) => { $(id).scrollIntoView({behavior:'smooth'}); };
  window.modQty = (i, d) => { cart[i].qty += d; if(cart[i].qty <= 0) cart.splice(i, 1); saveCart(); updateCartUI(); };
  window.updateShip = (c, l) => { shipping = { cost: c, label: l }; $('shipLabel').innerText = l; updateCartUI(); };
  window.emptyCart = () => { if(confirm("¿Vaciar?")) { cart=[]; saveCart(); updateCartUI(); } };
  function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart() { try{ cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch(e){cart=[];} }
  function toast(m) { const t=$('toast'); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); }
  
  /* SOCIAL PROOF */
  function showSocialProof() {
      const names = ["Alberto", "Juan", "Mariana", "Roberto", "Carlos"];
      const locs = ["Tijuana", "Ensenada", "San Diego", "Mexicali"];
      const notif = document.getElementById('sales-notification');
      if(notif) {
          const name = names[Math.floor(Math.random()*names.length)];
          const loc = locs[Math.floor(Math.random()*locs.length)];
          document.getElementById('notif-content').innerHTML = `¡<b>${name}</b> de ${loc} compró productos oficiales!`;
          notif.classList.add('active');
          setTimeout(() => notif.classList.remove('active'), 5000);
      }
  }

  /* LEGAL */
  const LEGAL_TXT = {
      privacidad: "<h2>Aviso de Privacidad</h2><p>Tus datos son seguros. Solo se usan para procesar el pedido.</p>",
      terminos: "<h2>Términos</h2><p>Cambios solo por defecto de fábrica en 30 días.</p>",
      legal: "<h2>Legal</h2><p>BAJATEX S. de R.L. de C.V.</p>",
      contacto: "<h2>Contacto</h2><p>ventas.unicotextil@gmail.com</p>"
  };
  window.openLegal = (t) => { $('legalTitle').innerText=t.toUpperCase(); $('legalBody').innerHTML=LEGAL_TXT[t]; $('legalModal').classList.add('active'); $('overlay').classList.add('active'); };
  window.closeLegal = () => { $('legalModal').classList.remove('active'); $('overlay').classList.remove('active'); };
  window.togglePromo = () => $('promo-box').classList.toggle('open');

  document.addEventListener('DOMContentLoaded', init);
})();