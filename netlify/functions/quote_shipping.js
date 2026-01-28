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

function buildEstimate(totalQty) {
  // Estimación conservadora (ropa/merch), para que Envia no rechace por falta de paquete
  const qty = Math.max(1, normalizeQty(totalQty));

  // Caja base (CM) + “crece” con qty
  const length = 30;
  const width = 25;
  const height = Math.min(45, 8 + qty * 2); // no se dispare

  // Peso (KG)
  const weight = Math.min(25, Math.max(0.5, qty * 0.55)); // ~0.55kg por pieza

  return { qty, length, width, height, weight };
}

// Compat: soporta firmas distintas de getEnviaQuote sin romper
async function callEnviaQuote(zip, totalQty, country, est) {
  // 1) Firma “extendida”: (zip, qty, country, weight, length, height, width)
  try {
    if (typeof getEnviaQuote === "function" && getEnviaQuote.length >= 4) {
      return await getEnviaQuote(
        zip,
        totalQty,
        country,
        est.weight,
        est.length,
        est.height,
        est.width
      );
    }
  } catch (_) {}

  // 2) Firma “simple”: (zip, qty, country)
  try {
    if (typeof getEnviaQuote === "function") {
      return await getEnviaQuote(zip, totalQty, country);
    }
  } catch (_) {}

  return null;
}

exports.handler = async (event) => {
  // CORS + método
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST")
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);

    const country = String(body.country || "MX").toUpperCase() === "US" ? "US" : "MX";
    const zip = digitsOnly(body.zip || body.cp || body.postal_code || "");

    const items = Array.isArray(body.items) ? body.items : [{ qty: 1 }];
    const totalQty = items.reduce(
      (acc, i) => acc + normalizeQty(i.qty || i.quantity || 1),
      0
    );

    // Validación mínima
    if (!zip || zip.length < 4) {
      return jsonResponse(200, { ok: false, error: "ZIP_INVALID" });
    }

    // 1) Validar cobertura “real” antes de fallback (para no inventar zonas)
    // validateZip(country, zip) debe devolver algo como:
    // { ok:true, normalizedZip:"xxxxx", country:"MX" } o { ok:false, error:"NO_COVERAGE" }
    const v = await validateZip(country, zip);
    if (!v || v.ok !== true) {
      return jsonResponse(200, {
        ok: false,
        error: (v && v.error) || "NO_COVERAGE",
      });
    }

    const normalizedZip = digitsOnly(v.normalizedZip || zip) || zip;

    // 2) Intentar cotización real (Envia)
    const est = buildEstimate(totalQty);
    let quote = null;

    try {
      quote = await callEnviaQuote(normalizedZip, est.qty, country, est);
    } catch (apiErr) {
      console.warn("[quote_shipping] getEnviaQuote error:", apiErr?.message || apiErr);
      quote = null;
    }

    // Si hay cotización real
    if (quote && Number(quote.mxn) > 0) {
      return jsonResponse(200, {
        ok: true,
        cost: Number(quote.mxn),
        // Importante: NO mencionar paquetería
        label:
          country === "US"
            ? "Envío internacional"
            : "Envío nacional",
        source: "envia",
        // opcional para UI: días estimados si tu shared los expone
        days: quote.days ?? null,
      });
    }

    // 3) Fallback SOLO dentro de cobertura válida (ya validamos zip)
    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;

    return jsonResponse(200, {
      ok: true,
      cost: Number(fallbackCost),
      label: country === "US" ? "Envío internacional" : "Envío nacional",
      source: "fallback",
    });
  } catch (err) {
    console.error("[quote_shipping] Critical:", err);

    // Rescate: no romper frontend
    // (mantén ok:true para que UI no explote, pero costo fijo seguro)
    return jsonResponse(200, {
      ok: true,
      cost: FALLBACK_MX_PRICE,
      label: "Envío nacional",
      source: "error_rescue",
    });
  }
};
```0