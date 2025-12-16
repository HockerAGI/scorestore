/**
 * netlify/functions/create_checkout.js
 * SCORE STORE — Stripe Checkout (MXN) + OXXO + Shipping Address MX
 *
 * Seguridad:
 * - NO confía en priceMXN del frontend.
 * - Solo acepta items por ID + talla + qty.
 * - Precios y nombres se calculan aquí (CATALOG).
 *
 * Robustez Netlify:
 * - Soporta event.isBase64Encoded
 * - CORS + OPTIONS preflight
 */

const ASSET_BASE = "assets/BAJA1000";
const ED2025 = `${ASSET_BASE}/EDICION_2025`;
const OTRAS = `${ASSET_BASE}/OTRAS_EDICIONES`;

/**
 * CATALOGO (alineado a tu estructura en TrebEdit)
 * Nota:
 * - Agregué productos NUEVOS para rosa/roja.
 * - Dejé ALIASES para que no se rompa si el frontend aún usa IDs viejos.
 */
const CATALOG = {
  // ✅ EDICION 2025
  b1000_pits: {
    name: "Camisa de Pits Oficial · Baja 1000",
    priceMXN: 989,
    img: `${ED2025}/camisa-pits-baja1000.jpg`,
  },

  // Camisetas (colores)
  b1000_tee_azul: {
    name: "Camiseta · Baja 1000 (Azul)",
    priceMXN: 439,
    img: `${ED2025}/camiseta-baja1000-azul.jpg`,
  },
  b1000_tee_cafe: {
    name: "Camiseta · Baja 1000 (Café)",
    priceMXN: 439,
    img: `${ED2025}/camiseta-baja1000-cafe.jpg`,
  },
  b1000_tee_negra: {
    name: "Camiseta · Baja 1000 (Negra)",
    priceMXN: 439,
    img: `${ED2025}/camiseta-baja1000-negra.jpg`,
  },

  // Sudaderas World Desert (en tu EDICION_2025)
  world_desert_negra: {
    name: "Sudadera SCORE · World Desert (Negra)",
    priceMXN: 824,
    img: `${ED2025}/sudadera-world-desert-negra.jpg`,
  },
  world_desert_cafe: {
    name: "Sudadera SCORE · World Desert (Café)",
    priceMXN: 824,
    img: `${ED2025}/sudadera-world-desert-cafe.jpg`,
  },

  // ✅ OTRAS EDICIONES (las que no te aparecían)
  world_desert_roja: {
    name: "Sudadera SCORE · World Desert (Roja)",
    priceMXN: 824,
    img: `${OTRAS}/sudadera-world-desert-roja.jpg`,
  },
  world_desert_rosa: {
    name: "Sudadera SCORE · World Desert (Rosa)",
    priceMXN: 824,
    img: `${OTRAS}/sudadera-world-desert-rosa.jpg`,
  },

  /**
   * ====== ALIASES / COMPATIBILIDAD (IDs viejos) ======
   * Si tu index.html todavía manda estos IDs, seguirá jalando.
   */
  world_desert_blk: { // antes "Negra"
    name: "Sudadera SCORE · World Desert (Negra)",
    priceMXN: 824,
    img: `${ED2025}/sudadera-world-desert-negra.jpg`,
  },
  world_desert_snd: { // antes "Arena" -> lo más cercano en tus assets es "café"
    name: "Sudadera SCORE · World Desert (Café)",
    priceMXN: 824,
    img: `${ED2025}/sudadera-world-desert-cafe.jpg`,
  },
  world_desert_pnk: { // antes "Rosa"
    name: "Sudadera SCORE · World Desert (Rosa)",
    priceMXN: 824,
    img: `${OTRAS}/sudadera-world-desert-rosa.jpg`,
  },

  // Si tu frontend aún usa "b1000_maptee", lo mapeo a camiseta negra (para no romper checkout)
  b1000_maptee: {
    name: "Camiseta · Baja 1000 (Negra)",
    priceMXN: 439,
    img: `${ED2025}/camiseta-baja1000-negra.jpg`,
  },

  /**
   * Los siguientes estaban en tu catálogo viejo pero NO veo sus imágenes en tus assets.
   * Los dejo “vivos” sin imagen para evitar 404 en Stripe si alguien los manda.
   * (Cuando subas sus fotos reales, aquí se actualizan.)
   */
  b1000_jacket: {
    name: "Chaqueta Oficial SCORE · Baja 1000",
    priceMXN: 1639,
    img: null,
  },
  b1000_kids: {
    name: "Sudadera Infantil · Baja 1000",
    priceMXN: 824,
    img: null,
  },
  b1000_panels: {
    name: "Sudadera Baja 1000 · Paneles",
    priceMXN: 824,
    img: null,
  },
  score_trucker: {
    name: "Gorra Trucker SCORE",
    priceMXN: 715,
    img: null,
  },
};

