// api/_rate_limit.js
"use strict";

const memory = new Map();

const WINDOW = 60 * 1000; // 1 min
const LIMIT = 60; // 60 req/min por IP

function getIP(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function rateLimit(req) {
  const ip = getIP(req);
  const now = Date.now();

  if (!memory.has(ip)) {
    memory.set(ip, { count: 1, ts: now });
    return { ok: true };
  }

  const data = memory.get(ip);

  if (now - data.ts > WINDOW) {
    memory.set(ip, { count: 1, ts: now });
    return { ok: true };
  }

  data.count++;

  if (data.count > LIMIT) {
    return { ok: false, error: "rate_limited" };
  }

  return { ok: true };
}

module.exports = { rateLimit };