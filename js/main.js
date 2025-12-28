/**
 * js/main.js - CORE LOGIC V14
 */

const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";
const USD_RATE = 17.50; 

// Cache en memoria (RAM)
let _catalogCache = null;

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: null, cost: 0 };
const $ = id => document.getElementById(id);

function smoothScroll(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({behavior:'smooth'});
}

function showToast(msg) {
  const t = $('toast');
  if (t) {
    t.innerText = msg;
    t.style.visibility = 'visible'; 
    t.classList.add('show');
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.style.visibility = 'hidden', 300);
    }, 2500);
  }
}

/**
 * Abre el catálogo
 * USA "Cache Busting" (?t=...) para garantizar datos nuevos si hay internet
 */
async function openCatalog(sectionId, title) {
  $('catTitle').innerText = title.toUpperCase();
  const content = $('catContent');
  const modal = $('modalCatalog');
  
  // 1. Mostrar SKELETON
  if (!_catalogCache) {
    let skeletons = '';
    for(let i=0; i<4; i++) skeletons += `<div class="prodCard skeleton" style="height:320px;"></div>`;
    content.innerHTML = `<div class="catGrid">${skeletons}</div>`;
  }

  modal.classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
  
  // Atrupar foco (A11y)
  trapFocus(modal);

  try {
    // 2. Fetch con Cache Busting para evitar datos viejos
    if (!_catalogCache) {
      // EL TRUCO: ?t=... fuerza al navegador a pedirlo de nuevo
      const res = await fetch(`/data/catalog.json?t=${Date.now()}`);
      if(res.ok) _catalogCache = await res.json();
    }
    
    let items = (_catalogCache?.products || []).filter(p => p.sectionId === sectionId);

    if(!items.length) {
       content.innerHTML = `<div style='text-align:center; padding:40px; color:#666;'><h3>PRÓXIMAMENTE</h3><p>Estamos preparando esta colección.</p></div>`;
       return;
    }

    const groups = {};
    items.forEach(p => {
      const k = p.subSection || 'GENERAL';
      if(!groups[k]) groups[k] = [];
      groups[k].push(p);
    });

    const keys = Object.keys(groups).sort((a,b) => {
        if(a.includes('2025')) return -1;
        if(b.includes('2025')) return 1;
        return 0;
    });

    let html = '';
    for (const groupName of keys) {
      html += `<div class="catSectionTitle">${groupName}</div>`;
      html += `<div class="catGrid">`;
      html += groups[groupName].map(p => `
        <div class="prodCard">
          <img src="${p.img}" alt="${p.name}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='/assets/logo-score.webp'">
          <div style="font-weight:700; font-size:14px; margin:5px 0;">${p.name}</div>
          <div style="color:var(--red); font-weight:900;">$${p.baseMXN || p.price}</div>
          <select id="size_${p.id}" aria-label="Talla">
            ${(p.sizes || ['Unitalla']).map(s=>`<option>${s}</option>`).join('')}
          </select>
          <button id="btn_${p.id}" class="btn primary" style="width:100%; justify-content:center; padding:8px;" 
            onclick="add('${p.id}','${p.name}',${p.baseMXN || p.price},'${p.img}')">AGREGAR</button>
        </div>
      `).join('');
      html += `</div>`;
    }
    content.innerHTML = html;

  } catch(e) { 
    console.error(e);
    content.innerHTML = '<p style="text-align:center;">Error de conexión.</p>';
  }
}

function add(id, name, price, img) {
  const btn = $(`btn_${id}`);
  const originalText = btn ? btn.innerText : 'AGREGAR';
  
  if(btn) {
    btn.innerText = "¡LISTO!";
    btn.style.background = "var(--green)";
    btn.style.color = "#fff";
  }

  const size = $(`size_${id}`).value;
  const key = id + size;
  const exist = cart.find(i => i.key === key);
  if(exist) exist.qty++; else cart.push({ key, id, name, price, img, size, qty:1 });
  
  save();
  showToast("Agregado al carrito");

  setTimeout(() => {
    if(btn) {
      btn.innerText = originalText;
      btn.style.background = "";
      btn.style.color = "";
    }
    closeAll();
    openDrawer();
  }, 600);
}

async function quoteShipping() {
  const cp = $('cp').value;
  if(cp.length !== 5) return;
  
  const resEl = $('quoteResult');
  resEl.style.display = 'block';
  resEl.innerText = 'Cotizando...';
  
  try {
    const res = await fetch('/.netlify/functions/quote_shipping', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ to: { postal_code: cp }, items: cart })
    });
    const data = await res.json();
    if(data.ok) {
      ship.cost = data.mxn;
      resEl.innerText = `Envío: $${data.mxn} MXN (${data.carrier})`;
      resEl.style.color = "var(--green)";
      updateCart(false);
    } else {
      ship.cost = 250;
      resEl.innerText = 'Tarifa estandar: $250';
      updateCart(false);
    }
  } catch(e) { console.error(e); }
}

