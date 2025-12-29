// netlify/functions/quote_shipping.js

const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  isTijuanaPostal,
  looksLikeTijuana,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  quoteEnviaMXN,
} = require("./_shared");

const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

/* ===============================
   HELPERS
================================ */
function isMxPostal(cp = "") {
  return /^\d{5}$/.test(cp);
}

function normalizeMode(raw) {
  const m = toStr(raw).toLowerCase();
  if (m === "pickup") return "pickup";
  if (m === "tj" || m === "tijuana_delivery") return "tijuana_delivery";
  if (m === "mx" || m === "envia") return "envia";
  return "auto";
}

/* ===============================
   HANDLER
================================ */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(
      405,
      { ok: false, error: "Método no permitido." },
      {
        Allow: "POST",
        "Access-Control-Allow-Origin": "*",
      }
    );
  }

  const body = safeJsonParse(event.body, {});
  const items = body?.items || [];
  const to = body?.to || {};
  const mode = normalizeMode(body?.mode || "auto");

  const v = validateCartItems(items);
  if (!v.ok) {
    return jsonResponse(400, { ok: false, error: v.error }, { "Access-Control-Allow-Origin": "*" });
  }

  const postal = toStr(to?.postal_code);
  const state = upper(to?.state_code || to?.state || "");
  const city = toStr(to?.city);
  const address1 = toStr(to?.address1);

  /* ===============================
     PICKUP
  ================================ */
  if (mode === "pickup") {
    return jsonResponse(
      200,
      {
        ok: true,
        mxn: 0,
        carrier: "TIJUANA",
        service: "Recolección en tienda",
        note: "Gratis",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  }

  /* ===============================
     TIJUANA LOCAL
  ================================ */
  const isLikelyTijuana =
    (isTijuanaPostal(postal) && (!state || state === "BC")) ||
    (looksLikeTijuana(city) && (!state || state === "BC"));

  if (mode === "tijuana_delivery" || (mode === "auto" && isLikelyTijuana)) {
    if (!(mode === "tijuana_delivery" && !isLikelyTijuana && postal.length === 5)) {
      return jsonResponse(
        200,
        {
          ok: true,
          mxn: TIJUANA_DELIVERY_MXN,
          carrier: "TIJUANA",
          service: "Entrega local",
          days: 1,
          note: "Entrega local (24–48h)",
          min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }
  }

  /* ===============================
     NACIONAL / ENVIA
  ================================ */
  try {
    const catalog = await loadCatalog();
    const productMap = productMapFromCatalog(catalog.products || []);

    if (!isMxPostal(postal) || !address1 || !state || !city) {
      return jsonResponse(
        200,
        {
          ok: true,
          mxn: MIN_OUTSIDE_TJ_MXN,
          carrier: "ESTIMADO",
          service: "Envío nacional",
          note: "Tarifa base. Completa tu dirección para cotizar en vivo.",
          min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const q = await quoteEnviaMXN({
      to: { postal_code: postal, state_code: state, city, address1 },
      items: v.items,
      productMap,
    });

    if (!q.ok) {
      return jsonResponse(
        200,
        {
          ok: true,
          mxn: MIN_OUTSIDE_TJ_MXN,
          carrier: "ESTIMADO",
          service: "Envío nacional",
          note: "Mínimo aplicado (fallback).",
          min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
        },
        { "Access-Control-Allow-Origin": "*" }
      );
    }

    const raw = Number(q.quote.mxn || 0);
    const mxn = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05));

    return jsonResponse(
      200,
      {
        ok: true,
        mxn,
        carrier: q.quote.provider || "ENVIA",
        service: q.quote.service || "Standard",
        days: q.quote.days || 3,
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  } catch (e) {
    console.error("quote_shipping error:", e);
    return jsonResponse(
      200,
      {
        ok: true,
        mxn: MIN_OUTSIDE_TJ_MXN,
        carrier: "ESTIMADO",
        service: "Envío nacional",
        note: "Error interno, tarifa base aplicada.",
        min_mxn_outside_tijuana: MIN_OUTSIDE_TJ_MXN,
      },
      { "Access-Control-Allow-Origin": "*" }
    );
  }
};