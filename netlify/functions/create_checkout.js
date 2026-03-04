"use strict";

const {
  jsonResponse,
  handleOptions,
  readJsonFile,
  isAllowedOrigin,
  getStripe,
  getEnviaQuote,
  supabaseAdmin,
} = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normCode = (s) => String(s || "").trim().toUpperCase().replace(/\s+/g, "");

const clampInt = (v, a, b) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
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

const loadLocalCatalogIndex = () => {
  const cat = readJsonFile("data/catalog.json");
  const map = new Map();
  for (const p of Array.isArray(cat?.products) ? cat.products : []) {
    const sku = String(p?.sku || "").trim();
    if (!sku) continue;

    const priceCents = Number.isFinite(Number(p?.price_cents)) ? Math.floor(Number(p.price_cents)) : 0;
    const title = String(p?.title || p?.name || "Producto Oficial").trim();
    const images = Array.isArray(p?.images) ? p.images.filter(Boolean).map(String) : p?.img ? [String(p.img)] : [];
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes.map(String) : ["S", "M", "L", "XL", "XXL"];

    map.set(sku, {
      sku,
      title,
      description: String(p?.description || "").trim(),
      priceCents,
      sizes,
      images,
      stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
    });
  }
  return map;
};

const loadLocalPromos = () => readJsonFile("data/promos.json") || { rules: [] };

const getProductsFromDB = async (sb, orgId, skus) => {
  const { data, error } = await sb
    .from("products")
    .select(
      "sku,name,description,price_cents,price_mxn,base_mxn,images,sizes,img,image_url,stock,active,is_active,deleted_at,org_id,organization_id"
    )
    .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
    .in("sku", skus)
    .is("deleted_at", null)
    .or("active.eq.true,is_active.eq.true")
    .limit(200);

  if (error) throw error;

  const map = new Map();

  for (const p of Array.isArray(data) ? data : []) {
    const sku = String(p?.sku || "").trim();
    if (!sku) continue;

    const images = Array.isArray(p?.images) ? p.images.filter(Boolean).map(String) : [];
    const sizes = Array.isArray(p?.sizes) && p.sizes.length ? p.sizes.map(String) : null;

    const priceCents = Number.isFinite(Number(p?.price_cents))
      ? Math.max(0, Math.floor(Number(p.price_cents)))
      : Number.isFinite(Number(p?.price_mxn)) && num(p.price_mxn) > 0
        ? Math.max(0, Math.round(num(p.price_mxn) * 100))
        : Math.max(0, Math.round(num(p?.base_mxn) * 100));

    const primary = (p?.img && String(p.img)) || (p?.image_url && String(p.image_url)) || (images.length ? images[0] : "");

    map.set(sku, {
      sku,
      title: String(p?.name || "Producto Oficial").trim(),
      description: String(p?.description || "").trim(),
      priceCents,
      sizes: sizes || ["S", "M", "L", "XL", "XXL"],
      images: images.length ? images : primary ? [primary] : [],
      stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
    });
  }

  return map;
};

const getPromoFromDB = async (sb, orgId, code) => {
  const c = normCode(code);
  if (!c) return null;

  const { data } = await sb
    .from("promo_rules")
    .select("code,type,value,description,active,min_amount_mxn,expires_at")
    .eq("organization_id", orgId)
    .ilike("code", c)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!data?.code) return null;

  const expOk = !data.expires_at || Date.now() <= new Date(data.expires_at).getTime();
  if (!expOk) return null;

  return {
    code: String(data.code || "").trim(),
    type: String(data.type || "").trim(),
    value: num(data.value),
    description: String(data.description || "").trim(),
    min_amount_mxn: num(data.min_amount_mxn),
  };
};

const getPromoFromLocal = (promosData, code) => {
  const c = normCode(code);
  const rules = Array.isArray(promosData?.rules) ? promosData.rules : [];
  const r = rules.find((x) => normCode(x?.code) === c && !!x?.active);
  if (!r) return null;

  const expOk = !r.expires_at || Date.now() <= new Date(r.expires_at).getTime();
  if (!expOk) return null;

  return {
    code: String(r.code || "").trim(),
    type: String(r.type || "").trim(),
    value: num(r.value),
    description: String(r.description || "").trim(),
    min_amount_mxn: num(r.min_amount_mxn),
  };
};

