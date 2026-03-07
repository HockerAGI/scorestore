"use strict";

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  readJsonFile,
  getEnviaQuote,
  initStripe,
  supabaseAdmin,
} = require("./_shared");

const DEFAULT_SCORE_ORG_ID = "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";

const isUuid = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const safeStr = (v, d = "") => (typeof v === "string" ? v : v == null ? d : String(v));

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

const loadLocalCatalogIndex = () => {
  const cat = readJsonFile("data/catalog.json") || { products: [] };
  const map = new Map();

  for (const p of Array.isArray(cat?.products) ? cat.products : []) {
    const sku = String(p?.sku || "").trim();
    if (!sku) continue;
    map.set(sku, p);
  }

  return map;
};

const loadLocalPromos = () => readJsonFile("data/promos.json") || { rules: [] };

const getProductsFromDB = async (sb, orgId, skus) => {
  const { data, error } = await sb
    .from("products")
    .select("sku,name,description,price_cents,price_mxn,images,sizes,image_url,stock,is_active,deleted_at")
    .or(`organization_id.eq.${orgId},org_id.eq.${orgId}`)
    .in("sku", skus)
    .is("deleted_at", null)
    .eq("is_active", true)
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
      : Math.max(0, Math.round(num(p?.price_mxn) * 100));

    map.set(sku, {
      sku,
      title: String(p?.name || "Producto Oficial").trim(),
      description: String(p?.description || "").trim(),
      priceCents,
      sizes: sizes || ["S", "M", "L", "XL", "XXL"],
      images: images.length ? images : p?.image_url ? [String(p.image_url)] : [],
      stock: Number.isFinite(Number(p?.stock)) ? Number(p.stock) : null,
    });
  }

  return map;
};

const getPromoFromDB = async (sb, orgId, code) => {
  const c = normCode(code);
  if (!c) return null;

  const { data, error } = await sb
    .from("promo_rules")
    .select("code,type,value,description,active,min_amount_mxn,expires_at")
    .or(`organization_id.eq.${orgId},org_id.eq.${orgId}`)
    .ilike("code", c)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.code) return null;

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

const normalizeFrontendPromo = (promo) => {
  if (!promo || typeof promo !== "object") return null;
  const code = normCode(promo.code);
  if (!code) return null;

  return {
    code,
    type: String(promo.type || "").trim(),
    value: num(promo.value),
    description: String(promo.description || "").trim(),
    min_amount_mxn: num(promo.min_amount_mxn),
  };
};

const sumLineItemsCents = (lineItems) =>
  (Array.isArray(lineItems) ? lineItems : []).reduce((acc, li) => {
    const qty = Math.max(1, Math.floor(Number(li?.quantity || 1)));
    const unitAmount = Math.max(0, Math.floor(Number(li?.price_data?.unit_amount || 0)));
    return acc + unitAmount * qty;
  }, 0);

function cloneLineItem(li, unitAmount, qty) {
  const out = JSON.parse(JSON.stringify(li));
  out.price_data.unit_amount = Math.max(0, Math.floor(Number(unitAmount || 0)));
  out.quantity = Math.max(1, Math.floor(Number(qty || 1)));
  return out;
}

function applyPromoToLineItems(lineItems, promoRule, subtotalCents) {
  if (!promoRule || !Array.isArray(lineItems) || !lineItems.length) {
    return {
      lineItems,
      freeShipping: false,
      discountCents: 0,
    };
  }

  const type = String(promoRule.type || "").toLowerCase().trim();
  const value = num(promoRule.value);

  if (type === "free_shipping") {
    return {
      lineItems,
      freeShipping: true,
      discountCents: 0,
    };
  }

  if (type === "fixed") {
    const discountCents = Math.max(0, Math.round(value * 100));
    const remaining = Math.max(0, subtotalCents - discountCents);
    const ratio = subtotalCents > 0 ? remaining / subtotalCents : 1;

    const out = lineItems.map((li) => {
      const baseUnit = Math.max(0, Math.floor(Number(li?.price_data?.unit_amount || 0)));
      const nextUnit = Math.max(1, Math.round(baseUnit * ratio));
      return cloneLineItem(li, nextUnit, li.quantity);
    });

    return {
      lineItems: out,
      freeShipping: false,
      discountCents: discountCents,
    };
  }

  if (type === "percent" || type === "percentage") {
    const ratio = Math.max(0, 1 - value / 100);
    const discountCents = Math.max(0, Math.round(subtotalCents * (value / 100)));

    const out = lineItems.map((li) => {
      const baseUnit = Math.max(0, Math.floor(Number(li?.price_data?.unit_amount || 0)));
      const nextUnit = Math.max(1, Math.round(baseUnit * ratio));
      return cloneLineItem(li, nextUnit, li.quantity);
    });

    return {
      lineItems: out,
      freeShipping: false,
      discountCents,
    };
  }

  return {
    lineItems,
    freeShipping: false,
    discountCents: 0,
  };
}

