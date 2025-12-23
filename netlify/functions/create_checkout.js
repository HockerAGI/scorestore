// netlify/functions/create_checkout.js
// Crea la sesión de pago en Stripe (MXN) y valida reglas de envío.
// Sincronizado con index.html (FrontEnd Maestro v4.0).

const Stripe = require("stripe");

const {
  jsonResponse,
  safeJsonParse,
  toStr,
  upper,
  isMxPostal,
  isTijuanaPostal,
  looksLikeTijuana,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  validateSizes,
  computeSubtotalMXN,
  applyPromoToTotals,
  getBaseUrlFromEnv,
  quoteEnviaMXN,
} = require("./_shared");

const MIN_OUTSIDE_TJ_MXN = 250;
const TIJUANA_DELIVERY_MXN = 200;

function summarizeItems(items) {
  return items
    .map((it) => `${toStr(it.id)}:${toStr(it.size || "NA")}x${Number(it.qty || 0)}`)
    .slice(0, 12)
    .join("|");
}

exports.handler = async (event) => {
  // 1. CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Método no permitido." }, { Allow: "POST" });
  }

  // 2. Inicializar Stripe
  const secretKey = toStr(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) return jsonResponse(500, { ok: false, error: "Error interno: Falta configuración de pagos." });

  const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" });

  // 3. Leer Datos del Cliente
  const body = safeJsonParse(event.body, {});
  const items = body?.items || body?.cart || [];
  const promoCode = toStr(body?.promoCode || body?.promo || "");
  const ship = body?.shipping || {};
  
  // Normalizar el método de envío que viene del Frontend ("tj", "mx", "pickup")
  let rawMode = toStr(ship?.method || ship?.mode || "mx").toLowerCase();
  let shipMode = "envia"; // Default nacional

  if (rawMode === "pickup") shipMode = "pickup";
  else if (rawMode === "tj" || rawMode === "tijuana_delivery") shipMode = "tijuana_delivery";
  else shipMode = "envia";

  const to = ship?.to || body?.shipTo || {}; // Datos de dirección para cotizar

  // 4. Validaciones de Seguridad (Inventario y Precios)
  const v = validateCartItems(items);
  if (!v.ok) return jsonResponse(400, { ok: false, error: v.error });

  const catalog = await loadCatalog();
  const productMap = productMapFromCatalog(catalog);

  const sizeCheck = validateSizes(items, productMap);
  if (!sizeCheck.ok) return jsonResponse(400, { ok: false, error: sizeCheck.error });

  // Subtotal calculado en servidor (¡Jamás confiar en el cliente!)
  const subtotalMXN = computeSubtotalMXN(items, productMap);
  if (subtotalMXN <= 0) return jsonResponse(400, { ok: false, error: "El carrito está vacío o es inválido." });

  // 5. Cálculo de Envío
  let shippingMXN = 0;
  
  // Datos de dirección
  const postal = toStr(to?.postal_code || to?.cp);
  const state = upper(to?.state || to?.state_code);
  const city = toStr(to?.city);
  const address1 = toStr(to?.address || to?.address1);

  // Lógica de Envío
  if (shipMode === "pickup") {
    shippingMXN = 0;
  } 
  else if (shipMode === "tijuana_delivery") {
    // Validar que sea realmente Tijuana (CP empieza con 22 o ciudad dice Tijuana)
    const validTJ = isTijuanaPostal(postal) || looksLikeTijuana(city);
    if (validTJ) {
      shippingMXN = TIJUANA_DELIVERY_MXN;
    } else {
      // Si seleccionó TJ pero el CP no es de TJ, forzar tarifa nacional
      shipMode = "envia"; 
    }
  }

  // Si es nacional (o fallback de TJ inválido)
  if (shipMode === "envia") {
    // Si faltan datos, cobramos el mínimo estándar para no bloquear la venta
    if (!isMxPostal(postal) || address1.length < 5) {
      shippingMXN = MIN_OUTSIDE_TJ_MXN;
    } else {
      // Cotizar real con Envia.com
      const q = await quoteEnviaMXN({
        to: { postal_code: postal, state_code: state, city, address1 },
        items,
        productMap,
      });

      if (!q.ok) {
        shippingMXN = MIN_OUTSIDE_TJ_MXN; // Fallback seguro
      } else {
        const raw = Number(q.quote.mxn || 0);
        // Cobramos lo que dice Envia + 5% margen de seguridad
        shippingMXN = Math.max(MIN_OUTSIDE_TJ_MXN, Math.round(raw * 1.05));
      }
    }
  }

  // 6. Aplicar Promociones
  const promo = await applyPromoToTotals({ promoCode, subtotalMXN, shippingMXN });
  const totalMXN = Math.max(0, Math.round(promo.totalMXN));

  if (totalMXN < 10) { // Stripe requiere mínimo aprox $10 MXN
    return jsonResponse(400, { ok: false, error: "El total es demasiado bajo para procesar el pago." });
  }

  // 7. Configurar Checkout de Stripe
  const baseUrl = getBaseUrlFromEnv() || "https://scorestore.netlify.app";
  const success_url = `${baseUrl}/?success=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = `${baseUrl}/?canceled=1`;

  // Item único consolidado para evitar problemas de redondeo en Stripe
  const line_items = [
    {
      price_data: {
        currency: "mxn",
        product_data: {
          name: "Pedido — SCORE Store",
          description: `Subtotal: $${subtotalMXN} | Envío: $${promo.shippingMXN} | Descuento: -$${promo.discountMXN}`,
          images: items.length > 0 ? [`${baseUrl}${items[0].img}`] : [], // Muestra la imagen del primer producto
        },
        unit_amount: totalMXN * 100, // En centavos
      },
      quantity: 1,
    },
  ];

  // Metadatos para el Webhook (Envío de notificaciones)
  const metadata = {
    items_summary: summarizeItems(items),
    promo_code: upper(promo.code || "NA"),
    discount_mxn: String(Math.round(promo.discountMXN || 0)),
    subtotal_mxn: String(Math.round(subtotalMXN)),
    shipping_mxn: String(Math.round(promo.shippingMXN || 0)),
    total_mxn: String(Math.round(totalMXN)),
    shipping_mode: shipMode,
    ship_postal: postal,
    ship_address: address1,
    customer_name: toStr(body?.name || to?.name || "Cliente"),
  };

  try {
    const sessionParams = {
      mode: "payment",
      payment_method_types: ["card", "oxxo"],
      line_items,
      success_url,
      cancel_url,
      phone_number_collection: { enabled: true }, // Pedimos teléfono para WhatsApp
      metadata,
    };

    // Si es envío físico, Stripe recolecta/valida la dirección final
    if (shipMode !== "pickup") {
      sessionParams.shipping_address_collection = { allowed_countries: ["MX"] };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return jsonResponse(200, { ok: true, url: session.url });

  } catch (err) {
    console.error("Stripe Error:", err);
    return jsonResponse(500, { ok: false, error: "Error al iniciar el pago. Intenta de nuevo." });
  }
};
