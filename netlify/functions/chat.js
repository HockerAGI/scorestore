/* =========================================================
   SCORE STORE — Netlify Function: chat
   Route: /api/chat  ->  /.netlify/functions/chat

   ✅ Alineado a BLOQUE 1/2/3:
   Frontend manda:
     { messages: [{role:"user", content:"..."}] }

   Compat:
     { message:"..." } o { text:"..." }

   ENV:
   - GEMINI_API_KEY (si no existe, responde error)
   ========================================================= */

const { handleOptions, json, geminiChat, rateLimit } = require("./_shared");

function extractMessage(body) {
  // Nuevo formato
  if (Array.isArray(body.messages) && body.messages.length) {
    const lastUser = [...body.messages]
      .reverse()
      .find((m) => String(m.role || "").toLowerCase() === "user");
    const msg = String(lastUser?.content || "").trim();
    if (msg) return msg;
  }
  // Compat
  if (body.message) return String(body.message).trim();
  if (body.text) return String(body.text).trim();
  return "";
}

exports.handler = async (event) => {
  const opt = handleOptions(event);
  if (opt) return opt;

  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" }, event);
    }

    // Rate limit (best effort)
    const limited = await rateLimit(event, 20, 60);
    if (limited) return limited;

    const body = JSON.parse(event.body || "{}");
    const msg = extractMessage(body);

    if (!msg) {
      return json(400, { error: "Empty message" }, event);
    }

    const reply = await geminiChat(msg);
    return json(200, { reply }, event);
  } catch (err) {
    console.error("chat error:", err);
    return json(500, { error: "Chat failed" }, event);
  }
};
