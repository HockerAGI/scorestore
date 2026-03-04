"use strict";

const { jsonResponse, handleOptions, supabaseAdmin, readJsonFile } = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

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

const resolveOrgId = async (sb) => {
  const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
  if (envId && isUuid(envId)) return String(envId).trim();
  return DEFAULT_SCORE_ORG_ID;
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
      .select("sku,name,description,price_cents,price_mxn,base_mxn,images,sizes,section_id,rank,img,image_url,stock,active,is_active,deleted_at,org_id,organization_id,created_at")
      .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
      .is("deleted_at", null)
      .or("active.eq.true,is_active.eq.true")
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(800);

    if (error || !Array.isArray(data) || data.length === 0) {
      return withNoStore(jsonResponse(200, fallback, origin));
    }

    const products = data
      .map((p) => {
        const sku = String(p?.sku || "").trim();
        if (!sku) return null;

        const images = Array.isArray(p?.images) ? p.images.filter(Boolean).map(String) : [];
        const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes.map(String) : ["S", "M", "L", "XL", "XXL"];

        const priceCents = Number.isFinite(Number(p?.price_cents))
          ? Math.max(0, Math.floor(Number(p.price_cents)))
          : Number.isFinite(Number(p?.price_mxn)) && num(p.price_mxn) > 0
            ? Math.max(0, Math.round(num(p.price_mxn) * 100))
            : Math.max(0, Math.round(num(p?.base_mxn) * 100));

        const primary = (p?.img && String(p.img)) || (p?.image_url && String(p.image_url)) || (images.length ? images[0] : "");

        return {
          sku,
          title: String(p?.name || "Producto Oficial").trim(),
          description: String(p?.description || "").trim(),
          price_cents: priceCents,
          sectionId: String(p?.section_id || "EDICION_2025").trim(),
          images: images.length ? images : primary ? [primary] : [],
          sizes,
          rank: Number.isFinite(Number(p?.rank)) ? Number(p.rank) : 999,
          stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
        };
      })
      .filter(Boolean);

    return withNoStore(jsonResponse(200, { ...fallback, products }, origin));
  } catch {
    return withNoStore(jsonResponse(200, fallback, origin));
  }
};