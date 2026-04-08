// api/index.js
"use strict";

/**
 * SCORE STORE - Centralized API Router
 * Este archivo centraliza todas las funciones para cumplir con el límite de 12 funciones de Vercel Hobby.
 */

// Importación de módulos internos (ya renombrados con _)
const auth = require("./_auth.js");
const catalog = require("./_catalog.js");
const checkoutStatus = require("./_checkout_status.js");
const createCheckout = require("./_create_checkout.js");
const enviaWebhook = require("./_envia_webhook.js");
const healthCheck = require("./_health_check.js");
const promos = require("./_promos.js");
const quoteShipping = require("./_quote_shipping.js");
const siteSettings = require("./_site_settings.js");
const stripeWebhook = require("./_stripe_webhook.js");

// Utilidades compartidas
const { handleOptions } = require("../lib/_shared.js");

module.exports = async (req, res) => {
  // 1. Manejo Global de CORS (Preflight)
  // Centralizar esto aquí evita que cada función gaste recursos en responder a OPTIONS
  if (req.method === "OPTIONS") {
    const out = handleOptions({ headers: req.headers });
    res.statusCode = out.statusCode || 204;
    if (out.headers) {
      Object.entries(out.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    return res.end();
  }

  // 2. Extracción de la ruta
  // Limpiamos la URL para identificar el endpoint solicitado
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Si la URL es /api/catalog, el target será "catalog"
  const target = pathParts[1]; 

  try {
    // 3. Sistema de Enrutamiento (Directorio de Endpoints)
    switch (target) {
      case "auth":
        return await auth(req, res);
      
      case "catalog":
        return await catalog(req, res);
      
      case "checkout_status":
        return await checkoutStatus(req, res);
      
      case "create_checkout":
        return await createCheckout(req, res);
      
      case "envia_webhook":
        return await enviaWebhook(req, res);
      
      case "health_check":
        return await healthCheck(req, res);
      
      case "promos":
        return await promos(req, res);
      
      case "quote_shipping":
        return await quote_shipping(req, res);
      
      case "site_settings":
        return await siteSettings(req, res);
      
      case "stripe_webhook":
        return await stripeWebhook(req, res);

      default:
        // Respuesta para rutas no encontradas dentro de /api/
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({ 
          ok: false, 
          error: "Endpoint no encontrado",
          path: url.pathname 
        }));
    }
  } catch (error) {
    // 4. Captura de errores global del Backend
    console.error(`[Router Error] Error en ejecución de /api/${target}:`, error);
    
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ 
      ok: false, 
      error: "Error interno del servidor",
      message: error.message 
    }));
  }
};
