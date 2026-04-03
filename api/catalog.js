// api/catalog.js
"use strict";

const shared = require("./_shared");

const jsonResponse = shared.jsonResponse;
const handleOptions = shared.handleOptions;
const readJsonFile = shared.readJsonFile;
const getCatalogIndex = shared.getCatalogIndex;
const readPublicSiteSettings = shared.readPublicSiteSettings;
const safeStr = shared.safeStr || ((v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v)));

const DEFAULT_STORE = {
  name: "SCORE STORE",
  currency: "MXN",
  locale: "es-MX",
};

const CATEGORY_CONFIG = [
  {
    uiId: "BAJA1000",
    name: "BAJA 1000",
    title: "BAJA 1000",
    logo: "/assets/logo-baja1000.webp",
    mapFrom: ["BAJA1000", "BAJA_1000", "EDICION_2025", "OTRAS_EDICIONES", "BAJA_1000_2025"],
  },
  {
    uiId: "BAJA500",
    name: "BAJA 500",
    title: "BAJA 500",
    logo: "/assets/logo-baja500.webp",
    mapFrom: ["BAJA500", "BAJA_500"],
  },
  {
    uiId: "BAJA400",
    name: "BAJA 400",
    title: "BAJA 400",
    logo: "/assets/logo-baja400.webp",
    mapFrom: ["BAJA400", "BAJA_400"],
  },
  {
    uiId: "SF250",
    name: "SAN FELIPE 250",
    title: "SAN FELIPE 250",
    logo: "/assets/logo-sf250.webp",
    mapFrom: ["SF250", "SF_250"],
  },
];

function send(res, resp) {
  const out = resp || {};
  out.headers = out.headers || {};
  out.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
  out.headers["Pragma"] = "no-cache";
  out.headers["Expires"] = "0";

  if (out.headers) {
    Object.keys(out.headers).forEach((key) => res.setHeader(key, out.headers[key]));
  }

  res.status(out.statusCode || 200).send(out.body);
}

function cleanText(v, fallback = "") {
  return safeStr(v, fallback).trim();
}

function cleanSku(v) {
  return cleanText(v).replace(/\s+/g, "-");
}

function normalizeSectionToUi(sectionId) {
  const sid = cleanText(sectionId);
  if (!sid) return "BAJA1000";

  const found = CATEGORY_CONFIG.find((c) => c.mapFrom.includes(sid));
  return found ? found.uiId : "BAJA1000";
}

function inferCollection(product) {
  const sid = cleanText(
    product?.sectionId ||
      product?.section_id ||
      product?.section ||
      product?.categoryId ||
      ""
  );

  if (sid === "EDICION_2025") return "Edición 2025";
  if (sid === "OTRAS_EDICIONES") return "Otras ediciones";

  return cleanText(product?.collection || product?.sub_section || "");
}

