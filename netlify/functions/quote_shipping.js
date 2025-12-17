// /netlify/functions/quote_shipping.js
// SCORE Store — Quote shipping (Envia) + fallback seguro
// Respuesta esperada por el frontend: { ok:true, quote:{ ok:true, mxn, carrier, service, eta_days, raw } }

const ENVIA_API_KEY = process.env.ENVIA_API_KEY;

// Origen (pon tus datos reales en variables Netlify para cotización más exacta)
const ORIGIN = {
  postal_code: process.env.ORIGIN_POSTAL_CODE || "22614",
  state_code: process.env.ORIGIN_STATE_CODE || "BC",
  city: process.env.ORIGIN_CITY || "Tijuana",
  address1: process.env.ORIGIN_ADDRESS1 || "Palermo 6106 Interior JK, Anexa Roma",
  country_code: "MX",
};

// Carriers a intentar (si tu cuenta Envia no soporta alguno, lo saltamos)
const ENVIA_CARRIERS = (process.env.ENVIA_CARRIERS || "dhl,fedex,estafeta")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

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

function estimatePackage(items = []) {
  // Estimación conservadora (ajusta si quieres más exactitud)
  const qty = items.reduce((a, b) => a + Number(b.qty || 0), 0) || 1;

  // 1–2 prendas: ~1kg, 3–5 prendas: ~2kg, 6+ prendas: ~3kg
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
  // Envia docs (endpoint): https://api.envia.com/ship/rate/
  // ⚠️ El schema exacto puede variar por cuenta/país/servicios; por eso manejamos fallback si Envia responde error.
  const url = "https://api.envia.com/ship/rate/";

  const payload = {
    carrier,
    from,
    to,
    packages,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENVIA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const msg = (data && (data.message || data.error)) ? (data.message || data.error) : `HTTP ${res.status}`;
    throw new Error(`ENVIA_RATE_FAIL: ${msg}`);
  }

  return data;
}

function fallbackByPostalCode(cp) {
  // Fallback HONESTO (si Envia no responde): tabla simple por zona.
  // Ajusta estos montos a tu política real si lo necesitas.
  const zip = String(cp || "").slice(0, 2);

  // BC (22): más barato, resto MX: estándar
  if (zip === "22") return 149;
  return 199;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  // Compatible con tu frontend:
  const to = body.to || {};
  const items = Array.isArray(body.items) ? body.items : [];

  const postal_code = String(to.postal_code || body.zip || "").trim();
  const state_code = String(to.state_code || "").trim().toUpperCase();
  const city = String(to.city || "").trim();
  const address1 = String(to.address1 || "").trim();

  if (!postal_code || postal_code.length !== 5) {
    return json(400, { ok: false, error: "postal_code inválido" });
  }

  // Si no hay API Key, usamos fallback directo (pero no mentimos)
  if (!ENVIA_API_KEY) {
    const mxn = fallbackByPostalCode(postal_code);
    return json(200, {
      ok: true,
      quote: { ok: true, mxn, carrier: "FALLBACK", service: "STANDARD", eta_days: null, raw: null },
      note: "ENVIA_API_KEY no configurada: se aplicó tarifa fallback.",
    });
  }

  const from = ORIGIN;
  const dest = {
    postal_code,
    state_code: state_code || "NA",
    city: city || "NA",
    address1: address1 || "NA",
    country_code: "MX",
  };

  const pkg = estimatePackage(items);

  let best = null;
  let errors = [];

  for (const carrier of ENVIA_CARRIERS) {
    try {
      const data = await enviaRateOnce({
        carrier,
        from,
        to: dest,
        packages: [pkg],
      });

      // Normalizamos posible respuesta:
      // Si Envia regresa lista de servicios, tomamos el más barato.
      const rates = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.rates) ? data.rates : null));

      if (Array.isArray(rates) && rates.length) {
        for (const r of rates) {
          const price = Number(r?.total || r?.price || r?.amount || r?.rate || 0);
          if (!price) continue;
          const candidate = {
            ok: true,
            mxn: roundMXN(price),
            carrier: r?.carrier || carrier,
            service: r?.service || r?.service_name || r?.name || "SERVICE",
            eta_days: r?.delivery_days ?? r?.eta_days ?? null,
            raw: r,
          };
          if (!best || candidate.mxn < best.mxn) best = candidate;
        }
      } else {
        // Si no viene lista, intentamos leer total directo
        const price = Number(data?.total || data?.price || 0);
        if (price) {
          const candidate = {
            ok: true,
            mxn: roundMXN(price),
            carrier,
            service: "SERVICE",
            eta_days: null,
            raw: data,
          };
          if (!best || candidate.mxn < best.mxn) best = candidate;
        }
      }
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }

  if (!best) {
    const mxn = fallbackByPostalCode(postal_code);
    return json(200, {
      ok: true,
      quote: { ok: true, mxn, carrier: "FALLBACK", service: "STANDARD", eta_days: null, raw: null },
      note: "Envia no devolvió tarifas. Se aplicó fallback.",
      debug: errors.slice(0, 3),
    });
  }

  return json(200, { ok: true, quote: best });
};