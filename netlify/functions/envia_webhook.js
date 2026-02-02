const {
  supabaseAdmin,
  jsonResponse,
  handleOptions,
  safeJsonParse,
} = require("./_shared");

// =========================================================
// /.netlify/functions/envia_webhook
// Purpose: Receive Envía webhook updates and patch orders.
// Optional lock: set ENVIA_WEBHOOK_TOKEN and call webhook URL with ?token=...
// =========================================================

const WEBHOOK_TOKEN =
  process.env.ENVIA_WEBHOOK_TOKEN ||
  process.env.ENVIA_WEBHOOK_SECRET ||
  "";

function pickHeader(headers, key) {
  if (!headers) return "";
  return (
    headers[key] ||
    headers[key.toLowerCase()] ||
    headers[key.toUpperCase()] ||
    ""
  );
}

function getProvidedToken(event) {
  const qp = event.queryStringParameters || {};
  const hdr = event.headers || {};
  return (
    qp.token ||
    pickHeader(hdr, "x-envia-webhook-token") ||
    pickHeader(hdr, "x-webhook-token") ||
    (pickHeader(hdr, "authorization") || "").replace(/^Bearer\s+/i, "") ||
    ""
  );
}

function normalize(body) {
  const tracking =
    body?.tracking_number ||
    body?.trackingNumber ||
    body?.tracking ||
    body?.data?.tracking_number ||
    body?.shipment?.tracking_number ||
    "";

  const carrier =
    body?.carrier ||
    body?.carrier_name ||
    body?.data?.carrier ||
    body?.shipment?.carrier ||
    "";

  const labelUrl =
    body?.label_url ||
    body?.labelUrl ||
    body?.data?.label_url ||
    body?.shipment?.label_url ||
    "";

  const stripeSessionId =
    body?.stripe_session_id ||
    body?.data?.stripe_session_id ||
    body?.metadata?.stripe_session_id ||
    "";

  const orderId =
    body?.order_id ||
    body?.data?.order_id ||
    body?.metadata?.order_id ||
    "";

  return { tracking, carrier, labelUrl, stripeSessionId, orderId };
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  if (!supabaseAdmin) {
    return jsonResponse(500, {
      ok: false,
      error: "Supabase admin not configured (SUPABASE_SERVICE_ROLE_KEY missing)",
    });
  }

  // Optional protection
  if (WEBHOOK_TOKEN) {
    const provided = getProvidedToken(event);
    if (!provided || provided !== WEBHOOK_TOKEN) {
      return jsonResponse(401, { ok: false, error: "Unauthorized" });
    }
  }

  const body = safeJsonParse(event.body || "{}");
  const { tracking, carrier, labelUrl, stripeSessionId, orderId } = normalize(body);

  // If there is nothing we can match, ignore gracefully
  if (!tracking && !stripeSessionId && !orderId) {
    return jsonResponse(200, { ok: true, ignored: true, reason: "No identifiers" });
  }

  const patch = {
    raw_meta: JSON.stringify(body),
  };
  if (tracking) patch.tracking_number = tracking;
  if (carrier) patch.carrier = carrier;
  if (labelUrl) patch.label_url = labelUrl;

  const targets = [];
  if (orderId) targets.push({ col: "id", val: orderId });
  if (stripeSessionId) targets.push({ col: "stripe_session_id", val: stripeSessionId });
  if (tracking) targets.push({ col: "tracking_number", val: tracking });

  let updated = 0;
  let matchedBy = null;

  for (const t of targets) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq(t.col, t.val)
      .select("id")
      .maybeSingle();

    if (!error && data?.id) {
      updated = 1;
      matchedBy = t.col;
      break;
    }
  }

  return jsonResponse(200, {
    ok: true,
    updated,
    matchedBy,
    tracking: tracking || null,
    carrier: carrier || null,
    label_url: labelUrl || null,
  });
};