// netlify/functions/stripe_webhook.js
// ✅ Node 18+ (fetch nativo) — producción Netlify
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

function toStr(v) {
  return (v ?? "").toString().trim();
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function getSiteUrl() {
  const url = toStr(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL);
  return url ? url.replace(/\/+$/, "") : "";
}

function moneyFromStripe(amountMinor, currency) {
  const cur = toStr(currency).toUpperCase() || "MXN";
  // Stripe amount_total viene en centavos para MXN/USD/EUR etc.
  const value = Number(amountMinor || 0) / 100;
  return { value: Math.max(0, Math.round(value * 100) / 100), currency: cur };
}

// --------- Meta CAPI (Purchase) ----------
async function sendMetaPurchase({ eventId, value, currency, email, phone }) {
  const PIXEL_ID = toStr(process.env.META_PIXEL_ID);
  const ACCESS_TOKEN = toStr(process.env.META_ACCESS_TOKEN);

  // Si no está configurado, no hacemos nada (sin fallar)
  if (!PIXEL_ID || !ACCESS_TOKEN) return { ok: false, skipped: true };

  // Normalización mínima (Meta recomienda hashed, pero esto es “ready” y se mejora después)
  // Cuando lo quieras PRO: hasheamos SHA256 (email/phone) y mandamos ip/userAgent, etc.
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        user_data: {
          // En production ideal: em/ph hash SHA256. Aquí dejamos raw si existe.
          // Más adelante lo endurecemos con hash, sin cambiar tu flujo.
          em: email ? [email] : undefined,
          ph: phone ? [phone] : undefined,
        },
        custom_data: {
          currency,
          value,
        },
      },
    ],
  };

  // Limpia undefined
  if (!payload.data[0].user_data.em) delete payload.data[0].user_data.em;
  if (!payload.data[0].user_data.ph) delete payload.data[0].user_data.ph;

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(PIXEL_ID)}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("Meta CAPI error:", res.status, data);
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (e) {
    console.error("Meta CAPI exception:", e.message);
    return { ok: false, error: e.message };
  }
}

// --------- GA4 Measurement Protocol (purchase) ----------
async function sendGA4Purchase({ clientId, transactionId, value, currency }) {
  const MEASUREMENT_ID = toStr(process.env.GA_MEASUREMENT_ID);
  const API_SECRET = toStr(process.env.GA_API_SECRET);

  if (!MEASUREMENT_ID || !API_SECRET) return { ok: false, skipped: true };

  // client_id debe ser string. Si no hay, generamos uno estable por transacción (meh, pero sirve).
  const cid = clientId || `stripe.${transactionId}.${Date.now()}`;

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(MEASUREMENT_ID)}&api_secret=${encodeURIComponent(API_SECRET)}`;

  const payload = {
    client_id: cid,
    events: [
      {
        name: "purchase",
        params: {
          currency,
          value,
          transaction_id: transactionId,
        },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // GA4 MP responde 2xx sin body normalmente
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("GA4 MP error:", res.status, txt);
      return { ok: false, status: res.status, body: txt };
    }
    return { ok: true };
  } catch (e) {
    console.error("GA4 MP exception:", e.message);
    return { ok: false, error: e.message };
  }
}

// --------- Util: obtener line items reales ----------
async function getSessionLineItems(sessionId) {
  try {
    // Expand para obtener line_items y producto en un solo golpe
    const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    return Array.isArray(items?.data) ? items.data : [];
  } catch (e) {
    console.error("LineItems error:", e.message);
    return [];
  }
}

exports.handler = async (event) => {
  // Stripe requiere raw body para firma (Netlify lo entrega bien en event.body)
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Solo atendemos pagos completos
  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true, ignored: stripeEvent.type });
  }

  const session = stripeEvent.data.object;

  // Datos base
  const transactionId = toStr(session.id);
  const { value, currency } = moneyFromStripe(session.amount_total, session.currency);

  const customerName = toStr(session.customer_details?.name) || "Cliente";
  const email = toStr(session.customer_details?.email);
  const phone = toStr(session.customer_details?.phone);

  const shipping = session.shipping_details || {};
  const addr = shipping.address || {};

  // Obtener items reales de Stripe (más confiable que confiar en front)
  const lineItems = await getSessionLineItems(session.id);
  const items = lineItems.map(li => ({
    name: toStr(li.description || li.price?.product?.name || "Item"),
    qty: Number(li.quantity || 1),
    amount: Number(li.amount_total || 0) / 100,
  }));

  // Payload para tu notificador (Telegram/WhatsApp)
  const notifyPayload = {
    orderId: transactionId,
    customerName,
    email,
    phone,
    total: value,
    currency,
    shipping: {
      name: toStr(shipping.name),
      address: {
        line1: toStr(addr.line1),
        line2: toStr(addr.line2),
        city: toStr(addr.city),
        state: toStr(addr.state),
        postal_code: toStr(addr.postal_code),
        country: toStr(addr.country),
      },
    },
    items,
  };

  const siteUrl = getSiteUrl();
  const notifyUrl = siteUrl ? `${siteUrl}/.netlify/functions/envia_webhook` : "";

  // 1) Notificación interna (si hay URL)
  if (notifyUrl) {
    try {
      await fetch(notifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifyPayload),
      });
    } catch (e) {
      console.error("envia_webhook call error:", e.message);
    }
  } else {
    console.warn("No site URL detected for envia_webhook.");
  }

  // 2) Meta CAPI Purchase (si hay env vars)
  const metaRes = await sendMetaPurchase({
    eventId: `purchase_${transactionId}`,
    value,
    currency,
    email,
    phone,
  });

  // 3) GA4 MP Purchase (si hay env vars)
  // client_id ideal vendría del front; por ahora usamos session.id (sirve para reporting)
  const gaRes = await sendGA4Purchase({
    clientId: toStr(session.client_reference_id) || "",
    transactionId,
    value,
    currency,
  });

  return json(200, {
    received: true,
    ok: true,
    meta: metaRes,
    ga4: gaRes,
  });
};