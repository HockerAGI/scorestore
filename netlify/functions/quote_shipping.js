// netlify/functions/quote_shipping.js
const {
  jsonResponse,
  safeJsonParse,
  getEnviaQuote,
  validateZip,
  FALLBACK_MX_PRICE,
  FALLBACK_US_PRICE,
  normalizeQty,
  digitsOnly,
} = require("./_shared");

const pickFallback = (country) => (String(country || "MX").toUpperCase() === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE);

exports.handler = async (event) => {
  // CORS + método
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);

    const country = String(body.country || "MX").toUpperCase(); // "MX" | "US"
    const zip = digitsOnly(body.zip || body.cp || body.postal_code || "");

    // Items (solo qty). El backend hace estimación.
    const items = Array.isArray(body.items) && body.items.length ? body.items : [{ qty: 1 }];
    const totalQty = items.reduce((acc, i) => acc + normalizeQty(i.qty || i.quantity || 1), 0);

    // Validación básica
    if (!zip || zip.length < 4) {
      return jsonResponse(200, { ok: false, error: "ZIP_INVALID" });
    }

    // 1) Validación “real” del ZIP/CP (evita fallbacks en zonas inexistentes)
    // validateZip debe regresar algo tipo:
    // { ok:true, normalized:"22614", coverage:true, label:"Tijuana, BC" } (ejemplo)
    // o { ok:false, coverage:false, error:"NO_COVERAGE" }
    let v = null;
    try {
      v = await validateZip(country, zip);
    } catch (e) {
      // Si tu validador falla por red/timeout, no rompemos: seguimos con intento de cotización
      v = null;
    }

    // Si el validador dice que NO hay cobertura real, respondemos ok:false para que el frontend muestre “no hay tarifa”
    if (v && v.ok === false) {
      return jsonResponse(200, { ok: false, error: v.error || "NO_COVERAGE", label: v.label || "" });
    }

    // 2) Intento de cotización real
    // Estimaciones: sin SKU weights reales todavía; usamos un estimado coherente por item.
    // Ajusta números si ya tienes tabla por producto.
    const estWeightKg = Math.max(0.5, totalQty * 0.55);         // 0.55kg por pieza aprox
    const estLen = 30;                                          // cm
    const estWid = 25;                                          // cm
    const estHei = Math.min(35, 6 + totalQty * 2);              // cm: base + apilado

    let quote = null;
    try {
      // OJO: tu getEnviaQuote del shared anterior solo acepta (zip, qty, countryCode)
      // y trae dimensiones internas.
      // Si ya lo actualizaste para aceptar dimensiones, esto igual funciona:
      quote = await getEnviaQuote(zip, totalQty, country, estWeightKg, estLen, estHei, estWid);
    } catch (e) {
      quote = null;
    }

    // 3) Respuesta final
    if (quote && Number(quote.mxn) > 0) {
      // NO mencionamos paquetería
      const daysTxt = quote.days ? ` · ${quote.days} días` : "";
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn),
        label: `Envío estimado${daysTxt}`, // limpio, sin carrier
        source: "envia",
        zip: (v && v.normalized) ? v.normalized : zip,
        zone: (v && v.label) ? v.label : "",
      });
    }

    // Si el validador dijo que sí hay cobertura / zip válido, pero la API falló → fallback
    const fallbackCost = pickFallback(country);
    return jsonResponse(200, {
      ok: true,
      cost: fallbackCost,
      label: country === "US" ? "Envío USA (Estándar)" : "Envío Nacional (Estándar)",
      source: "fallback",
      zip: (v && v.normalized) ? v.normalized : zip,
      zone: (v && v.label) ? v.label : "",
    });

  } catch (err) {
    console.error("[quote_shipping] Critical:", err);
    // Modo “rescate”: respondemos ok:true para que el frontend no reviente,
    // pero con costo fijo seguro.
    return jsonResponse(200, {
      ok: true,
      cost: FALLBACK_MX_PRICE,
      label: "Envío Estándar",
      source: "error_rescue",
    });
  }
};