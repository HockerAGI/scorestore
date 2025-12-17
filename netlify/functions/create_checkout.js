/**
 * SCORE STORE — Create Stripe Checkout
 *
 * Reglas (alineadas con frontend):
 * - Precio tienda = baseMXN +20%
 * - Cupón público: SCORE10 = -10% (solo productos)
 * - Cupones en /data/promos.json: percent | fixed_mxn | free_shipping
 * - Cupón secreto (NO en JSON): GRTS10 => total GRATIS (productos+envío)
 * - Envío: se recibe como shippingMXN + shippingLabel
 */
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const PRICE_MARKUP = 0.20;
const PUBLIC_COUPON = "SCORE10";
const SECRET_FREE_CODE = ["GR", "TS10"].join(""); // secreto

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}

function roundMXN(n) { return Math.round(Number(n || 0)); }
function normCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").trim();
}
function unitPriceFromBase(baseMXN) {
  return roundMXN(Number(baseMXN || 0) * (1 + PRICE_MARKUP));
}

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.json();
}

function findPromoRule(code, promosJson) {
  const c = normCode(code);
  if (!c) return null;

  if (c === SECRET_FREE_CODE) {
    return { code: c, type: "free_total", value: 0, active: true };
  }

  const rules = promosJson?.rules;
  if (Array.isArray(rules)) {
    const r = rules.find((x) => normCode(x.code) === c && x.active);
    if (r) return r;
  }

  if (c === PUBLIC_COUPON) {
    return { code: c, type: "percent", value: 0.10, active: true };
  }

  return null;
}

function computeDiscountTotals({ promo, subtotalProductsMXN, shippingMXN }) {
  let discProducts = 0;
  let discShipping = 0;

  if (!promo) return { discProducts, discShipping, discTotal: 0 };

  if (promo.type === "percent") {
    discProducts = roundMXN(subtotalProductsMXN * Number(promo.value || 0));
  } else if (promo.type === "fixed_mxn") {
    discProducts = roundMXN(Number(promo.value || 0));
  } else if (promo.type === "free_shipping") {
    discShipping = roundMXN(shippingMXN);
  } else if (promo.type === "free_total") {
    return { discProducts: subtotalProductsMXN, discShipping: shippingMXN, discTotal: subtotalProductsMXN + shippingMXN };
  }

  // clamp
  discProducts = Math.max(0, Math.min(discProducts, subtotalProductsMXN));
  discShipping = Math.max(0, Math.min(discShipping, shippingMXN));
  const discTotal = discProducts + discShipping;

  return { discProducts, discShipping, discTotal };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const items = Array.isArray(body.items) ? body.items : [];
  const promoCode = normCode(body.promoCode || "");
  const shippingMXN = roundMXN(body.shippingMXN || 0);
  const shippingLabel = String(body.shippingLabel || "Envío");

  if (!items.length) return json(400, { ok: false, error: "Cart vacío" });

  try {
    // Cargar catálogo y promos desde el repo (Netlify deploy)
    const baseURL = body.siteUrl || "https://scorestore.netlify.app";
    const catalog = await loadJSON(`${baseURL}/data/catalog.json?v=${Date.now()}`);
    const promos = await loadJSON(`${baseURL}/data/promos.json?v=${Date.now()}`).catch(() => null);

    const catalogProducts = Array.isArray(catalog.products) ? catalog.products : [];

    // Construir line_items con precio server-side (anti-tamper)
    let subtotalProductsMXN = 0;

    const line_items = items.map((it) => {
      const id = String(it.id || "");
      const qty = Math.max(1, Number(it.qty || 1));
      const size = String(it.size || "ÚNICA");

      const p = catalogProducts.find((x) => String(x.id) === id);
      if (!p || !p.baseMXN) throw new Error(`Producto inválido o sin baseMXN: ${id}`);

      const unitMXN = unitPriceFromBase(p.baseMXN);
      subtotalProductsMXN += unitMXN * qty;

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${p.name}${size && size !== "ÚNICA" ? ` — ${size}` : ""}`,
            images: p.img ? [`${baseURL}${p.img}`] : undefined,
          },
          unit_amount: unitMXN * 100,
        },
        quantity: qty,
      };
    });

    subtotalProductsMXN = roundMXN(subtotalProductsMXN);

    // Shipping como line item (si aplica)
    if (shippingMXN > 0) {
      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: { name: shippingLabel },
          unit_amount: shippingMXN * 100,
        },
        quantity: 1,
      });
    }

    // Promo
    const rule = promoCode ? findPromoRule(promoCode, promos) : null;
    const promoApplied = rule ? { code: normCode(rule.code), type: rule.type, value: Number(rule.value || 0) } : null;

    const { discTotal } = computeDiscountTotals({
      promo: promoApplied,
      subtotalProductsMXN,
      shippingMXN,
    });

    const discounts = [];
    if (discTotal > 0) {
      // Cupón por monto (MXN) — permite total $0 incluso para el secreto
      const coupon = await stripe.coupons.create({
        name: promoApplied?.code ? `Promo ${promoApplied.code}` : "Promo",
        amount_off: Math.min(discTotal, subtotalProductsMXN + shippingMXN) * 100,
        currency: "mxn",
        duration: "once",
      });
      discounts.push({ coupon: coupon.id });
    }

    // Crear sesión
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      discounts: discounts.length ? discounts : undefined,
      success_url: `${baseURL}/?success=1`,
      cancel_url: `${baseURL}/?canceled=1`,
    });

    return json(200, { ok: true, url: session.url });
  } catch (err) {
    return json(500, { ok: false, error: err.message || "Checkout error" });
  }
};