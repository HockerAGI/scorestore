/**
 * Netlify Function: create_checkout
 * - Crea un Stripe Checkout Session en MXN
 * - Valida items contra /data/catalog.json
 * - Aplica promos desde /data/promos.json
 * - (Opcional) recalcula envío con Envia si llega shipTo
 *
 * Body esperado (JSON):
 * {
 *   "items":[{"id":"camisa-pits-baja1000","qty":1}, ...],
 *   "promo":{"code":"SCORE10"},
 *   "shippingMXN": 250,
 *   "shipTo": { "postalCode":"22000", "state":"BC", "city":"Tijuana", "address1":"...", "name":"...", "phone":"...", "email":"..." }
 * }
 */
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const SITE_URL = process.env.URL_SCORE || process.env.URL || "http://localhost:8888";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Envia (para recalcular envío de forma server-side)
const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
const ENVIA_API_BASE = process.env.ENVIA_API_BASE || "https://api.envia.com"; // puedes sobrescribir
const SHIPPING_BASE_MXN = 250;
const SHIPPING_MARKUP = 0.05;

// Dirección de recolección (Único Uniformes)
const ORIGIN = {
  name: "Único Uniformes (Recolección)",
  address: "Palermo 6106 Interior JK",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function readJson(relPath) {
  const abs = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(abs, "utf-8"));
}

function clampQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(50, Math.floor(x)));
}

function moneyCents(mxn) {
  return Math.max(0, Math.round(Number(mxn) * 100));
}

function applyPromo({ subtotalMXN, promoRule }) {
  if (!promoRule) return { discountMXN: 0, freeShipping: false, freeTotal: false };

  const type = promoRule.type;
  const val = Number(promoRule.value || 0);

  if (type === "percent") {
    const d = Math.round(subtotalMXN * (val / 100));
    return { discountMXN: Math.min(d, subtotalMXN), freeShipping: false, freeTotal: false };
  }
  if (type === "fixed_mxn") {
    return { discountMXN: Math.min(Math.round(val), subtotalMXN), freeShipping: false, freeTotal: false };
  }
  if (type === "free_shipping") {
    return { discountMXN: 0, freeShipping: true, freeTotal: false };
  }
  if (type === "free_total") {
    return { discountMXN: subtotalMXN, freeShipping: true, freeTotal: true };
  }
  return { discountMXN: 0, freeShipping: false, freeTotal: false };
}

function buildPackageFromItems(validatedItems, catalogById) {
  let totalWeight = 0;
  let maxL = 0, maxW = 0, totalH = 0;

  for (const it of validatedItems) {
    const p = catalogById[it.id];
    const qty = it.qty;

    const ship = p.shipping || {};
    const w = Number(ship.weight_kg || 0.5);
    const dims = ship.dims_cm || [30, 25, 10];
    const [L, W, H] = dims.map((n) => Number(n) || 0);

    totalWeight += w * qty;
    maxL = Math.max(maxL, L);
    maxW = Math.max(maxW, W);
    totalH += H * qty;
  }

  totalWeight = Math.max(0.2, Number(totalWeight.toFixed(2)));
  const length = Math.max(10, Math.ceil(maxL));
  const width = Math.max(10, Math.ceil(maxW));
  const height = Math.max(5, Math.ceil(totalH));

  return { weight: totalWeight, length, width, height };
}

