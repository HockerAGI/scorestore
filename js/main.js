(function () {
  const STRIPE_KEY = 'pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh';
  const API_BASE = "/.netlify/functions";
  const CART_KEY = "score_cart_prod_v2";

  let cart = [];
  let catalog = {};
  let shipping = { cost: 0, label: "Gratis (Fábrica)" };
  
  // DATOS DUROS PARA EVITAR ERROR DE CARGA
  const FALLBACK_CATALOG = {
    products: [
       { id: "b1k-jacket", sectionId: "BAJA_1000", name: "Chamarra Oficial Baja 1000", baseMXN: 1890, img: "/assets/EDICION_2025/chamarra-baja1000.webp" },
       { id: "b1k-hoodie", sectionId: "BAJA_1000", name: "Hoodie Negro Baja 1000", baseMXN: 1100, img: "/assets/EDICION_2025/hoodie-negro-gris-baja1000.webp" },
       { id: "b500-tee", sectionId: "BAJA_500", name: "Camiseta Baja 500", baseMXN: 480, img: "/assets/BAJA500/camiseta-gris-baja500.webp" },
       { id: "sf250-tank", sectionId: "SF_250", name: "Tank Top San Felipe", baseMXN: 440, img: "/assets/SF250/camiseta-negra-sinmangas-SF250.webp" }
    ]
  };

  const $ = (id) => document.getElementById(id);
  const money = (n) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

  /* --- 1. CORE FUNCTIONS (GLOBALES) --- */
  
  window.scrollToId = (id) => { 
    const el = $(id); 
    if(el) el.scrollIntoView({behavior:'smooth'}); 
  };

  window.openDrawer = () => {
    $('drawer').classList.add('active');
    $('overlay').classList.add('active');
    document.body.classList.add('modalOpen');
  };

  window.closeAll = () => {
    document.querySelectorAll('.modal, .drawer, .footer-card').forEach(e => e.classList.remove('active'));
    $('overlay').classList.remove('active');
    document.body.classList.remove('modalOpen');
  };

  window.toggleCart = () => {
    const d = $('drawer');
    if (d.classList.contains('active')) window.closeAll();
    else window.openDrawer();
  };

  /* --- 2. CATALOGIC LOGIC --- */
  
  window.openCatalog = (sid, title) => {
    const items = catalog.products.filter(p => p.sectionId === sid);
    $('catTitle').innerText = title;
    
    const content = $('catContent');
    content.innerHTML = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px;"></div>';
    const grid = content.querySelector('div');

    if(items.length === 0) {
        content.innerHTML = '<p style="text-align:center; padding:40px; color:#555;">Próximamente disponible.</p>';
        return;
    }

    items.forEach(p => {
        const card = document.createElement('div');
        card.style.cssText = "background:#fff; border:1px solid #eee; padding:15px; border-radius:12px; text-align:center;";
        card.innerHTML = `
            <img src="${p.img}" style="width:100%; height:200px; object-fit:contain; margin-bottom:10px;">
            <div style="font-weight:bold; font-size:16px; margin-bottom:5px;">${p.name}</div>
            <div style="color:#E10600; font-family:'Teko'; font-size:24px; font-weight:bold;">${money(p.baseMXN)}</div>
            <button onclick="addToCart('${p.id}')" style="background:#E10600; color:white; border:none; width:100%; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; margin-top:10px;">AGREGAR</button>
        `;
        grid.appendChild(card);
    });

    $('modalCatalog').classList.add('active');
    $('overlay').classList.add('active');
  };

  window.addToCart = (pid) => {
      const p = catalog.products.find(x => x.id === pid);
      const exist = cart.find(x => x.id === pid);
      if(exist) exist.qty++; else cart.push({...p, qty:1});
      saveCart(); updateCartUI(); showToast("Agregado al pedido");
      window.openDrawer();
  };

  /* --- 3. CART & CHECKOUT --- */
  
  window.updateShip = () => {
      const radios = document.getElementsByName('shipMode');
      let val = 'pickup';
      for(const r of radios) if(r.checked) val = r.value;

      const f = $('shipForm');
      if(val === 'pickup') { shipping.cost = 0; f.style.display='none'; }
      else if(val === 'mx') { shipping.cost = 250; f.style.display='block'; }
      else { shipping.cost = 800; f.style.display='block'; }
      
      updateCartUI();
  };

  window.checkout = async () => {
      if(!cart.length) return showToast("Carrito vacío");
      const btn = $('checkoutBtn');
      btn.innerText = "PROCESANDO...";
      btn.disabled = true;

      try {
          const res = await fetch(`${API_BASE}/create_checkout`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ cart, shippingMode: document.querySelector('input[name="shipMode"]:checked').value })
          });
          const data = await res.json();
          if(data.url) location.href = data.url;
          else throw new Error("Error iniciando pago");
      } catch(e) {
          alert("Error: " + e.message);
          btn.disabled = false; btn.innerText = "PAGAR AHORA";
      }
  };

  /* --- 4. LEGAL & UTILS --- */
  
  const LEGAL_TXT = {
      privacidad: "<h2>Aviso de Privacidad</h2><p>Tus datos son seguros. Solo se usan para procesar el pedido.</p>",
      terminos: "<h2>Términos y Condiciones</h2><p>Ventas finales. Cambios solo por defecto de fábrica (5 días).</p>",
      legal: "<h2>Información Legal</h2><p>BAJATEX S. de R.L. de C.V.<br>RFC: BAJ220613P51<br>Tijuana, B.C.</p>",
      contacto: "<h2>Contacto</h2><p>ventas.unicotextil@gmail.com<br>WhatsApp: +52 664 236 8701</p>"
  };

  window.openFooterLegal = (key) => {
      const card = $('footerCard');
      const content = $('footerCardContent');
      content.innerHTML = LEGAL_TXT[key];
      card.classList.add('active');
      $('overlay').classList.add('active');
  };
  
  window.closeFooterCard = () => {
      $('footerCard').classList.remove('active');
      $('overlay').classList.remove('active');
  };

  window.emptyCart = () => { if(confirm("¿Vaciar?")){ cart=[]; saveCart(); updateCartUI(); } };
  
  function updateCartUI() {
      const list = $('cartItems'); list.innerHTML = '';
      let sub = 0;
      cart.forEach(i => {
          sub += i.baseMXN * i.qty;
          list.innerHTML += `<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;">
             <img src="${i.img}" width="50">
             <div><b>${i.name}</b><br><small>Qty: ${i.qty}</small></div>
             <div>${money(i.baseMXN*i.qty)}</div>
          </div>`;
      });
      $('subTotal').innerText = money(sub);
      $('shipTotal').innerText = shipping.cost === 0 ? 'Gratis' : money(shipping.cost);
      $('grandTotal').innerText = money(sub + shipping.cost);
      $('cartCount').innerText = cart.reduce((a,b)=>a+b.qty,0);
  }

  function showToast(m) { const t=$('toast'); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
  function saveCart(){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
  function loadCart(){ try{ cart=JSON.parse(localStorage.getItem(CART_KEY))||[]; }catch{cart=[];} }

  /* --- INIT --- */
  async function init() {
      // Intro 4s
      setTimeout(() => { 
          $('aguja').style.transform = "rotate(80deg)"; 
      }, 500);
      setTimeout(() => { 
          $('splash-screen').style.opacity = '0';
          setTimeout(()=> { $('splash-screen').style.display='none'; }, 600);
      }, 4000);

      try {
          const res = await fetch("/data/catalog.json");
          if(res.ok) catalog = await res.json();
          else catalog = FALLBACK_CATALOG;
      } catch { catalog = FALLBACK_CATALOG; }

      loadCart();
      updateCartUI();
  }

  document.addEventListener('DOMContentLoaded', init);
})();