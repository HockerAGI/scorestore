// SCORE STORE — MAIN JS (v15 - Production Ready)
// Configuración unificada con cotizador y Stripe

const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh"; 

const $ = id => document.getElementById(id);

function toStr(v) { return (v ?? '').toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }
function digits(v) { return toStr(v).replace(/\D+/g,''); }

let catalog = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: null, cost: 0 };

function money(n){ return `$${(Number(n)||0).toLocaleString('es-MX', {minimumFractionDigits: 0})} MXN`; }

function save(){
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCart(true);
}

function openDrawer(){
  $('drawer').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
}

function closeAll(){
  $('drawer').classList.remove('active');
  $('modalCatalog').classList.remove('active');
  $('overlay').classList.remove('active');
  document.body.classList.remove('modalOpen');
}

async function loadCatalog(){
  try{
    // Cache busting para asegurar precios frescos
    const res = await fetch('/data/catalog.json?t=' + Date.now());
    const data = await res.json();
    catalog = data.products || [];
  }catch(e){
    console.error("Error catálogo:", e);
    catalog = [];
  }
}

// Abre el modal de catálogo filtrado
async function openCatalog(sectionId, title) {
  await loadCatalog();
  $('catTitle').innerText = title.toUpperCase();
  const wrap = $('catContent');
  wrap.innerHTML = '';
  
  const items = catalog.filter(p => p.sectionId === sectionId);
  
  if(items.length === 0) {
    wrap.innerHTML = '<p style="text-align:center; padding:20px;">Próximamente disponible.</p>';
  } else {
    // Agrupar por subsección
    const groups = {};
    items.forEach(p => {
      const sub = p.subSection || 'General';
      if(!groups[sub]) groups[sub] = [];
      groups[sub].push(p);
    });

    Object.keys(groups).forEach(sub => {
      const h4 = document.createElement('h4');
      h4.className = 'catSectionTitle';
      h4.innerText = sub;
      wrap.appendChild(h4);

      const grid = document.createElement('div');
      grid.className = 'catGrid';
      
      groups[sub].forEach(p => {
        const card = document.createElement('div');
        card.className = 'prodCard';
        const sizesOpts = (p.sizes || []).map(s => `<option value="${s}">${s}</option>`).join('');
        
        card.innerHTML = `
          <img src="${p.img}" alt="${p.name}" loading="lazy">
          <strong>${p.name}</strong>
          <div style="color:var(--red); font-weight:700; margin:5px 0;">${money(p.baseMXN)}</div>
          ${p.sizes && p.sizes.length ? `<select id="size_${p.id}">${sizesOpts}</select>` : ''}
          <button class="btn-sm" onclick="addToCart('${p.id}')">AGREGAR</button>
        `;
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    });
  }
  
  $('modalCatalog').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
}

function addToCart(id){
  const p = catalog.find(x => x.id === id);
  if(!p) return;
  
  const sizeEl = document.getElementById('size_' + id);
  const size = sizeEl ? sizeEl.value : null;
  
  const key = size ? `${id}__${size}` : id;
  const existing = cart.find(x => x.key === key);
  
  if(existing) existing.qty += 1;
  else cart.push({ key, id, name:p.name, price:p.baseMXN, size, qty:1 });

  save();
  showToast("Agregado al carrito");
  openDrawer();
}

function removeItem(key){
  cart = cart.filter(x => x.key !== key);
  save();
}

function changeQty(key, delta){
  const item = cart.find(x => x.key === key);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) cart = cart.filter(x => x.key !== key);
  save();
}

function showToast(msg){
  const t = $('toast');
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// --- LÓGICA DE ENVÍOS ---

async function quoteShipping() {
  const method = $('shipMethod')?.value || ship.method || 'pickup';
  ship.method = method;

  const resEl = $('quoteResult');
  if (!resEl) return;

  const postal = digits($('cp')?.value);
  const addr = toStr($('addr')?.value);
  let state_code = upper($('state')?.value);
  let city = toStr($('city')?.value);

  // 1. Recolección
  if (method === 'pickup') {
    ship.cost = 0;
    resEl.style.display = 'none';
    updateCart(false);
    return;
  }

  // 2. Entrega Tijuana (Autocompletar BC/Tijuana)
  if (method === 'tj') {
    if (!state_code) state_code = 'BC';
    if (!city) city = 'Tijuana';
    const stEl = $('state'); if (stEl && !toStr(stEl.value)) stEl.value = state_code;
    const ctEl = $('city'); if (ctEl && !toStr(ctEl.value)) ctEl.value = city;
  }

  const needsFull = (method === 'mx');

  // Validación básica
  if (postal.length !== 5 || addr.length < 5 || (needsFull && (state_code.length < 2 || city.length < 3))) {
    ship.cost = 0;
    resEl.style.display = 'block';
    resEl.style.color = '#c0392b';
    resEl.innerText = needsFull
      ? 'Completa CP, Estado, Ciudad y Dirección.'
      : 'Completa CP y Dirección.';
    updateCart(false);
    return;
  }

  resEl.style.display = 'block';
  resEl.style.color = '#333';
  resEl.innerText = 'Cotizando...';

  try {
    const res = await fetch('/.netlify/functions/quote_shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: method,
        to: { postal_code: postal, state_code, city, address1: addr },
        items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size }))
      })
    });

    const data = await res.json();
    if (data.ok) {
      ship.cost = Number(data.mxn || 0);
      resEl.style.color = '#00C853';
      resEl.innerText = `${data.carrier ? data.carrier + ': ' : ''}$${ship.cost} MXN`;
    } else {
      ship.cost = 0;
      resEl.style.color = '#c0392b';
      resEl.innerText = data.error || 'No se pudo cotizar.';
    }
  } catch (e) {
    console.error(e);
    ship.cost = 0;
    resEl.style.color = '#c0392b';
    resEl.innerText = 'Error de conexión.';
  }

  updateCart(false);
}

