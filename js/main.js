// SCORE STORE — MAIN JS (DEFENSIVO + DEBUG)

// =====================
// DEBUG CONTROLADO
// =====================
const DEBUG = location.hostname.includes('netlify.app');

function log(...args) {
  if (DEBUG) console.log('[SCORE]', ...args);
}

function $(id) {
  return document.getElementById(id);
}

function toStr(v) {
  return (v ?? '').toString().trim();
}

function digits(v) {
  return toStr(v).replace(/\D+/g, '');
}

function money(n) {
  return `$${(Number(n) || 0).toFixed(0)}`;
}

// =====================
// ESTADO
// =====================
let catalog = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let ship = { method: 'pickup', cost: 0 };

// =====================
// CARGA DEFENSIVA CATÁLOGO
// =====================
async function loadCatalog() {
  try {
    const res = await fetch('/data/catalog.json?ts=' + Date.now());

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error('Catálogo inválido');
    }

    catalog = data;
    log('Catálogo cargado:', catalog.length);
  } catch (e) {
    console.error(e);
    alert('La tienda está temporalmente en mantenimiento. Intenta más tarde.');
    catalog = [];
  }

  renderCatalog();
  updateCart(true);
}

// =====================
// RENDER CATÁLOGO
// =====================
function renderCatalog() {
  const grid = $('catalog');
  if (!grid) return;

  grid.innerHTML = '';

  catalog.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card';

    const sizes = (p.sizes || [])
      .map((s) => `<option value="${s}">${s}</option>`)
      .join('');

    card.innerHTML = `
      <img class="prodImg" src="${p.image}" alt="${p.name}">
      <div class="cardBody">
        <h3>${p.name}</h3>
        <p class="price">${money(p.price)}</p>
        ${
          sizes
            ? `<select id="size_${p.id}" class="select">${sizes}</select>`
            : ''
        }
        <button class="btn" onclick="addToCart('${p.id}')">Agregar</button>
      </div>
    `;

    grid.appendChild(card);
  });
}

// =====================
// CARRITO
// =====================
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCart(false);
}

function addToCart(id) {
  const p = catalog.find((x) => x.id === id);
  if (!p) return;

  const sizeEl = $('size_' + id);
  const size = sizeEl ? sizeEl.value : null;
  const key = size ? `${id}_${size}` : id;

  const existing = cart.find((x) => x.key === key);
  if (existing) existing.qty += 1;
  else cart.push({ key, id, name: p.name, price: p.price, size, qty: 1 });

  saveCart();
  openDrawer();
}

function updateCart() {
  const sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const total = sub + ship.cost;

  $('cartCount').innerText = cart.reduce((a, i) => a + i.qty, 0);
  $('subTotal').innerText = money(sub);
  $('shipCost').innerText = money(ship.cost);
  $('grandTotal').innerText = money(total);
  $('paybarTotal').innerText = money(total);

  const list = $('cartItems');
  if (!list) return;

  list.innerHTML = '';
  cart.forEach((i) => {
    const row = document.createElement('div');
    row.className = 'cartRow';
    row.innerHTML = `
      <div>
        <b>${i.name}</b> ${i.size ? `(${i.size})` : ''}
        <div>${money(i.price)} x ${i.qty}</div>
      </div>
      <button onclick="removeItem('${i.key}')">×</button>
    `;
    list.appendChild(row);
  });
}

function removeItem(key) {
  cart = cart.filter((x) => x.key !== key);
  saveCart();
}

// =====================
// UI
// =====================
function openDrawer() {
  $('drawer').classList.add('active');
  $('overlay').classList.add('active');
  document.body.classList.add('modalOpen');
}

function closeAll() {
  $('drawer').classList.remove('active');
  $('overlay').classList.remove('active');
  document.body.classList.remove('modalOpen');
}

// =====================
// INIT
// =====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

$('overlay')?.addEventListener('click', closeAll);

loadCatalog();