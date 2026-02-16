const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

const {
  jsonResponse,
  handleOptions,
  safeJsonParse,
  validateZip,
  itemsQtyFromAny,
  getEnviaQuote,
  isSupabaseConfigured,
  supabase,
} = require("./_shared");

function clampInt(n, min, max) {
  const v = Math.floor(Number(n) || 0);
  return Math.max(min, Math.min(max, v));
}

function normCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function loadCatalog() {
  const file = path.join(process.cwd(), "data", "catalog.json");
  const raw = fs.readFileSync(file, "utf-8");
  return JSON.parse(raw);
}

function loadPromos() {
  const file = path.join(process.cwd(), "data", "promos.json");
  const raw = fs.readFileSync(file, "utf-8");
  return JSON.parse(raw);
}

function baseUrlFrom(event, body) {
  const origin = String(body?.origin || "").trim();
  if (origin.startsWith("http://") || origin.startsWith("https://")) return origin;
  const proto = (event.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = event.headers.host;
  return `${proto}://${host}`;
}

async function getOrCreateCoupon(stripe, promo) {
  const cid = `PROMO_${normCode(promo.code)}`.slice(0, 50);

  try {
    const existing = await stripe.coupons.retrieve(cid);
    if (existing && !existing.deleted) return existing.id;
  } catch (_) {}

  const params = {
    id: cid,
    name: promo.code,
    duration: "once",
    metadata: { source: "scorestore", promo_code: promo.code },
  };

  if (promo.type === "percent") {
    params.percent_off = Number(promo.value);
  } else if (promo.type === "fixed_mxn") {
    params.amount_off = Math.round(Number(promo.value) * 100);
    params.currency = "mxn";
  } else {
    return null;
  }

  const created = await stripe.coupons.create(params);
  return created.id;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return handleOptions();
    if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) return jsonResponse(500, { error: "STRIPE_SECRET_KEY no configurada" });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const body = safeJsonParse(event.body);

    const itemsIn = Array.isArray(body.items) ? body.items : [];
    if (!itemsIn.length) return jsonResponse(400, { error: "Carrito vacío" });

    const shipping_mode = String(body.shipping_mode || "").toLowerCase() || "pickup";
    const postal_code = String(body.postal_code || "").trim();
    const promo_code_raw = String(body.promo_code || "").trim();

    const catalog = loadCatalog();
    const skuMap = new Map(catalog.products.map((p) => [p.sku, p]));

    const baseUrl = baseUrlFrom(event, body);
    const line_items = [];

    for (const it of itemsIn) {
      const sku = String(it.sku || "").trim();
      const qty = clampInt(it.qty, 1, 99);
      const size = String(it.size || "").trim().slice(0, 10) || "M";

      const p = skuMap.get(sku);
      if (!p) return jsonResponse(400, { error: `SKU inválido: ${sku}` });

      line_items.push({
        quantity: qty,
        price_data: {
          currency: "mxn",
          unit_amount: Number(p.price_cents),
          product_data: {
            name: p.name,
            description: size ? `Talla: ${size}` : undefined,
            images: [baseUrl + encodeURI(p.img)],
            metadata: { sku: p.sku, product_id: p.id, size, section: p.sectionId },
          },
        },
      });
    }

    const items_qty = itemsQtyFromAny(itemsIn);

    // Shipping
    let shippingAmountCents = 0;
    let shippingService = "";
    const needsAddress = shipping_mode !== "pickup";

    if (shipping_mode === "envia_mx" || shipping_mode === "envia_us") {
      if (!validateZip(postal_code)) return jsonResponse(400, { error: "Código postal inválido" });

      const country = shipping_mode === "envia_us" ? "US" : "MX";
      const quote = await getEnviaQuote({ zip: postal_code, country, items_qty });

      const mxn = Number(quote?.amount_mxn ?? quote?.amount ?? 0) || 0;
      shippingAmountCents = Math.round(mxn * 100);
      shippingService = quote?.label || "";
    }

    // Promo
    let promo = null;
    let couponId = null;
    const promo_code = normCode(promo_code_raw);

    if (promo_code) {
      const promosDb = loadPromos();
      promo = promosDb.promos.find((p) => String(p.code || "").trim().toUpperCase() === promo_code && p.active);
      if (!promo) return jsonResponse(400, { error: "Código promocional inválido" });

      const sub_mxn = line_items.reduce((sum, li) => sum + (li.price_data.unit_amount * li.quantity) / 100, 0);
      if (promo.min_subtotal_mxn && sub_mxn < promo.min_subtotal_mxn) {
        return jsonResponse(400, { error: `Mínimo ${promo.min_subtotal_mxn} MXN para aplicar` });
      }

      if (promo.type === "free_shipping") {
        shippingAmountCents = 0;
      } else if (promo.type === "percent" || promo.type === "fixed_mxn") {
        couponId = await getOrCreateCoupon(stripe, promo);
      }
    }

    // Shipping line item (solo si aplica y > 0)
    if (shipping_mode !== "pickup" && shippingAmountCents > 0) {
      const shippingLabel =
        shipping_mode === "envia_us"
          ? `Envío USA (Envia.com${shippingService ? " — " + shippingService : ""})`
          : `Envío Nacional (Envia.com${shippingService ? " — " + shippingService : ""})`;

      line_items.push({
        quantity: 1,
        price_data: {
          currency: "mxn",
          unit_amount: shippingAmountCents,
          product_data: {
            name: shippingLabel,
            metadata: { shipping_mode, postal_code: postal_code || "", provider: "envia" },
          },
        },
      });
    }

    const sessionParams = {
      mode: "payment",
      locale: "es",
      payment_method_types: ["card", "oxxo"],
      line_items,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      phone_number_collection: { enabled: true },
      metadata: {
        source: "scorestore",
        shipping_mode,
        postal_code: postal_code || "",
        promo_code: promo_code || "",
        items_qty: String(items_qty),
      },
    };

    if (couponId) sessionParams.discounts = [{ coupon: couponId }];

    if (needsAddress) {
      sessionParams.shipping_address_collection = { allowed_countries: ["MX", "US"] };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Supabase opcional
    try {
      if (isSupabaseConfigured()) {
        await supabase.from("orders").insert({
          created_at: new Date().toISOString(),
          stripe_session_id: session.id,
          status: "checkout_created",
          shipping_mode,
          postal_code: postal_code || null,
          promo_code: promo_code || null,
          items: itemsIn,
        });
      }
    } catch (_) {}

    return jsonResponse(200, { url: session.url, id: session.id });
  } catch (e) {
    return jsonResponse(500, { error: "Error creando checkout", details: String(e?.message || e) });
  }
};
