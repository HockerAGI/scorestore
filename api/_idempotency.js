// api/_idempotency.js
"use strict";

const store = new Map();

function getKey(req) {
  return (
    req.headers["idempotency-key"] ||
    req.headers["Idempotency-Key"] ||
    ""
  );
}

function checkIdempotency(key) {
  if (!key) return { ok: true };

  if (store.has(key)) {
    return {
      ok: false,
      cached: store.get(key),
    };
  }

  return { ok: true };
}

function saveIdempotency(key, response) {
  if (!key) return;
  store.set(key, response);
}

module.exports = {
  checkIdempotency,
  saveIdempotency,
};