function cloneLineItem(li, unitAmount, qty) {
  const out = JSON.parse(JSON.stringify(li));
  out.price_data.unit_amount = Math.max(0, Math.floor(Number(unitAmount) || 0));
  out.quantity = Math.max(1, Math.floor(Number(qty) || 1));
  return out;
}

function sumLineItemsCents(items) {
  let s = 0;
  for (const li of Array.isArray(items) ? items : []) {
    const u = Number(li?.price_data?.unit_amount || 0) || 0;
    const q = Number(li?.quantity || 0) || 0;
    s += Math.max(0, u) * Math.max(0, q);
  }
  return s;
}

function applyFixedDiscount(lineItems, discountCents) {
  let remaining = Math.max(0, Math.floor(Number(discountCents) || 0));
  if (!remaining) return { lineItems, discountApplied: 0 };

  const out = [];
  let applied = 0;

  for (const li of lineItems) {
    if (remaining <= 0) {
      out.push(li);
      continue;
    }

    const u = Number(li?.price_data?.unit_amount || 0) || 0;
    const q = Number(li?.quantity || 0) || 0;

    if (u <= 0 || q <= 0) {
      out.push(li);
      continue;
    }

    const maxReduce = u * q;
    const take = Math.min(remaining, maxReduce);

    const baseReduce = Math.floor(take / q);
    const extraUnits = take % q;

    const u1 = Math.max(0, u - baseReduce);
    const u2 = Math.max(0, u - baseReduce - 1);

    if (extraUnits > 0) {
      out.push(cloneLineItem(li, u2, extraUnits));
      if (q - extraUnits > 0) out.push(cloneLineItem(li, u1, q - extraUnits));
    } else {
      out.push(cloneLineItem(li, u1, q));
    }

    remaining -= take;
    applied += take;
  }

  return { lineItems: out, discountApplied: applied };
}

