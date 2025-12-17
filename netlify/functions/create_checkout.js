// /netlify/functions/create_checkout.js
// SCORE Store — Stripe Checkout
// - NO confía en precios del frontend
// - Calcula: listMXN = round(baseMXN * 1.20)
// - Promos desde /promos.json
// - Catálogo desde /catalog.json
// - Envío: recalculado (Envia) con shipTo

const Stripe = require("stripe");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const URL_SCORE = (process.env.URL_SCORE || "").replace(/\/$/, "");
const ENVIA_API_KEY = process.env.ENVIA_API_KEY;

const PRICE_MARKUP = 0.20;
const PUBLIC_COUPON = "SCORE10";
const SECRET_FREE_CODE = "GRTS10";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function roundMXN(n) {
  return Math.round(Number(n || 0));
}

function normCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").trim();
}

async function fetchSiteJson(path) {
  if (!URL_SCORE) throw new Error("URL_SCORE missing");
  const res = await fetch(`${URL_SCORE}${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch ${path} failed`);
  return await res.json();
}

function priceListFromBase(baseMXN) {
  return roundMXN(Number(baseMXN || 0) * (1 + PRICE_MARKUP));
}

function findPromoRule(code, promos) {
  const c = normCode(code);
  if (!c) return null;

  if (c === SECRET_FREE_CODE) return { code: c, type: "free_total", value: 0, active: true };

  const rules = promos?.rules;
  if (Array.isArray(rules)) {
    const r = rules.find(x => normCode(x.code) === c && x.active);
    if (r) return { code: c, type: r.type, value: Number(r.value || 0), active: true };
  }

  if (c === PUBLIC_COUPON) return { code: c, type: "percent", value: 0.10, active: true };
  return null;
}

// Origen (pon tus datos reales en Netlify env si quieres más precisión)
const ORIGIN = {
  postal_code: process.env.ORIGIN_POSTAL_CODE || "22614",
  state_code: process.env.ORIGIN_STATE_CODE || "BC",
  city: process.env.ORIGIN_CITY || "Tijuana",
  address1: process.env.ORIGIN_ADDRESS1 || "Palermo 6106 Interior JK, Anexa Roma",
  country_code: "MX",
};

const ENVIA_CARRIERS = (process.env.ENVIA_CARRIERS || "dhl,fedex,estafeta")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function estimatePackage(items = []) {
  const qty = items.reduce((a, b) => a + Number(b.qty || 0), 0) || 1;
  const weightKg = qty <= 2 ? 1 : qty <= 5 ? 2 : 3;

  return {
    content: "Merch",
    amount: qty,
    type: "box",
    weight: weightKg,
    weightUnit: "KG",
    length: 30,
    width: 22,
    height: 10,
    dimensionUnit: "CM",
  };
}

async function enviaRateOnce({ carrier, from, to, packages }) {
  const url = "https://api.envia.com/ship/rate/";
  const payload = { carrier, from, to, packages };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENVIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`ENVIA_RATE_FAIL HTTP ${res.status}`);
  return data;
}

