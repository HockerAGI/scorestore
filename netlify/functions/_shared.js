const fs = require("fs/promises");
const path = require("path");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function ok(body) {
  return json(200, body);
}

function bad(status, msg) {
  return json(status, { ok: false, error: msg });
}

/**
 * JSON SAFE PARSE (NO rompe function)
 */
function parseBody(event) {
  if (!event || !event.body) return null;

  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * URL REAL DEL SITIO
 * Usa URL_SCORE (frontend)
 */
function getSiteURL(event) {
  if (process.env.URL_SCORE) return process.env.URL_SCORE;
  if (process.env.URL) return process.env.URL;

  const proto = event?.headers?.["x-forwarded-proto"] || "https";
  const host = event?.headers?.host;
  return `${proto}://${host}`;
}

/**
 * LECTURA DE CATÁLOGO DESDE /data
 */
async function readCatalog() {
  const file = path.join(__dirname, "..", "..", "data", "catalog.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function readPromos() {
  const file = path.join(__dirname, "..", "..", "data", "promos.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

module.exports = {
  json,
  ok,
  bad,
  parseBody,
  getSiteURL,
  readCatalog,
  readPromos
};