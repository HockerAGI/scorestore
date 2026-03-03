"use strict";

const { jsonResponse, handleOptions, supabaseAdmin, readJsonFile } = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

// Misma lógica de categorías que tu js/main.js (CATEGORY_CONFIG)
const CATEGORY_CONFIG = [
  { uiId: "BAJA1000", mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES"] },
  { uiId: "BAJA500", mapFrom: ["BAJA500", "BAJA_500"] },
  { uiId: "BAJA400", mapFrom: ["BAJA400", "BAJA_400"] },
  { uiId: "SF250", mapFrom: ["SF250", "SF_250"] },
];

const normalizeSectionIdToUi = (sectionId) => {
  const sid = String(sectionId || "").trim();
  const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
  return found ? found.uiId : null;
};

const resolveOrgId = async (sb) => {
  const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (envId && isUuid(envId)) return String(envId).trim();

  let orgId = DEFAULT_SCORE_ORG_ID;

  try {
    const { data: byId } = await sb.from("organizations").select("id").eq("id", orgId).limit(1).maybeSingle();
    if (byId?.id) return orgId;

    const { data: byName } = await sb
      .from("organizations")
      .select("id")
      .ilike("name", "%score%")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (byName?.id) orgId = byName.id;
  } catch {}

  return orgId;
};

const withNoStore = (resp) => {
  resp.headers = resp.headers || {};
  resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  resp.headers["Pragma"] = "no-cache";
  resp.headers["Expires"] = "0";
  return resp;
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  if (event.httpMethod === "OPTIONS") return handleOptions(event);
  if (event.httpMethod !== "GET") return withNoStore(jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));

  const fallback =
    readJsonFile("data/catalog.json") || {
      store: { name: "SCORE STORE", currency: "MXN", locale: "es-MX" },
      sections: [],
      products: [],
    };

  const sb = supabaseAdmin();
  if (!sb) return withNoStore(jsonResponse(200, fallback, origin));

  try {
    const orgId = await resolveOrgId(sb);

    const { data, error } = await sb
      .from("products")
      .select("sku,name,description,price_cents,price_mxn,images,sizes,section_id,rank,image_url,collection,category")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(800);

    // Si la tabla no existe o falla, cae a JSON local
    if (error || !Array.isArray(data) || data.length === 0) {
      return withNoStore(jsonResponse(200, fallback, origin));
    }

    const products = data
      .map((p) => {
        const sku = String(p?.sku || "").trim();
        if (!sku) return null;

        const priceCents = Number.isFinite(Number(p?.price_cents))
          ? Math.max(0, Math.floor(Number(p.price_cents)))
          : Math.max(0, Math.round(num(p?.price_mxn) * 100));

        const images = Array.isArray(p?.images) ? p.images.filter(Boolean).map(String) : [];
        const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes.map(String) : ["S", "M", "L", "XL", "XXL"];

        return {
          sku,
          title: String(p?.name || "Producto Oficial").trim(),
          description: String(p?.description || "").trim(),
          price_cents: priceCents,
          sectionId: String(p?.section_id || "EDICION_2025").trim(),
          collection: String(p?.collection || "").trim() || undefined,
          rank: Number.isFinite(Number(p?.rank)) ? Number(p.rank) : 999,
          sizes,
          images: images.length ? images : (p?.image_url ? [String(p.image_url)] : []),
        };
      })
      .filter(Boolean);

    // Actualiza counts de secciones (para que sea coherente con tu UI)
    const countByUi = new Map();
    for (const pr of products) {
      const ui = normalizeSectionIdToUi(pr.sectionId) || pr.sectionId;
      countByUi.set(ui, (countByUi.get(ui) || 0) + 1);
    }

    const sections = Array.isArray(fallback.sections)
      ? fallback.sections.map((s) => {
          const id = String(s?.id || "").trim();
          return { ...s, count: countByUi.get(id) || 0 };
        })
      : [];

    const out = { ...fallback, sections, products };
    return withNoStore(jsonResponse(200, out, origin));
  } catch {
    return withNoStore(jsonResponse(200, fallback, origin));
  }
};