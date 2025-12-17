/**
 * Netlify Function: quote_shipping
 * - Cotiza con Envia SIEMPRE
 * - Regla de negocio:
 *    * Si Envia < $250 MXN -> cobrar $250
 *    * Si Envia >= $250 MXN -> cobrar (Envia + 5%)
 *
 * Body esperado:
 * {
 *   "items":[{"id":"camisa-pits-baja1000","qty":1}, ...],
 *   "shipTo": { "postalCode":"22000", "state":"BC", "city":"Tijuana", "address1":"...", "name":"...", "phone":"..." }
 * }
 */
const fs = require("fs");
const path = require("path");

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

function readCatalog() {
  const abs = path.join(process.cwd(), "data", "catalog.json");
  return JSON.parse(fs.readFileSync(abs, "utf-8"));
}

function clampQty(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(50, Math.floor(x)));
}

function buildPackage(items, catalogById) {
  let totalWeight = 0;
  let maxL = 0, maxW = 0, totalH = 0;

  for (const it of items) {
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

async function quoteEnvia({ shipTo, pkg }) {
  if (!ENVIA_API_KEY) throw new Error("Falta ENVIA_API_KEY en variables de entorno.");
  if (!shipTo?.postalCode || !shipTo?.state || !shipTo?.city) {
    throw new Error("Falta shipTo.postalCode/state/city para cotizar.");
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
      street: shipTo.address1 || "SIN_DIRECCION",
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
  if (!res.ok) throw new Error(`Envia rate error (${res.status}): ${text.slice(0, 500)}`);

  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.rates) ? data.rates : []));
  if (!Array.isArray(list) || list.length === 0) throw new Error("Envia no regresó tarifas (rates vacíos).");

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

function applyRule(enviaCostMXN) {
  if (enviaCostMXN < SHIPPING_BASE_MXN) {
    return { finalMXN: SHIPPING_BASE_MXN, enviaMXN: enviaCostMXN, appliedMin: true, appliedMarkup: false };
  }
  return {
    finalMXN: Math.round(enviaCostMXN * (1 + SHIPPING_MARKUP)),
    enviaMXN: enviaCostMXN,
    appliedMin: false,
    appliedMarkup: true,
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
    }

    const body = JSON.parse(event.body || "{}");
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const shipTo = body.shipTo || null;

    if (!shipTo) return jsonResponse(400, { ok: false, error: "Falta shipTo." });
    if (!rawItems.length) return jsonResponse(400, { ok: false, error: "Carrito vacío." });

    const catalog = readCatalog();
    const catalogById = Object.fromEntries((catalog.products || []).map((p) => [p.id, p]));

    const items = rawItems.map((it) => ({ id: String(it.id || ""), qty: clampQty(it.qty) }))
      .filter((it) => catalogById[it.id]);

    if (!items.length) return jsonResponse(400, { ok: false, error: "Items no válidos contra catálogo." });

    const pkg = buildPackage(items, catalogById);
    const q = await quoteEnvia({ shipTo, pkg });

    const ruled = applyRule(Number(q.cost));
    return jsonResponse(200, {
      ok: true,
      provider: "envia",
      envia_cost_mxn: ruled.enviaMXN,
      shipping_mxn: ruled.finalMXN,
      applied_min: ruled.appliedMin,
      applied_markup: ruled.appliedMarkup,
      base_min_mxn: SHIPPING_BASE_MXN,
      markup_percent: SHIPPING_MARKUP,
      package: pkg,
      raw: q.raw
    });
  } catch (err) {
    return jsonResponse(500, { ok: false, error: err.message || String(err) });
  }
};