let _quoteTimer = null;
function scheduleQuote() {
  clearTimeout(_quoteTimer);
  _quoteTimer = setTimeout(() => quoteShipping(), 500); 
}

function updateCart(resetShip = true) {
  const methodEl = $('shipMethod');
  const method = methodEl ? methodEl.value : 'pickup';
  ship.method = method;

  const shipForm = $('shipForm');
  const needsAddress = (method !== 'pickup');
  if (shipForm) shipForm.style.display = needsAddress ? 'block' : 'none';
  
  const qr = $('quoteResult');
  if (qr) qr.style.display = (needsAddress && ship.cost > 0) ? 'block' : 'none';

  if (resetShip) {
    ship.cost = 0; 
    if(qr) qr.style.display = 'none';
  }

  const sub = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
  const total = sub + (ship.cost || 0);

  $('cartCount').innerText = cart.reduce((a,i)=>a+i.qty, 0);
  $('lnSub').innerText = money(sub);
  $('shipCost').innerText = (ship.cost > 0) ? money(ship.cost) : (method === 'pickup' ? 'Gratis' : '--');
  $('lnTotal').innerText = money(total);
  $('barTotal').innerText = money(total);

  const list = $('cartBody');
  if(list){
    list.innerHTML = '';
    if(cart.length === 0) list.innerHTML = '<p style="text-align:center; opacity:0.6; margin-top:20px;">Tu carrito está vacío.</p>';
    
    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'sumRow'; 
      row.innerHTML = `
        <div style="flex:1">
          <div>${item.name} ${item.size ? `<span style="font-size:11px; background:#eee; padding:2px 5px; border-radius:4px;">${item.size}</span>` : ''}</div>
          <div style="font-size:12px; opacity:0.7;">${money(item.price)} x ${item.qty}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button style="width:24px; height:24px; border-radius:50%; border:1px solid #ccc; background:#fff;" onclick="changeQty('${item.key}', -1)">-</button>
          <button style="width:24px; height:24px; border-radius:50%; border:1px solid #ccc; background:#fff;" onclick="changeQty('${item.key}', 1)">+</button>
          <button style="color:red; border:none; background:none; font-weight:bold; cursor:pointer;" onclick="removeItem('${item.key}')">&times;</button>
        </div>
      `;
      list.appendChild(row);
    });
  }

  let valid = cart.length > 0 && method;
  if (method !== 'pickup') {
    const postal = digits($('cp')?.value);
    const addr = toStr($('addr')?.value);
    const name = toStr($('name')?.value);
    valid = valid && postal.length === 5 && addr.length > 5 && name.length > 2 && ship.cost > 0;
  }

  const btn = $('payBtn');
  if (btn) btn.disabled = !valid;
  
  $('paybar').classList.toggle('visible', cart.length > 0);
}

async function checkout() {
  const btn = $('payBtn');
  if (btn) { btn.innerText = "PROCESANDO..."; btn.disabled = true; }

  try {
    const stripe = Stripe(STRIPE_PK);
    const method = $('shipMethod')?.value || 'pickup';
    const promoCode = $('promoCode')?.value || ""; // ✅ Captura el cupón
    
    const postal = digits($('cp')?.value);
    const addr = toStr($('addr')?.value);
    const name = toStr($('name')?.value);
    let state = upper($('state')?.value);
    let city = toStr($('city')?.value);
    
    if(method === 'tj') {
       if(!state) state = 'BC';
       if(!city) city = 'Tijuana';
    }

    const payload = {
      items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
      mode: method,
      promoCode: promoCode, // ✅ Envía el cupón
      to: { postal_code: postal, state_code: state, city, address1: addr, name }
    };

    const res = await fetch('/.netlify/functions/create_checkout', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error || "Error iniciando pago.");
    
  } catch (e) {
    alert(e.message || "Error desconocido");
    if (btn) { btn.innerText = "PAGAR AHORA"; btn.disabled = false; }
  }
}

const shipMethodEl = $('shipMethod');
if (shipMethodEl) shipMethodEl.addEventListener('change', () => { updateCart(true); scheduleQuote(); });

const overlay = $('overlay');
if(overlay) overlay.onclick = closeAll;

['cp','state','city','addr'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', () => { updateCart(false); scheduleQuote(); }); 
});

const nameEl = $('name');
if (nameEl) nameEl.addEventListener('input', () => updateCart(false));

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

loadCatalog();
updateCart(true);
