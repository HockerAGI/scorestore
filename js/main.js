const STRIPE_PK = "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";

const PRODUCTS = [
  {
    id: "chamarra-oficial",
    name: "Chamarra Oficial Baja 1000",
    price: 1789,
    img: "/assets/EDICION_2025/chamarra-baja1000.webp",
    sizes: ["S", "M", "L", "XL", "2XL"],
    section: "BAJA_1000"
  }
];

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: null, cost: 0 };
let appliedPromo = null;
let promoRules = [];

const USD_RATE = 17.50;
const $ = id => document.getElementById(id);

// =======================
// Promociones
// =======================

async function loadPromos() {
  try {
    const res = await fetch('/data/promos.json');
    if (res.ok) {
      const data = await res.json();
      promoRules = data.rules || [];
    }
  } catch (e) {
    console.warn('No se pudieron cargar las promociones');
  }
}

// =======================
// Catálogo y Productos
// =======================

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
    console.log('Usando local');
  }

  if (!items.length && section === 'BAJA_1000') {
    items = PRODUCTS;
  }

  const grid = $('catGrid');

  if (!items.length) {
    grid.innerHTML = `
      <div style='grid-column:1/-1; text-align:center; padding:60px 20px; color:#888;'>
        <h3 style="margin:0; text-transform:uppercase;">Próximamente</h3>
        <p style="font-size:14px; margin-top:10px;">Estamos preparando la colección oficial.</p>
      </div>`;
  } else {
    grid.innerHTML = items.map(p => `
      <div class="prodCard">
        <img src="${p.img}" onerror="this.src='/assets/logo-score.webp'">
        <div style="font-weight:700; font-size:14px; margin:5px 0;">${p.name}</div>
        <div style="color:var(--red); font-weight:900;">$${p.baseMXN || p.price}</div>
        <select id="size_${p.id}" style="margin:5px 0; height:36px; font-size:14px !important;">
          ${(p.sizes || ['Unitalla']).map(s => `<option>${s}</option>`)}
        </select>
        <button class="btn primary" style="width:100%; justify-content:center; padding:8px;"
          onclick="add('${p.id}','${p.name}',${p.baseMXN || p.price},'${p.img}')">AGREGAR</button>
      </div>`).join('');
  }

  $('modalCatalog').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
}

function add(id, name, price, img) {
  const size = $(`size_${id}`).value;
  const key = id + size;
  const exist = cart.find(i => i.key === key);
  if (exist) {
    exist.qty++;
  } else {
    cart.push({ key, id, name, price, img, size, qty: 1 });
  }
  save();
  closeAll();
  openDrawer();
  showToast("Agregado al equipo");
}

// =======================
// Envíos
// =======================

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
    $('quoteResult').innerText = 'Error al cotizar envío';
  }
}

// =======================
// Carrito
// =======================

function updateCart(resetShip = true) {
  const method = $('shipMethod')?.value;
  ship.method = method;

  if (resetShip) {
    if (method === 'tj') ship.cost = 200;
    else if (method === 'pickup') ship.cost = 0;
    else if (method === 'mx') {
      ship.cost = 0;
      if ($('cp')?.value.length === 5) quoteShipping();
    }
  }

  if ($('shipForm')) {
    $('shipForm').style.display = (method === 'mx') ? 'block' : 'none';
  }

  let sub = cart.reduce((a, b) => a + (b.price * b.qty), 0);
  let discount = 0;

  if (appliedPromo) {
    if (appliedPromo.type === 'percent') {
      discount = sub * appliedPromo.value;
    } else if (appliedPromo.type === 'fixed_mxn') {
      discount = appliedPromo.value;
    } else if (appliedPromo.type === 'free_shipping') {
      ship.cost = 0;
    } else if (appliedPromo.type === 'free_total') {
      sub = 0;
      ship.cost = 0;
    }
  }

  let total = Math.max(0, sub - discount + ship.cost);
  const usd = (total / USD_RATE).toFixed(2);

  $('cartCount').innerText = cart.reduce((a, b) => a + b.qty, 0);
  $('lnSub').innerText = `$${sub.toFixed(2)} MXN`;
  $('lnShip').innerText = `$${ship.cost.toFixed(2)} MXN`;
  $('lnTotal').innerText = `$${total.toFixed(2)} MXN`;
  $('lnUsd').innerText = `aprox $${usd} USD`;

  if ($('barTotal')) $('barTotal').innerText = `$${total.toFixed(2)}`;
  if ($('lnPromo')) $('lnPromo').innerText = discount > 0 ? `Descuento aplicado: -$${discount.toFixed(2)} MXN` : '';

  $('cartBody').innerHTML = cart.map((i, x) => `
    <div style="display:flex; gap:10px; margin-bottom:12px; background:#f4f4f4; padding:10px; border-radius:8px;">
      <img src="${i.img}" style="width:60px; height:60px; object-fit:contain; mix-blend-mode:multiply;">
      <div style="flex:1;">
        <div style="font-weight:700; font-size:13px;">${i.name}</div>
        <div style="font-size:12px; color:#666;">Talla: ${i.size}</div>
      </div>
      <div style="text-align:right;">
        <button onclick="cart.splice(${x},1);save()" style="color:var(--red); border:none; background:none; font-weight:900; font-size:16px; cursor:pointer;">&times;</button>
        <div style="font-weight:900;">x${i.qty}</div>
      </div>
    </div>`).join('') || '<div style="text-align:center; padding:40px 20px; opacity:0.5;">Tu equipo está vacío</div>';

  const hasItems = cart.length > 0;
  $('paybar')?.classList.toggle('visible', hasItems);

  let valid = hasItems && method;
  if (method === 'mx') {
    valid = valid &&
      $('cp').value.length === 5 &&
      $('addr').value.length > 5 &&
      ship.cost > 0;
  }

  $('payBtn').disabled = !valid;
}

function save() {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCart();
}

// =======================
// Checkout
// =======================

async function checkout() {
  const btn = $('payBtn');
  btn.innerText = "PROCESANDO...";
  btn.disabled = true;

  try {
    const stripe = Stripe(STRIPE_PK);
    const payload = {
      items: cart.map(i => ({
        name: i.name,
        qty: i.qty,
        price: i.price
      })),
      shipping: ship
    };

    const res = await fetch('/.netlify/functions/create_checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.sessionId) {
      await stripe.redirectToCheckout({ sessionId: data.sessionId });
    } else {
      alert('Error al iniciar el pago');
    }

  } catch (err) {
    console.error(err);
    alert('Error inesperado al procesar el pago.');
  }

  btn.innerText = "PAGAR";
  btn.disabled = false;
}

// =======================
// UI / Helpers
// =======================

function openDrawer() {
  $('drawer').classList.add('active');
  $('overlay').classList.add('active');
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
  setTimeout(() => t.classList.remove('show'), 2200);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAll();
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadPromos();
  updateCart();

  const promoInput = document.getElementById('promoInput');
  if (promoInput) {
    promoInput.addEventListener('input', () => {
      const code = promoInput.value.trim().toUpperCase();
      const rule = promoRules.find(p => p.code === code && p.active);
      appliedPromo = rule || null;
      updateCart();
    });
  }
});