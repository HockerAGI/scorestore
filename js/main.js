// js/main.js

const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";
const USD_RATE = 17.50;

const $ = id => document.getElementById(id);

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: null, cost: 0 };

function formatMXN(value) {
  return `$${value.toLocaleString('es-MX')} MXN`;
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
  $('lnSub').innerText = formatMXN(sub);
  $('lnShip').innerText = formatMXN(ship.cost);
  $('lnTotal').innerText = formatMXN(total);
  $('lnUsd').innerText = `aprox $${usd} USD`;
  $('barTotal').innerText = formatMXN(total);

  $('cartBody').innerHTML = cart.map((i, x) => `
    <div style="display:flex; gap:10px; margin-bottom:12px; background:#f4f4f4; padding:10px; border-radius:8px;">
      <img src="${i.img}" style="width:60px; height:60px; object-fit:contain; mix-blend-mode:multiply;">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13px; line-height:1.2;">${i.name}</div>
        <div style="font-size:12px; color:#666;">Talla: ${i.size}</div>
      </div>
      <div style="text-align:right; display:flex; flex-direction:column; justify-content:space-between;">
        <button onclick="cart.splice(${x},1);save()" style="color:var(--red); border:none; background:none; font-weight:900; font-size:16px; cursor:pointer;" type="button">&times;</button>
        <div style="font-weight:900;">x${i.qty}</div>
      </div>
    </div>
  `).join('') || '<div style="text-align:center; padding:40px 20px; opacity:0.5;">Tu equipo está vacío</div>';

  const hasItems = cart.length > 0;
  $('paybar').classList.toggle('visible', hasItems);

  let valid = hasItems && method;
  if (method === 'mx') {
    valid = valid && $('cp').value.length === 5 && $('addr').value.length > 5 && ship.cost > 0;
  }

  $('payBtn').disabled = !valid;
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

function showToast(m) {
  const t = $('toast');
  t.innerText = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
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
  showToast("Agregado al equipo");
}

async function quoteShipping() {
  const cp = $('cp').value;
  if (cp.length !== 5) return;

  $('quoteResult').style.display = 'block';
  $('quoteResult').innerText = 'Cotizando envío...';

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
    } else {
      ship.cost = 250;
      $('quoteResult').innerText = 'Tarifa estándar: $250';
    }
    updateCart(false);
  } catch (e) {
    console.error(e);
  }
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
      mode: ship.method,
      to: { postal_code: $('cp').value }
    };

    const res = await fetch('/.netlify/functions/create_checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error("Error iniciando pago.");
  } catch (e) {
    alert(e.message);
    btn.innerText = "IR A PAGAR";
    btn.disabled = false;
  }
}

// Eventos iniciales
['cp', 'addr', 'name'].forEach(id => $(id).addEventListener('input', updateCart));
$('overlay').onclick = closeAll;
updateCart();