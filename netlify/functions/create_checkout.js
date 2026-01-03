const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const promosData = require("../../data/promos.json");
const {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly
} = require("./_shared");

function toStr(v) { return (v ?? "").toString().trim(); }
function upper(v) { return toStr(v).toUpperCase(); }
function normalizeCode(v) { return upper(v).replace(/\s+/g, ""); }

function getOrigin(event) {
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["host"];
  return `${proto}://${host}`;
}

function findPromo(codeRaw) {
  const code = normalizeCode(codeRaw);
  if (!code) return null;

  const rules = promosData?.rules || [];
  const rule = rules.find(r => r.active && normalizeCode(r.code) === code);
  if (!rule) return null;

  return { code, type: rule.type, value: rule.value };
}

function sumPieces(items) {
  return (items || []).reduce((a, b) => a + (parseInt(b.qty) || 0), 0) || 1;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  try {
    const origin = getOrigin(event);

    const body = safeJsonParse(event.body, {});
    const { mode, to } = body; // pickup | tj | mx

    const catalog = await loadCatalog();
    const map = productMapFromCatalog(catalog);
    const cartCheck = validateCartItems(body.items);

    if (!cartCheck.ok) return jsonResponse(400, { error: cartCheck.error });

    const promo = findPromo(body.promo_code);

    // ====== DESCUENTOS (server-side) ======
    // Regla:
    // - percent => reduce unit_amount
    // - fixed_mxn => distribuye descuento sobre los items proporcionalmente
    // - free_shipping => solo afecta shipping cost, no productos
    const items = cartCheck.items;
    const pieces = sumPieces(items);

    // totals en centavos
    const baseTotals = items.map(it => {
      const p = map[it.id];
      if (!p) throw new Error(`Producto no encontrado: ${it.id}`);
      const unit = Math.round(Number(p.baseMXN) * 100);
      const line = unit * it.qty;
      return { id: it.id, qty: it.qty, unitCents: unit, lineCents: line };
    });

    const cartBaseCents = baseTotals.reduce((a, b) => a + b.lineCents, 0);

    let fixedDiscountCentsTotal = 0;
    if (promo && promo.type === "fixed_mxn") {
      fixedDiscountCentsTotal = Math.min(cartBaseCents, Math.round(Number(promo.value || 0) * 100));
    }

    // repartir fixed discount por línea (aprox, sin romper Stripe)
    let perLineFixed = new Map();
    if (fixedDiscountCentsTotal > 0 && cartBaseCents > 0) {
      let allocated = 0;
      for (let i = 0; i < baseTotals.length; i++) {
        const lt = baseTotals[i].lineCents;
        const share = (i === baseTotals.length - 1)
          ? (fixedDiscountCentsTotal - allocated)
          : Math.floor((fixedDiscountCentsTotal * lt) / cartBaseCents);
        allocated += share;
        perLineFixed.set(baseTotals[i].id, share);
      }
    }

    const line_items = items.map(it => {
      const product = map[it.id];

      const imgUrl = product.img.startsWith("http")
        ? product.img
        : `${origin}${product.img}`;

      let unitCents = Math.round(Number(product.baseMXN) * 100);

      // percent promo
      if (promo && promo.type === "percent") {
        const factor = 1 - Number(promo.value || 0);
        unitCents = Math.max(0, Math.round(unitCents * factor));
      }

      // fixed_mxn promo (distribuido)
      if (promo && promo.type === "fixed_mxn" && fixedDiscountCentsTotal > 0) {
        const share = perLineFixed.get(it.id) || 0;
        // nuevo unit aproximado
        unitCents = Math.max(0, Math.round(((unitCents * it.qty) - share) / it.qty));
      }

      return {
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            description: `Talla: ${it.size}`,
            images: [imgUrl],
            metadata: {
              id: it.id,
              size: it.size,
              sku: product.sku || it.id
            }
          },
          unit_amount: unitCents
        },
        quantity: it.qty
      };
    });

    // ====== SHIPPING ======
    let shipping_options = [];
    const freeShip = promo && promo.type === "free_shipping";

    if (mode === "pickup") {
      // no shipping
    } else if (mode === "tj") {
      const cost = freeShip ? 0 : 200;
      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: cost * 100, currency: "mxn" },
          display_name: cost === 0 ? "Envío Gratis (Promo)" : "Envío Local Express (Tijuana)",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 1 },
            maximum: { unit: "business_day", value: 2 }
          }
        }
      });
    } else {
      // mx
      let cost = 250;
      if (freeShip) cost = 0;

      const zip = digitsOnly(to?.postal_code);
      if (!freeShip && zip.length === 5) {
        const quote = await getEnviaQuote(zip, pieces);
        if (quote) cost = quote.mxn;
      }

      shipping_options.push({
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: cost * 100, currency: "mxn" },
          display_name: cost === 0 ? "Envío Gratis (Promo)" : "Envío Nacional Estándar",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 3 },
            maximum: { unit: "business_day", value: 7 }
          }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "oxxo"],
      line_items,
      mode: "payment",
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?cancel=true`,
      shipping_options: shipping_options.length ? shipping_options : undefined,
      shipping_address_collection: (mode !== "pickup") ? { allowed_countries: ["MX"] } : undefined,
      metadata: {
        shipping_mode: mode || "pickup",
        customer_name: toStr(to?.name),
        promo_code: promo?.code || ""
      }
    });

    return jsonResponse(200, { url: session.url });

  } catch (e) {
    console.error("Checkout Error:", e);
    return jsonResponse(500, { error: "Error iniciando pago. Intente nuevamente." });
  }
};