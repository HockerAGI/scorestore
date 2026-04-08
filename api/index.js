// api/index.js
"use strict";

// Importamos los módulos con su nuevo nombre (prefijo _)
const catalog = require("./_catalog.js");
const checkoutStatus = require("./_checkout_status.js");
const createCheckout = require("./_create_checkout.js");
const enviaWebhook = require("./_envia_webhook.js");
const healthCheck = require("./_health_check.js");
const promos = require("./_promos.js");
const quoteShipping = require("./_quote_shipping.js");
const siteSettings = require("./_site_settings.js");
const stripeWebhook = require("./_stripe_webhook.js");

// Extraemos handleOptions de tu _shared.js existente
const { handleOptions } = require("../lib/_shared.js");

module.exports = async (req, res) => {
  // Manejo global de CORS Preflight para que no consuma lógica de los endpoints
  if (req.method === "OPTIONS") {
    const out = handleOptions({ headers: req.headers });
    res.statusCode = out.statusCode || 204;
    Object.entries(out.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    return res.end();
  }

  // Parseamos la URL para saber a qué módulo dirigir la petición
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

  try {
    switch (route) {
      case "catalog": return await catalog(req, res);
      case "checkout_status": return await checkoutStatus(req, res);
      case "create_checkout": return await createCheckout(req, res);
      case "envia_webhook": return await enviaWebhook(req, res);
      case "health_check": return await healthCheck(req, res);
      case "promos": return await promos(req, res);
      case "quote_shipping": return await quoteShipping(req, res);
      case "site_settings": return await siteSettings(req, res);
      case "stripe_webhook": return await stripeWebhook(req, res);
      default:
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({ ok: false, error: "Endpoint no encontrado" }));
    }
  } catch (err) {
    console.error(`[Router Error] en ruta /api/${route}:`, err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error: "Error interno del servidor" }));
  }
};
