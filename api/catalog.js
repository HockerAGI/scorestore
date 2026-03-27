"use strict";

const { jsonResponse, handleOptions, supabaseAdmin, readJsonFile } = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const CATEGORY_CONFIG = [
  {
    uiId: "BAJA1000",
    title: "BAJA 1000",
    logo: "/assets/logo-baja1000.webp",
    mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES", "BAJA_1000_2025"],
  },
  {
    uiId: "BAJA500",
    title: "BAJA 500",
    logo: "/assets/logo-baja500.webp",
    mapFrom: ["BAJA500", "BAJA_500"],
  },
  {
    uiId: "BAJA400",
    title: "BAJA 400",
    logo: "/assets/logo-baja400.webp",
    mapFrom: ["BAJA400", "BAJA_400"],
  },
  {
    uiId: "SF250",
    title: "SAN FELIPE 250",
    logo: "/assets/logo-sf250.webp",
    mapFrom: ["SF250", "SF_250"],
  },
];

const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s || "").trim()
  );

const withNoStore = (resp) => {
  const out = resp || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";
  return out;
};

const send = (res, resp) => {
  const out = withNoStore(resp);
  Object.keys(out.headers || {}).forEach((key) => res.setHeader(key, out.headers[key]));
  res.status(out.statusCode || 200).send(out.body);
};

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v, fallback = "") => {
  const s = String(v ?? "").trim();
  return s || fallback;
};

const arr = (v) => (Array.isArray(v) ? v : []);

const pickImage = (...values) => {
  for (const value of values) {
    const s = str(value);
    if (s) return s;
  }
  return "";
};

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
    const { data: byId } = await sb
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .limit(1)
      .maybeSingle();

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

const normalizeSection = (row) => {
  const rawSectionId = str(row?.section_id || row?.sectionId || row?.id, "");
  const uiId = normalizeSectionIdToUi(rawSectionId) || rawSectionId || "BAJA1000";
  const cfg = CATEGORY_CONFIG.find((c) => c.uiId === uiId);

  const name = str(
    row?.name || row?.title || row?.label,
    cfg?.title || rawSectionId.replaceAll("_", " ") || uiId.replaceAll("_", " ")
  );

  const logo = pickImage(row?.logo, row?.image, row?.cover_image, row?.coverImage, cfg?.logo);

  return {
    id: uiId,
    uiId,
    section_id: rawSectionId || uiId,
    sectionId: rawSectionId || uiId,
    name: cfg?.title || name,
    title: cfg?.title || name,
    image: logo,
    logo,
    count: num(row?.count, 0),
  };
};

const normalizeImages = (value) => {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map(String).map((x) => x.trim()).filter(Boolean);
      } catch {}
    }
    return [s];
  }
  return [];
};

const normalizeProduct = (p) => {
  const sku = str(p?.sku || p?.id);
  if (!sku) return null;

  const images = normalizeImages(p?.images);
  const primary = pickImage(
    p?.img,
    p?.image_url,
    p?.image,
    images[0] || ""
  );

  const sizesRaw = arr(p?.sizes).map(String).map((s) => s.trim()).filter(Boolean);
  const sizes = sizesRaw.length ? sizesRaw : ["S", "M", "L", "XL", "XXL"];

  const priceCents =
    Number.isFinite(Number(p?.price_cents)) && num(p?.price_cents) > 0
      ? Math.max(0, Math.floor(num(p?.price_cents)))
      : Number.isFinite(Number(p?.price_mxn)) && num(p?.price_mxn) > 0
        ? Math.max(0, Math.round(num(p?.price_mxn) * 100))
        : Number.isFinite(Number(p?.base_mxn)) && num(p?.base_mxn) > 0
          ? Math.max(0, Math.round(num(p?.base_mxn) * 100))
          : 0;

  const rawSectionId = str(p?.section_id || p?.sectionId || p?.section || p?.categoryId, "");
  const uiSection = normalizeSectionIdToUi(rawSectionId) || "BAJA1000";
  const collection = str(p?.sub_section || p?.collection, "");

  return {
    id: str(p?.id, sku),
    sku,
    title: str(p?.title || p?.name, "Producto Oficial"),
    name: str(p?.name || p?.title, "Producto Oficial"),
    description: str(p?.description),
    price_cents: priceCents,
    price_mxn: num(p?.price_mxn, 0),
    base_mxn: num(p?.base_mxn, 0),
    sectionId: rawSectionId || uiSection,
    section_id: rawSectionId || uiSection,
    section: rawSectionId || uiSection,
    categoryId: rawSectionId || uiSection,
    uiSection,
    collection,
    sub_section: collection,
    image: primary,
    image_url: primary,
    img: primary,
    images: images.length ? images : primary ? [primary] : [],
    sizes,
    rank: Number.isFinite(Number(p?.rank)) ? Math.round(Number(p.rank)) : 999,
    stock: p?.stock == null ? null : num(p?.stock, 0),
    active: p?.active == null ? true : !!p?.active,
    is_active: p?.is_active == null ? true : !!p?.is_active,
  };
};

