// netlify/functions/shipping.js
const { jsonResponse, safeJsonParse, digitsOnly } = require("./_shared");

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  const body = safeJsonParse(event.body, {});
  const postalCode = digitsOnly(body?.to?.postal_code);

  if (!/^\d{5}$/.test(postalCode)) {
    return jsonResponse(200, { ok: false });
  }

  const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
  if (!ENVIA_API_KEY) {
    // fallback silencioso
    return jsonResponse(200, { ok: false });
  }

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ENVIA_API_KEY}`,
      },
      body: JSON.stringify({
        origin: {
          postal_code: "22000",
          country_code: "MX",
        },
        destination: {
          postal_code: postalCode,
          country_code: "MX",
        },
        packages: [
          {
            weight: 1,
            dimensions: {
              length: 20,
              width: 20,
              height: 10,
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      return jsonResponse(200, { ok: false });
    }

    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      return jsonResponse(200, { ok: false });
    }

    const cheapest = data.reduce((a, b) =>
      Number(a.total_price) < Number(b.total_price) ? a : b
    );

    return jsonResponse(200, {
      ok: true,
      mxn: Number(cheapest.total_price),
      label: "Envío Nacional",
      carrier: String(cheapest.carrier || ""),
      service_code: String(cheapest.service || ""),
      days: Number(cheapest.delivery_time || 7),
    });
  } catch (e) {
    // fallback silencioso (NO rompe checkout)
    return jsonResponse(200, { ok: false });
  }
};