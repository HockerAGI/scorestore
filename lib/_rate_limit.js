"use strict";

const memory = new Map();

const WINDOW = 60 * 1000; // 1 min
const LIMIT = 60; // 60 req/min por IP

function normalizeIP(ip) {
  const raw = String(ip || "").trim();
  if (!raw) return "unknown";

  // x-forwarded-for puede venir como "ip1, ip2, ip3"
  const first = raw.split(",")[0].trim();

  // Quita puerto si viene en formato IPv4:port
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(first)) {
    return first.split(":")[0];
  }

  return first;
}

function getIP(req) {
  const h = req?.headers || {};

  return normalizeIP(
    h["x-forwarded-for"] ||
      h["x-real-ip"] ||
      h["cf-connecting-ip"] ||
      req?.socket?.remoteAddress ||
      "unknown"
  );
}

function rateLimit(req) {
  const ip = getIP(req);
  const now = Date.now();

  const current = memory.get(ip);

  if (!current) {
    memory.set(ip, { count: 1, ts: now });
    return { ok: true, remaining: LIMIT - 1, limit: LIMIT, resetAt: now + WINDOW };
  }

  if (now - current.ts > WINDOW) {
    memory.set(ip, { count: 1, ts: now });
    return { ok: true, remaining: LIMIT - 1, limit: LIMIT, resetAt: now + WINDOW };
  }

  current.count += 1;

  if (current.count > LIMIT) {
    return {
      ok: false,
      error: "rate_limited",
      remaining: 0,
      limit: LIMIT,
      resetAt: current.ts + WINDOW,
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, LIMIT - current.count),
    limit: LIMIT,
    resetAt: current.ts + WINDOW,
  };
}

function clearRateLimit(ip) {
  const key = normalizeIP(ip);
  if (key && key !== "unknown") {
    memory.delete(key);
  }
}

function resetRateLimitStore() {
  memory.clear();
}

module.exports = {
  rateLimit,
  clearRateLimit,
  resetRateLimitStore,
};