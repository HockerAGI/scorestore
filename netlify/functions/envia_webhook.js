exports.handler = async (event) => {
  try{
    if(event.httpMethod !== "POST"){
      return json(405, { ok:false, error:"method_not_allowed" });
    }

    // Este endpoint lo dejamos listo para el siguiente paso:
    // Crear guía/ship en Envia requiere datos completos del destinatario + paquetes exactos.
    // Aquí solo validamos y notificamos si llega.
    const body = JSON.parse(event.body || "{}");

    await sendTelegram(`[SCORE] envía_webhook recibido\n${JSON.stringify(body).slice(0,3500)}`);

    return json(200, { ok:true });
  }catch(e){
    return json(500, { ok:false, error:"server_error", detail:String(e?.message||e) });
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

function json(statusCode, body){
  return {
    statusCode,
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  };
}