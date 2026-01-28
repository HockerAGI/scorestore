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

function countryFromBody(body) {
  // country puede venir como "MX"/"US" o mode "mx"/"us"
  const c = String(body.country || body.cc || body.mode || "MX").toUpperCase();
  return c === "US" ? "US" : "MX";
}

function buildLabel(country, cost, days, source) {
  const isUS = country === "US";

  // NO mencionar carrier/paquetería
  // Sí podemos dar contexto de tiempos si vienen en la tarifa
  const eta = Number(days) ? ` · ${days} días` : "";

  if (source === "envia") {
    return `Envío estimado${eta}`;
  }

  // fallback (pero con CP validado)
  return isUS ? `Envío internacional${eta}` : `Envío nacional${eta}`;
}

exports.handler = async (event) => {
  // CORS + Método
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST")
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const country = countryFromBody(body);

    // zip/cp/postal_code
    const zip = digitsOnly(body.zip || body.cp || body.postal_code || body.postalCode || "");

    // items: [{qty}] o [{quantity}]
    const items = Array.isArray(body.items) && body.items.length ? body.items : [{ qty: 1 }];
    const totalQty = items.reduce(
      (acc, i) => acc + normalizeQty(i.qty || i.quantity || 1),
      0
    );

    // Validación básica rápida
    if (!zip || zip.length < 4) {
      return jsonResponse(200, { ok: false, error: "ZIP_INVALID" });
    }

    // 1) Validar ZIP real con Geocodes (para no “inventar” zonas en fallback)
    // Si no hay ENVIA_API_KEY, validateZip regresa ok:true (no_key) y no bloquea.
    const v = await validateZip(country, zip);
    if (!v?.ok) {
      return jsonResponse(200, { ok: false, error: v.error || "ZIP_NOT_FOUND" });
    }

    // 2) Cotización real (Ship Rate)
    // Estimación simple por pieza (sin catálogo de dimensiones):
    // - 0.5 kg por item
    // - caja 30x25 y altura escalable
    const estWeightKg = Math.max(0.5, totalQty * 0.5);
    const L = 30;
    const W = 25;
    const H = Math.min(30, 5 + totalQty * 2);

    const quote = await getEnviaQuote(zip, totalQty, country, estWeightKg, L, H, W);

    if (quote?.mxn && Number(quote.mxn) > 0) {
      const cost = Number(quote.mxn);
      return jsonResponse(200, {
        ok: true,
        cost,
        label: buildLabel(country, cost, quote.days, "envia"),
        source: "envia",
        // opcional: puedes devolver algo “neutro” si quieres debug sin exponer carrier
        meta: {
          days: quote.days || null,
          zip_validated: v.source || "geocodes",
        },
      });
    }

    // 3) Fallback (SOLO si ZIP fue validado)
    const fallbackCost = country === "US" ? FALLBACK_US_PRICE : FALLBACK_MX_PRICE;
    return jsonResponse(200, {
      ok: true,
      cost: fallbackCost,
      label: buildLabel(country, fallbackCost, null, "fallback"),
      source: "fallback",
      meta: {
        zip_validated: v.source || "geocodes",
      },
    });
  } catch (err) {
    console.error("[quote_shipping] Critical:", err);

    // Nota: aquí NO podemos garantizar cobertura por CP si algo “truena”,
    // pero devolvemos JSON estable para no romper el frontend.
    return jsonResponse(200, {
      ok: false,
      error: "QUOTE_FAILED",
    });
  }
};