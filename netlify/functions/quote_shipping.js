/**
 * SCORE STORE — Shipping Quote (MXN)
 *
 * Cálculo determinístico por zona usando CP (México):
 * - Baja California (21,22): base 99
 * - Baja California Sur (23): base 129
 * - Resto MX: base 199
 * Ajuste por piezas: +15 MXN por pieza extra (desde la 2da)
 * Opción pickup: 0
 */
function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(obj),
  };
}

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "").slice(0, 5);
}

function zoneFromCP(cp5) {
  const cp = onlyDigits(cp5);
  if (cp.length < 2) return "MX";
  const prefix2 = Number(cp.slice(0, 2));
  if (prefix2 === 21 || prefix2 === 22) return "BC";
  if (prefix2 === 23) return "BCS";
  return "MX";
}

function baseByZone(zone) {
  if (zone === "BC") return 99;
  if (zone === "BCS") return 129;
  return 199;
}

function countPieces(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((a, it) => a + Math.max(0, Number(it.qty || 0)), 0);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const method = String(body.method || "delivery"); // delivery | pickup
  const postalCode = onlyDigits(body.postalCode || "");
  const state = String(body.state || "").trim();
  const pieces = countPieces(body.items);

  if (method === "pickup") {
    return json(200, {
      ok: true,
      mxn: 0,
      label: "Recoger en ÚNICO (Tijuana)",
      eta: "Mismo día / 24h",
      zone: "PICKUP",
      postalCode,
      state,
      pieces,
    });
  }

  if (!postalCode || postalCode.length < 5) {
    return json(400, { ok: false, error: "Postal code inválido" });
  }

  const zone = zoneFromCP(postalCode);
  const base = baseByZone(zone);

  // ajuste por piezas (simple y usable)
  const extra = Math.max(0, (pieces || 1) - 1) * 15;
  const mxn = base + extra;

  const eta = zone === "BC" ? "1–2 días" : zone === "BCS" ? "2–4 días" : "3–6 días";
  const label =
    zone === "BC" ? "Envío BC" :
    zone === "BCS" ? "Envío BCS" :
    "Envío Nacional";

  return json(200, {
    ok: true,
    mxn,
    label,
    eta,
    zone,
    postalCode,
    state,
    pieces,
  });
};