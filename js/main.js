/* SCORE STORE — main.js (Production) */

(() => {
  const META_PIXEL_ID = '4249947775334413';

  // Netlify redirects in netlify.toml
  const API_CHECKOUT = '/api/checkout';
  const API_QUOTE = '/api/quote';
  const API_CHAT = '/api/chat';

  const CATALOG_URL = '/data/catalog.json';
  const PROMOS_URL = '/data/promos.json';

  const CART_KEY = 'scorestore_cart_v2';
  const PREFS_KEY = 'scorestore_prefs_v2';

  const $ = (sel) => document.querySelector(sel);

  const state = {
    catalog: null,
    promos: [],
    cart: loadCart(),
    prefs: loadPrefs(),
    shipping: {
      mode: 'pickup',
      zip: '',
      country: 'MX',
      quoted: false,
      amount_mxn: 0,
      service: ''
    },
    promo: {
      code: '',
      valid: false,
      type: null,
      value: 0
    }
  };

  // ---------- Utilities ----------
  function safeSrc(path) {
    try { return encodeURI(path); } catch { return path; }
  }

  function mxn(n) {
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  }

  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.remove('show'), 3200);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function cssSafe(id) {
    return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  // ---------- Local storage ----------
  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    updateCartCount();
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : { cookieConsent: null, customer: { name: '', email: '', phone: '' } };
    } catch {
      return { cookieConsent: null, customer: { name: '', email: '', phone: '' } };
    }
  }

  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  }

  function updateCartCount() {
    const count = state.cart.reduce((sum, it) => sum + it.qty, 0);
    const el = $('#cartCount');
    if (el) el.textContent = String(count);
  }

  // ---------- Totals ----------
  function cartSubtotal() {
    return state.cart.reduce((sum, it) => sum + (it.price_mxn * it.qty), 0);
  }

  function computeDiscount() {
    if (!state.promo.valid) return 0;
    const sub = cartSubtotal();

    if (state.promo.type === 'percent') {
      // promos.json usa fracción (0.10 = 10%)
      return Math.round(sub * Number(state.promo.value || 0));
    }
    if (state.promo.type === 'fixed_mxn') {
      return Math.min(sub, Math.round(Number(state.promo.value || 0)));
    }
    return 0;
  }

  function totalAmount() {
    const sub = cartSubtotal();
    const disc = computeDiscount();
    const ship = state.shipping.amount_mxn || 0;
    return Math.max(0, sub - disc + ship);
  }

  // ---------- Data loading ----------
  async function loadCatalog() {
    const res = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('No pude cargar el catálogo');
    return res.json();
  }

  async function loadPromos() {
    const res = await fetch(PROMOS_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rules)) return data.rules;
    return [];
  }

  // ---------- Rendering: Editions ----------
  function renderEditions() {
    const grid = $('#editionGrid');
    if (!grid || !state.catalog) return;

    const sections = state.catalog.sections || [];
    grid.innerHTML = sections.map(sec => {
      const cover = sec.cover || '/assets/hero.webp';
      const logo = sec.logo || '';
      const desc = sec.subtitle || sec.description || 'Ver merch disponible';
      return `
        <article class="editionCard" data-sec="${sec.id}">
          <div class="editionCover">
            <img src="${safeSrc(cover)}" alt="${escapeHtml(sec.title)}" loading="lazy" />
          </div>
          ${logo ? `<div class="editionLogoCard"><img src="${safeSrc(logo)}" alt="${escapeHtml(sec.title)} logo" loading="lazy" /></div>` : ''}
          <div class="editionBody">
            <h3 class="editionName">${escapeHtml(sec.title)}</h3>
            <p class="editionDesc">${escapeHtml(desc)}</p>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.editionCard').forEach(card => {
      card.addEventListener('click', () => openProducts(card.dataset.sec));
    });
  }

  // ---------- Rendering: Products ----------
  function openProducts(sectionId) {
    const panel = $('#productsPanel') || $('#productsView'); // compat con tus 2 layouts
    if (!panel || !state.catalog) return;

    const sec = (state.catalog.sections || []).find(s => s.id === sectionId);
    const products = (state.catalog.products || []).filter(p => p.sectionId === sectionId);

    const t = $('#editionTitle');
    const m = $('#editionMeta');
    if (t) t.textContent = sec ? sec.title : 'Catálogo';
    if (m) m.textContent = sec?.meta || 'Selecciona un producto y agrégalo al carrito.';

    const grid = $('#productsGrid');
    if (!grid) return;

    grid.innerHTML = products.map(p => renderProductCard(p)).join('');

    grid.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.getAttribute('data-add');
        const prod = products.find(x => x.id === pid);
        if (!prod) return;

        const sizeSel = grid.querySelector(`#size-${cssSafe(pid)}`);
        const size = sizeSel ? sizeSel.value : (prod.sizes?.[0] || 'ÚNICA');
        addToCart(prod, size);
      });
    });

    grid.querySelectorAll('[data-open]').forEach(el => {
      el.addEventListener('click', () => {
        const pid = el.getAttribute('data-open');
        const prod = products.find(x => x.id === pid);
        if (prod) openProductModal(prod);
      });
    });

    panel.classList.remove('hide');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeProducts() {
    const panel = $('#productsPanel') || $('#productsView');
    if (panel) panel.classList.add('hide');
  }

  function renderProductCard(p) {
    const img = p.img || (p.images && p.images[0]) || '/assets/hero.webp';
    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ['ÚNICA'];

    return `
      <article class="productCard" data-open="${p.id}">
        <div class="productImgWrap" data-open="${p.id}">
          <img src="${safeSrc(img)}" alt="${escapeHtml(p.name)}" loading="lazy" />
        </div>
        <div class="productBody">
          <h4 class="productName" data-open="${p.id}">${escapeHtml(p.name)}</h4>
          <p class="productPrice">${mxn(Number(p.baseMXN || 0))}</p>

          <div>
            <label class="muted" for="size-${cssSafe(p.id)}" style="font-weight:850; font-size:13px">Talla</label>
            <select id="size-${cssSafe(p.id)}" class="select">
              ${sizes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
            </select>
          </div>

          <div class="productActions">
            <button class="btn btnPrimary" type="button" data-add="${p.id}">
              <span>Agregar</span>
            </button>
            <button class="btn btnGhost" type="button" data-open="${p.id}">Ver</button>
          </div>
        </div>
      </article>
    `;
  }

  // ---------- Product modal ----------
  function openProductModal(prod) {
    const modal = $('#productModal');
    const overlay = $('#pageOverlay');
    if (!modal || !overlay) return;

    const title = $('#productTitle');
    if (title) title.textContent = prod.name;

    const imgs = [prod.img, ...(prod.images || [])].filter(Boolean);
    const uniqueImgs = Array.from(new Set(imgs));

    const body = $('#productBody');
    if (!body) return;

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr; gap:12px">
        <div style="display:flex; gap:10px; overflow:auto; padding-bottom:6px">
          ${uniqueImgs.map(i => `
            <div style="min-width:220px; height:220px; border:1px solid rgba(0,0,0,.12); border-radius:18px; background:rgba(0,0,0,.03); overflow:hidden">
              <img src="${safeSrc(i)}" alt="${escapeHtml(prod.name)}" style="width:100%; height:100%; object-fit:contain" />
            </div>
          `).join('')}
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap">
          <strong style="font-size:18px">${mxn(Number(prod.baseMXN || 0))}</strong>
          <button class="btn btnPrimary" id="modalAddBtn" type="button">Agregar al carrito</button>
        </div>
        <p class="muted" style="margin:0; font-weight:750">Tip: si necesitas ayuda de tallas o envíos, abre <strong>Score AI</strong>.</p>
      </div>
    `;

    const btn = $('#modalAddBtn');
    if (btn) {
      btn.onclick = () => {
        const size = (prod.sizes && prod.sizes[0]) || 'ÚNICA';
        addToCart(prod, size);
        closeModal(modal);
      };
    }

    openModal(modal);
  }

  // ---------- Cart ----------
  function addToCart(prod, size) {
    const key = `${prod.id}__${size}`;
    const existing = state.cart.find(i => i.key === key);
    const price = Number(prod.baseMXN || 0);

    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({
        key,
        id: prod.id,
        name: prod.name,
        price_mxn: price,
        qty: 1,
        size,
        img: prod.img || (prod.images && prod.images[0]) || ''
      });
    }

    saveCart();
    renderCart();

    trackPixel('AddToCart', {
      content_name: prod.name,
      currency: 'MXN',
      value: price
    });

    toast('Agregado al carrito ✅');
  }

  function removeFromCart(key) {
    state.cart = state.cart.filter(i => i.key !== key);
    saveCart();
    renderCart();
  }

  function changeQty(key, delta) {
    const it = state.cart.find(i => i.key === key);
    if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) removeFromCart(key);
    else {
      saveCart();
      renderCart();
    }
  }

  function renderCart() {
    const body = $('#drawerBody');
    if (!body) return;

    if (state.prefs.shipping) {
      state.shipping = { ...state.shipping, ...state.prefs.shipping };
    }
    if (state.prefs.promo?.code) {
      state.promo = { ...state.promo, ...state.prefs.promo };
    }

    if (!state.cart.length) {
      body.innerHTML = `
        <div class="block">
          <h4 class="blockTitle">Tu carrito está vacío</h4>
          <p class="blockSub">Elige un catálogo, agrega productos y vuelve aquí para elegir la entrega y pagar.</p>
        </div>
      `;
      updateTotals();
      return;
    }

    body.innerHTML = `
      <div>
        ${state.cart.map(it => `
          <div class="cartItem">
            <div class="cartImg"><img src="${safeSrc(it.img || '/assets/hero.webp')}" alt="${escapeHtml(it.name)}"></div>
            <div class="cartInfo">
              <p class="cartName">${escapeHtml(it.name)}</p>
              <p class="cartMeta">Talla: <strong>${escapeHtml(it.size)}</strong> · ${mxn(it.price_mxn)}</p>
              <div class="cartRow">
                <button class="qtyBtn" data-qty="-1" data-key="${escapeHtml(it.key)}" type="button">−</button>
                <strong>${it.qty}</strong>
                <button class="qtyBtn" data-qty="1" data-key="${escapeHtml(it.key)}" type="button">+</button>
                <button class="removeBtn" data-remove="1" data-key="${escapeHtml(it.key)}" type="button">Quitar</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="block" style="margin-top:12px">
        <h4 class="blockTitle">Entrega</h4>
        <p class="blockSub">Selecciona cómo lo quieres recibir. Envíos MX/USA se cotizan en tiempo real con Envia.com.</p>

        <label class="radioRow">
          <input type="radio" name="shipMode" value="pickup" ${state.shipping.mode==='pickup'?'checked':''} />
          <div>
            <strong>Pickup (fábrica)</strong>
            <div class="muted" style="font-weight:750; font-size:13px">Recoges directo en fábrica en Tijuana. Rápido y sin costos extra.</div>
          </div>
        </label>

        <label class="radioRow">
          <input type="radio" name="shipMode" value="local_tj" ${state.shipping.mode==='local_tj'?'checked':''} />
          <div>
            <strong>Envío local Tijuana</strong>
            <div class="muted" style="font-weight:750; font-size:13px">Solo dentro de TJ. Se coordina por Uber/Didi (costo según distancia).</div>
          </div>
        </label>

        <label class="radioRow">
          <input type="radio" name="shipMode" value="envia_mx" ${state.shipping.mode==='envia_mx'?'checked':''} />
          <div>
            <strong>Envío Nacional (México)</strong>
            <div class="muted" style="font-weight:750; font-size:13px">Cotización y guía en tiempo real con Envia.com.</div>
          </div>
        </label>

        <label class="radioRow">
          <input type="radio" name="shipMode" value="envia_us" ${state.shipping.mode==='envia_us'?'checked':''} />
          <div>
            <strong>Envío USA</strong>
            <div class="muted" style="font-weight:750; font-size:13px">Cotización y guía en tiempo real con Envia.com.</div>
          </div>
        </label>

        <div id="shipExtra" style="margin-top:12px"></div>
      </div>

      <div class="block">
        <h4 class="blockTitle">Código promocional</h4>
        <p class="blockSub">Si tienes uno, aplícalo aquí. Se valida de nuevo en el checkout.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <input id="promoInput" class="input" placeholder="Ej: BAJA10" value="${escapeHtml(state.promo.code || '')}" style="flex:1; min-width:200px" />
          <button id="applyPromoBtn" class="btn" type="button">Aplicar</button>
          <button id="clearPromoBtn" class="btn btnGhost" type="button" style="display:${state.promo.code?'inline-flex':'none'}">Quitar</button>
        </div>
        <div id="promoMsg" class="muted" style="margin-top:10px; font-weight:850"></div>
      </div>

      <div class="block">
        <h4 class="blockTitle">Datos de contacto</h4>
        <p class="blockSub">Para confirmar tu pedido y coordinar entrega si aplica.</p>
        <div style="display:grid; grid-template-columns:1fr; gap:10px; margin-top:10px">
          <input id="cName" class="input" placeholder="Nombre" value="${escapeHtml(state.prefs.customer?.name || '')}" />
          <input id="cEmail" class="input" placeholder="Correo" value="${escapeHtml(state.prefs.customer?.email || '')}" />
          <input id="cPhone" class="input" placeholder="WhatsApp / Teléfono" value="${escapeHtml(state.prefs.customer?.phone || '')}" />
        </div>
      </div>
    `;

    body.querySelectorAll('[data-qty]').forEach(btn => {
      btn.addEventListener('click', () => changeQty(btn.dataset.key, Number(btn.dataset.qty)));
    });
    body.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => removeFromCart(btn.dataset.key));
    });

    body.querySelectorAll('input[name="shipMode"]').forEach(r => {
      r.addEventListener('change', () => {
        state.shipping.mode = r.value;
        state.shipping.quoted = false;
        state.shipping.amount_mxn = (r.value === 'pickup' || r.value === 'local_tj') ? 0 : state.shipping.amount_mxn;
        state.shipping.country = (r.value === 'envia_us') ? 'US' : 'MX';

        state.prefs.shipping = { ...state.shipping };
        savePrefs();

        renderShippingExtra();
        updateTotals();
      });
    });

    $('#applyPromoBtn').addEventListener('click', applyPromo);
    $('#clearPromoBtn').addEventListener('click', clearPromo);

    ['cName','cEmail','cPhone'].forEach(id => {
      const inp = $('#'+id);
      if (!inp) return;
      inp.addEventListener('input', () => {
        state.prefs.customer = {
          name: $('#cName').value.trim(),
          email: $('#cEmail').value.trim(),
          phone: $('#cPhone').value.trim(),
        };
        savePrefs();
      });
    });

    renderShippingExtra();
    updateTotals();
  }

  function renderShippingExtra() {
    const wrap = $('#shipExtra');
    if (!wrap) return;

    if (state.shipping.mode === 'pickup') {
      wrap.innerHTML = `<div class="muted" style="font-weight:850">📍 Pickup en fábrica (Tijuana). Te mandamos ubicación al confirmar.</div>`;
      return;
    }

    if (state.shipping.mode === 'local_tj') {
      wrap.innerHTML = `<div class="muted" style="font-weight:850">🚗 Envío local TJ: se coordina por Uber/Didi. El costo se confirma por WhatsApp después del pago.</div>`;
      return;
    }

    const label = state.shipping.mode === 'envia_us' ? 'ZIP (USA)' : 'Código Postal (MX)';
    const placeholder = state.shipping.mode === 'envia_us' ? 'Ej: 92101' : 'Ej: 22000';

    wrap.innerHTML = `
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end">
        <div style="flex:1; min-width:200px">
          <label class="muted" style="font-weight:850; font-size:13px">${label}</label>
          <input id="shipZip" class="input" value="${escapeHtml(state.shipping.zip || '')}" placeholder="${placeholder}" />
        </div>
        <button id="quoteBtn" class="btn" type="button">Cotizar</button>
      </div>
      <div id="shipMsg" class="muted" style="margin-top:10px; font-weight:850"></div>
    `;

    $('#shipZip').addEventListener('input', (e) => {
      state.shipping.zip = e.target.value.trim();
      state.shipping.quoted = false;
      state.prefs.shipping = { ...state.shipping };
      savePrefs();
      updateTotals();
    });

    $('#quoteBtn').addEventListener('click', quoteShipping);

    const msg = $('#shipMsg');
    msg.textContent = state.shipping.quoted
      ? `Cotización: ${mxn(state.shipping.amount_mxn)} · ${state.shipping.service || 'Envia.com'}`
      : 'Cotiza para calcular el total.';
  }

  function updateTotals() {
    const sub = cartSubtotal();
    const disc = computeDiscount();
    const ship = state.shipping.amount_mxn || 0;
    const total = Math.max(0, sub - disc + ship);

    const elSub = $('#cartSubtotal');
    const elDiscRow = $('#discountRow');
    const elDisc = $('#cartDiscount');
    const elShip = $('#cartShipping');
    const elTot = $('#cartTotal');
    const elShipLabel = $('#cartShipLabel');

    if (elSub) elSub.textContent = mxn(sub);

    if (disc > 0) {
      if (elDiscRow) elDiscRow.style.display = '';
      if (elDisc) elDisc.textContent = '-' + mxn(disc);
    } else {
      if (elDiscRow) elDiscRow.style.display = 'none';
    }

    if (elShipLabel) {
      const label = {
        pickup: 'Entrega (Pickup)',
        local_tj: 'Entrega (Local TJ)',
        envia_mx: 'Envío (MX)',
        envia_us: 'Envío (USA)'
      }[state.shipping.mode] || 'Entrega';
      elShipLabel.textContent = label;
    }

    if (elShip) elShip.textContent = mxn(ship);
    if (elTot) elTot.textContent = mxn(total);

    state.prefs.shipping = { ...state.shipping };
    savePrefs();
  }

  async function quoteShipping() {
    const zip = (state.shipping.zip || '').trim();
    if (!zip) {
      toast('Pon tu código postal/ZIP para cotizar.');
      return;
    }

    const msg = $('#shipMsg');
    if (msg) msg.textContent = 'Cotizando…';

    try {
      const res = await fetch(API_QUOTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shipping_mode: state.shipping.mode,
          ship_zip: zip,
          ship_country: state.shipping.mode === 'envia_us' ? 'US' : 'MX',
          items: state.cart.map(i => ({
            id: i.id,
            qty: i.qty,
            size: i.size
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo cotizar');

      state.shipping.amount_mxn = Number(data.amount_mxn || 0);
      state.shipping.service = data.service || 'Envia.com';
      state.shipping.quoted = true;

      state.prefs.shipping = { ...state.shipping };
      savePrefs();

      if (msg) msg.textContent = `Cotización: ${mxn(state.shipping.amount_mxn)} · ${state.shipping.service}`;
      updateTotals();
    } catch (e) {
      if (msg) msg.textContent = `No pude cotizar: ${e.message}`;
      state.shipping.quoted = false;
      updateTotals();
    }
  }

  async function applyPromo() {
    const input = $('#promoInput');
    const msg = $('#promoMsg');
    const clearBtn = $('#clearPromoBtn');

    const code = (input?.value || '').trim().toUpperCase();
    if (!code) {
      if (msg) msg.textContent = 'Escribe un código.';
      return;
    }

    if (!state.promos.length) state.promos = await loadPromos();
    const promo = state.promos.find(p => (String(p.code || '').toUpperCase() === code) && p.active);

    if (!promo) {
      state.promo = { code, valid: false, type: null, value: 0 };
      if (msg) msg.textContent = 'Ese código no existe o ya no está activo.';
      if (clearBtn) clearBtn.style.display = 'inline-flex';
      updateTotals();
      return;
    }

    state.promo = { code, valid: true, type: promo.type, value: promo.value };

    const d = computeDiscount();
    if (msg) msg.textContent = `✅ ${code} aplicado: descuento estimado ${mxn(d)}.`;
    if (clearBtn) clearBtn.style.display = 'inline-flex';

    state.prefs.promo = { ...state.promo };
    savePrefs();

    updateTotals();
  }

  function clearPromo() {
    state.promo = { code: '', valid: false, type: null, value: 0 };
    if ($('#promoInput')) $('#promoInput').value = '';
    if ($('#promoMsg')) $('#promoMsg').textContent = '';
    if ($('#clearPromoBtn')) $('#clearPromoBtn').style.display = 'none';

    state.prefs.promo = null;
    savePrefs();

    updateTotals();
  }

  // ---------- Checkout ----------
  async function startCheckout() {
    if (!state.cart.length) {
      toast('Tu carrito está vacío.');
      return;
    }

    const customer = {
      name: ($('#cName')?.value || state.prefs.customer?.name || '').trim(),
      email: ($('#cEmail')?.value || state.prefs.customer?.email || '').trim(),
      phone: ($('#cPhone')?.value || state.prefs.customer?.phone || '').trim(),
    };

    if (!customer.name || !customer.email || !customer.phone) {
      toast('Completa tu nombre, correo y teléfono.');
      return;
    }

    if ((state.shipping.mode === 'envia_mx' || state.shipping.mode === 'envia_us') && !state.shipping.zip) {
      toast('Pon tu código postal/ZIP para envío.');
      return;
    }

    const payload = {
      items: state.cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
      customer,
      shipping_mode: state.shipping.mode,
      ship_zip: state.shipping.zip,
      ship_country: state.shipping.mode === 'envia_us' ? 'US' : 'MX',
      promo_code: state.promo.code || ''
    };

    const btn = $('#checkoutBtn');
    const old = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando checkout…';
    }

    try {
      trackPixel('InitiateCheckout', { currency: 'MXN', value: totalAmount() });

      const res = await fetch(API_CHECKOUT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear el checkout');

      if (data?.url) window.location.href = data.url;
      else throw new Error('Stripe no regresó URL de pago');

    } catch (e) {
      toast('Error: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = old || 'Pagar seguro';
      }
    }
  }

  // ---------- Modals / Drawer ----------
  function openDrawer() {
    $('#cartDrawer')?.classList.add('show');
    $('#pageOverlay')?.classList.add('show');
    renderCart();
  }

  function closeDrawer() {
    $('#cartDrawer')?.classList.remove('show');
    $('#pageOverlay')?.classList.remove('show');
  }

  function openModal(modal) {
    modal.classList.add('show');
    $('#pageOverlay')?.classList.add('show');
  }

  function closeModal(modal) {
    modal.classList.remove('show');
    $('#pageOverlay')?.classList.remove('show');
  }

  // ---------- Legal ----------
  async function openLegal() {
    const modal = $('#legalModal');
    if (!modal) return;

    const body = $('#legalBody');
    if (body && !body.dataset.loaded) {
      try {
        const res = await fetch('/legal.html', { cache: 'no-store' });
        body.innerHTML = await res.text();
        body.dataset.loaded = '1';
      } catch {
        body.innerHTML = '<p class="muted">No pude cargar el legal.</p>';
      }
    }

    openModal(modal);
  }

  // ---------- Score AI ----------
  function openAi() {
    const modal = $('#aiModal');
    if (!modal) return;
    openModal(modal);

    const msgs = $('#aiMessages');
    if (msgs && !msgs.dataset.seeded) {
      msgs.dataset.seeded = '1';
      appendChat('bot', 'Soy Score AI. Dime qué edición estás viendo y te ayudo con tallas, envíos y dudas del merch.');
    }
  }

  function appendChat(who, text) {
    const wrap = $('#aiMessages');
    if (!wrap) return;
    const div = document.createElement('div');
    div.className = `chatBubble ${who === 'me' ? 'me' : 'bot'}`;
    div.textContent = text;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
  }

  async function sendAi() {
    const input = $('#aiInput');
    const btn = $('#aiSendBtn');
    const text = (input?.value || '').trim();
    if (!text) return;

    appendChat('me', text);
    input.value = '';

    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    try {
      const res = await fetch(API_CHAT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No pude responder');
      appendChat('bot', data.reply || 'Listo.');
    } catch (e) {
      appendChat('bot', 'Error: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
    }
  }

  // ---------- Cookie consent + Pixel ----------
  function showCookieBannerIfNeeded() {
    const banner = $('#cookieBanner');
    if (!banner) return;

    const consent = state.prefs.cookieConsent;
    if (!consent) {
      banner.style.display = 'block';
      return;
    }
    banner.style.display = 'none';
    if (consent === 'accept') initPixel();
  }

  function initPixel() {
    if (window.fbq) return;

    !(function(f,b,e,v,n,t,s){
      if(f.fbq)return; n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n; n.push=n; n.loaded=!0; n.version='2.0';
      n.queue=[]; t=b.createElement(e); t.async=!0;
      t.src=v; s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    })(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function trackPixel(event, params) {
    if (!window.fbq) return;
    try { window.fbq('track', event, params || {}); } catch {}
  }

  // ---------- Boot ----------
  async function boot() {
    $('#openCartBtn')?.addEventListener('click', openDrawer);
    $('#heroOpenCart')?.addEventListener('click', openDrawer);
    $('#closeCartBtn')?.addEventListener('click', closeDrawer);

    $('#pageOverlay')?.addEventListener('click', () => {
      closeDrawer();
      ['productModal','aiModal','legalModal'].forEach(id => {
        const m = $('#'+id);
        if (m?.classList.contains('show')) closeModal(m);
      });
    });

    $('#checkoutBtn')?.addEventListener('click', startCheckout);

    $('#openLegalBtn')?.addEventListener('click', openLegal);
    $('#closeLegalBtn')?.addEventListener('click', () => closeModal($('#legalModal')));

    // AI buttons compat con tus 2 index.html
    $('#openAiBtnFab')?.addEventListener('click', openAi);
    $('#openAiBtn')?.addEventListener('click', openAi);
    $('#footerAiBtn')?.addEventListener('click', openAi);
    $('#heroCtaAi')?.addEventListener('click', openAi);
    $('#closeAiBtn')?.addEventListener('click', () => closeModal($('#aiModal')));
    $('#aiSendBtn')?.addEventListener('click', sendAi);
    $('#aiInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAi(); });

    $('#closeProductBtn')?.addEventListener('click', () => closeModal($('#productModal')));
    $('#closeProductsBtn')?.addEventListener('click', closeProducts);

    $('#cookieAcceptBtn')?.addEventListener('click', () => {
      state.prefs.cookieConsent = 'accept';
      savePrefs();
      $('#cookieBanner').style.display = 'none';
      initPixel();
      toast('Cookies aceptadas ✅');
    });

    $('#cookieRejectBtn')?.addEventListener('click', () => {
      state.prefs.cookieConsent = 'reject';
      savePrefs();
      $('#cookieBanner').style.display = 'none';
      toast('Cookies rechazadas');
    });

    state.catalog = await loadCatalog();
    renderEditions();

    updateCartCount();
    showCookieBannerIfNeeded();
  }

  boot().catch((e) => {
    console.error(e);
    toast('Error cargando el sitio.');
  });
})();