function safeUrl(input) {
  const value = cleanText(input);
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return `/${value.replace(/^\.?\//, "")}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProduct(row) {
  if (!row || typeof row !== "object") return null;

  const images = Array.isArray(row.images)
    ? row.images
    : row.image_url || row.img || row.image
      ? [row.image_url || row.img || row.image]
      : [];

  const sizes = Array.isArray(row.sizes) && row.sizes.length
    ? row.sizes
    : ["S", "M", "L", "XL", "XXL"];

  const priceFrom =
    Number.isFinite(Number(row.price_cents)) ? Math.round(Number(row.price_cents)) :
    Number.isFinite(Number(row.price_mxn)) ? Math.round(Number(row.price_mxn) * 100) :
    Number.isFinite(Number(row.base_mxn)) ? Math.round(Number(row.base_mxn) * 100) :
    Number.isFinite(Number(row.price)) ? Math.round(Number(row.price) * 100) :
    0;

  const sectionRaw = cleanText(
    row.sectionId || row.section_id || row.section || row.categoryId || ""
  );

  const sku = cleanSku(row.sku || row.id || row.slug || "");
  const name = cleanText(row.name || row.title || "Producto SCORE");
  const title = cleanText(row.title || row.name || "Producto SCORE");
  const description = cleanText(row.description || "");
  const primaryImage = safeUrl(row.image_url || row.img || row.image || images[0] || "");

  return {
    ...row,
    id: cleanText(row.id || sku),
    sku,
    title,
    name,
    description,
    sectionId: sectionRaw,
    section_id: sectionRaw,
    uiSection: normalizeSectionToUi(sectionRaw),
    collection: inferCollection(row),
    sub_section: inferCollection(row),
    category: cleanText(row.category || ""),
    image: primaryImage,
    image_url: primaryImage,
    img: primaryImage,
    images: images.map(safeUrl).filter(Boolean),
    sizes: sizes.map((x) => cleanText(x)).filter(Boolean),
    price_cents: priceFrom,
    price_mxn: Number.isFinite(Number(row.price_mxn)) ? Number(row.price_mxn) : priceFrom / 100,
    base_mxn: Number.isFinite(Number(row.base_mxn)) ? Number(row.base_mxn) : priceFrom / 100,
    rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : 999,
    stock: row.stock == null ? null : toNumber(row.stock, 0),
    active: row.active == null ? true : !!row.active,
    is_active: row.is_active == null ? true : !!row.is_active,
    deleted_at: row.deleted_at || null,
  };
}

function normalizeSection(row) {
  if (!row || typeof row !== "object") return null;

  const id = cleanText(row.id || row.slug || row.section_id || row.sectionId || "");
  if (!id) return null;

  const cfg = CATEGORY_CONFIG.find((c) => c.uiId === id || c.mapFrom.includes(id));

  return {
    id,
    section_id: cleanText(row.section_id || row.sectionId || id),
    sectionId: cleanText(row.sectionId || row.section_id || id),
    uiId: cfg?.uiId || id,
    name: cleanText(row.name || row.title || cfg?.title || id.replaceAll("_", " ")),
    title: cleanText(row.title || row.name || cfg?.title || id.replaceAll("_", " ")),
    logo: safeUrl(row.logo || row.image || row.cover_image || row.coverImage || cfg?.logo || ""),
    image: safeUrl(row.image || row.logo || row.cover_image || row.coverImage || cfg?.logo || ""),
    count: Number.isFinite(Number(row.count)) ? Math.max(0, Math.round(Number(row.count))) : 0,
    rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : 999,
  };
}

function buildSectionsFromProducts(products) {
  const sectionMap = new Map();

  for (const item of Array.isArray(products) ? products : []) {
    const key = cleanText(item.uiSection || item.sectionId || item.section_id || "");
    if (!key) continue;

    if (!sectionMap.has(key)) {
      const cfg = CATEGORY_CONFIG.find((c) => c.uiId === key);
      sectionMap.set(key, {
        id: key,
        section_id: key,
        sectionId: key,
        uiId: key,
        name: cfg?.title || key.replaceAll("_", " "),
        title: cfg?.title || key.replaceAll("_", " "),
        logo: cfg?.logo || item.image || item.image_url || "",
        image: cfg?.logo || item.image || item.image_url || "",
        count: 0,
      });
    }

    sectionMap.get(key).count += 1;
  }

  return Array.from(sectionMap.values());
}

function countBySection(products) {
  const out = new Map();
  for (const item of Array.isArray(products) ? products : []) {
    const key = cleanText(item.uiSection || item.sectionId || item.section_id || "");
    if (!key) continue;
    out.set(key, (out.get(key) || 0) + 1);
  }
  return out;
}

function attachCounts(sections, products) {
  const counts = countBySection(products);
  return (Array.isArray(sections) ? sections : []).map((section) => {
    const key = cleanText(section.id || section.sectionId || section.section_id || section.uiId || "");
    return {
      ...section,
      count: counts.get(key) || 0,
    };
  });
}

function matchesSearch(product, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    product?.sku,
    product?.name,
    product?.title,
    product?.description,
    product?.collection,
    product?.sub_section,
    product?.sectionId,
    product?.uiSection,
    product?.category,
  ]
    .map((v) => cleanText(v).toLowerCase())
    .join(" | ");

  return haystack.includes(q);
}

function matchesSection(product, section) {
  if (!section) return true;
  const target = cleanText(section).toUpperCase();
  if (!target) return true;

  const candidates = [
    cleanText(product?.uiSection).toUpperCase(),
    cleanText(product?.sectionId).toUpperCase(),
    cleanText(product?.section_id).toUpperCase(),
  ];

  return candidates.includes(target);
}

function shouldIncludeInactive(req) {
  const value =
    req.query?.include_inactive ||
    req.query?.includeInactive ||
    req.query?.drafts ||
    "0";

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parsePayload(raw) {
  const data = raw && typeof raw === "object" ? raw : {};

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
  let sections = rawSections.map(normalizeSection).filter(Boolean);

  if (!sections.length) {
    sections = buildSectionsFromProducts(products);
  } else {
    sections = attachCounts(sections, products);
  }

  return {
    ok: true,
    store: data.store && typeof data.store === "object" ? data.store : DEFAULT_STORE,
    sections,
    categories: sections,
    products,
    items: products,
  };
}

async function loadCatalogSource() {
  const fromJson = readJsonFile ? readJsonFile("data/catalog.json") : null;
  if (fromJson && typeof fromJson === "object") return fromJson;

  if (typeof getCatalogIndex === "function") {
    try {
      const out = getCatalogIndex();
      if (out?.catalog && typeof out.catalog === "object") return out.catalog;
    } catch {}
  }

  return { products: [], sections: [], categories: [] };
}

async function loadStoreInfo() {
  const defaults = { ...DEFAULT_STORE };

  try {
    if (typeof readPublicSiteSettings === "function") {
      const site = await readPublicSiteSettings();
      if (site && typeof site === "object") {
        const title = cleanText(site.hero_title || "");
        if (title) defaults.name = title;
      }
    }
  } catch {}

  return defaults;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "*";

  try {
    if (req.method === "OPTIONS") {
      const optionsRes =
        handleOptions?.({ headers: { origin } }) ||
        {
          statusCode: 204,
          headers: {
            "Access-Control-Allow-Origin": origin,
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

    const rawCatalog = await loadCatalogSource();
    const store = await loadStoreInfo();
    const normalized = parsePayload({
      ...rawCatalog,
      store: {
        ...(rawCatalog?.store && typeof rawCatalog.store === "object" ? rawCatalog.store : {}),
        ...store,
      },
    });

    const q = cleanText(req.query?.q || req.query?.search || "");
    const section = cleanText(req.query?.section || req.query?.sectionId || req.query?.uiSection || "");
    const includeInactive = shouldIncludeInactive(req);

    let products = Array.isArray(normalized.products) ? [...normalized.products] : [];

    if (!includeInactive) {
      products = products.filter((p) => p.deleted_at == null && p.active !== false && p.is_active !== false);
    }

    if (section) {
      products = products.filter((p) => matchesSection(p, section));
    }

    if (q) {
      products = products.filter((p) => matchesSearch(p, q));
    }

    let sections = Array.isArray(normalized.sections) ? [...normalized.sections] : [];
    if (section || q || !includeInactive) {
      sections = attachCounts(
        sections.length ? sections : buildSectionsFromProducts(products),
        products
      );
    }

    const payload = {
      ok: true,
      store: normalized.store || store,
      sections,
      categories: sections,
      products,
      items: products,
      count: products.length,
      sections_count: sections.length,
      updated_at: new Date().toISOString(),
    };

    return send(res, jsonResponse(200, payload, origin));
  } catch (error) {
    return send(
      res,
      jsonResponse(
        500,
        {
          ok: false,
          error: String(error?.message || error || "No se pudo cargar el catálogo"),
        },
        origin
      )
    );
  }
};