async function getShippingMXN(shipTo, items, promoRule) {
  if (promoRule?.type === "free_shipping") return 0;

  const postal_code = String(shipTo?.postal_code || "").trim();
  const state_code = String(shipTo?.state_code || "").trim().toUpperCase();
  const city = String(shipTo?.city || "").trim();
  const address1 = String(shipTo?.address1 || "").trim();

  if (!postal_code || postal_code.length !== 5) throw new Error("Shipping: postal_code inválido");
  if (!state_code || state_code.length < 2) throw new Error("Shipping: state_code inválido");
  if (!city || city.length < 2) throw new Error("Shipping: city inválido");
  if (!address1 || address1.length < 5) throw new Error("Shipping: address1 inválido");

  if (!ENVIA_API_KEY) {
    // Si no hay Envia, NO inventamos “cotización real”. Marcamos envío estándar.
    return 199;
  }

  const from = ORIGIN;
  const to = { postal_code, state_code, city, address1, country_code: "MX" };
  const pkg = estimatePackage(items);

  let best = null;
  for (const carrier of ENVIA_CARRIERS) {
    try {
      const data = await enviaRateOnce({ carrier, from, to, packages: [pkg] });

      const rates = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.rates) ? data.rates : null));
      if (Array.isArray(rates) && rates.length) {
        for (const r of rates) {
          const price = Number(r?.total || r?.price || r?.amount || r?.rate || 0);
          if (!price) continue;
          if (!best || price < best) best = price;
        }
      } else {
        const price = Number(data?.total || data?.price || 0);
        if (price && (!best || price < best)) best = price;
      }
    } catch {}
  }

  if (!best) return 199; // fallback conservador si Envia falla
  return roundMXN(best);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  if (!STRIPE_SECRET_KEY) return json(500, { ok: false, error: "STRIPE_SECRET_KEY missing" });
  if (!URL_SCORE) return json(500, { ok: false, error: "URL_SCORE missing" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const cart = Array.isArray(body.cart) ? body.cart : [];
  const promoCode = normCode(body.promoCode || "");
  const shipTo = body.shipTo || {};

  if (!cart.length) return json(400, { ok: false, error: "Cart empty" });

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  // Cargar catálogo/promos desde el sitio (NO desde fs)
  let catalog, promos;
  try {
    catalog = await fetchSiteJson("/catalog.json");
    promos = await fetchSiteJson("/promos.json");
  } catch (e) {
    return json(500, { ok: false, error: "No pude leer /catalog.json o /promos.json desde URL_SCORE." });
  }

  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const promoRule = findPromoRule(promoCode, promos);

  // FREE TOTAL (secreto): no pasa por Stripe
  if (promoRule?.type === "free_total") {
    // Notificación mínima (si quieres, aquí luego metemos Telegram directo)
    return json(200, {
      free: true,
      redirect_url: `${URL_SCORE}/?free=1`,
    });
  }

  // Construir items validados por catálogo
  const normalizedItems = [];
  for (const it of cart) {
    const qty = Math.max(1, Math.min(99, Number(it.qty || 1)));
    const id = String(it.id || "").trim();
    const size = String(it.size || "ÚNICA").trim();

    const p = products.find(x => String(x.id) === id);
    if (!p) return json(400, { ok: false, error: `Producto no existe en catálogo: ${id}` });

    const base = Number(p.baseMXN || 0);
    if (!base) return json(400, { ok: false, error: `Producto sin baseMXN: ${id}` });

    const listMXN = priceListFromBase(base);
    normalizedItems.push({
      id,
      name: p.name,
      img: p.img,
      qty,
      size,
      listMXN,
    });
  }

  // Shipping (server-side)
  let shippingMXN = 0;
  try {
    shippingMXN = await getShippingMXN(shipTo, normalizedItems, promoRule);
  } catch (e) {
    return json(400, { ok: false, error: String(e.message || e) });
  }

  // Line items Stripe
  const line_items = normalizedItems.map((it) => ({
    quantity: it.qty,
    price_data: {
      currency: "mxn",
      unit_amount: it.listMXN * 100, // centavos
      product_data: {
        name: `${it.name} (${it.size})`,
        images: it.img ? [`${URL_SCORE}${it.img}`] : undefined,
        metadata: { product_id: it.id, size: it.size },
      },
    },
  }));

  // Shipping como item separado
  if (shippingMXN > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "mxn",
        unit_amount: shippingMXN * 100,
        product_data: { name: "Envío (MX)" },
      },
    });
  }

  // Descuento por Stripe coupon (percent / fixed)
  let discounts = undefined;
  if (promoRule?.type === "percent") {
    const key = `score_pct_${Math.round(promoRule.value * 100)}`;
    const coupon = await stripe.coupons.create(
      { percent_off: Math.round(promoRule.value * 100), duration: "once", name: promoRule.code },
      { idempotencyKey: key }
    );
    discounts = [{ coupon: coupon.id }];
  }

  if (promoRule?.type === "fixed_mxn") {
    const amt = roundMXN(promoRule.value);
    const key = `score_mxn_${amt}`;
    const coupon = await stripe.coupons.create(
      { amount_off: amt * 100, currency: "mxn", duration: "once", name: promoRule.code },
      { idempotencyKey: key }
    );
    discounts = [{ coupon: coupon.id }];
  }

  const itemsMeta = normalizedItems.map(i => `${i.id}:${i.size}:${i.qty}`).join("|").slice(0, 490);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    discounts,
    success_url: `${URL_SCORE}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${URL_SCORE}/?canceled=1`,
    metadata: {
      promo_code: promoRule?.code || "",
      ship_postal_code: String(shipTo.postal_code || ""),
      ship_state_code: String(shipTo.state_code || ""),
      ship_city: String(shipTo.city || ""),
      ship_address1: String(shipTo.address1 || ""),
      items: itemsMeta,
    },
  });

  return json(200, { url: session.url, id: session.id });
};