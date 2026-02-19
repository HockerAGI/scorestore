// netlify/functions/create_checkout.js
const path = require("path");
const fs = require("fs");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");
const { getOrgIdFromEvent, safeJson, json, badRequest } = require("./_shared");

// Helpers
function readCatalog() {
  const p = path.join(process.cwd(), "data", "catalog.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function findProduct(catalog, sku) {
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  return products.find((p) => String(p.sku) === String(sku));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function computeDiscount(subtotal, promo, promosDb) {
  if (!promo) return { discount: 0, meta: null, freeShipping: false };

  const code = String(promo).trim().toUpperCase();
  if (!code) return { discount: 0, meta: null, freeShipping: false };

  const rules = Array.isArray(promosDb?.rules) ? promosDb.rules : (Array.isArray(promosDb?.promos) ? promosDb.promos : []);
  const rule = rules.find((r) => String(r?.code || "").trim().toUpperCase() === code && (r?.active === true || r?.active === 1));
  if (!rule) return { discount: 0, meta: null, freeShipping: false };

  const type = String(rule.type || "");
  const val = Number(rule.value || 0) || 0;

  if (type === "percent") {
    const pct = val <= 1 ? val : (val / 100);
    const discount = subtotal * clamp(pct, 0, 1);
    return { discount, meta: rule, freeShipping: false };
  }

  if (type === "fixed_mxn") {
    const discount = clamp(val, 0, subtotal);
    return { discount, meta: rule, freeShipping: false };
  }

  if (type === "free_shipping") {
    return { discount: 0, meta: rule, freeShipping: true };
  }

  return { discount: 0, meta: rule, freeShipping: false };
}

async function readPromos() {
  const p = path.join(process.cwd(), "data", "promos.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

async function quoteShipping({ zip, country, items_qty }) {
  // We delegate quoting to the existing Netlify function (quote_shipping.js) via internal logic reuse is avoided.
  // This checkout function uses a simplified shipping calculator:
  // - pickup: 0
  // - local_tj: from env var
  // - envia_*: call ENVIA API directly
  const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
  if (!ENVIA_API_KEY) throw new Error("Missing ENVIA_API_KEY");

  const qty = Number(items_qty || 0) || 0;
  const weightKg = clamp(qty * 0.4, 0.4, 25); // heuristic, same spirit as quote_shipping.js
  const originZip = String(process.env.FACTORY_ORIGIN_POSTAL || "22000");

  const body = {
    origin: { zip: originZip, country: "MX" },
    destination: { zip: String(zip), country: String(country) },
    packages: [{ content: "merch", amount: 1, type: "box", weight: weightKg, insurance: 0, declaredValue: 0, weightUnit: "KG", lengthUnit: "CM", dimensions: { length: 30, width: 25, height: 8 } }]
  };

  const res = await fetch("https://api.envia.com/ship/rate/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENVIA_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Envia rate error");
  }

  // Choose cheapest
  const rates = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  if (!rates.length) throw new Error("No shipping rates available");

  rates.sort((a, b) => (Number(a?.totalPrice || a?.total || 1e18) - Number(b?.totalPrice || b?.total || 1e18)));
  const best = rates[0];

  const mxn = Number(best?.totalPrice || best?.total || 0) || 0;
  const carrier = String(best?.carrier || best?.carrierName || "").trim();
  const service = String(best?.service || best?.serviceName || "").trim();
  const label = [carrier, service].filter(Boolean).join(" ");

  return { amount_mxn: mxn, label };
}

exports.handler = async (event) => {
  try {
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) return badRequest("Missing STRIPE_SECRET_KEY");

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    // OXXO: Stripe supports expires_after_days between 1 and 7 (Checkout)
    const OXXO_EXPIRES_AFTER_DAYS = (() => {
      const raw = Number(process.env.OXXO_EXPIRES_AFTER_DAYS || 3);
      const n = Number.isFinite(raw) ? Math.round(raw) : 3;
      return Math.max(1, Math.min(7, n));
    })();

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const supabase =
      SUPABASE_URL && SUPABASE_SERVICE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
        : null;

    const org_id = getOrgIdFromEvent(event);

    const body = safeJson(event.body, {});
    const items = Array.isArray(body.items) ? body.items : [];
    const shipping_mode = String(body.shipping_mode || "pickup");
    const postal_code = String(body.postal_code || "");
    const promo_code = String(body.promo_code || "").trim().toUpperCase();

    if (!items.length) return badRequest("Cart is empty");

    // catalog lookup
    const catalog = readCatalog();
    const promosDb = await readPromos();

    // compute subtotal & build Stripe line items
    let amount_subtotal = 0;
    const line_items = [];

    for (const it of items) {
      const sku = String(it.sku || "");
      const qty = clamp(Number(it.qty || 1), 1, 99);
      if (!sku) continue;

      const p = findProduct(catalog, sku);
      if (!p) return badRequest(`Unknown sku: ${sku}`);

      const name = String(p.name || "Producto");
      const unit = Number(p.baseMXN || 0) || 0;

      amount_subtotal += unit * qty;

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name,
            metadata: {
              sku,
              size: String(it.size || ""),
            },
          },
          unit_amount: Math.round(unit * 100),
        },
        quantity: qty,
      });
    }

    if (!line_items.length) return badRequest("No valid items");

    // promo discount
    const { discount, meta, freeShipping } = computeDiscount(amount_subtotal, promo_code, promosDb);

    // shipping
    let amount_shipping = 0;
    let shipLabel = "";

    if (shipping_mode === "pickup") {
      amount_shipping = 0;
      shipLabel = "Pickup";
    } else if (shipping_mode === "local_tj") {
      const flat = Number(process.env.LOCAL_TJ_FLAT_MXN || 200);
      amount_shipping = Number.isFinite(flat) ? flat : 200;
      shipLabel = "Local TJ";
    } else if (shipping_mode === "envia_mx" || shipping_mode === "envia_us") {
      if (!postal_code) return badRequest("postal_code required for envia");
      const country = shipping_mode === "envia_us" ? "US" : "MX";
      const items_qty = items.reduce((s, x) => s + clamp(Number(x.qty || 1), 1, 99), 0);

      const q = await quoteShipping({ zip: postal_code, country, items_qty });
      amount_shipping = Number(q.amount_mxn || 0) || 0;
      shipLabel = q.label || "Envia";
    } else {
      return badRequest("Invalid shipping_mode");
    }

    if (freeShipping) amount_shipping = 0;

    const amount_total = Math.max(0, amount_subtotal - discount + amount_shipping);

    const baseUrl = (() => {
      const h = event.headers || {};
      const proto = h["x-forwarded-proto"] || "https";
      const host = h.host || h["x-forwarded-host"];
      return `${proto}://${host}`;
    })();

    const params = {
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      payment_method_options: {
        oxxo: { expires_after_days: OXXO_EXPIRES_AFTER_DAYS }
      },
      line_items,
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel.html`,
      metadata: {
        org_id: String(org_id || ""),
        shipping_mode,
        postal_code,
        promo_code,
        ship_label: shipLabel,
        amount_subtotal_mxn: String(amount_subtotal),
        amount_shipping_mxn: String(amount_shipping),
        amount_discount_mxn: String(discount),
        amount_total_mxn: String(amount_total),
      },
    };

    // Add shipping as a separate line to show it clearly in Checkout
    if (amount_shipping > 0) {
      params.line_items.push({
        price_data: {
          currency: "mxn",
          product_data: { name: `Envío (${shipLabel || shipping_mode})` },
          unit_amount: Math.round(amount_shipping * 100),
        },
        quantity: 1,
      });
    }

    // Add discount as negative line (Stripe Checkout doesn't allow arbitrary discount without Coupons unless you create them in Stripe)
    if (discount > 0) {
      params.line_items.push({
        price_data: {
          currency: "mxn",
          product_data: { name: `Descuento (${promo_code || "PROMO"})` },
          unit_amount: -Math.round(discount * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create(params);

    // persist order (best-effort)
    if (supabase) {
      await supabase.from("orders").insert({
        organization_id: org_id || null,
        email: null,
        items,
        amount_total: amount_total,
        shipping_mode,
        postal_code,
        promo_code,
        stripe_session_id: session.id,
        status: "pending",
      });
    }

    return json({ url: session.url, id: session.id });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};