"use strict";

const store = new Map();

function getHeaderValue(headers, key) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    return headers.get(key) || headers.get(key.toLowerCase()) || "";
  }

  const lower = String(key).toLowerCase();
  return (
    headers[key] ||
    headers[lower] ||
    headers[key.toUpperCase()] ||
    ""
  );
}

function getKey(req) {
  const h = req?.headers || {};
  return String(
    getHeaderValue(h, "idempotency-key") ||
      getHeaderValue(h, "Idempotency-Key") ||
      ""
  ).trim();
}

function checkIdempotency(key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return { ok: true };

  if (store.has(safeKey)) {
    return { ok: false, cached: store.get(safeKey) };
  }

  return { ok: true };
}

function saveIdempotency(key, response) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return;
  store.set(safeKey, response);
}

function clearIdempotency(key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return;
  store.delete(safeKey);
}

function resetIdempotencyStore() {
  store.clear();
}

module.exports = {
  getKey,
  checkIdempotency,
  saveIdempotency,
  clearIdempotency,
  resetIdempotencyStore,
};