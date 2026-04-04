// api/_auth.js
"use strict";

const jwt = require("jsonwebtoken");

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

function verifyToken(token) {
  try {
    return jwt.verify(token, SUPABASE_JWT_SECRET);
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

  const role = decoded.role || decoded.user_role || "";

  if (!["admin", "service_role"].includes(role)) {
    return { ok: false, error: "forbidden" };
  }

  return { ok: true, user: decoded };
}

module.exports = {
  requireAdmin,
};