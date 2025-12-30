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

function ok(body) { return json(200, body); }
function bad(status, msg) { return json(status, { ok: false, error: msg }); }

function parseBody(event) {
  if (!event || !event.body) return null;
  if (event.isBase64Encoded) {
    const raw = Buffer.from(event.body, "base64").toString("utf8");
    return JSON.parse(raw);
  }
  return JSON.parse(event.body);
}

function getSiteURL(event) {
  // Netlify in prod
  const netlifyURL = process.env.URL;
  if (netlifyURL) return netlifyURL;

  // fallback local
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers.host;
  return `${proto}://${host}`;
}

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
  json, ok, bad, parseBody, getSiteURL,
  readCatalog, readPromos
};