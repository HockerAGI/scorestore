"use strict";

/**
 * =========================================================
 * quote_shipping.js (Netlify Function)
 * Endpoint: /.netlify/functions/quote_shipping
 *
 * FIXES v2026-02-21:
 * - Validación CP/ZIP por país (MX/US)
 * - Fallback consistente si Envía falla (no rompe checkout)
 * =========================================================
 */

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  getEnviaQuote,
  getFallbackShipping,
  validateZip,
} = require("./_shared");

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

    const body = safeJsonParse(event.body) || {};
    const zipRaw = String(body.postal_code || "").trim();
    const country = String(body.country || "MX").trim().toUpperCase();
    const items = Array.isArray(body.items) ? body.items : [];

    const items_qty = items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);

    const zip = validateZip(zipRaw, country);
    if (!zip) return jsonResponse(400, { ok: false, error: "Código Postal / ZIP inválido" }, origin);

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