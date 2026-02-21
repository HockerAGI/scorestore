"use strict";

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  getEnviaQuote,
  getFallbackShipping
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const zip = String(body.postal_code || "").trim();
    const country = String(body.country || "MX").trim().toUpperCase();
    const items = body.items || [];
    
    const items_qty = items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);

    if (!zip || zip.length < 4) {
      return jsonResponse(400, { ok: false, error: "Código postal inválido" }, origin);
    }

    try {
      const quote = await getEnviaQuote({ zip, country, items_qty });
      return jsonResponse(200, quote, origin);
      
    } catch (enviaError) {
      console.warn("[quote_shipping] Envía falló, usando fallback de seguridad:", enviaError.message);
      
      const fallback = getFallbackShipping(country, items_qty);
      return jsonResponse(200, fallback, origin);
    }

  } catch (error) {
    console.error("Shipping Quote Error:", error);
    return jsonResponse(500, { ok: false, error: "Error interno al cotizar envío." }, origin);
  }
};