/**
 * stripe_webhook.js — FINAL MASTER (unificado)
 * - Verifica firma Stripe (RAW body / base64 Netlify)
 * - Crea/actualiza orden en Supabase (idempotente)
 * - Genera guía Envia SOLO para mx/us (si ENVIA_API_KEY existe)
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");

const { createEnviaLabel } = require("./_shared");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Supabase server-side (preferir Service Role en Netlify)
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://lpbzndnavkbpxwnlbqgb.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || // recomendado (Netlify env)
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helpers
function toMoneyFromCents(amountCents) {
  const n = Number(amountCents || 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

async function getScoreOrgId() {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "score-store")
    .single();

  if (error || !data?.id) return null;
  return data.id;
}

async function getExistingOrderBySession(stripe_session_id) {
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_session_id", stripe_session_id)
    .maybeSingle();

  return data || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  if (!sig || !webhookSecret) {
    console.error("Webhook Error: Missing signature or STRIPE_WEBHOOK_SECRET");
    return json(400, { error: "Missing Signature" });
  }

  // Stripe requiere RAW body correcto (Netlify a veces lo manda base64)
  const payload = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  try {
    // Solo nos interesa cuando Checkout termina exitoso
    if (stripeEvent.type !== "checkout.session.completed") {
      return json(200, { received: true });
    }

    const session = stripeEvent.data.object;

    const stripe_session_id = session.id;
    const mode = String(session.metadata?.score_mode || "pickup").toLowerCase(); // pickup | tj | mx | us
    const org_id = session.metadata?.org_id || (await getScoreOrgId());

    const customer = session.customer_details || {};
    const shipping = session.shipping_details || null;

    const customer_email = customer.email || null;
    const currency = String(session.currency || "mxn").toUpperCase();

    const total = toMoneyFromCents(session.amount_total);
    const shipping_cost = toMoneyFromCents(session.total_details?.amount_shipping);

    const address =
      shipping && shipping.address
        ? shipping.address
        : customer.address || null;

    // Line items reales
    let items = [];
    try {
      const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      items = (li.data || []).map((x) => ({
        description: x.description || null,
        quantity: Number(x.quantity || 0),
        amount_total: toMoneyFromCents(x.amount_total),
        currency,
        price: x.price
          ? {
              id: x.price.id,
              unit_amount: toMoneyFromCents(x.price.unit_amount),
              product: x.price.product || null,
            }
          : null,
      }));
    } catch (e) {
      console.warn("⚠️ No se pudieron leer line_items:", e.message);
      items = [];
    }

    // Idempotencia: si ya existe, no repetir guía
    const existing = await getExistingOrderBySession(stripe_session_id);

    const basePayload = {
      org_id,
      stripe_session_id,
      customer_email,
      total,
      currency,
      status: existing?.status || "paid",
      shipping_mode: mode,
      shipping_cost,
      address_json: address ? address : null,
      items_json: items && items.length ? items : null,
    };

    // UPSERT por stripe_session_id (asumido UNIQUE)
    const { data: upserted, error: upsertErr } = await supabase
      .from("orders")
      .upsert(basePayload, { onConflict: "stripe_session_id" })
      .select("*")
      .single();

    if (upsertErr) {
      console.error("❌ Supabase upsert error:", upsertErr);
      return json(200, { received: true, warning: "supabase_upsert_failed" });
    }

    console.log(`✅ Order upsert OK: session=${stripe_session_id} mode=${mode} total=${total}`);

    // Generar guía solo para mx/us
    if (mode === "mx" || mode === "us") {
      if (upserted?.tracking_number) {
        console.log("ℹ️ Orden ya tiene tracking. Skip Envia.");
        return json(200, { received: true });
      }

      const postal = address?.postal_code;
      if (!postal) {
        console.error("⚠️ Sin postal_code. No se puede generar guía.");
        return json(200, { received: true, warning: "missing_postal_code" });
      }

      const itemsQty = (items || []).reduce((acc, x) => acc + Number(x.quantity || 0), 0) || 1;

      const shipment = await createEnviaLabel(
        {
          name: shipping?.name || customer?.name || "Cliente",
          email: customer_email || "cliente@scorestore.com",
          phone: customer?.phone || shipping?.phone || "0000000000",
          address: address, // { line1,line2,city,state,country,postal_code }
        },
        itemsQty
      );

      if (shipment) {
        console.log(`🚚 GUÍA OK: ${shipment.tracking} (${shipment.carrier})`);

        const { error: updErr } = await supabase
          .from("orders")
          .update({
            tracking_number: shipment.tracking || null,
            label_url: shipment.labelUrl || null,
            carrier: shipment.carrier || null,
            status: "shipped",
          })
          .eq("stripe_session_id", stripe_session_id);

        if (updErr) {
          console.error("⚠️ No se pudo actualizar order con tracking:", updErr);
        }
      } else {
        console.error("⚠️ Envia no generó guía (API/validación). Orden queda paid.");
      }
    }

    return json(200, { received: true });
  } catch (err) {
    console.error("Webhook Handler Error:", err);
    // 200 para evitar reintentos infinitos
    return json(200, { received: true, warning: "handled_with_error" });
  }
};