async function quoteEnviaMXN({ shipTo, pkg }) {
  if (!ENVIA_API_KEY) {
    throw new Error("Falta ENVIA_API_KEY en variables de entorno.");
  }
  if (!shipTo || (shipTo.country && shipTo.country !== "MX")) {
    throw new Error("Por ahora solo enviamos dentro de México (MX).");
  }

  const url = `${ENVIA_API_BASE.replace(/\/$/, "")}/ship/rate/`;

  const payload = {
    origin: {
      name: ORIGIN.name,
      street: ORIGIN.address,
      district: ORIGIN.district,
      city: ORIGIN.city,
      state: ORIGIN.state,
      country: ORIGIN.country,
      postalCode: ORIGIN.postalCode,
    },
    destination: {
      name: shipTo.name || "Cliente",
      street: shipTo.address1,
      district: shipTo.district || "",
      city: shipTo.city,
      state: shipTo.state,
      country: "MX",
      postalCode: shipTo.postalCode,
    },
    packages: [
      {
        weight: pkg.weight,
        dimensions: { length: pkg.length, width: pkg.width, height: pkg.height },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ENVIA_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Envia rate error (${res.status}): ${text.slice(0, 500)}`);
  }

  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.rates) ? data.rates : []));
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Envia no regresó tarifas (rates vacíos).");
  }

  const getCost = (x) => {
    const candidates = [
      x.total_price, x.totalPrice,
      x.total_amount, x.totalAmount,
      x.price, x.amount,
      x?.cost?.total, x?.cost?.amount
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return NaN;
  };

  let best = null;
  for (const r of list) {
    const cost = getCost(r);
    if (!Number.isFinite(cost)) continue;
    if (!best || cost < best.cost) best = { cost, raw: r };
  }
  if (!best) throw new Error("No pude interpretar el costo MXN de Envia.");

  return best;
}

function applyShippingRule(enviaCostMXN) {
  if (enviaCostMXN < SHIPPING_BASE_MXN) {
    return { finalMXN: SHIPPING_BASE_MXN, enviaMXN: enviaCostMXN, appliedMin: true, appliedMarkup: false };
  }
  return { finalMXN: Math.round(enviaCostMXN * (1 + SHIPPING_MARKUP)), enviaMXN: enviaCostMXN, appliedMin: false, appliedMarkup: true };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
    }

    if (!STRIPE_SECRET_KEY) {
      return jsonResponse(500, { ok: false, error: "Falta STRIPE_SECRET_KEY en variables de entorno." });
    }

    const body = JSON.parse(event.body || "{}");
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return jsonResponse(400, { ok: false, error: "Carrito vacío." });

    const catalog = readJson("data/catalog.json");
    const promos = readJson("data/promos.json");
    const catalogById = Object.fromEntries((catalog.products || []).map((p) => [p.id, p]));

    const items = rawItems
      .map((it) => ({ id: String(it.id || ""), qty: clampQty(it.qty) }))
      .filter((it) => catalogById[it.id]);

    if (items.length === 0) return jsonResponse(400, { ok: false, error: "Ningún item del carrito coincide con el catálogo." });

    let subtotalMXN = 0;
    for (const it of items) subtotalMXN += Number(catalogById[it.id].price_mxn_retail || 0) * it.qty;

    const code = (body.promo?.code || "").toString().trim().toUpperCase();
    const promoRule = promos.find((x) => x.active && x.code === code) || null;
    const promoApplied = applyPromo({ subtotalMXN, promoRule });

    let shippingMXN = Math.max(0, Math.round(Number(body.shippingMXN || 0)));
    const shipTo = body.shipTo || null;

    if (promoApplied.freeShipping) {
      shippingMXN = 0;
    } else if (shipTo) {
      const pkg = buildPackageFromItems(items, catalogById);
      const q = await quoteEnviaMXN({ shipTo, pkg });
      const ruled = applyShippingRule(Number(q.cost));
      shippingMXN = ruled.finalMXN;
    } else {
      if (shippingMXN < SHIPPING_BASE_MXN) shippingMXN = SHIPPING_BASE_MXN;
    }

    const discountMXN = promoApplied.discountMXN;
    const totalMXN = Math.max(0, subtotalMXN - discountMXN + shippingMXN);

    if (promoApplied.freeTotal || totalMXN === 0) {
      return jsonResponse(200, {
        ok: true,
        free: true,
        url: `${SITE_URL}/?success=1&free=1`,
        summary: { subtotalMXN, discountMXN, shippingMXN, totalMXN, promoCode: code || null },
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const line_items = items.map((it) => {
      const p = catalogById[it.id];
      return {
        quantity: it.qty,
        price_data: {
          currency: "mxn",
          unit_amount: moneyCents(p.price_mxn_retail),
          product_data: {
            name: p.name,
            images: p.img ? [`${SITE_URL}${p.img.startsWith("/") ? "" : "/"}${p.img}`] : [],
            metadata: {
              productId: p.id,
              shortId: p.shortId || "",
              color: p.color || "",
              sizes: (p.sizes || []).join(","),
            },
          },
        },
      };
    });

    // Distribuye descuento proporcionalmente
    if (discountMXN > 0) {
      let remaining = discountMXN;
      const baseSum = line_items.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);

      for (let i = 0; i < line_items.length; i++) {
        const li = line_items[i];
        const itemTotal = li.price_data.unit_amount * li.quantity;
        const share = i === line_items.length - 1
          ? remaining
          : Math.round((itemTotal / baseSum) * discountMXN);

        const perUnitDec = Math.floor(share / li.quantity);
        const newUnit = Math.max(1, li.price_data.unit_amount - perUnitDec);
        const applied = (li.price_data.unit_amount - newUnit) * li.quantity;

        li.price_data.unit_amount = newUnit;
        remaining -= applied;
        if (remaining <= 0) break;
      }
    }

    if (shippingMXN > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: moneyCents(shippingMXN),
          product_data: { name: "Envío (México)" },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${SITE_URL}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?cancel=1`,
      customer_email: shipTo?.email || undefined,
      metadata: {
        promoCode: code || "",
        subtotalMXN: String(subtotalMXN),
        discountMXN: String(discountMXN),
        shippingMXN: String(shippingMXN),
        totalMXN: String(totalMXN),
        shipTo: shipTo ? JSON.stringify(shipTo).slice(0, 500) : ""
      },
    });

    return jsonResponse(200, {
      ok: true,
      url: session.url,
      summary: { subtotalMXN, discountMXN, shippingMXN, totalMXN, promoCode: code || null },
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err.message || String(err) });
  }
};