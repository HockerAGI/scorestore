exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok:false, error:"method_not_allowed" });
    }

    const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
    const body = JSON.parse(event.body || "{}");
    const to = body.to || {};
    const items = Array.isArray(body.items) ? body.items : [];

    // Validación mínima
    if (!to.postal_code || String(to.postal_code).length !== 5) {
      return json(400, { ok:false, error:"postal_code_required" });
    }

    // Origin fijo (Tijuana)
    const origin = {
      name: "SCORE STORE",
      company: "SCORE",
      email: "ventas.unicotextil@gmail.com",
      phone: "6642368701",
      address1: "Palermo 6106 Interior JK, Anexa Roma",
      city: "Tijuana",
      state_code: "BC",
      country_code: "MX",
      postal_code: "22614"
    };

    // Destination (del cliente)
    const destination = {
      name: "Cliente SCORE",
      company: "Cliente",
      email: "na@na.com",
      phone: "0000000000",
      address1: to.address1 || "Dirección",
      city: to.city || "Ciudad",
      state_code: to.state_code || "BC",
      country_code: "MX",
      postal_code: String(to.postal_code)
    };

    // Paquete (sin datos reales de peso por producto, usamos un default razonable)
    const qty = items.reduce((a,b)=> a + Number(b.qty||0), 0) || 1;
    const weightKg = Math.max(1, Math.min(10, qty * 0.8)); // 0.8kg por pieza (cap a 10kg)

    const pkg = {
      content: "SCORE Merch",
      type: "box",
      amount: qty,
      weight: weightKg,
      length: 30,
      width: 25,
      height: 10
    };

    // Si no hay API KEY, fallback
    if (!ENVIA_API_KEY) {
      return json(200, { ok:true, quote: fallbackQuote(destination.postal_code) });
    }

    // === Envia API (rate quote) ===
    // NOTA: Envia pide 1 request por carrier. Aquí intentamos "fedex" y si falla, devolvemos fallback.
    const tryCarriers = ["fedex", "dhl", "estafeta"];
    for (const carrier of tryCarriers) {
      const payload = {
        carrier,
        origin,
        destination,
        packages: [pkg]
      };

      const r = await fetch("https://api.envia.com/ship/rate/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENVIA_API_KEY}`
        },
        body: JSON.stringify(payload)
      }).catch(()=>null);

      if (!r || !r.ok) continue;

      const data = await r.json().catch(()=>null);
      if (!data) continue;

      // Normalizamos respuesta (varía por carrier/cuenta)
      const rates = Array.isArray(data) ? data : (data.data || data.rates || []);
      if (!Array.isArray(rates) || !rates.length) continue;

      // cheapest
      const normalized = rates.map(x => ({
        carrier: x.carrier || carrier,
        service: x.service || x.service_name || x.name || "Servicio",
        total: Number(x.total_amount || x.total || x.amount || x.price || 0),
        eta_days: x.delivery_days || x.days || null,
        raw: x
      })).filter(x => x.total > 0);

      if (!normalized.length) continue;

      normalized.sort((a,b)=> a.total - b.total);
      const best = normalized[0];

      return json(200, {
        ok: true,
        quote: {
          ok:true,
          mxn: Math.round(best.total),
          carrier: String(best.carrier || carrier).toUpperCase(),
          service: String(best.service || "Servicio").toUpperCase(),
          eta_days: best.eta_days,
          raw: best.raw
        }
      });
    }

    // si todo falló:
    return json(200, { ok:true, quote: fallbackQuote(destination.postal_code) });

  } catch (e) {
    return json(500, { ok:false, error:"server_error", detail: String(e?.message || e) });
  }
};

function fallbackQuote(postalCode){
  // fallback simple pero estable
  // (si Envia falla / API key no puesta)
  const cp = String(postalCode||"");
  const local = cp.startsWith("22"); // Tijuana/BC aproximado
  return {
    ok:true,
    mxn: local ? 99 : 199,
    carrier: "FALLBACK",
    service: local ? "LOCAL" : "NACIONAL",
    eta_days: local ? 2 : 4,
    raw: null
  };
}

function json(statusCode, body){
  return {
    statusCode,
    headers: {
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":"*"
    },
    body: JSON.stringify(body)
  };
}