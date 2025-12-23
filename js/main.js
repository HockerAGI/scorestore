const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";
const USD_RATE = 17.5;

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: null, cost: 0 };
const $ = id => document.getElementById(id);

function smoothScroll(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

async function openCatalog(section, title) {
  $('catTitle').innerText = title.toUpperCase();
  let items = [];
  try {
    const res = await fetch('/data/catalog.json');
    if (res.ok) {
      const data = await res.json();
      items = data.products.filter(p => p.sectionId === section);
    }
  } catch (e) {
    console.log('Error cargando catálogo:', e);
  }

  const grid = $('catGrid');

  if (!items.length) {
    grid.innerHTML = `<div style='grid-column:1/-1; text-align:center; padding:60px 20px; color:#888;'><h3>Próximamente</h3><p>Estamos preparando la colección oficial.</p></div>`;
  } else {
    grid.innerHTML = items.map(p => `
      <div class="prodCard">
        <img src="${p.img}" alt="${p.name}" onerror="this.src='/assets/logo-score.webp'" width="160" height="213" loading="lazy">
        <div style="font-weight:700; font-size:14px; margin:5px 0;">${p.name}</div>
        <div style="color:var(--red); font-weight:900;">$${p.baseMXN || p.price}</div>
        <select id="size_${p.id}" style="margin:5px 0; height:36px;">
          ${(p.sizes || ['Unitalla']).map(s => `<option>${s}</option>`).join('')}
        </select>
        <button class="btn primary" style="width:100%;" onclick="add('${p.id}','${p.name}',${p.baseMXN || p.price},'${p.img}')">AGREGAR</button>
      </div>
    `).join('');
  }

  $('modalCatalog').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
}

function add(id, name, price, img) {
  const size = $(`size_${id}`).value;
  const key = id + size;
  const exist = cart.find(i => i.key === key);
  if (exist) exist.qty++;
  else cart.push({ key, id, name, price, img, size, qty: 1 });
  save();
  closeAll();
  openDrawer();
  showToast("Agregado al carrito");
}

async function quoteShipping() {
  const cp = $('cp').value;
  if (cp.length !== 5) return;
  $('quoteResult').style.display = 'block';
  $('quoteResult').innerText = 'Cotizando...';
  try {
    const res = await fetch('/.netlify/functions/quote_shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: { postal_code: cp }, items: cart })
    });
    const data = await res.json();
    if (data.ok) {
      ship.cost = data.mxn;
      $('quoteResult').innerText = `Envío: $${data.mxn} MXN (${data.carrier})`;
      updateCart(false);
    } else {
      ship.cost = 250;
      $('quoteResult').innerText = 'Tarifa estándar: $250';
      updateCart(false);
    }
  } catch (e) {
    console.error(e);
  }
}

function updateCart(resetShip = true) {
  const method = $('shipMethod').value;
  ship.method = method;

  if (resetShip) {
    if (method === 'pickup') ship.cost = 0;
    else if (method === 'tj') ship.cost = 200;
    else if (method === 'mx') {
      ship.cost = 0;
      if ($('cp').value.length === 5) quoteShipping();
    }
  }

  $('shipForm').style.display = method === 'mx' ? 'block' : 'none';

  const sub = cart.reduce((a, b) => a + (b.price * b.qty), 0);
  const total = sub + ship.cost;
  const usd = (total / USD_RATE).toFixed(2);

  $('cartCount').innerText = cart.reduce((a, b) => a + b.qty, 0);
  $('lnSub').innerText = `$${sub} MXN`;
  $('lnShip').innerText = `$${ship.cost} MXN`;
  $('lnTotal').innerText = `$${total} MXN`;
  $('lnUsd').innerText = `aprox $${usd} USD`;
  $('barTotal').innerText = `$${total}`;

  $('cartBody').innerHTML = cart.map((i, x) => `
    <div style="display:flex; gap:10px; margin-bottom:12px; background:#f4f4f4; padding:10px; border-radius:8px;">
      <img src="${i.img}" style="width:60px; height:60px; object-fit:contain;">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13px;">${i.name}</div>
        <div style="font-size:12px;">Talla: ${i.size}</div>
      </div>
      <div style="text-align:right;">
        <button onclick="cart.splice(${x},1);save()" style="border:none; background:none; font-weight:900; font-size:16px;">&times;</button>
        <div style="font-weight:900;">x${i.qty}</div>
      </div>
    </div>
  `).join('') || `<div style="text-align:center; opacity:0.5; padding:40px;">Tu carrito está vacío</div>`;

  const hasItems = cart.length > 0;
  $('paybar').classList.toggle('visible', hasItems);

  let valid = hasItems && method;
  if (method === 'mx') {
    valid = valid && $('cp').value.length === 5 && $('addr').value.length > 5 && ship.cost > 0;
  }

  $('payBtn').disabled = !valid;
}

async function checkout() {
  const btn = $('payBtn');
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;
  try {
    const stripe = Stripe(STRIPE_PK);
    const payload = {
      items: cart,
      shipping: {
        method: ship.method,
        cost: ship.cost,
        data: {
          cp: $('cp').value,
          address: $('addr').value,
          name: $('name').value
        }
      },
      to: { postal_code: $('cp').value }
    };
    const res = await fetch('/.netlify/functions/create_checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error("Error al iniciar el pago.");
  } catch (e) {
    alert(e.message);
    btn.innerText = "IR A PAGAR";
    btn.disabled = false;
  }
}

function save() {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCart();
}

function openDrawer() {
  $('drawer').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
  updateCart();
}

function closeAll() {
  $('drawer').classList.remove('active');
  $('modalCatalog').classList.remove('active');
  $('overlay').classList.remove('active');
  document.body.classList.remove('modalOpen');
}

function showToast(msg) {
  const t = $('toast');
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

$('overlay').onclick = closeAll;
['cp', 'addr', 'name'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('input', updateCart);
});

updateCart();