function applyPromoToLineItems(lineItems, promo, subtotalCents) {
  if (!promo) return { lineItems, discountApplied: 0, freeShipping: false };

  const type = String(promo.type || "").toLowerCase();

  if (type === "free_shipping") {
    return { lineItems, discountApplied: 0, freeShipping: true };
  }

  if (type === "percent") {
    const raw = num(promo.value);
    const frac = Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
    const discountCents = Math.round(Math.max(0, subtotalCents) * frac);
    return { ...applyFixedDiscount(lineItems, discountCents), freeShipping: false };
  }

  if (type === "fixed_mxn") {
    const discountCents = Math.round(Math.max(0, num(promo.value)) * 100);
    return { ...applyFixedDiscount(lineItems, discountCents), freeShipping: false };
  }

  return { lineItems, discountApplied: 0, freeShipping: false };
}

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  if (event.httpMethod === "OPTIONS") return handleOptions(event);
  if (event.httpMethod !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);

  const reqOrigin = event?.headers?.origin || event?.headers?.Origin || "";
  if (reqOrigin && !isAllowedOrigin(reqOrigin)) {
    return jsonResponse(403, { ok: false, error: "Origin no permitido" }, origin);
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return jsonResponse(400, { ok: false, error: "Carrito vacío" }, origin);

    const reqId = String(body?.req_id || "").trim();
    if (reqId && reqId.length > 120) return jsonResponse(400, { ok: false, error: "req_id inválido" }, origin);

    const shipping_mode = String(body?.shipping_mode || "pickup").trim();
    const postal_code = String(body?.postal_code || "").trim();
    const promo_code = normCode(body?.promo_code);

    const normalizedItems = items
      .map((it) => ({
        sku: String(it?.sku || "").trim(),
        qty: clampInt(it?.qty, 1, 99),
        size: String(it?.size || "").trim() || "Unitalla",
      }))
      .filter((it) => it.sku);

    if (!normalizedItems.length) return jsonResponse(400, { ok: false, error: "Items inválidos" }, origin);

    const skuList = Array.from(new Set(normalizedItems.map((i) => i.sku))).slice(0, 80);

    const sb = supabaseAdmin();
    let orgId = DEFAULT_SCORE_ORG_ID;
    let productsIndex = null;
    let promoRule = null;

    if (sb) {
      orgId = await resolveOrgId(sb);
      productsIndex = await getProductsFromDB(sb, orgId, skuList).catch(() => null);
      promoRule = promo_code ? await getPromoFromDB(sb, orgId, promo_code).catch(() => null) : null;
    }

    if (!productsIndex) productsIndex = loadLocalCatalogIndex();
    if (!promoRule && promo_code) promoRule = getPromoFromLocal(loadLocalPromos(), promo_code);

    let line_items = [];
    let itemsQty = 0;

    for (const it of normalizedItems) {
      const p = productsIndex.get(it.sku);
      if (!p) return jsonResponse(400, { ok: false, error: `SKU no encontrado: ${it.sku}` }, origin);

      const title = String(p.title || p.name || "Producto Oficial").trim();
      const unitPrice = Math.max(0, Number(p.priceCents || p.price_cents || 0));
      if (!unitPrice) return jsonResponse(400, { ok: false, error: `Precio inválido: ${it.sku}` }, origin);

      const stock = Number(p.stock);
      if (Number.isFinite(stock) && stock <= 0) {
        return jsonResponse(409, { ok: false, error: `Sin stock: ${it.sku}` }, origin);
      }

      itemsQty += it.qty;

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: title + (it.size ? ` (${it.size})` : ""),
            metadata: { sku: it.sku, size: it.size },
          },
          unit_amount: unitPrice,
        },
        quantity: it.qty,
      });
    }

    const subtotalCents = sumLineItemsCents(line_items);

    if (promoRule) {
      const min = num(promoRule.min_amount_mxn) || 0;
      const subtotalMXN = subtotalCents / 100;
      if (subtotalMXN < min) promoRule = null;
    }

    const promoApplied = applyPromoToLineItems(line_items, promoRule, subtotalCents);
    line_items = promoApplied.lineItems;

    const needsZip = shipping_mode === "envia_mx" || shipping_mode === "envia_us";
    let shippingCents = 0;
    let shippingCountry = "MX";

    if (shipping_mode === "pickup") {
      shippingCents = 0;
    } else if (needsZip) {
      shippingCountry = shipping_mode === "envia_us" ? "US" : "MX";
      if (postal_code.length < 4) return jsonResponse(400, { ok: false, error: "CP/ZIP inválido" }, origin);

      const shippingQuote = await getEnviaQuote({ zip: postal_code, country: shippingCountry, items_qty: itemsQty });
      shippingCents = Math.max(0, Number(shippingQuote?.amount_cents || 0));
    } else {
      return jsonResponse(400, { ok: false, error: "shipping_mode inválido" }, origin);
    }

    const freeShipping = !!promoApplied.freeShipping;
    const finalShippingCents = freeShipping ? 0 : shippingCents;

    const pmTypes = ["card"];
    if (String(process.env.STRIPE_ENABLE_OXXO || "0") === "1") pmTypes.push("oxxo");

    const SITE_URL = String(process.env.SITE_URL || "https://scorestore.netlify.app").replace(/\/+$/, "");
    const stripe = getStripe();

    const sessionParams = {
      mode: "payment",
      payment_method_types: pmTypes,
      line_items,
      allow_promotion_codes: false,
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/index.html`,
      billing_address_collection: "auto",
      locale: "es",
      customer_creation: "always",
      metadata: {
        org_id: orgId,
        shipping_mode,
        postal_code: needsZip ? postal_code : "",
        promo_code: promoRule?.code || "",
        promo_type: promoRule?.type || "",
      },
      shipping_address_collection: shipping_mode === "pickup" ? undefined : { allowed_countries: [shippingCountry] },
      shipping_options:
        shipping_mode === "pickup"
          ? undefined
          : [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  fixed_amount: { amount: finalShippingCents, currency: "mxn" },
                  display_name: shippingCountry === "US" ? "Envío USA (Envía.com)" : "Envío MX (Envía.com)",
                  delivery_estimate: {
                    minimum: { unit: "business_day", value: shippingCountry === "US" ? 5 : 2 },
                    maximum: { unit: "business_day", value: shippingCountry === "US" ? 12 : 6 },
                  },
                },
              },
            ],
    };

    const idempotencyKey = reqId ? `scorestore_${reqId}` : undefined;
    const session = await stripe.checkout.sessions.create(sessionParams, idempotencyKey ? { idempotencyKey } : undefined);

    return jsonResponse(200, { ok: true, url: session.url }, origin);
  } catch (e) {
    return jsonResponse(500, { ok: false, error: String(e?.message || e) }, origin);
  }
};