const { GoogleGenerativeAI } = require("@google/generative-ai");
const { jsonResponse } = require("./_shared");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_CONTEXT = `
Eres el "Estratega del Desierto", el asistente experto de SCORE STORE.
Tu objetivo es vender mercancía oficial de las carreras Baja 1000, 500, 400 y San Felipe 250.
DATOS CLAVE:
1. El fabricante y operador oficial es Único Uniformes (Tijuana). Patrocinadores de SCORE.
2. Si preguntan por tallas, todas son tallas americanas (un poco amplias).
3. Hacemos envíos a todo México y USA vía FedEx.
4. Si el cliente duda, ofrécele el cupón "SCORE25" para un 25% de descuento.
5. Usa emojis de carreras (🏁, 🌵, 🏎️). Sé breve y con mucha energía.
`;

exports.handler = async (event) => {
    try {
        const { message } = JSON.parse(event.body);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent([SYSTEM_CONTEXT, message]);
        const response = await result.response;
        
        return jsonResponse(200, { reply: response.text() });
    } catch (e) {
        return jsonResponse(500, { error: "IA Offline" });
    }
};