function updateCart(resetShip = true) {
  const methodEl = $('shipMethod');
  const method = methodEl ? methodEl.value : '';
  ship.method = method;
  
  if(resetShip) {
    if(method === 'tj') ship.cost = 200; 
    else if(method === 'pickup') ship.cost = 0;
    else if(method === 'mx') { ship.cost = 0; if($('cp').value.length === 5) quoteShipping(); }
  }

  const shipForm = $('shipForm');
  if(shipForm) shipForm.style.display = (method === 'mx') ? 'block' : 'none';
  
  const sub = cart.reduce((a,b) => a + (b.price*b.qty), 0);
  const total = sub + ship.cost;
  const usd = (total / USD_RATE).toFixed(2);
  
  const countEl = $('cartCount');
  if(countEl) {
    countEl.innerText = cart.reduce((a,b)=>a+b.qty,0);
    const trigger = $('cartBtnTrigger');
    trigger.classList.remove('cart-bounce');
    void trigger.offsetWidth; 
    trigger.classList.add('cart-bounce');
  }

  const elSub = $('lnSub'); if(elSub) elSub.innerText = `$${sub}`;
  const elShip = $('lnShip'); if(elShip) elShip.innerText = `$${ship.cost}`;
  const elTotal = $('lnTotal'); if(elTotal) elTotal.innerText = `$${total} MXN`;
  const elUsd = $('lnUsd'); if(elUsd) elUsd.innerText = `aprox $${usd} USD`;
  const elBar = $('barTotal'); if(elBar) elBar.innerText = `$${total}`;
  
  const cartBody = $('cartBody');
  if (cart.length === 0) {
      cartBody.innerHTML = '<div style="text-align:center; padding:40px 20px; opacity:0.5;">Tu equipo está vacío</div>';
  } else {
      cartBody.innerHTML = cart.map((i,x) => `
        <div style="display:flex; gap:10px; margin-bottom:12px; background:#f4f4f4; padding:10px; border-radius:8px;">
          <img src="${i.img}" style="width:60px; height:60px; object-fit:contain; mix-blend-mode:multiply;">
          <div style="flex:1;">
            <div style="font-weight:700; font-size:13px; line-height:1.2;">${i.name}</div>
            <div style="font-size:12px; color:#666;">Talla: ${i.size}</div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; justify-content:space-between;">
            <button onclick="removeItem(${x})" aria-label="Eliminar ${i.name}" style="color:var(--red); border:none; background:none; font-weight:900; font-size:16px; cursor:pointer;">&times;</button>
            <div style="font-weight:900;">x${i.qty}</div>
          </div>
        </div>
      `).join('');
  }

  const paybar = $('paybar');
  if(paybar) paybar.classList.toggle('visible', cart.length > 0);
  
  let valid = cart.length > 0 && method;
  if(method === 'mx') valid = valid && $('cp').value.length === 5 && $('addr').value.length > 5 && ship.cost > 0;
  
  const btn = $('payBtn');
  if(btn) btn.disabled = !valid;
}

function removeItem(index) { cart.splice(index, 1); save(); }

async function checkout() {
  const btn = $('payBtn');
  btn.innerText = "PROCESANDO..."; btn.disabled = true;
  try {
    const stripe = Stripe(STRIPE_PK);
    const payload = {
      items: cart,
      shipping: {
        method: ship.method,
        cost: ship.cost,
        data: { cp: $('cp').value, address: $('addr').value, name: $('name').value }
      },
      mode: ship.method,
      to: { postal_code: $('cp').value }
    };
    const res = await fetch('/.netlify/functions/create_checkout', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(data.url) window.location.href = data.url;
    else throw new Error("Error iniciando pago.");
  } catch(e) {
    alert(e.message || "Error desconocido"); 
    btn.innerText = "IR A PAGAR"; btn.disabled = false;
  }
}

function save() { localStorage.setItem('cart', JSON.stringify(cart)); updateCart(); }

function openDrawer() { 
  const drawer = $('drawer');
  drawer.classList.add('active'); 
  $('overlay').classList.add('active'); 
  document.body.classList.add('modalOpen'); 
  $('cartBtnTrigger').setAttribute('aria-expanded', 'true');
  updateCart(); 
  trapFocus(drawer);
}

function closeAll() { 
  $('drawer').classList.remove('active'); 
  $('modalCatalog').classList.remove('active'); 
  $('overlay').classList.remove('active');
  document.body.classList.remove('modalOpen');
  $('cartBtnTrigger').setAttribute('aria-expanded', 'false');
  // Return focus to main content
  $('mainContent').focus();
}

// A11y Focus Trap
function trapFocus(element) {
  const focusableElements = element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  element.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) { /* shift + tab */
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else { /* tab */
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
    if (e.key === 'Escape') closeAll();
  });
  // Focus first element initially
  if(firstElement) firstElement.focus();
}

const overlay = $('overlay');
if(overlay) overlay.onclick = closeAll;

['cp','addr','name'].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener('input', () => updateCart(id !== 'cp')); 
});

if('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

updateCart();