async function seedPendingOrder(sb, payload) {
  if (!sb || !payload?.stripe_session_id) return;

  const { error } = await sb.from("orders").upsert(payload, {
    onConflict: "stripe_session_id",
  });

  if (error) throw error;
}

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || "*";

  if (event.httpMethod === "OPTIONS") return handleOptions(event);
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" }, origin);
  }

  try {
    const stripe = initStripe();
    const body = safeJsonParse(event.body) || {};

    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return jsonResponse(400, { ok: false, error: "Carrito vacío" }, origin);

    const reqId = String(body?.req_id || "").trim();
    const shipping_mode = String(body?.ship_mode || body?.shipping_mode || "pickup").trim();
    const postal_code = String(body?.postal_code || body?.zip || "").trim();
    const promo_code = normCode(body?.promo_code || body?.coupon || body?.promo?.code || "");

    const normalizedItems = items
      .map((it) => ({
        sku: String(it?.sku || "").trim(),
        qty: clampInt(it?.qty, 1, 99),
        size: String(it?.size || "").trim() || "Unitalla",
      }))
      .filter((it) => it.sku);

    if (!normalizedItems.length) {
      return jsonResponse(400, { ok: false, error: "Items inválidos" }, origin);
    }

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
    if (!promoRule && body?.promo) promoRule = normalizeFrontendPromo(body.promo);

    let line_items = [];
    let itemsQty = 0;
    let pendingItems = [];

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

      pendingItems.push({
        sku: it.sku,
        size: it.size,
        name: title,
        qty: it.qty,
        unit_amount_mxn: unitPrice / 100,
        amount_total_mxn: (unitPrice * it.qty) / 100,
        currency: "MXN",
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

      const frontendQuoted = Math.max(
        0,
        Math.floor(Number(body?.shipping_amount_cents || body?.shippingAmountCents || 0))
      );

      if (frontendQuoted > 0) {
        shippingCents = frontendQuoted;
      } else {
        if (postal_code.length < 4) {
          return jsonResponse(400, { ok: false, error: "CP/ZIP inválido" }, origin);
        }

        const shippingQuote = await getEnviaQuote({
          zip: postal_code,
          country: shippingCountry,
          items_qty: itemsQty,
        });

        shippingCents = Math.max(0, Number(shippingQuote?.amount_cents || 0));
      }
    } else {
      return jsonResponse(400, { ok: false, error: "shipping_mode inválido" }, origin);
    }

    const freeShipping = !!promoApplied.freeShipping;
    const finalShippingCents = freeShipping ? 0 : shippingCents;

    const SITE_URL = String(process.env.SITE_URL || "https://scorestore.netlify.app").replace(/\/+$/, "");
    const pmTypes = ["card"];
    if (String(process.env.STRIPE_ENABLE_OXXO || "0") === "1") pmTypes.push("oxxo");

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
        organization_id: orgId,
        shipping_mode,
        postal_code: needsZip ? postal_code : "",
        promo_code: promoRule?.code || "",
        promo_type: promoRule?.type || "",
        promo_value: promoRule?.value != null ? String(promoRule.value) : "",
      },
      shipping_address_collection:
        shipping_mode === "pickup"
          ? undefined
          : { allowed_countries: [shippingCountry] },
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
    const session = await stripe.checkout.sessions.create(
      sessionParams,
      idempotencyKey ? { idempotencyKey } : undefined
    );

    if (sb && session?.id) {
      await seedPendingOrder(sb, {
        org_id: orgId,
        organization_id: orgId,
        stripe_session_id: session.id,
        currency: "MXN",
        amount_total_mxn: (sumLineItemsCents(line_items) + finalShippingCents) / 100,
        amount_subtotal_mxn: sumLineItemsCents(line_items) / 100,
        amount_shipping_mxn: finalShippingCents / 100,
        amount_discount_mxn: promoApplied.discountCents / 100,
        shipping_total_mxn: finalShippingCents / 100,
        status: "pending_payment",
        items: pendingItems,
        metadata: {
          org_id: orgId,
          organization_id: orgId,
          shipping_mode,
          postal_code: needsZip ? postal_code : "",
          promo_code: promoRule?.code || "",
          promo_type: promoRule?.type || "",
          promo_value: promoRule?.value != null ? String(promoRule.value) : "",
        },
        updated_at: new Date().toISOString(),
      }).catch((e) => {
        console.warn("[create_checkout] warn pending order upsert:", e?.message);
      });
    }

    return jsonResponse(
      200,
      {
        ok: true,
        url: session.url,
      },
      origin
    );
  } catch (e) {
    return jsonResponse(500, { ok: false, error: String(e?.message || e) }, origin);
  }
};