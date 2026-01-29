// netlify/functions/quote_shipping.js
/* =========================================================
   SCORE STORE — Shipping Quote (Envia.com) v2026 (PROD)
   - Entrada:
      {
        zip,
        country:"MX"|"US",
        items:[ { id?, sku?, qty } ]   // ✅ recomendado para quote real (ÚNICO OS)
      }
   - Salida:
      { ok:true, cost:number, label:string, country, zip, source, meta }
   ✅ Envia PRIORIDAD (si hay ENVIA_API_TOKEN)
   ✅ Si hay Supabase (ÚNICO OS): usa specs por SKU (weight/dims/declared)
   ✅ Fallback seguro si falla Envia / faltan specs
   ========================================================= */

const {
  handleOptions,
  jsonResponse,
  safeJsonParse,
  normalizeQty,
  digitsOnly,
  getFallbackShipping,
  validateZip,
  getEnviaQuote,
  supabaseAdmin,
  supabase,
} = require("./_shared");

// -------------------------
// Helpers de payload
// -------------------------
function normalizeCountry(body) {
  const raw = String(body?.country || body?.cc || "MX").trim().toUpperCase();
  if (raw === "US" || raw === "USA" || raw === "UNITEDSTATES") return "US";
  return "MX";
}

function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return [{ qty: 1 }];

  return arr.map((it) => {
    const qty = normalizeQty(it?.qty ?? it?.quantity ?? 1);
    const id = it?.id ? String(it.id) : "";
    const sku = it?.sku ? String(it.sku) : "";
    return { qty, id, sku };
  });
}

function sumQty(items) {
  return items.reduce((acc, it) => acc + normalizeQty(it?.qty || 1), 0);
}

function buildLabel(country, days, source, carrier, service) {
  const d = Number(days);
  const eta = Number.isFinite(d) && d > 0 ? ` · ${d}d` : "";
  const c = carrier ? String(carrier).toUpperCase() : (source === "envia" ? "ENVIA" : "ENVÍO");
  const s = service ? ` ${String(service)}` : "";
  if (source === "envia") return `${c}${s}${eta}`.trim();
  return country === "US" ? `Envío internacional${eta}` : `Envío (Estimación)${eta}`;
}

// -------------------------
// ÚNICO OS (Supabase) — specs envío por SKU/ID
// - Tolerante: si no hay Supabase / no hay columnas -> cae a estimación
// -------------------------
async function getOrgId(client, slug = "score-store") {
  try {
    const { data, error } = await client
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .single();
    if (error || !data?.id) return null;
    return data.id;
  } catch {
    return null;
  }
}

