"use strict";

const { supabaseAdmin } = require("./_shared.js");

const WINDOW = 60 * 1000; // 1 min
const LIMIT = 60;

/**
 * Normaliza la IP del cliente para manejar proxies de Vercel y Cloudflare
 */
function normalizeIP(ip) {
  const raw = String(ip || "").trim();
  if (!raw) return "unknown";
  // Obtener la primera IP si viene una lista (X-Forwarded-For)
  const first = raw.split(",")[0].trim();
  // Limpiar puerto si existe (ej. 127.0.0.1:4532 -> 127.0.0.1)
  if (first.includes(":") && !first.includes("[")) {
    return first.split(":")[0];
  }
  return first;
}

function getIP(req) {
  const h = req?.headers || {};
  return normalizeIP(
    h["x-forwarded-for"] || 
    h["x-real-ip"] || 
    h["cf-connecting-ip"] || 
    req?.socket?.remoteAddress || 
    "unknown"
  );
}

/**
 * Lógica de Rate Limit asíncrona usando Supabase como almacenamiento KV
 */
async function rateLimit(req) {
  const ip = getIP(req);
  const now = Date.now();

  // Si no podemos identificar la IP, permitimos por defecto para no bloquear usuarios legítimos
  if (ip === "unknown") {
    return { ok: true, remaining: LIMIT, limit: LIMIT, resetAt: now + WINDOW };
  }

  const sb = supabaseAdmin();
  // Fallback: Si la DB no está configurada, permitimos el paso pero logueamos
  if (!sb) {
    console.warn("[rate-limit] Supabase no configurado, omitiendo validación.");
    return { ok: true, remaining: LIMIT, limit: LIMIT, resetAt: now + WINDOW };
  }

  const key = `ratelimit_${ip}`;

  try {
    // 1. Intentar obtener el registro actual
    const { data, error } = await sb
      .from("kv_store")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) throw error;

    let count = 1;
    let ts = now;

    if (data && data.value) {
      const current = data.value;
      // Si estamos dentro de la ventana de tiempo, incrementamos
      if (now - current.ts <= WINDOW) {
        count = (current.count || 0) + 1;
        ts = current.ts;
      } else {
        // Si la ventana ya pasó, reiniciamos el contador
        count = 1;
        ts = now;
      }
    }

    // 2. Guardar el nuevo estado (Upsert basado en la columna 'key')
    const { error: upsertError } = await sb
      .from("kv_store")
      .upsert(
        { 
          key, 
          value: { count, ts }, 
          updated_at: new Date().toISOString(),
          // Se recomienda tener un campo expires_at en la DB para limpieza automática
          expires_at: new Date(ts + WINDOW).toISOString() 
        }, 
        { onConflict: 'key' } // Asegura que actualice la IP existente
      );

    if (upsertError) console.error("[rate-limit] Error al actualizar contador:", upsertError.message);

    // 3. Evaluar límite
    if (count > LIMIT) {
      return { 
        ok: false, 
        error: "rate_limited", 
        remaining: 0, 
        limit: LIMIT, 
        resetAt: ts + WINDOW 
      };
    }

    return { 
      ok: true, 
      remaining: Math.max(0, LIMIT - count), 
      limit: LIMIT, 
      resetAt: ts + WINDOW 
    };

  } catch (error) {
    // Si falla la base de datos, dejamos pasar al usuario para no romper la tienda (Fail-safe)
    console.error("[rate-limit] Exception:", error.message);
    return { ok: true, remaining: LIMIT, limit: LIMIT, resetAt: now + WINDOW };
  }
}

module.exports = { rateLimit, getIP };
