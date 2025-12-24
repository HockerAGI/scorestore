/**
 * js/main.js
 * Lógica principal: Carrito, Catálogo Inteligente, Stripe y Envíos.
 */

const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";
const USD_RATE = 17.50; 

// Fallback por si falla la carga del JSON
const PRODUCTS_BACKUP = [
  { id:"chamarra-oficial", name:"Chamarra Oficial Baja 1000", price:1789, img:"/assets/EDICION_2025/chamarra-baja1000.webp", sizes:["S","M","L","XL","2XL"], section:"BAJA_1000" }
];

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: null, cost: 0 };
const $ = id => document.getElementById(id);

function smoothScroll(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if(el) el.scrollIntoView({behavior:'smooth'});
}

/**
 * Abre el catálogo y AGRUPA los productos por subsección (ej: 2025 vs Anteriores)
 */
async function openCatalog(sectionId, title) {
  $('catTitle').innerText = title.toUpperCase();
  const content = $('catContent');
  content.innerHTML = '<p style="text-align:center; padding:40px;">Cargando colección...</p>';
  
  try {
    const res = await fetch('/data/catalog.json');
    let items = [];
    
    if(res.ok) {
      const data = await res.json();
      items = data.products.filter(p => p.sectionId === sectionId);
    }

    if(!items.length) {
        if(sectionId === 'BAJA_1000') items = PRODUCTS_BACKUP;
        else {
            content.innerHTML = `<div style='text-align:center; padding:40px; color:#666;'><h3>PRÓXIMAMENTE</h3><p>Estamos preparando esta colección.</p></div>`;
            $('modalCatalog').classList.add('active');
            $('overlay').classList.add('active');
            document.body.classList.add('modalOpen');
            return;
        }
    }

    // LÓGICA DE AGRUPACIÓN (UX MEJORADA)
    const groups = {};
    items.forEach(p => {
      // Si no tiene subSection, lo ponemos en "General"
      const k = p.subSection || 'GENERAL';
      if(!groups[k]) groups[k] = [];
      groups[k].push(p);
    });

    let html = '';
    // Ordenamos para que "COLECCIÓN 2025" salga primero si existe
    const keys = Object.keys(groups).sort((a,b) => b.includes('2025') ? 1 : -1);

    for (const groupName of keys) {
      const prods = groups[groupName];
      html += `<div class="catSectionTitle">${groupName}</div>`;
      html += `<div class="catGrid">`;
      html += prods.map(p => `
        <div class="prodCard">
          <img src="${p.img}" onerror="this.src='/assets/logo-score.webp'" width="160" height="213" loading="lazy" alt="${p.name}">
          <div style="font-weight:700; font-size:14px; margin:5px 0;">${p.name}</div>
          <div style="color:var(--red); font-weight:900;">$${p.baseMXN || p.price}</div>
          <select id="size_${p.id}" style="margin:5px 0; height:36px; font-size:14px !important;">
            ${(p.sizes || ['Unitalla']).map(s=>`<option>${s}</option>`)}
          </select>
          <button class="btn primary" style="width:100%; justify-content:center; padding:8px;" 
            onclick="add('${p.id}','${p.name}',${p.baseMXN || p.price},'${p.img}')">AGREGAR</button>
        </div>
      `).join('');
      html += `</div>`;
    }
    content.innerHTML = html;
    
    $('modalCatalog').classList.add('active');
    $('overlay').classList.add('active');
    document.body.classList.add('modalOpen');

  } catch(e) { 
    console.error("Error catálogo:", e);
    content.innerHTML = '<p style="text-align:center; padding:20px; color:red;">Error de conexión. Intenta de nuevo.</p>';
  }
}

function add(id, name, price, img) {
  const sizeInput = $(`size_${id}`);
  const size = sizeInput ? sizeInput.value : 'Unitalla';
  const key = id + size;
  
  const exist = cart.find(i => i.key === key);
  if(exist) exist.qty++; else cart.push({ key, id, name, price, img, size, qty:1 });
  
  save();
  closeAll();
  openDrawer();
  showToast("Agregado al equipo");
}

async function quoteShipping() {
  const cp = $('cp').value;
  if(cp.length !== 5) return;
  
  $('quoteResult').style.display = 'block';
  $('quoteResult').innerText = 'Cotizando envío...';
  
  try {
    const res = await fetch('/.netlify/functions/quote_shipping', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ to: { postal_code: cp }, items: cart })
    });
    const data = await res.json();
    
    if(data.ok) {
      ship.cost = data.mxn;
      $('quoteResult').innerText = `Envío: $${data.mxn} MXN (${data.carrier})`;
      updateCart(false);
    } else {
      ship.cost = 250;
      $('quoteResult').innerText = 'Tarifa estandar: $250';
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

  $('shipForm').style.display = (method === 'mx') ? 'block' : 'none';
  
  const sub = cart.reduce((a,b) => a + (b.price*b.qty), 0);
  const total = sub + ship.cost;
  const usd = (total / USD_RATE).toFixed(2);
  
  $('cartCount').innerText = cart.reduce((a,b)=>a+b.qty,0);
  $('lnSub').innerText = `$${sub} MXN`;
  $('lnShip').innerText = `$${ship.cost} MXN`;
  $('lnTotal').innerText = `$${total} MXN`;
  $('lnUsd').innerText = `aprox $${usd} USD`;
  $('barTotal').innerText = `$${total}`;
  
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
            <button onclick="removeItem(${x})" style="color:var(--red); border:none; background:none; font-weight:900; font-size:16px; cursor:pointer;">&times;</button>
            <div style="font-weight:900;">x${i.qty}</div>
          </div>
        </div>
      `).join('');
  }

  const hasItems = cart.length > 0;
  $('paybar').classList.toggle('visible', hasItems);
  
  let valid = hasItems && method;
  if(method === 'mx') valid = valid && $('cp').value.length === 5 && $('addr').value.length > 5 && ship.cost > 0;
  $('payBtn').disabled = !valid;
}

function removeItem(index) {
    cart.splice(index, 1);
    save();
}

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
function openDrawer() { $('drawer').classList.add('active'); $('overlay').classList.add('active'); document.body.classList.add('modalOpen'); updateCart(); }
function closeAll() { 
  $('drawer').classList.remove('active'); 
  $('modalCatalog').classList.remove('active'); 
  $('overlay').classList.remove('active');
  document.body.classList.remove('modalOpen');
}
function showToast(m) { 
  const t=$('toast'); 
  if(t) {
    t.innerText=m; 
    t.classList.add('show'); 
    setTimeout(()=>t.classList.remove('show'),2000); 
  }
}

// Event Listeners
const overlay = $('overlay');
if(overlay) overlay.onclick = closeAll;

['cp','addr','name'].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener('input', () => updateCart(id !== 'cp')); 
});

// PWA Registro
if('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

// Init
updateCart();
