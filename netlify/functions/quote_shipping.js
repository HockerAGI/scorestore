// netlify/functions/quote_shipping.js
// PRODUCCIÓN — Cotización Envia (carrito en tiempo real)

import { json, safeParse, needEnv } from "./_shared.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = safeParse(event.body);
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const postalCode = body?.to?.postal_code;
  if (!postalCode || !/^\d{5}$/.test(postalCode)) {
    return json(400, { ok: false, error: "Invalid postal code" });
  }

  const ENVIA_API_KEY = needEnv("ENVIA_API_KEY");

  // 🔒 Parámetros base (pueden evolucionar luego)
  const payload = {
    origin: {
      postal_code: "22000", // Tijuana
      country_code: "MX",
    },
    destination: {
      postal_code: postalCode,
      country_code: "MX",
    },
    packages: [
      {
        weight: 1, // kg (default seguro)
        dimensions: {
          length: 20,
          width: 20,
          height: 10,
        },
      },
    ],
  };

  try {
    const res = await fetch("https://api.envia.com/ship/rate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENVIA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Envia rate error:", res.status, text);
      return json(200, {
        ok: false,
        mxn: 0,
        error: "Envia unavailable",
      });
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return json(200, {
        ok: false,
        mxn: 0,
        error: "No shipping options",
      });
    }

    // 👉 Tomamos la opción más barata
    const cheapest = data.reduce((a, b) =>
      Number(a.total_price) < Number(b.total_price) ? a : b
    );

    return json(200, {
      ok: true,
      mxn: Number(cheapest.total_price),
      carrier: cheapest.carrier,
      service: cheapest.service,
      days: cheapest.delivery_time || null,
    });
  } catch (err) {
    console.error("Envia fetch failed:", err.message);
    return json(200, {
      ok: false,
      mxn: 0,
      error: "Shipping quote failed",
    });
  }
};