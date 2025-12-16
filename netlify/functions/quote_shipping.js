/**
 * netlify/functions/quote_shipping.js
 * Cotización con Envia.com + fallback inteligente si falla.
 *
 * Requiere Netlify env vars:
 * - ENVIA_API_KEY
 * Opcional:
 * - ENVIA_BASE_URL (default: https://api.envia.com)
 */

const ORIGIN = {
  name: "ÚNICO UNIFORMES",
  company: "ÚNICO UNIFORMES",
  email: "ventas.unicotextil@gmail.com",
  phone: "6642368701",
  street: "Palermo",
  number: "6106",
  district: "Anexa Roma",
  city: "Tijuana",
  state: "BC",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK",
};

const MAX_QTY_PER_LINE = 10;
const MAX_ITEMS_TOTAL = 40;

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function isZip(zip) {
  return /^\d{5}$/.test(String(zip || "").trim());
}

function safeInt(n, def = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.trunc(x);
}

function readJsonBody(event) {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

// Para "mandar todo" sin romper Envia: solo incluimos keys con valor real
function cleanObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const val = typeof v === "string" ? v.trim() : v;
    if (val === undefined || val === null) continue;
    if (typeof val === "string" && val.length === 0) continue;
    out[k] = val;
  }
  return out;
}

// Fallback si Envia falla
function fallbackQuote(zip, reason = null) {
  const z = Number(String(zip || "0").replace(/\D/g, "")) || 0;

  let mxn = 199;
  if (z >= 21000 && z <= 22999) mxn = 149; // Baja California aprox
  if (z >= 60000) mxn = 249; // regla simple remota

  return {
    mxn,
    note: reason
      ? `Envío estimado (fallback). Motivo: ${String(reason).slice(0, 140)}`
      : "Envío estimado (fallback). Se confirmará al generar guía.",
    provider: "fallback",
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { items: [], qtyTotal: 0 };

  let qtyTotal = 0;
  const safe = [];

  for (const it of items) {
    const id = String(it?.id || "").trim();
    const qty = Math.max(1, safeInt(it?.qty, 1));

    if (!id) continue;
    if (qty > MAX_QTY_PER_LINE) return { error: `Cantidad inválida (1–${MAX_QTY_PER_LINE}).` };

    qtyTotal += qty;
    if (qtyTotal > MAX_ITEMS_TOTAL) return { error: `Demasiados artículos (${MAX_ITEMS_TOTAL} máx.).` };

    safe.push({ id, qty });
  }

  return { items: safe, qtyTotal };
}

function buildPackages(qtyTotal) {
  const weightKg = Math.max(0.5, Math.min(10, qtyTotal * 0.7));
  return [
    {
      content: "Ropa / Merch",
      amount: 1,
      type: "box",
      weight: weightKg,
      insurance: 0,
      declaredValue: 0,
      weightUnit: "KG",
      lengthUnit: "CM",
      dimensions: { length: 30, width: 25, height: 10 },
    },
  ];
}

/**
 * Construye destination "completo":
 * - hoy tu front solo manda { zip }
 * - mañana puedes mandar destination: { name, email, phone, street, city, state, ... }
 */
function buildDestination(payload, zip) {
  const d = payload?.destination || payload?.shipping || payload?.address || {};

  // Base mínima segura
  const base = {
    country: "MX",
    postalCode: String(zip),
  };

  // Campos extra opcionales (no inventamos datos)
  const full = {
    ...base,
    name: d.name,
    company: d.company,
    email: d.email,
    phone: d.phone,

    street: d.street,
    number: d.number,
    district: d.district,
    city: d.city,
    state: d.state,
    reference: d.reference,
  };

  // “Mandar todo” en código ✅ pero a Envia solo le mandamos lo que tenga valor ✅
  return cleanObject(full);
}

async function quoteWithEnvia({ destination, qtyTotal }) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

  const baseUrl = (process.env.ENVIA_BASE_URL || "https://api.envia.com").replace(/\/+$/, "");

  const urlCandidates = [
    `${baseUrl}/ship/rate`,
    `${baseUrl}/ship/rates`,
    `${baseUrl}/rate`,
    `${baseUrl}/rates`,
  ];

  const body = {
    origin: { ...ORIGIN },
    destination, // ✅ ya viene “completo” (pero limpio)
    packages: buildPackages(qtyTotal),
  };

  let lastErr = null;

  for (const url of urlCandidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "api-key": apiKey,
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!res.ok) {
        lastErr = new Error(`Envia ${res.status} en ${url}: ${String(text).slice(0, 260)}`);
        continue;
      }

      const rates = data?.data || data?.rates || data?.result || data;

      if (!Array.isArray(rates) || rates.length === 0) {
        lastErr = new Error(`Envia sin tarifas en ${url}`);
        continue;
      }

      const parsed = rates
        .map(r => {
          const mxn =
            Number(r?.totalPrice) ||
            Number(r?.total_price) ||
            Number(r?.price) ||
            Number(r?.total) ||
            Number(r?.amount) ||
            Number(r?.rate);

          return {
            mxn: Number.isFinite(mxn) ? mxn : null,
            carrier: r?.carrier || r?.provider || r?.company || "",
            service: r?.service || r?.serviceLevel || r?.name || "",
          };
        })
        .filter(x => typeof x.mxn === "number" && x.mxn > 0)
        .sort((a, b) => a.mxn - b.mxn);

      if (parsed.length === 0) {
        lastErr = new Error(`Envia tarifas sin precio usable en ${url}`);
        continue;
      }

      const best = parsed[0];
      return {
        mxn: Math.round(best.mxn),
        note: `Envío estimado vía ${best.carrier || "paquetería"}${best.service ? ` (${best.service})` : ""}.`,
        provider: "envia",
        carrier: best.carrier,
        service: best.service,
      };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("No se pudo cotizar con Envia.");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const payload = readJsonBody(event);
  if (!payload) return json(200, fallbackQuote("00000", "Body inválido / JSON parse error"));

  const zip = String(payload.zip || "").trim();
  const norm = normalizeItems(payload.items);

  if (!isZip(zip)) return json(400, { mxn: null, note: "C.P. inválido", provider: "validation" });
  if (norm?.error) return json(400, { mxn: null, note: norm.error, provider: "validation" });
  if (!norm.qtyTotal) return json(400, { mxn: null, note: "Carrito vacío", provider: "validation" });

  const destination = buildDestination(payload, zip);

  try {
    const q = await quoteWithEnvia({ destination, qtyTotal: norm.qtyTotal });
    return json(200, q);
  } catch (e) {
    return json(200, fallbackQuote(zip, e?.message || e));
  }
};