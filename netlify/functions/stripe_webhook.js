const Stripe = require("stripe");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return resp(405, "method_not_allowed");
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return resp(500, "missing_stripe_env");
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const sig = event.headers["stripe-signature"];
    if (!sig) return resp(400, "missing_signature");

    let evt;
    try {
      evt = stripe.webhooks.constructEvent(event.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return resp(400, "invalid_signature");
    }

    if (evt.type === "checkout.session.completed") {
      const session = evt.data.object;

      const promo = session.metadata?.promo_code || "";
      const discount = session.metadata?.discount_mxn || "0";
      const ship = session.metadata?.shipping_mxn || "0";
      const items = session.metadata?.items || "[]";
      const shipTo = session.metadata?.ship_to || "{}";

      const msg =
`✅ [SCORE] Pago confirmado
Session: ${session.id}
Total: ${session.amount_total ? (session.amount_total/100) : "N/A"} ${session.currency?.toUpperCase()}
Promo: ${promo}
Descuento: ${discount} MXN
Envío: ${ship} MXN
ShipTo: ${shipTo}
Items: ${items}`.slice(0, 3900);

      await sendTelegram(msg);
      await sendWhatsApp(msg);

      // Si luego quieres: aquí puedes llamar envia_webhook con el pedido completo
      // await fetch(`${process.env.URL_SCORE}/.netlify/functions/envia_webhook`, ...)
    }

    return resp(200, "ok");
  } catch (e) {
    return resp(500, "server_error");
  }
};

async function sendTelegram(text){
  try{
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if(!token || !chatId) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }).catch(()=>{});
  }catch(e){}
}

async function sendWhatsApp(text){
  try{
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if(!token || !phoneId) return;

    // OJO: aquí necesitarías un destinatario real.
    // Si quieres, lo conectamos a un "admin phone" en env (ej: WHATSAPP_ADMIN_TO)
    const to = process.env.WHATSAPP_TO;
    if(!to) return;

    await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(0, 3800) }
      })
    }).catch(()=>{});
  }catch(e){}
}

function resp(statusCode, body){
  return { statusCode, body };
}