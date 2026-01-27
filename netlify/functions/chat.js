const { GoogleGenerativeAI } = require("@google/generative-ai");
const { jsonResponse, safeJsonParse } = require("./_shared");
const catalog = require("../../data/catalog.json");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_PROMPT = `
Eres SCORE AI, vendedor y soporte oficial de SCORE Store.
Operación: Único Uniformes (BAJATEX, Tijuana).
Objetivo: ayudar a comprar (tallas, envíos, productos, pagos) con tono Racing pro (🏁🌵🏎).

Reglas:
- Sé breve, claro, útil.
- Si preguntan por descuentos: ofrece cupón SCORE25.
- Envíos: MX y USA por FedEx vía Envia.com. Si piden envío, pide CP.
- Pagos: Stripe (tarjeta y OXXO).
- Marca protagonista: SCORE STORE; Único Uniformes opera la tienda.
- Si piden catálogo: lista opciones por categoría/edición y su precio.
`;

function summarizeCatalog() {
  const products = (catalog?.products || []).slice(0, 80).map((p) => ({
    id: p.id,
    name: p.name,
    price_mxn: p.baseMXN,
    category: p.category || ""
  }));
  return JSON.stringify(products);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const body = safeJsonParse(event.body);
  const prompt = String(body.prompt || body.message || "").trim();
  if (!prompt) return jsonResponse(400, { error: "Falta prompt" });

  if (!process.env.GEMINI_API_KEY) {
    return jsonResponse(200, {
      ok: false,
      reply: "SCORE AI está apagado (falta GEMINI_API_KEY). ¿Qué producto y talla buscas? 🏁"
    });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `CATALOGO_JSON_RESUMIDO: ${summarizeCatalog()}` },
      { text: `USUARIO: ${prompt}` }
    ]);

    const text = result?.response?.text?.() || "No pude responder. Intenta de nuevo.";
    return jsonResponse(200, { ok: true, reply: text });
  } catch (e) {
    console.error("Gemini error:", e);
    return jsonResponse(200, {
      ok: false,
      reply: "Tuve un fallo rápido con SCORE AI. Dime producto+talla+CP y te lo resuelvo. 🏎"
    });
  }
};