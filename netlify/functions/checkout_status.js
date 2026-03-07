"use strict";

const {
  jsonResponse,
  handleOptions,
  initStripe,
  supabaseAdmin,
} = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const safeUpper = (v) => String(v || "").toUpperCase().trim();
const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));
const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const normalizeLineItems = (lineItems) => {
  const arr = Array.isArray(lineItems) ? lineItems : [];
  return arr
    .map((li) => {
      const productObj = li?.price?.product && typeof li.price.product === "object" ? li.price.product : null;
      const meta = productObj?.metadata || {};
      return {
        sku: meta.sku || meta.SKU || null,
        size: meta.size || meta.talla || null,
        name: productObj?.name || li?.description || null,
        qty: Number(li?.quantity || 0) || 0,
        amount_total_mxn: Number(li?.amount_total || 0) / 100,
        currency: safeUpper(li?.currency || "mxn"),
      };
    })
    .filter((x) => x.qty > 0);
};

function sessionLooksValid(sessionId) {
  return /^cs_(test|live)_[a-zA-Z0-9]+$/.test(String(sessionId || "").trim());
}

function pickOrgId(session) {
  const meta = session?.metadata || {};
  return safeStr(meta.org_id || meta.organization_id || "").trim() || DEFAULT_SCORE_ORG_ID;
}

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  try {
    if (event.httpMethod === "OPTIONS") return handleOptions(event);
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);
    }

    const qs = event.queryStringParameters || {};
    const session_id = String(qs.session_id || "").trim();

    if (!sessionLooksValid(session_id)) {
      return jsonResponse(400, { ok: false, error: "ID de sesión inválido" }, origin);
    }

    const stripe = initStripe();

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer", "payment_intent", "shipping_details"],
    });

    let items = [];
    try {
      const li = await stripe.checkout.sessions.listLineItems(session_id, {
        limit: 100,
        expand: ["data.price.product"],
      });
      items = normalizeLineItems(li?.data || []);
    } catch {}

    const td = session.total_details || {};
    const amount_total_mxn = Number(session.amount_total || 0) / 100;
    const amount_subtotal_mxn = Number(session.amount_subtotal || 0) / 100;
    const amount_shipping_mxn = Number(td.amount_shipping || 0) / 100;
    const amount_discount_mxn = Number(td.amount_discount || 0) / 100;
    const amount_tax_mxn = Number(td.amount_tax || 0) / 100;

    const payment_status = String(session.payment_status || "");
    const status =
      payment_status === "paid"
        ? "paid"
        : payment_status === "unpaid"
          ? "pending_payment"
          : "pending";

    const metadata = session.metadata || {};
    const shipping_mode = safeStr(metadata.shipping_mode || metadata.ship_mode || "");
    const postal_code = safeStr(metadata.postal_code || "");
    const orgId = pickOrgId(session);

    const sb = supabaseAdmin();
    if (sb) {
      try {
        await sb.from("orders").upsert(
          {
            org_id: orgId,
            organization_id: orgId,
            stripe_session_id: session.id,
            stripe_payment_intent_id:
              session.payment_intent
                ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id)
                : null,
            stripe_customer_id:
              session.customer
                ? (typeof session.customer === "string" ? session.customer : session.customer.id)
                : null,
            email: session.customer_details?.email || session.customer_email || null,
            customer_name: session.customer_details?.name || session.shipping_details?.name || "Cliente",
            phone: session.customer_details?.phone || null,
            currency: safeUpper(session.currency || "mxn"),
            amount_total_mxn,
            amount_subtotal_mxn,
            amount_shipping_mxn,
            amount_discount_mxn,
            amount_tax_mxn,
            shipping_total_mxn: amount_shipping_mxn,
            status,
            updated_at: new Date().toISOString(),
            items: items || [],
            metadata: {
              ...(metadata || {}),
              org_id: orgId,
              organization_id: orgId,
              shipping_address: session.shipping_details?.address || null,
              shipping_mode,
              postal_code,
            },
          },
          { onConflict: "stripe_session_id" }
        );
      } catch (e) {
        console.warn("[checkout_status] warn upsert:", e?.message);
      }
    }

    return jsonResponse(
      200,
      {
        ok: true,
        session_id: session.id,
        payment_status,
        status,
        currency: safeUpper(session.currency || "mxn"),
        amount_total_mxn,
        amount_subtotal_mxn,
        amount_shipping_mxn,
        amount_discount_mxn,
        amount_tax_mxn,
        customer_email: session.customer_details?.email || session.customer_email || null,
        customer_name: session.customer_details?.name || session.shipping_details?.name || null,
        shipping_mode,
        postal_code,
        items,
      },
      origin
    );
  } catch (e) {
    console.error("[checkout_status] error:", e?.message);
    return jsonResponse(
      200,
      { ok: false, error: "No se pudo recuperar el estado del pedido." },
      origin
    );
  }
};