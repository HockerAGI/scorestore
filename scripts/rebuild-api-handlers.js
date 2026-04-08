#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const apiDir = path.join(root, "api");
const handlersDir = path.join(root, "lib", "handlers");
const enviaHandlerPath = path.join(handlersDir, "_envia_webhook.js");

const filesToMove = [
  "_auth.js",
  "_catalog.js",
  "_checkout_status.js",
  "_create_checkout.js",
  "_health_check.js",
  "_promos.js",
  "_quote_shipping.js",
  "_site_settings.js",
  "_stripe_webhook.js",
];

const filesToDelete = ["_envia_webhook.js"];

const indexJs = `// api/index.js
"use strict";

/**
 * SCORE STORE - Centralized API Router
 * Single Vercel Serverless Function.
 */

const auth = require("../lib/handlers/_auth.js");
const catalog = require("../lib/handlers/_catalog.js");
const checkoutStatus = require("../lib/handlers/_checkout_status.js");
const createCheckout = require("../lib/handlers/_create_checkout.js");
const enviaWebhook = require("../lib/handlers/_envia_webhook.js");
const healthCheck = require("../lib/handlers/_health_check.js");
const promos = require("../lib/handlers/_promos.js");
const quoteShipping = require("../lib/handlers/_quote_shipping.js");
const siteSettings = require("../lib/handlers/_site_settings.js");
const stripeWebhook = require("../lib/handlers/_stripe_webhook.js");

const { handleOptions } = require("../lib/_shared.js");

module.exports = async (req, res) => {
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

  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const pathParts = url.pathname.split("/").filter(Boolean);
  const target = pathParts[1];

  try {
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
        return await quoteShipping(req, res);
      case "site_settings":
        return await siteSettings(req, res);
      case "stripe_webhook":
        return await stripeWebhook(req, res);
      default:
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({
          ok: false,
          error: "Endpoint no encontrado",
          path: url.pathname,
        }));
    }
  } catch (error) {
    console.error("[Router Error] Error en ejecución de /api/" + target + ":", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({
      ok: false,
      error: "Error interno del servidor",
      message: error.message,
    }));
  }
};

module.exports.default = module.exports;
`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function patchSharedImports(code) {
  return code
    .replace(/require\((['"])\.\.\/lib\/_shared(?:\.js)?\1\)/g, 'require("../_shared")')
    .replace(/require\((['"])\.\.\/lib\/idempotency(?:\.js)?\1\)/g, 'require("../idempotency")')
    .replace(/require\((['"])\.\.\/lib\/_rate_limit(?:\.js)?\1\)/g, 'require("../_rate_limit")');
}

function patchRateLimitImport(code) {
  const re = /const \{\n([\s\S]*?)\n\} = require\((['"])(?:\.\.\/lib\/)?_shared(?:\.js)?\2\);/;
  return code.replace(re, (_match, inner) => {
    const lines = inner
      .split("\n")
      .filter((line) => !/rateLimit,?/.test(line));

    return `const {\n${lines.join("\n")}\n} = require("../_shared");\n\nconst { rateLimit } = require("../_rate_limit");`;
  });
}

function patchPromos(code) {
  return code.replace(
    /res\.status\(out\.statusCode \|\| 200\)\.send\(out\.body\);/,
    `res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([key, value]) => res.setHeader(key, value));
  res.end(out.body || "");`
  );
}

function patchHealthCheck(code) {
  return code.replace(/select\("org_id"\)/g, 'select("organization_id")');
}

function patchSiteSettings(code) {
  return code.replace(/onConflict:\s*"org_id"/g, 'onConflict: "organization_id"');
}

function patchStripeWebhook(code) {
  return code.replace(/apiVersion:\s*"2024-06-20"/g, 'apiVersion: "2025-01-27.acacia"');
}

function patchCatalog(code) {
  let out = patchRateLimitImport(code);
  out = patchSharedImports(out);
  return out;
}

function patchQuoteShipping(code) {
  let out = patchRateLimitImport(code);
  out = patchSharedImports(out);
  return out;
}

function patchGeneric(code) {
  return patchSharedImports(code);
}

function patchFile(file, content) {
  if (file === "_catalog.js") return patchCatalog(content);
  if (file === "_quote_shipping.js") return patchQuoteShipping(content);
  if (file === "_promos.js") return patchPromos(patchGeneric(content));
  if (file === "_health_check.js") return patchHealthCheck(patchGeneric(content));
  if (file === "_site_settings.js") return patchSiteSettings(patchGeneric(content));
  if (file === "_stripe_webhook.js") return patchStripeWebhook(patchGeneric(content));
  return patchGeneric(content);
}

function main() {
  if (!fs.existsSync(apiDir)) {
    throw new Error("No existe la carpeta api/");
  }

  ensureDir(handlersDir);

  if (!fs.existsSync(enviaHandlerPath)) {
    throw new Error("Falta lib/handlers/_envia_webhook.js");
  }

  write(path.join(apiDir, "index.js"), indexJs);

  const deleted = [];

  for (const file of filesToMove) {
    const src = path.join(apiDir, file);
    const dest = path.join(handlersDir, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Falta el archivo origen: api/${file}`);
    }
    const patched = patchFile(file, read(src));
    write(dest, patched);
    deleted.push(src);
  }

  for (const file of filesToDelete) {
    const src = path.join(apiDir, file);
    if (fs.existsSync(src)) deleted.push(src);
  }

  for (const file of deleted) {
    fs.unlinkSync(file);
  }

  console.log("OK: api/index.js creado y handlers movidos a lib/handlers/.");
  console.log("OK: elimina cualquier .js sobrante en api/ excepto index.js si quedara alguno.");
}

main();