const $ = id => document.getElementById(id);
const money = n => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0 })} MXN`;

let CATALOG = [];
let CART = JSON.parse(localStorage.getItem('cart') || '[]');

async function init() {
  try {
    const res = await fetch('/data/catalog.json');
    const data = await res.json();
    CATALOG = data.products || [];
  } catch (e) {
    console.error("Error loading catalog", e);
  }

  updateCart(true); 

  $('overlay').onclick = closeAll;
  
  ['cp', 'state', 'city'].forEach(id => {
    $(id).addEventListener('input', () => { updateCart(false); scheduleQuote(); });
  });

  $('shipMethod').addEventListener('change', () => { updateCart(true); scheduleQuote(); });
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}

function openCatalog(sectionId, title) {
  const wrap = $('catContent');
  $('catTitle').innerText = title.toUpperCase();
  wrap.innerHTML = '';

  const items = CATALOG.filter(p => p.sectionId === sectionId);

  if (!items.length) {
    wrap.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Colección próximamente disponible.</p>';
  } else {
    const grid = document.createElement('div');
    grid.className = 'catGrid';
    
    items.forEach(p => {
      const card = document.createElement('div');
      card.className = 'prodCard';
      
      const sizes = (p.sizes || []).map(s => `<option value="${s}">${s}</option>`).join('');
      
      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}" loading="lazy">
        <strong>${p.name}</strong>
        <div>${money(p.baseMXN)}</div>
        ${sizes ? `<select id="size_${p.id}">${sizes}</select>` : ''}
        <button class="btn-sm" onclick="addToCart('${p.id}')">AGREGAR</button>
      `;
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  }

  $('modalCatalog').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
}

function addToCart(id) {
  const p = CATALOG.find(x => x.id === id);
  if(!p) return;

  const sizeEl = $(`size_${id}`);
  const size = sizeEl ? sizeEl.value : 'UNITALLA';
  const key = `${id}_${size}`;

  const existing = CART.find(x => x.key === key);
  if (existing) {
    existing.qty++;
  } else {
    CART.push({ key, id, name: p.name, price: p.baseMXN, size, qty: 1, img: p.img });
  }

  saveCart();
  showToast('Agregado al carrito');
}

function rmItem(index) {
  CART.splice(index, 1);
  saveCart();
}

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(CART));
  updateCart(true);
}

function showToast(msg) {
  const t = $('toast');
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function updateCart(resetShip = false) {
  const list = $('cartBody');
  list.innerHTML = '';
  let subtotal = 0;

  if (CART.length === 0) {
    list.innerHTML = '<p style="text-align:center; margin-top:30px; color:#888;">Tu carrito está vacío.</p>';
  }

  CART.forEach((item, idx) => {
    subtotal += item.price * item.qty;
    const row = document.createElement('div');
    row.className = 'sumRow';
    row.innerHTML = `
      <div style="flex:1">
        <div>${item.name} <small style="background:#eee; padding:2px 5px; border-radius:4px;">${item.size}</small></div>
        <div style="font-size:12px; color:#666; margin-top:2px;">${money(item.price)} x ${item.qty}</div>
      </div>
      <button onclick="rmItem(${idx})" style="border:none; background:none; color:red; font-weight:bold; padding:0 10px; cursor:pointer;">&times;</button>
    `;
    list.appendChild(row);
  });

  $('lnSub').innerText = money(subtotal);
  $('cartCount').innerText = CART.reduce((a, b) => a + b.qty, 0);
  
  if (resetShip) $('shipCost').innerText = '--';
  
  const hasItems = CART.length > 0;
  $('paybar').classList.toggle('visible', hasItems);
  $('barTotal').innerText = money(subtotal); 

  const method = $('shipMethod').value;
  const needsAddress = (method === 'mx' || method === 'envia');
  $('shipForm').style.display = needsAddress ? 'block' : 'none';
  
  $('payBtn').disabled = !hasItems;
}

let quoteTimer;
function scheduleQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(quoteShipping, 600);
}

async function quoteShipping() {
  if (CART.length === 0) return;
  const method = $('shipMethod').value;
  const resEl = $('quoteResult');
  const costEl = $('shipCost');

  resEl.innerText = '';
  
  if (method === 'pickup') {
    costEl.innerText = 'Gratis';
    updateTotal(0);
    return;
  }
  
  if (method === 'tj') {
    costEl.innerText = '$200 MXN';
    updateTotal(200);
    return;
  }

  if (method === 'mx') {
    const cp = $('cp').value;
    const state = $('state').value;
    const city = $('city').value;

    if (cp.length !== 5 || state.length < 2 || city.length < 2) {
      resEl.innerText = 'Completa tu dirección para cotizar...';
      costEl.innerText = '--';
      return;
    }

    resEl.innerText = 'Cotizando...';
    
    try {
      const res = await fetch('/.netlify/functions/quote_shipping', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'mx',
          to: { postal_code: cp, state_code: state, city, address1: $('addr').value },
          items: CART
        })
      });
      const data = await res.json();
      
      if (data.ok) {
        costEl.innerText = money(data.mxn);
        resEl.innerText = `${data.carrier}: ${money(data.mxn)}`;
        updateTotal(data.mxn);
      } else {
        resEl.innerText = 'Error al cotizar.';
      }
    } catch (e) {
      console.error(e);
    }
  }
}

function updateTotal(shipCost) {
  const sub = CART.reduce((a, b) => a + (b.price * b.qty), 0);
  const total = sub + shipCost;
  $('lnTotal').innerText = money(total);
  $('barTotal').innerText = money(total);
}

async function checkout() {
  const btn = $('payBtn');
  btn.innerText = 'PROCESANDO...';
  btn.disabled = true;

  try {
    const payload = {
      items: CART,
      mode: $('shipMethod').value,
      promoCode: $('promoCode').value,
      to: {
        postal_code: $('cp').value,
        state_code: $('state').value,
        city: $('city').value,
        address1: $('addr').value,
        name: $('name').value
      }
    };

    const res = await fetch('/.netlify/functions/create_checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Error: ' + (data.error || 'Intenta de nuevo'));
      btn.disabled = false;
      btn.innerText = 'PROCEDER AL PAGO';
    }
  } catch (e) {
    alert('Error de conexión');
    btn.disabled = false;
    btn.innerText = 'PROCEDER AL PAGO';
  }
}

function closeAll() {
  document.querySelectorAll('.active').forEach(e => e.classList.remove('active'));
  document.body.classList.remove('modalOpen');
}

init();
