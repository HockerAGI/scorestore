// netlify/functions/chat.js
// SCORE AI (Gemini) — vendedor/soporte para Score Store
// - Lee catalog.json para responder con productos reales
// - No expone secretos
// - CORS + OPTIONS
// - Respuestas cortas, pro y accionables

import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  ok,
  fail,
  parseJSON,
  env,
  corsHeaders
} from "./_shared.js";

/* ---------------------- helpers ------------------------ */
function getSiteUrl(event) {
  const fromEnv = process.env.SITE_URL || process.env.URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = event?.headers?.host;
  if (host) return `https://${host}`;
  return "https://scorestore.netlify.app";
}

function readCatalogLite() {
  const candidates = [
    path.resolve(process.cwd(), "data", "catalog.json"),
    path.resolve("/var/task", "data", "catalog.json"),
    path.resolve(process.cwd(), "..", "data", "catalog.json")
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const json = JSON.parse(raw);
        const products = Array.isArray(json?.products) ? json.products : [];
        // versión ligera para prompt
        return products.map((x) => ({
          id: String(x.id || ""),
          name: String(x.name || ""),
          category: String(x.category || ""),
          priceMXN: Number(x.baseMXN || x.price || 0),
          img: String(x.img || "")
        })).filter(p => p.id && p.name);
      }
    } catch {
      // sigue intentando
    }
  }
  return [];
}

function truncate(str, n = 1800) {
  const s = String(str || "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function normalizeMsg(m) {
  return truncate(String(m || "").trim(), 800);
}

/* ---------------------- handler ------------------------ */
export async function handler(event) {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders() };
  }

  if (event.httpMethod !== "POST") {
    return fail(405, "Method not allowed");
  }

  try {
    const body = parseJSON(event.body);
    const message = normalizeMsg(body.message);

    if (!message) return fail(422, "Mensaje vacío");

    const apiKey = env("GEMINI_API_KEY", { required: true });
    const genAI = new GoogleGenerativeAI(apiKey);

    // Modelo: si tu lib soporta gemini-1.5-flash o similar, va perfecto.
    // Si tu cuenta tiene otro nombre, cámbialo en env o aquí. No invento, dejo default estable.
    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const siteUrl = getSiteUrl(event);
    const catalog = readCatalogLite();

    // Compactamos catálogo para el prompt (no saturar tokens)
    const catalogText = catalog.length
      ? catalog.slice(0, 80).map(p => `- [${p.id}] ${p.name} (${p.category}) ${p.priceMXN} MXN`).join("\n")
      : "(Catálogo no disponible en este momento)";

    const system = `
Eres "SCORE AI" — vendedor y soporte oficial de SCORE STORE (tienda oficial).
Tono: profesional, directo, estilo Gen Z ligero (sin cringe), enfocado a cerrar venta.
Reglas de marca:
- El protagonista SIEMPRE es: SCORE STORE.
- Único Uniformes opera/fabrica (BAJATEX Tijuana), pero NO le roba spotlight a SCORE STORE.
Reglas de seguridad:
- Jamás reveles llaves, tokens, secretos, ni datos internos.
- Si te piden llaves o cosas sensibles: rechaza y explica que va en variables de entorno.
Objetivo:
- Ayuda a elegir producto/talla, resolver dudas de envío/pago, promociones, y guiar al checkout.
Hechos del sistema (no inventes):
- Pagos: Stripe (tarjeta y OXXO en MX).
- Envíos: Envia.com (FedEx) cotización real; requiere CP.
- Store URL: ${siteUrl}
Cuando recomiendes, da 2-4 opciones máximo y termina con un CTA claro (ej: "Dime tu talla y qué carrera prefieres").
Catálogo (IDs reales):
${catalogText}
`.trim();

    const user = `
Usuario dice: "${message}"
Responde en español (México). Si pregunta por productos, usa el catálogo de arriba.
Si pide "recomendación", primero pregunta 1 cosa clave (talla / evento / presupuesto).
`.trim();

    const result = await model.generateContent([
      { text: system },
      { text: user }
    ]);

    const reply = result?.response?.text?.() || "Estoy aquí. ¿Qué producto buscas y qué talla usas?";

    return ok({ reply: truncate(reply, 1800) });

  } catch (e) {
    console.error("chat.js error:", e);
    // Si falta GEMINI_API_KEY, lo decimos claro
    if (String(e?.message || "").includes("Missing env var: GEMINI_API_KEY")) {
      return fail(500, "GEMINI_API_KEY no configurada en Netlify Environment Variables");
    }
    return fail(500, "Error en Score AI", { detail: e?.message || "unknown" });
  }
}