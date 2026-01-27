// netlify/functions/quote_shipping.js
// Cotiza envío real usando Envia.com
// - Pickup (Tijuana) = $0
// - MX / USA = Envia rate
// - Usa specs reales por SKU (peso/dimensiones)
// - No inventa costos

import {
  ok,
  fail,
  parseJSON,
  normalizeCountry,
  normalizeZip,
  clampInt,
  getSupabaseAnon,
  enviaQuote,
  corsHeaders
} from "./_shared.js";

export async function handler(event) {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders()
    };
  }

  if (event.httpMethod !== "POST") {
    return fail(405, "Method not allowed");
  }

  try {
    const body = parseJSON(event.body);

    const mode = body.mode || "pickup"; // pickup | mx | us
    const country = normalizeCountry(body.country || mode);
    const zip = normalizeZip(body.zip);
    const items = Array.isArray(body.items) ? body.items : [];

    /* ---------------- PICKUP ---------------- */
    if (mode === "pickup") {
      return ok({
        mode: "pickup",
        carrier: "PICKUP",
        service: "Recolecta en Tijuana",
        amount: 0,
        currency: "MXN",
        eta: "Mismo día"
      });
    }

    if (!zip || items.length === 0) {
      return fail(422, "Datos incompletos para cotizar envío");
    }

    /* ---------------- SUPABASE: SPECS SKU ---------------- */
    const supabase = getSupabaseAnon();

    const skuIds = items.map(i => i.sku);
    const { data: products, error } = await supabase
      .from("products")
      .select("id, weight_kg, length_cm, width_cm, height_cm, declared_value_mxn")
      .in("id", skuIds);

    if (error) {
      return fail(500, "Error consultando productos (ÚNICO OS)");
    }

    // Map specs
    const specsMap = {};
    for (const p of products || []) specsMap[p.id] = p;

    /* ---------------- PACKAGES ---------------- */
    const packages = [];

    for (const item of items) {
      const qty = clampInt(item.qty, 1, 50);
      const spec = specsMap[item.sku];

      if (!spec) {
        return fail(
          422,
          `Faltan specs del SKU ${item.sku}. Configúralos en ÚNICO OS`
        );
      }

      for (let i = 0; i < qty; i++) {
        packages.push({
          weight: spec.weight_kg,
          length: spec.length_cm,
          width: spec.width_cm,
          height: spec.height_cm
        });
      }
    }

    /* ---------------- ENVIA PAYLOAD ---------------- */
    const enviaPayload = {
      origin: {
        country: "MX",
        postalCode: "22400" // Tijuana base (ajústalo si cambias)
      },
      destination: {
        country,
        postalCode: zip
      },
      packages,
      shipment: {
        carrier: "fedex",
        type: "package"
      }
    };

    const rates = await enviaQuote(enviaPayload);

    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return fail(404, "No se encontraron tarifas disponibles");
    }

    // Elegimos la más barata
    const best = rates.sort((a, b) => a.totalAmount - b.totalAmount)[0];

    return ok({
      mode,
      carrier: best.carrier || "FedEx",
      service: best.service || "Standard",
      amount: best.totalAmount,
      currency: best.currency || "MXN",
      eta: best.deliveryEstimate || "3–7 días",
      raw: best
    });

  } catch (e) {
    console.error("quote_shipping error:", e);
    return fail(500, "Error cotizando envío", { detail: e.message });
  }
}