async function fetchProductsByIdsOrSkus(client, orgId, ids, skus) {
  let rows = [];

  // 1) Por ID
  if (ids.length) {
    try {
      let q = client.from("products").select("*").in("id", ids);
      if (orgId) {
        // si existe org_id, perfecto; si no existe, caerá al catch y reintentamos sin org_id
        q = q.eq("org_id", orgId);
      }
      const { data, error } = await q;
      if (!error && Array.isArray(data)) rows = rows.concat(data);
    } catch (_) {
      try {
        const { data, error } = await client.from("products").select("*").in("id", ids);
        if (!error && Array.isArray(data)) rows = rows.concat(data);
      } catch (_) {}
    }
  }

  // 2) Por SKU
  if (skus.length) {
    try {
      let q = client.from("products").select("*").in("sku", skus);
      if (orgId) q = q.eq("org_id", orgId);
      const { data, error } = await q;
      if (!error && Array.isArray(data)) rows = rows.concat(data);
    } catch (_) {
      try {
        const { data, error } = await client.from("products").select("*").in("sku", skus);
        if (!error && Array.isArray(data)) rows = rows.concat(data);
      } catch (_) {}
    }
  }

  // dedupe por id
  const map = new Map();
  for (const r of rows) {
    const key = String(r?.id || r?.sku || "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

async function getShippingSpecsFromSupabase(items) {
  const client = supabaseAdmin || supabase;
  if (!client) {
    return { ok: false, source: "no_supabase" };
  }

  const ids = Array.from(new Set(items.map((i) => i.id).filter(Boolean)));
  const skus = Array.from(new Set(items.map((i) => i.sku).filter(Boolean)));

  // si el front no manda id/sku, no hay nada que consultar
  if (!ids.length && !skus.length) {
    return { ok: false, source: "no_keys" };
  }

  const orgId = await getOrgId(client, "score-store"); // opcional; si falla, seguimos sin orgId
  const rows = await fetchProductsByIdsOrSkus(client, orgId, ids, skus);
  if (!rows.length) {
    return { ok: false, source: "no_rows" };
  }

  // indexa por id y sku
  const byId = new Map();
  const bySku = new Map();
  for (const r of rows) {
    if (r?.id) byId.set(String(r.id), r);
    if (r?.sku) bySku.set(String(r.sku), r);
  }

  let totalWeightKg = 0;
  let maxL = 0;
  let maxW = 0;
  let heightSum = 0;
  let declaredTotal = 0;

  let matched = 0;

  for (const it of items) {
    const qty = normalizeQty(it.qty);
    const row = (it.id && byId.get(String(it.id))) || (it.sku && bySku.get(String(it.sku))) || null;

    if (!row) continue;
    matched++;

    // pesos/dimensiones por SKU (1 unidad)
    const w = num(row.weight_kg || row.weightKg || row.weight);
    const L = num(row.length_cm || row.lengthCm || row.length);
    const W = num(row.width_cm || row.widthCm || row.width);
    const H = num(row.height_cm || row.heightCm || row.height);

    if (w > 0) totalWeightKg += w * qty;
    if (L > 0) maxL = Math.max(maxL, L);
    if (W > 0) maxW = Math.max(maxW, W);
    heightSum += (H > 0 ? H : 3) * qty;

    // declared value (opcional)
    const dv = num(row.declared_value_mxn || row.declaredValueMxn || row.declared_value);
    const base = num(row.base_mxn || row.baseMXN || row.price || row.unit_price);
    if (dv > 0) declaredTotal += dv * qty;
    else if (base > 0) declaredTotal += base * qty;
  }

  if (!matched) return { ok: false, source: "no_match" };

  // Normaliza defaults
  const qtyAll = sumQty(items);

  const weightKg = Math.max(1, totalWeightKg || qtyAll * 0.6); // mínimo 1kg
  const lengthCm = maxL > 0 ? maxL : 30;
  const widthCm = maxW > 0 ? maxW : 20;

  // altura: suma de “grosor” por prenda, con clamp
  const heightCm = Math.min(60, Math.max(8, Math.ceil(6 + (heightSum || qtyAll * 3))));

  // declared no afecta rate si insurance=0, pero lo dejamos calculado por consistencia
  const declared_value_mxn = Math.max(400 * qtyAll, declaredTotal || 0);

  return {
    ok: true,
    source: "supabase",
    qty: qtyAll,
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
    declared_value_mxn,
    matched,
  };
}

// -------------------------
// Handler
// -------------------------
exports.handler = async (event) => {
  // Preflight
  const opt = handleOptions(event);
  if (opt) return opt;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    const body = safeJsonParse(event.body);
    const country = normalizeCountry(body);
    const zip = digitsOnly(body?.zip || body?.cp || body?.postal_code || body?.postalCode || "");
    const items = normalizeItems(body?.items || []);
    const qty = Math.max(1, sumQty(items));

    if (!zip || zip.length < 4) {
      return jsonResponse(200, { ok: false, error: "ZIP_INVALID" });
    }

    // Validación zip (si hay ENVIA_API_TOKEN)
    const zipCheck = await validateZip(country, zip);
    if (zipCheck?.ok === false) {
      return jsonResponse(200, { ok: false, error: zipCheck.error || "ZIP_NOT_FOUND" });
    }

    // 1) Intenta specs reales (ÚNICO OS)
    const specs = await getShippingSpecsFromSupabase(items);

    const weightKg = specs?.ok ? specs.weightKg : Math.max(1, qty * 0.6);
    const L = specs?.ok ? specs.lengthCm : 30;
    const W = specs?.ok ? specs.widthCm : 20;
    const H = specs?.ok ? specs.heightCm : Math.min(60, 5 + Math.ceil(qty * 3));

    // 2) Envia quote real (si hay token)
    const quote = await getEnviaQuote(zip, qty, country, weightKg, L, H, W);

    if (quote?.ok && quote?.mxn > 0) {
      return jsonResponse(200, {
        ok: true,
        country,
        zip,
        cost: Number(quote.mxn),
        label: buildLabel(country, quote.days, "envia", quote.carrier, quote.service),
        source: "envia",
        meta: {
          qty,
          used_specs: specs?.ok ? "supabase" : "estimate",
          specs_source: specs?.source || "estimate",
          matched_items: specs?.matched || 0,
          dims_cm: { L, W, H },
          weight_kg: Number(weightKg.toFixed(2)),
          zip_validated: zipCheck?.source || "geocodes",
          days: quote.days || null,
        },
      });
    }

    // 3) Fallback seguro
    const fallback = getFallbackShipping(country);
    return jsonResponse(200, {
      ok: true,
      country,
      zip,
      cost: fallback,
      label: buildLabel(country, null, "fallback"),
      source: "fallback",
      meta: {
        qty,
        used_specs: specs?.ok ? "supabase" : "estimate",
        specs_source: specs?.source || "estimate",
        matched_items: specs?.matched || 0,
        zip_validated: zipCheck?.source || "geocodes",
      },
    });
  } catch (e) {
    console.error("[quote_shipping] error:", e?.message || e);
    return jsonResponse(200, { ok: false, error: "QUOTE_FAILED" });
  }
};