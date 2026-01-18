/**
 * stripe_webhook.js — FINAL MASTER (CORREGIDO)
 * - Verifica firma Stripe correctamente
 * - Upsert idempotente de orden en Supabase
 * - Generación automática de guía en Envia.com
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");
const { createEnviaLabel } = require("./_shared");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// IMPORTANTE: Se necesita la Service Role Key para escribir en la tabla 'orders' sin restricciones RLS
// Si no está definida, intenta usar la Anon Key (puede fallar si tus políticas son estrictas)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ ADVERTENCIA: SUPABASE_SERVICE_ROLE_KEY no está definida. El webhook podría fallar al guardar la orden.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function toMoneyFromCents(amountCents) {
  const n = Number(amountCents || 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

async function getScoreOrgId() {
  const { data, error } = await supabase.from("organizations").select("id").eq("slug", "score-store").single();
  if (error || !data?.id) return null;
  return data.id;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  if (!sig || !webhookSecret) {
    console.error("Webhook Error: Falta firma o secreto.");
    return json(400, { error: "Missing Signature" });
  }

  // Manejo correcto del buffer para Stripe
  const payload = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook Signature Error:", err.message);
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

  // Solo procesamos checkout completado
  if (stripeEvent.type !== "checkout.session.completed") {
    return json(200, { received: true });
  }

  try {
    const session = stripeEvent.data.object;
    const stripe_session_id = session.id;
    const mode = String(session.metadata?.score_mode || "pickup").toLowerCase();
    const org_id = session.metadata?.org_id || (await getScoreOrgId());
    
    const customer = session.customer_details || {};
    const shipping = session.shipping_details || null;
    const customer_email = customer.email || null;
    const currency = String(session.currency || "mxn").toUpperCase();
    const total = toMoneyFromCents(session.amount_total);
    const shipping_cost = toMoneyFromCents(session.total_details?.amount_shipping || 0);
    
    // Dirección prioritaria: Shipping > Customer
    const address = shipping && shipping.address ? shipping.address : customer.address || null;

    // Recuperar items
    let items = [];
    try {
      const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      items = (li.data || []).map((x) => ({
        description: x.description || null,
        quantity: Number(x.quantity || 0),
        amount_total: toMoneyFromCents(x.amount_total),
        currency,
        price: x.price ? { id: x.price.id, unit_amount: toMoneyFromCents(x.price.unit_amount), product: x.price.product || null } : null,
      }));
    } catch (e) {
      console.warn("⚠️ No se pudieron leer line_items:", e.message);
    }

    // Guardar en Supabase (Upsert)
    const basePayload = {
      org_id,
      stripe_session_id,
      customer_email,
      total,
      currency,
      status: "paid", // Default inicial
      shipping_mode: mode,
      shipping_cost,
      address_json: address ? address : null,
      items_json: items && items.length ? items : null,
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from("orders")
      .upsert(basePayload, { onConflict: "stripe_session_id" })
      .select("*")
      .single();

    if (upsertErr) {
      console.error("❌ Error guardando orden en Supabase:", upsertErr);
      // Retornamos 200 para que Stripe no reintente infinitamente si es error de lógica nuestra
      return json(200, { received: true, warning: "supabase_upsert_failed" });
    }

    console.log(`✅ Orden guardada: ID interna ${upserted?.id || "?"}`);

    // Generar guía Envia.com (Solo MX/US y si no existe ya)
    if ((mode === "mx" || mode === "us") && !upserted?.tracking_number) {
      const postal = address?.postal_code;
      if (postal) {
        const itemsQty = items.reduce((acc, x) => acc + Number(x.quantity || 0), 0) || 1;
        const shipment = await createEnviaLabel(
          {
            name: shipping?.name || customer?.name || "Cliente",
            email: customer_email || "cliente@scorestore.com",
            phone: customer?.phone || "0000000000",
            address: address, 
          },
          itemsQty
        );

        if (shipment) {
          console.log(`🚚 Guía generada: ${shipment.tracking}`);
          await supabase
            .from("orders")
            .update({
              tracking_number: shipment.tracking,
              label_url: shipment.labelUrl,
              carrier: shipment.carrier,
              status: "shipped",
            })
            .eq("stripe_session_id", stripe_session_id);
        } else {
          console.error("⚠️ Envia.com no retornó guía.");
        }
      }
    }

    return json(200, { received: true });

  } catch (err) {
    console.error("Webhook Handler Error:", err);
    return json(200, { received: true, error: err.message });
  }
};