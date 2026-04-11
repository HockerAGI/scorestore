// api/_auth.js
"use strict";

const crypto = require("crypto");

const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "";

function getToken(req) {
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.replace("Bearer ", "").trim();
}

function base64UrlDecode(input) {
  const raw = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
  return Buffer.from(raw + pad, "base64");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function verifyToken(token) {
  try {
    if (!token || !SUPABASE_JWT_SECRET) return null;

    const parts = String(token).split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    const header = safeJsonParse(base64UrlDecode(headerB64).toString("utf8"));
    if (!header || (header.alg && header.alg !== "HS256")) return null;

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac("sha256", SUPABASE_JWT_SECRET)
      .update(signingInput)
      .digest();

    const actualSig = base64UrlDecode(signatureB64);

    if (actualSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

    const payload = safeJsonParse(base64UrlDecode(payloadB64).toString("utf8"));
    if (!payload || typeof payload !== "object") return null;

    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req) {
  const token = getToken(req);

  if (!token) {
    return { ok: false, error: "no_token" };
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return { ok: false, error: "invalid_token" };
  }

  const role =
    decoded.role ||
    decoded.user_role ||
    decoded.app_metadata?.role ||
    decoded.app_metadata?.user_role ||
    "";

  if (!["admin", "service_role"].includes(role)) {
    return { ok: false, error: "forbidden" };
  }

  return { ok: true, user: decoded };
}

module.exports = {
  requireAdmin,
};