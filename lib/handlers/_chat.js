"use strict";

const {
  jsonResponse,
  handleOptions,
  safeStr,
  rateLimit,
} = require("../_shared");

const catalogHandler = require("./_catalog.js");

function send(res, payload) {
  const out = payload || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";

  res.statusCode = out.statusCode || 200;
  Object.entries(out.headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(out.body || "");
}

function getOrigin(req) {
  return req?.headers?.origin || req?.headers?.Origin || "";
}

function parseBody(req) {
  const body = req?.body;

  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return {};
}

function buildChatPayload(body = {}) {
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];

  return {
    ...body,
    mode: "assistant",
    type: "assistant",
    assistant: "chat",
    message: safeStr(body.message || body.prompt || body.text || body.input || body.query || body.question || "").trim(),
    context: {
      ...context,
      channel: "chat",
      source: "chat",
      conversation: messages,
    },
  };
}

async function main(req, res) {
  const origin = getOrigin(req);

  try {
    if (req.method === "OPTIONS") {
      return send(res, handleOptions({ headers: req.headers }));
    }

    if (req.method === "GET") {
      return send(
        res,
        jsonResponse(
          200,
          {
            ok: true,
            endpoint: "chat",
            mode: "assistant",
            available: true,
            note: "Canal público de atención a clientes, ventas y soporte.",
          },
          origin
        )
      );
    }

    if (req.method !== "POST") {
      return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
    }

    const rl = rateLimit(req);
    if (!rl.ok) {
      return send(res, jsonResponse(429, { ok: false, error: "rate_limited" }, origin));
    }

    const body = parseBody(req);
    const payload = buildChatPayload(body);

    if (!payload.message) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin)
      );
    }

    const proxiedReq = {
      ...req,
      body: payload,
    };

    return catalogHandler(proxiedReq, res);
  } catch (err) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: err?.message || "No fue posible responder desde chat.",
        },
        origin
      )
    );
  }
}

module.exports = main;
module.exports.default = main;