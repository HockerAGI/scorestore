const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

// Función segura para leer archivos en Netlify Lambda
const readFile = (fileName) => {
  // En producción (Netlify), los archivos incluidos están en la raíz de la tarea
  const prodPath = path.resolve(fileName); 
  // En desarrollo local
  const devPath = path.resolve(__dirname, '../../data', fileName);
  
  if (fs.existsSync(prodPath)) return JSON.parse(fs.readFileSync(prodPath, 'utf8'));
  if (fs.existsSync(devPath)) return JSON.parse(fs.readFileSync(devPath, 'utf8'));
  
  // Intento final para estructura de carpetas data/
  const fallback = path.resolve('data', fileName);
  if (fs.existsSync(fallback)) return JSON.parse(fs.readFileSync(fallback, 'utf8'));

  throw new Error(`File not found: ${fileName}`);
};

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').trim();

const j = (s, b) => ({
  statusCode: s,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(b)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return j(405, { error: 'Method Not Allowed' });

  try {
    // 1. Cargar Datos
    let catalog, promos;
    try {
      catalog = readFile('catalog.json');
      promos = readFile('promos.json');
    } catch (e) {
      console.error("Error reading data:", e);
      return j(500, { error: "Database error" });
    }

    // 2. Config Stripe
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return j(500, { error: 'Missing STRIPE_SECRET_KEY' });
    
    const SITE_URL = process.env.SITE_URL || catalog?.site?.url || 'https://scorestore.netlify.app';
    const stripe = new Stripe(key);

    const discountPct = Number(catalog?.pricing?.discount_pct || 0);
    const markupPct = Number(catalog?.pricing?.markup_pct || 0);
    const products = Array.isArray(catalog?.products) ? catalog.products : [];
    const pIndex = new Map(products.map(p => [String(p.id), p]));

    // 3. Procesar Body
    const body = JSON.parse(event.body || '{}');
    const items = Array.isArray(body.items) ? body.items : [];
    const shippingMXN = Math.max(0, Math.round(Number(body.shippingMXN || 0)));
    const promoCode = norm(body?.promo?.code || '');

    if (!items.length) return j(400, { error: 'No items' });

    // 4. Construir Line Items
    const line_items = [];
    
    const getPriceMXN = (p) => {
      const was = Number(p.wasMXN || 0);
      const base = Number(p.baseMXN || 0);
      // Lógica de precio: Si hay "was", usa ese. Si no, usa base + markup.
      // Aplicar descuento global si existe.
      let price = was > 0 ? was : base * (1 + markupPct);
      return Math.max(0, Math.round(price * (1 - discountPct)));
    };

    for (const it of items) {
      const id = String(it.id || '');
      const p = pIndex.get(id);
      if (!p) return j(400, { error: `Unknown product: ${id}` });
      
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      const size = String(it.size || '').toUpperCase();
      const unit = getPriceMXN(p);

      // URL absoluta para imagen en Stripe
      let imgUrl = p.img;
      if (imgUrl && imgUrl.startsWith('/')) {
        imgUrl = `${SITE_URL}${imgUrl}`;
      }

      line_items.push({
        quantity: qty,
        price_data: {
          currency: 'mxn',
          unit_amount: unit * 100,
          product_data: {
            name: `${p.name}${size ? ` · ${size}` : ''}`,
            images: imgUrl ? [imgUrl] : undefined,
            metadata: { id, size }
          }
        }
      });
    }

    // 5. Envío
    if (shippingMXN > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: 'mxn',
          unit_amount: shippingMXN * 100,
          product_data: { name: 'Envío', metadata: { kind: 'shipping' } }
        }
      });
    }

    // 6. Cupones
    let discounts = undefined;
    const rules = Array.isArray(promos?.rules) ? promos.rules : [];
    const rule = rules.find(x => norm(x.code) === promoCode && x.active !== false);

    if (rule) {
      const t = String(rule.type || '');
      const couponObj = { duration: 'once', name: `PROMO ${rule.code}`, metadata: { promo_code: rule.code } };
      let apply = false;

      if (t === 'percent') {
        const v = Number(rule.value || 0);
        const pct = (v > 0 && v <= 1) ? Math.round(v * 100) : Math.round(v);
        if (pct >= 1 && pct <= 100) { couponObj.percent_off = pct; apply = true; }
      } else if (t === 'fixed_mxn') {
        const off = Math.max(1, Math.round(Number(rule.value || 0)));
        couponObj.amount_off = off * 100; couponObj.currency = 'mxn'; apply = true;
      } else if (t === 'free_shipping') {
         // Ya manejado en frontend poniendo shippingMXN en 0, pero por seguridad:
         if (shippingMXN > 0) {
           couponObj.amount_off = shippingMXN * 100; couponObj.currency = 'mxn'; apply = true;
         }
      }

      if (apply) {
        // Crear cupón al vuelo en Stripe
        const created = await stripe.coupons.create(couponObj);
        discounts = [{ coupon: created.id }];
      }
    }

    // 7. Sesión
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts,
      allow_promotion_codes: false, // Usamos nuestra propia lógica
      success_url: `${SITE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?status=cancel`,
      metadata: { source: 'score_store', promo_code: rule ? rule.code : '' },
      shipping_address_collection: { allowed_countries: ['MX'] },
      phone_number_collection: { enabled: true }
    });

    return j(200, { url: session.url });

  } catch (err) {
    console.error(err);
    return j(500, { error: err?.message || 'Server error' });
  }
};
