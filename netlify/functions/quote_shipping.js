/**
 * netlify/functions/quote_shipping.js
 * Cotización real con Envia.com + fallback inteligente si falla.
 *
 * Requiere variables Netlify:
 * - ENVIA_API_KEY
 * Opcional:
 * - ENVIA_BASE_URL (default: https://api.envia.com)
 *
 * Endpoint:
 * POST https://api.envia.com/ship/rate/
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
  // ✅ Estado COMPLETO (en vez de "BC")
  state: "Baja California",
  country: "MX",
  postalCode: "22614",
  reference: "Interior JK"
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(data)
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

function compactReason(reason) {
  const s = String(reason || "").trim();
  if (!s) return "";
  // Si viene JSON, reduce a algo humano
  try {
    const j = JSON.parse(s);
    if (j?.message) return String(j.message).slice(0, 160);
    if (j?.error) return String(j.error).slice(0, 160);
  } catch {}
  // Limpia basura común
  if (s.includes("{") && s.includes("}")) return "Error del proveedor (Envia).";
  if (s.length > 160) return s.slice(0, 160) + "…";
  return s;
}

// Fallback “inteligente”
function fallbackQuote(zip, reason = null) {
  const z = Number(zip);
  let mxn = 199;

  // Baja California (aprox 21000–22999)
  if (z >= 21000 && z <= 22999) mxn = 149;

  // Zonas remotas (regla simple)
  if (z >= 60000) mxn = 249;

  const r = compactReason(reason);

  return {
    mxn,
    note: r
      ? `Envío estimado (fallback). Motivo: ${r}`
      : "Envío estimado (fallback). Se confirmará al generar guía.",
    provider: "fallback"
  };
}

// Heurística rápida por CP (para que Envia no truene)
function inferDestination(zip) {
  const z = Number(zip);

  // Baja California: 21000–22999 (Tijuana / Tecate / Rosarito / Ensenada)
  if (z >= 21000 && z <= 22999) {
    return {
      country: "MX",
      postalCode: String(zip),
      state: "Baja California",
      city: "Tijuana"
    };
  }

  return {
    country: "MX",
    postalCode: String(zip),
    state: "México",
    city: "Ciudad de México"
  };
}

// Normaliza items -> paquete estimado
function buildPackages(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const qtyTotal = safeItems.reduce((a, i) => a + Math.max(1, safeInt(i?.qty, 1)), 0);

  // 0.7kg por pieza aprox, clamp (0.5–10kg)
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
      // ✅ Algunos proveedores prefieren dimensiones planas
      dimensions: { length: 30, width: 25, height: 10 }
    }
  ];
}

async function quoteWithEnvia({ zip, items }) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

  const baseUrl = (process.env.ENVIA_BASE_URL || "https://api.envia.com").replace(/\/+$/, "");
  const url = `${baseUrl}/ship/rate/`;

  const body = {
    origin: { ...ORIGIN },
    destination: inferDestination(zip), // ✅ ya no solo postalCode
    packages: buildPackages(items)
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error?.message ||
      data?.error ||
      `HTTP ${res.status}`;
    throw new Error(`Envia ${res.status}: ${compactReason(msg)}`);
  }

  const rates = data?.data || data?.rates || data?.result || data;

  if (!Array.isArray(rates) || rates.length === 0) {
    throw new Error("Envia sin tarifas (respuesta vacía)");
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
        service: r?.service || r?.serviceLevel || r?.name || ""
      };
    })
    .filter(x => typeof x.mxn === "number" && x.mxn > 0)
    .sort((a, b) => a.mxn - b.mxn);

  if (parsed.length === 0) throw new Error("Envia tarifas sin precio usable");

  const best = parsed[0];
  return {
    mxn: Math.round(best.mxn),
    note: `Envío estimado vía ${best.carrier || "paquetería"}${best.service ? ` (${best.service})` : ""}.`,
    provider: "envia",
    carrier: best.carrier,
    service: best.service
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const payload = readJsonBody(event);
  if (!payload) return json(200, fallbackQuote("00000", "Body inválido / JSON parse error"));

  const zip = String(payload.zip || "").trim();
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!isZip(zip)) return json(400, { mxn: null, note: "C.P. inválido", provider: "validation" });
  if (items.length === 0) return json(400, { mxn: null, note: "Carrito vacío", provider: "validation" });

  try {
    const q = await quoteWithEnvia({ zip, items });
    return json(200, q);
  } catch (e) {
    return json(200, fallbackQuote(zip, e?.message || e));
  }
};