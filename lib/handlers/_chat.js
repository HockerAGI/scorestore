// lib/handlers/_chat.js
"use strict";

/**
 * SCORE STORE - Chat handler
 * Public support channel for sales / customer service / IA.
 * Compatible with the centralized catalog assistant flow.
 */

const catalogHandler = require("./_catalog.js");

const {
  jsonResponse,
  handleOptions,
  safeStr,
  rateLimit,
} = require("../_shared");

function send(res, payload) {
  const out = payload || {};
  const headers = out.headers || {};

  res.statusCode = out.statusCode || 200;
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  return res.end(out.body || "");
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

function parseMode(req, body) {
  const qMode = safeStr(
    body?.mode ||
      body?.type ||
      body?.assistant ||
      req?.query?.mode ||
      req?.query?.type ||
      ""
  )
    .trim()
    .toLowerCase();

  if (qMode) return qMode;
  if (body?.message || body?.prompt || body?.text || body?.input || body?.query || body?.question) {
    return "assistant";
  }
  return "chat";
}

function parseOrgId(req, body) {
  return safeStr(
    body?.org_id ||
      body?.orgId ||
      body?.organization_id ||
      req?.query?.org_id ||
      req?.query?.orgId ||
      req?.query?.organization_id ||
      ""
  ).trim();
}

function parseMessage(body = {}) {
  return safeStr(
    body?.message ??
      body?.prompt ??
      body?.text ??
      body?.input ??
      body?.query ??
      body?.question ??
      ""
  ).trim();
}

function parseContext(body = {}) {
  const ctx = body?.context && typeof body.context === "object" ? body.context : {};

  return {
    currentProduct: safeStr(ctx.currentProduct || ctx.product || ctx.currentSku || body?.currentProduct || ""),
    currentSku: safeStr(ctx.currentSku || ctx.sku || body?.currentSku || ""),
    cartItems: safeStr(ctx.cartItems || ctx.cart || body?.cartItems || ""),
    cartTotal: safeStr(ctx.cartTotal || ctx.total || body?.cartTotal || ""),
    shipMode: safeStr(ctx.shipMode || ctx.shippingMode || body?.shipMode || ""),
    orderId: safeStr(ctx.orderId || ctx.order_id || body?.orderId || ""),
    actionHint: safeStr(ctx.actionHint || ctx.action || body?.actionHint || ""),
    category: safeStr(ctx.category || ctx.section || body?.category || ""),
    history: Array.isArray(body?.messages) ? body.messages.slice(-12) : [],
    channel: "chat",
    source: "chat",
  };
}

function buildAssistantPayload(req, body) {
  const message = parseMessage(body);
  const context = parseContext(body);

  return {
    ...body,
    mode: "assistant",
    type: "assistant",
    assistant: "chat",
    message,
    context,
    org_id: parseOrgId(req, body),
  };
}

module.exports = async (req, res) => {
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
    const mode = parseMode(req, body);

    if (mode !== "assistant" && mode !== "chat") {
      return send(
        res,
        jsonResponse(
          200,
          {
            ok: true,
            endpoint: "chat",
            mode: "chat",
            available: true,
            note: "Envía un mensaje para recibir respuesta de ventas y soporte.",
          },
          origin
        )
      );
    }

    const message = parseMessage(body);
    if (!message) {
      return send(
        res,
        jsonResponse(400, { ok: false, error: "Se requiere un mensaje válido." }, origin)
      );
    }

    const proxiedReq = {
      ...req,
      body: buildAssistantPayload(req, body),
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
};

module.exports.default = module.exports;