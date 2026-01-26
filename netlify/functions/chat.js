const { GoogleGenerativeAI } = require("@google/generative-ai");
const { jsonResponse, safeJsonParse } = require("./_shared");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const SYSTEM_PROMPT = `Eres el Asistente de SCORE Store. Responde brevemente sobre productos, tallas y envíos. Usa emojis de carreras. Si piden descuento, diles que prueben 'SCORE25'.`;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  try {
    const { message } = safeJsonParse(event.body);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const chat = model.startChat({ history: [{ role: "user", parts: [{ text: SYSTEM_PROMPT }] }] });
    const result = await chat.sendMessage(message);
    return jsonResponse(200, { reply: result.response.text() });
  } catch (e) { return jsonResponse(500, { error: "Error IA" }); }
};
