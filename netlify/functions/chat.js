/* netlify/functions/chat.js */
const { jsonResponse, safeJsonParse } = require("./_shared");

// TU API KEY REAL
const GEMINI_API_KEY = "AIzaSyAtFIytBGuc5Dc_ZmQb54cR1d6qsPBix2Y";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// CONTEXTO SCORE STORE
const SYSTEM_PROMPT = `
Eres SCORE AI, experto en ventas de Score Store y Único Uniformes.
Vendes mercancía oficial de carreras Baja 1000, 500, etc.
Datos:
- Envíos: Nacionales e Internacionales (FedEx/Envia.com).
- Pagos: Stripe (Tarjeta/OXXO).
- Tallas: Standard Fit.
- Ubicación: Tijuana, Baja California.
Responde corto, amable y persuasivo.
`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const body = safeJsonParse(event.body);
    const userMsg = body.message || "";

    if (!userMsg) return jsonResponse(400, { error: "Empty" });

    // Llamada directa a REST API de Gemini (Evita problemas de dependencias)
    const payload = {
      contents: [{
        parts: [{ text: SYSTEM_PROMPT + "\nUsuario: " + userMsg + "\nAI:" }]
      }]
    };

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    let reply = "Lo siento, hubo un error de conexión.";
    
    if (data.candidates && data.candidates[0].content) {
      reply = data.candidates[0].content.parts[0].text;
    }

    return jsonResponse(200, { reply });

  } catch (error) {
    console.error("Gemini Error:", error);
    return jsonResponse(500, { error: "Internal Server Error" });
  }
};
