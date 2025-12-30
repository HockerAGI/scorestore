const { json, safeParse, needEnv } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const body = safeParse(event.body);
  const postalCode = body?.to?.postal_code;

  if (!postalCode || !/^\d{5}$/.test(postalCode)) {
    return json(400, { ok: false, error: "Invalid postal code" });
  }

  const ENVIA_API_KEY = needEnv("ENVIA_API_KEY");

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ENVIA_API_KEY}`
      },
      body: JSON.stringify({
        origin: {
          postal_code: "22000",
          country_code: "MX"
        },
        destination: {
          postal_code: postalCode,
          country_code: "MX"
        },
        packages: [
          {
            weight: 1,
            dimensions: {
              length: 20,
              width: 20,
              height: 10
            }
          }
        ]
      })
    });

    if (!res.ok) {
      return json(200, { ok: false, mxn: 0 });
    }

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      return json(200, { ok: false, mxn: 0 });
    }

    const cheapest = data.reduce((a, b) =>
      Number(a.total_price) < Number(b.total_price) ? a : b
    );

    return json(200, {
      ok: true,
      mxn: Number(cheapest.total_price),
      carrier: cheapest.carrier,
      service: cheapest.service,
      days: cheapest.delivery_time || null
    });

  } catch {
    return json(200, { ok: false, mxn: 0 });
  }
};