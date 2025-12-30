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

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function needEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSiteURL(event) {
  if (process.env.URL) return process.env.URL;
  const proto = event.headers["x-forwarded-proto"] || "https";
  return `${proto}://${event.headers.host}`;
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
  json,
  ok,
  bad,
  safeParse,
  needEnv,
  getSiteURL,
  readCatalog,
  readPromos
};