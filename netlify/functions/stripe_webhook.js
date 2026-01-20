/**
 * stripe_webhook.js — FINAL MASTER (Con Telegram Notification)
 */

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { createClient } = require("@supabase/supabase-js");
const { createEnviaLabel } = require("./_shared");

// --- TELEGRAM CONFIG ---
const TELEGRAM_BOT_TOKEN = "7893882322:AAFFjrL0cfLl0AOAHMiNwbwrjX4E-1c58Bk";
const TELEGRAM_CHAT_ID = "8554886422"; // ID Personal de @unicouniformes

// Función para enviar mensaje a Telegram
async function sendTelegramNotification(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (error) {
    console.error("Error enviando Telegram:", error);
  }
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpbzndnavkbpxwnlbqgb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ ADVERTENCIA: Usando ANON KEY. Si RLS está activo, la orden no se guardará.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function toMoneyFromCents(amountCents) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(amountCents || 0) / 100);
}

async function getScoreOrgId() {
  const { data } = await supabase.from("organizations").select("id").eq("slug", "score-store").single();
  return data?.id;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  if (!sig || !webhookSecret) return json(400, { error: "Missing Signature" });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body, sig, webhookSecret);
  } catch (err) {
    return json(400, { error: `Webhook Error: ${err.message}` });
  }

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
    const customer_email = customer.email || "No email";
    const customer_name = customer.name || "Cliente";
    
    const totalFormatted = toMoneyFromCents(session.amount_total);
    const shipping_cost = (session.total_details?.amount_shipping || 0) / 100;
    
    const address = shipping && shipping.address ? shipping.address : customer.address || null;

    // Obtener items
    let itemsListText = "";
    let items = [];
    try {
      const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      items = (li.data || []).map((x) => {
        itemsListText += `• ${x.quantity}x ${x.description}\n`;
        return {
          description: x.description,
          quantity: x.quantity,
          amount: x.amount_total / 100,
          currency: "mxn"
        };
      });
    } catch (e) {
      console.warn("Error items:", e.message);
    }

    // Upsert Order en Supabase
    const { data: upserted } = await supabase
      .from("orders")
      .upsert({
        org_id,
        stripe_session_id,
        customer_email,
        total: session.amount_total / 100,
        currency: "mxn",
        status: "paid",
        shipping_mode: mode,
        shipping_cost,
        address_json: address,
        items_json: items,
      }, { onConflict: "stripe_session_id" })
      .select("*")
      .single();

    // Mensaje Telegram Base
    let telegramMsg = `<b>💰 ¡NUEVA VENTA CONFIRMADA!</b>\n\n`;
    telegramMsg += `👤 <b>Cliente:</b> ${customer_name}\n`;
    telegramMsg += `📧 <b>Email:</b> ${customer_email}\n`;
    telegramMsg += `💵 <b>Total:</b> ${totalFormatted}\n`;
    telegramMsg += `🚚 <b>Envío:</b> ${mode === 'pickup' ? 'Recoger en Fábrica' : 'Paquetería'}\n\n`;
    telegramMsg += `<b>📦 Productos:</b>\n${itemsListText}`;

    // Generar guía automática
    if ((mode === "mx" || mode === "us") && upserted && !upserted.tracking_number) {
      if (address?.postal_code) {
        const itemsQty = items.reduce((acc, x) => acc + x.quantity, 0) || 1;
        const shipment = await createEnviaLabel({
            name: customer_name,
            email: customer_email,
            phone: customer.phone || "0000000000",
            address: address, 
          }, itemsQty
        );

        if (shipment) {
          telegramMsg += `\n✅ <b>Guía Generada:</b> ${shipment.tracking}\ncarriers: ${shipment.carrier}`;
          
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
          telegramMsg += `\n⚠️ <b>Error Guía:</b> No se pudo generar automáticamente.`;
        }
      }
    } else if (mode === "pickup") {
      telegramMsg += `\n📍 <b>Instrucción:</b> El cliente pasará a recoger a la fábrica.`;
    }

    // Enviar notificación final
    await sendTelegramNotification(telegramMsg);

    return json(200, { received: true });

  } catch (err) {
    console.error("Webhook Error:", err);
    await sendTelegramNotification(`❌ <b>ERROR WEBHOOK:</b> ${err.message}`);
    return json(200, { received: true, error: err.message });
  }
};
