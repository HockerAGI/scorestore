// Webhook neutralizado para evitar errores en Envia.com
exports.handler = async (event, context) => {
  console.log("Webhook de Envia recibido (Placeholder)");
  return { statusCode: 200, body: "OK" };
};
