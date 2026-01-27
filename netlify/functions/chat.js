import { GoogleGenerativeAI } from "@google/generative-ai";
import { ok, fail, parseJSON, env } from "./_shared.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({});
  if (event.httpMethod !== "POST") return fail(405, "Method Not Allowed");

  try {
    const { message } = parseJSON(event.body);
    const key = env("GEMINI_API_KEY");

    // MODO FALLBACK INTELIGENTE (Si no hay key o falla Google)
    if (!key) {
      // Respuestas pre-programadas basadas en palabras clave (Surgical fix para que no de error)
      const msg = message.toLowerCase();
      let reply = "Soy el asistente virtual de SCORE. ¿En qué te puedo ayudar?";
      
      if(msg.includes("talla") || msg.includes("medida")) reply = "Nuestras tallas son estándar (Fit Regular). Si dudas entre dos, te recomiendo la más grande para mayor comodidad en el desierto.";
      else if(msg.includes("envio") || msg.includes("tarda")) reply = "Enviamos a todo México (3-5 días) y USA (5-7 días) vía FedEx. También puedes recoger gratis en nuestra fábrica en Tijuana.";
      else if(msg.includes("pago") || msg.includes("oxxo")) reply = "Aceptamos tarjetas Visa, Mastercard y pagos en efectivo en OXXO (solo México). Todo procesado de forma segura por Stripe.";
      else if(msg.includes("ubicacion") || msg.includes("donde")) reply = "Estamos en Tijuana, Col. Anexa Roma. Puedes seleccionar 'Pickup' al finalizar tu compra.";
      
      return ok({ reply });
    }

    // MODO REAL (Si pones la KEY en _shared.js después)
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent(`
      Eres el vendedor experto de SCORE STORE. Vendes mercancía oficial Off-Road.
      Responde corto, amable y motivando la compra.
      Datos clave: Envíos FedEx MX/USA, Pagos Stripe/OXXO, Fabricado por Único Uniformes Tijuana.
      Usuario: ${message}
    `);
    
    return ok({ reply: result.response.text() });

  } catch (e) {
    return ok({ reply: "Lo siento, mi radio está fallando. Por favor contáctanos por WhatsApp para respuesta inmediata." });
  }
}