const ALLOWED_SIZES = new Set(["S", "M", "L", "XL", "2XL", "UNICA", "ÚNICA"]);

// límites de seguridad
const MAX_QTY_PER_LINE = 10;
const MAX_ITEMS_TOTAL = 40;
const MAX_SHIPPING_MXN = 2500;

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function safeInt(n, def = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.trunc(x);
}

function readJsonBody(event) {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

function getBaseUrl() {
  return (
    process.env.SITE_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "https://scorestore.netlify.app"
  );
}

function absImageUrl(baseUrl, path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = String(path).replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: "Falta STRIPE_SECRET_KEY en variables de entorno." });
  }

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

  const payload = readJsonBody(event);
  if (!payload) return json(400, { error: "Body inválido / JSON parse error" });

  try {
    const { items, shippingMXN = 0, meta = {} } = payload;

    if (!Array.isArray(items) || items.length === 0) {
      return json(400, { error: "Carrito vacío" });
    }

    const normalized = [];
    let totalQty = 0;

    for (const it of items) {
      const id = String(it?.id || "").trim();
      const sizeRaw = String(it?.size || "").trim();
      const size = sizeRaw ? sizeRaw.toUpperCase() : "";
      const qty = Math.max(1, safeInt(it?.qty, 1));

      if (!id || !CATALOG[id]) {
        return json(400, { error: `Producto inválido: ${id || "(sin id)"}` });
      }
      if (size && !ALLOWED_SIZES.has(size)) {
        return json(400, { error: `Talla inválida: ${size}` });
      }
      if (qty < 1 || qty > MAX_QTY_PER_LINE) {
        return json(400, { error: `Cantidad inválida (1–${MAX_QTY_PER_LINE}).` });
      }

      totalQty += qty;
      if (totalQty > MAX_ITEMS_TOTAL) {
        return json(400, { error: `Demasiados artículos (${MAX_ITEMS_TOTAL} máx.).` });
      }

      // Si no mandan talla, lo dejamos vacío (no forzamos ÚNICA)
      normalized.push({ id, size: size || "", qty });
    }

    // Consolidar iguales (id+talla)
    const consolidated = new Map();
    for (const i of normalized) {
      const key = `${i.id}__${i.size}`;
      consolidated.set(key, (consolidated.get(key) || 0) + i.qty);
    }

    const baseUrl = getBaseUrl();

    const line_items = [];
    for (const [key, qty] of consolidated.entries()) {
      const [id, size] = key.split("__");
      const product = CATALOG[id];
      const imgAbs = absImageUrl(baseUrl, product.img);

      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: {
            name: product.name,
            images: imgAbs ? [imgAbs] : [],
            metadata: { product_id: id, size: size || "" },
          },
          unit_amount: Math.round(Number(product.priceMXN) * 100),
        },
        quantity: qty,
      });
    }

    // Shipping saneado
    const shipRaw = Math.round(Number(shippingMXN || 0));
    const ship = Math.max(0, Math.min(MAX_SHIPPING_MXN, shipRaw));

    const shipping_options =
      ship > 0
        ? [{
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: ship * 100, currency: "mxn" },
              display_name: "Envío (México)",
              delivery_estimate: {
                minimum: { unit: "business_day", value: 2 },
                maximum: { unit: "business_day", value: 7 },
              },
            },
          }]
        : [];

    const successUrl = `${baseUrl}/?status=success`;
    const cancelUrl = `${baseUrl}/?status=cancel`;

    const metaSafe = {
      source: String(meta.source || "score_store"),
      zip: String(meta.zip || ""),
      shippingQuoted: String(!!meta.shippingQuoted),
      shippingMXN: String(ship),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      payment_method_types: ["card", "oxxo"],
      line_items,

      shipping_address_collection: { allowed_countries: ["MX"] },
      phone_number_collection: { enabled: true },

      ...(shipping_options.length ? { shipping_options } : {}),

      success_url: successUrl,
      cancel_url: cancelUrl,

      metadata: metaSafe,
      payment_intent_data: { metadata: metaSafe },

      customer_creation: "if_required",
    });

    return json(200, { id: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    return json(500, { error: error?.message || "Stripe error" });
  }
};