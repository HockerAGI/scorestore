/**
 * envia_webhook.js — RECEPTOR DE ESTADOS (Placeholder)
 */
exports.handler = async (event, context) => {
  // Aquí en el futuro puedes actualizar el estado del pedido en Supabase
  // cuando Envia.com notifique "Entregado" o "En Tránsito".
  console.log("Envia Webhook Recibido:", event.body);
  
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "OK" })
  };
};
