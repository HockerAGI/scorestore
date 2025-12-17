const Stripe = require("stripe");
const fs = require("fs");
const path = require("path");

const PRICE_MARKUP = 0.20; // +20%
const SECRET_FREE_CODE = "GRTS10";

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) return json(500, { error:"missing_STRIPE_SECRET_KEY" });

    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const body = JSON.parse(event.body || "{}");
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const promoCode = String(body.promoCode || "").toUpperCase().trim();
    const shipTo = body.shipTo || {};

    if (!cart.length) return json(400, { error:"cart_empty" });

    // Load catalog from /data/catalog.json or /catalog.json
    const catalog = loadCatalogSafe();
    const products = Array.isArray(catalog.products) ? catalog.products : [];

    // Build subtotal from trusted catalog + qty
    let subtotal = 0;
    const safeItems = [];

    for (const item of cart) {
      const id = String(item.id || "");
      const qty = Math.max(1, Math.min(20, Number(item.qty || 1)));
      const p = products.find(x => String(x.id) === id);
      if (!p) continue;

      const baseMXN = Number(p.baseMXN || 0);
      const priceMXN = Math.round(baseMXN * (1 + PRICE_MARKUP));

      subtotal += priceMXN * qty;
      safeItems.push({
        id,
        name: String(p.name || item.name || id),
        qty,
        size: String(item.size || "ÚNICA"),
        unit_mxn: priceMXN
      });
    }

    if (!safeItems.length) return json(400, { error:"invalid_items" });

    // Promo compute
    const promo = resolvePromo(promoCode);
    let discount = 0;

    if (promo.type === "percent") discount = Math.round(subtotal * promo.value);
    if (promo.type === "fixed_mxn") discount = Math.round(promo.value);
    if (promo.type === "free_total") discount = subtotal;

    discount = Math.max(0, Math.min(subtotal, discount));

    // Shipping (real via Envia quote function)
    let shippingMXN = 0;

    if (promo.type === "free_shipping") {
      shippingMXN = 0;
    } else {
      shippingMXN = await quoteShippingServerSide(shipTo, safeItems);
    }

    // Secret: total gratis (incluye envío)
    if (promo.type === "free_total") {
      shippingMXN = 0;
    }

    const merchTotal = Math.max(0, subtotal - discount);
    const grandTotal = merchTotal + Math.max(0, shippingMXN);

    const origin = process.env.URL_SCORE || "https://scorestore.netlify.app";

    // Si total es 0 -> flujo FREE (sin Stripe)
    if (promo.type === "free_total" || promo.code === SECRET_FREE_CODE || grandTotal === 0) {
      const orderId = `FREE-${Date.now()}`;
      // Opcional: notificar Telegram aquí (sin pago)
      await sendTelegram(`[SCORE] Pedido GRATIS (${orderId})\nItems: ${safeItems.length}\nPromo: ${promo.code || "N/A"}\nTotal: $0 MXN`);
      return json(200, { free:true, redirect_url: `${origin}/?free=1&order=${encodeURIComponent(orderId)}` });
    }

    // Stripe Checkout: 2 líneas (Merch + Envío)
    const line_items = [];

    line_items.push({
      price_data: {
        currency: "mxn",
        product_data: { name: "Pedido SCORE (Merch)" },
        unit_amount: Math.max(1, Math.round(merchTotal * 100))
      },
      quantity: 1
    });

    if (shippingMXN > 0) {
      line_items.push({
        price_data: {
          currency: "mxn",
          product_data: { name: "Envío" },
          unit_amount: Math.max(1, Math.round(shippingMXN * 100))
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
      metadata: {
        promo_code: promo.code || "",
        discount_mxn: String(discount),
        shipping_mxn: String(shippingMXN),
        items: JSON.stringify(safeItems).slice(0, 4500),
        ship_to: JSON.stringify({
          postal_code: String(shipTo.postal_code || ""),
          state_code: String(shipTo.state_code || ""),
          city: String(shipTo.city || ""),
          address1: String(shipTo.address1 || "")
        }).slice(0, 500)
      }
    });

    return json(200, { url: session.url });

  } catch (e) {
    return json(500, { error:"server_error", detail: String(e?.message || e) });
  }
};

function resolvePromo(code){
  const c = String(code||"").toUpperCase().trim();
  if (!c) return { code:"", type:"none", value:0 };

  if (c === "GRTS10") return { code:"GRTS10", type:"free_total", value:0 }; // secreto
  if (c === "SCORE10") return { code:"SCORE10", type:"percent", value:0.10 };
  if (c === "ENVIOFREE") return { code:"ENVIOFREE", type:"free_shipping", value:0 };
  if (c === "BAJA200") return { code:"BAJA200", type:"fixed_mxn", value:200 };

  return { code:c, type:"none", value:0 };
}

async function quoteShippingServerSide(shipTo, items){
  // Si faltan datos, 0 (puede ser pickup)
  const cp = String(shipTo?.postal_code || "").trim();
  if (cp.length !== 5) return 0;

  try{
    const origin = process.env.URL_SCORE || "https://scorestore.netlify.app";
    // Llamamos a nuestra propia function de quote para mantener una sola lógica
    const res = await fetch(`${origin}/.netlify/functions/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ to: shipTo, items })
    }).catch(()=>null);

    if(!res || !res.ok) return fallbackShipping(cp);
    const data = await res.json().catch(()=>null);
    if(!data || !data.ok || !data.quote) return fallbackShipping(cp);

    return Math.max(0, Math.round(Number(data.quote.mxn||0)));
  }catch(e){
    return fallbackShipping(cp);
  }
}

function fallbackShipping(cp){
  const local = String(cp||"").startsWith("22");
  return local ? 99 : 199;
}

async function sendTelegram(text){
  try{
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if(!token || !chatId) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }).catch(()=>{});
  }catch(e){}
}

function loadCatalogSafe(){
  const candidates = [
    path.join(__dirname, "..", "..", "data", "catalog.json"),
    path.join(__dirname, "..", "..", "catalog.json"),
    path.join(process.cwd(), "data", "catalog.json"),
    path.join(process.cwd(), "catalog.json")
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {}
  }
  return { products: [] };
}

function json(statusCode, body){
  return {
    statusCode,
    headers: {
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":"*"
    },
    body: JSON.stringify(body)
  };
}