const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');

// Función segura para leer archivos en Netlify
const readFile = (fileName) => {
  const paths = [
    path.resolve(fileName),
    path.resolve('data', fileName),
    path.join(__dirname, fileName),
    path.join(process.cwd(), 'data', fileName)
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  throw new Error(`Archivo no encontrado: ${fileName}`);
};

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').trim();
const j = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return j(405, { error: 'Method Not Allowed' });

  try {
    const catalog = readFile('catalog.json');
    const promos = readFile('promos.json');
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return j(500, { error: 'Falta STRIPE_SECRET_KEY' });

    const stripe = new Stripe(key);
    const body = JSON.parse(event.body || '{}');
    const items = Array.isArray(body.items) ? body.items : [];
    
    // Configuración de precios
    const discountPct = Number(catalog?.pricing?.discount_pct || 0);
    const markupPct = Number(catalog?.pricing?.markup_pct || 0);
    const products = catalog.products || [];
    const pIndex = new Map(products.map(p => [String(p.id), p]));

    const line_items = items.map(it => {
      const p = pIndex.get(String(it.id));
      if (!p) throw new Error(`Producto inválido: ${it.id}`);
      
      // Cálculo de precio seguro en servidor
      let price = p.baseMXN * (1 + markupPct);
      price = Math.round(price * (1 - discountPct));

      return {
        quantity: it.qty || 1,
        price_data: {
          currency: 'mxn',
          unit_amount: price * 100,
          product_data: {
            name: `${p.name} (Talla: ${it.size || 'Única'})`,
            images: [it.img.startsWith('http') ? it.img : `https://scorestore.netlify.app${it.img}`],
            metadata: { id: p.id, size: it.size }
          }
        }
      };
    });

    // Lógica de Cupón
    let discounts = undefined;
    const promoCode = norm(body.promoCode);
    const rule = promos.rules.find(r => r.code === promoCode && r.active);
    
    if (rule) {
      const couponObj = { duration: 'once', name: rule.code };
      if (rule.type === 'percent') couponObj.percent_off = rule.value * 100;
      if (rule.type === 'fixed_mxn') { couponObj.amount_off = rule.value * 100; couponObj.currency = 'mxn'; }
      
      if (couponObj.percent_off || couponObj.amount_off) {
        const coupon = await stripe.coupons.create(couponObj);
        discounts = [{ coupon: coupon.id }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      discounts,
      success_url: 'https://scorestore.netlify.app/?status=success',
      cancel_url: 'https://scorestore.netlify.app/?status=cancel',
      shipping_address_collection: { allowed_countries: ['MX'] }
    });

    return j(200, { url: session.url });

  } catch (err) {
    return j(500, { error: err.message });
  }
};