const buildSectionsFromProducts = (products) => {
  const sectionMap = new Map();

  for (const item of products) {
    const ui = String(item.uiSection || "BAJA1000").trim();
    const cfg = CATEGORY_CONFIG.find((c) => c.uiId === ui);

    if (!sectionMap.has(ui)) {
      sectionMap.set(ui, {
        id: ui,
        uiId: ui,
        section_id: ui,
        sectionId: ui,
        name: cfg?.title || ui.replaceAll("_", " "),
        title: cfg?.title || ui.replaceAll("_", " "),
        image: cfg?.logo || item.image || item.image_url || "",
        logo: cfg?.logo || item.image || item.image_url || "",
        count: 0,
      });
    }

    sectionMap.get(ui).count += 1;
  }

  return Array.from(sectionMap.values());
};

const normalizePayload = (payload) => {
  const data = payload && typeof payload === "object" ? payload : {};

  const rawSections = Array.isArray(data.sections)
    ? data.sections
    : Array.isArray(data.categories)
      ? data.categories
      : [];

  const rawProducts = Array.isArray(data.products)
    ? data.products
    : Array.isArray(data.items)
      ? data.items
      : [];

  const products = rawProducts.map(normalizeProduct).filter(Boolean);

  let sections = rawSections.map(normalizeSection);

  if (!sections.length) {
    sections = buildSectionsFromProducts(products);
  } else {
    const countByUi = new Map();
    for (const item of products) {
      const key = String(item.uiSection || item.sectionId || "").trim();
      if (!key) continue;
      countByUi.set(key, (countByUi.get(key) || 0) + 1);
    }

    sections = sections.map((s) => {
      const key = String(s?.id || s?.uiId || s?.sectionId || s?.section_id || "").trim();
      const ui = normalizeSectionIdToUi(key) || key || "BAJA1000";
      const cfg = CATEGORY_CONFIG.find((c) => c.uiId === ui);
      return {
        ...s,
        id: ui,
        uiId: ui,
        section_id: key || ui,
        sectionId: key || ui,
        name: cfg?.title || s.name || ui,
        title: cfg?.title || s.title || ui,
        logo: cfg?.logo || s.logo || s.image || "",
        image: cfg?.logo || s.image || s.logo || "",
        count: countByUi.get(ui) || 0,
      };
    });
  }

  return {
    ok: true,
    store: data.store || { name: "SCORE STORE", currency: "MXN", locale: "es-MX" },
    sections,
    categories: sections,
    products,
    items: products,
  };
};

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "";

  if (req.method === "OPTIONS") {
    const optionsRes = handleOptions?.({ headers: { origin } }) || {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };

    return send(res, optionsRes);
  }

  if (req.method !== "GET") {
    return send(res, jsonResponse(405, { ok: false, error: "Method not allowed" }, origin));
  }

  const fallbackRaw =
    readJsonFile("data/catalog.json") || {
      store: { name: "SCORE STORE", currency: "MXN", locale: "es-MX" },
      sections: [],
      products: [],
    };

  const fallback = normalizePayload(fallbackRaw);

  const sb = supabaseAdmin();
  if (!sb) {
    return send(res, jsonResponse(200, fallback, origin));
  }

  try {
    const orgId = await resolveOrgId(sb);

    const { data, error } = await sb
      .from("products")
      .select(
        "id,sku,name,description,price_cents,price_mxn,base_mxn,images,sizes,section_id,sub_section,rank,img,image_url,stock,active,is_active,deleted_at,org_id,organization_id,created_at"
      )
      .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
      .is("deleted_at", null)
      .or("active.eq.true,is_active.eq.true")
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(800);

    if (error || !Array.isArray(data) || data.length === 0) {
      return send(res, jsonResponse(200, fallback, origin));
    }

    const products = data.map(normalizeProduct).filter(Boolean);
    const sections = buildSectionsFromProducts(products);

    const normalized = normalizePayload({
      store: fallback.store,
      sections,
      products,
    });

    return send(res, jsonResponse(200, normalized, origin));
  } catch {
    return send(res, jsonResponse(200, fallback, origin));
  }
};