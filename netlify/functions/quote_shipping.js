"use strict";

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  validateZip,
  itemsQtyFromAny,
  getEnviaQuote,
  getFallbackShipping,
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const shipping_mode = String(body.shipping_mode || "").trim(); 
    const postal_code = String(body.postal_code || "").trim();

    if (!shipping_mode) {
      return jsonResponse(400, { ok: false, error: "shipping_mode requerido" }, origin);
    }

    if (shipping_mode === "pickup") {
      return jsonResponse(
        200,
        { ok: true, provider: "pickup", label: "Recoger en fábrica (Tijuana)", country: "MX", amount_cents: 0, amount_mxn: 0 },
        origin
      );
    }

    const country = String(body.country || (shipping_mode === "envia_us" ? "US" : "MX")).toUpperCase();
    const zip = validateZip(postal_code, country);
    if (!zip) return jsonResponse(400, { ok: false, error: "CP/ZIP inválido" }, origin);

    const items_qty = itemsQtyFromAny(body.items);
    if (!items_qty) return jsonResponse(400, { ok: false, error: "items requeridos" }, origin);

    try {
      const q = await getEnviaQuote({ zip, country, items_qty });
      return jsonResponse(200, q, origin);
    } catch (e) {
      const fb = getFallbackShipping(country, items_qty);
      return jsonResponse(
        200,
        {
          ...fb,
          warning: String(e?.message || e || "Fallback shipping"),
        },
        origin
      );
    }
  } catch (e) {
    return jsonResponse(500, { ok: false, error: String(e?.message || e) }, origin);
  }
};
