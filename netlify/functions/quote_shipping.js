import fetch from "node-fetch";

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    const items = body.items || [];
    const to = body.to || {};

    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.ENVIA_API_KEY}` };

    const payload = {
      origin: {
        name: "ÚNICO Uniformes",
        company: "BAJATEX S. de R.L. de C.V.",
        email: "ventas.unicotextil@gmail.com",
        phone: "6642368701",
        street: "Palermo 6106 Interior JK",
        neighborhood: "Anexa Roma",
        city: "Tijuana",
        state: "BC",
        country: "MX",
        postalCode: "22614"
      },
      destination: {
        name: "Cliente SCORE",
        street: to.address1,
        city: to.city,
        state: to.state_code,
        country: "MX",
        postalCode: to.postal_code
      },
      parcels: items.map(i => ({
        weight: 0.5,
        width: 25,
        height: 20,
        length: 10,
        content: i.name
      })),
      shipment: { carrier: "ENVIA" }
    };

    const res = await fetch("https://api.envia.com/ship/rate", {
      method: "POST", headers, body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data || !data.data || !Array.isArray(data.data)) throw new Error("No rates");

    const lowest = data.data.reduce((a, b) => (a.total < b.total ? a : b));
    const envioBase = 250;
    const costo = Math.max(envioBase, Math.round(lowest.total * 1.05));

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        quote: {
          mxn: costo,
          carrier: lowest.provider,
          service: lowest.service,
          eta_days: lowest.days
        }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
}