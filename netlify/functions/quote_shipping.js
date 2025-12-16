/**
 * netlify/functions/quote_shipping.js
 * Cotización real con Envia.com + fallback inteligente si falla.
 * - POST: responde JSON (la app)
 * - GET: muestra "tester" HTML (para probar desde el navegador)
 *
 * Requiere variables Netlify:
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

function baseHeaders(contentType = "application/json") {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  };
}

function json(statusCode, data) {
  return { statusCode, headers: baseHeaders("application/json"), body: JSON.stringify(data) };
}

function html(statusCode, body) {
  return { statusCode, headers: baseHeaders("text/html; charset=utf-8"), body };
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

// Fallback “inteligente”
function fallbackQuote(zip, reason = null) {
  const z = Number(zip);
  let mxn = 199;

  // Baja California (aprox 21000–22999)
  if (z >= 21000 && z <= 22999) mxn = 149;

  // Zonas remotas (regla simple)
  if (z >= 60000) mxn = 249;

  return {
    mxn,
    note: reason
      ? `Envío estimado (fallback). Motivo: ${String(reason).slice(0, 140)}`
      : "Envío estimado (fallback). Se confirmará al generar guía.",
    provider: "fallback",
  };
}

// Normaliza items -> paquete estimado
function buildPackages(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const qtyTotal = safeItems.reduce((a, i) => a + Math.max(1, safeInt(i?.qty, 1)), 0);
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

async function quoteWithEnvia({ zip, items }) {
  const apiKey = process.env.ENVIA_API_KEY;
  if (!apiKey) throw new Error("ENVIA_API_KEY no configurada");

  const baseUrl = (process.env.ENVIA_BASE_URL || "https://api.envia.com").replace(/\/+$/, "");

  // OJO: Envia cambia endpoints según cuenta/plan. Probamos variantes.
  const urlCandidates = [
    `${baseUrl}/ship/rate`,
    `${baseUrl}/ship/rates`,
    `${baseUrl}/rate`,
    `${baseUrl}/rates`,
  ];

  const body = {
    origin: { ...ORIGIN },
    destination: { country: "MX", postalCode: String(zip) },
    packages: buildPackages(items),
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

function testerHtml() {
  const example = JSON.stringify({
    zip: "22614",
    items: [{ id: "b1000_tee_azul", size: "S", qty: 1 }]
  }, null, 2);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>quote_shipping tester</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Arial; margin:18px; background:#0b0b0b; color:#fff}
  textarea{width:100%; min-height:160px; border-radius:12px; padding:12px; border:1px solid #333; background:#111; color:#fff}
  button{margin-top:12px; width:100%; height:44px; border-radius:12px; border:none; font-weight:900; cursor:pointer}
  pre{white-space:pre-wrap; word-break:break-word; background:#111; padding:12px; border-radius:12px; border:1px solid #333}
  .hint{opacity:.8; font-size:13px}
</style>
</head>
<body>
<h2>✅ quote_shipping tester</h2>
<div class="hint">Esto manda <b>POST</b> a la misma Function. Si abres la URL normal, es <b>GET</b> y por eso antes te salía Method Not Allowed.</div>
<textarea id="payload">${example}</textarea>
<button id="go">PROBAR POST</button>
<pre id="out">Listo.</pre>
<script>
  const out = document.getElementById('out');
  document.getElementById('go').onclick = async () => {
    out.textContent = "Enviando...";
    try{
      const payload = JSON.parse(document.getElementById('payload').value);
      const res = await fetch(location.href, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      out.textContent = "Status: " + res.status + "\\n\\n" + text;
    }catch(e){
      out.textContent = "Error: " + e.message;
    }
  };
</script>
</body>
</html>`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET") return html(200, testerHtml());
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