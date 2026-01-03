const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const promos = require("../../data/promos.json");
const {
  jsonResponse,
  safeJsonParse,
  loadCatalog,
  productMapFromCatalog,
  validateCartItems,
  getEnviaQuote,
  digitsOnly
} = require("./_shared");

const getPromo = (c) =>
  promos.rules.find(p => p.active && p.code === c?.toUpperCase());

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return jsonResponse(405,{});

  const body = safeJsonParse(event.body,{});
  const promo = getPromo(body.promo);

  const catalog = await loadCatalog();
  const map = productMapFromCatalog(catalog);
  const cartCheck = validateCartItems(body.items);
  if (!cartCheck.ok) return jsonResponse(400,cartCheck);

  const line_items = cartCheck.items.map(i => {
    const p = map[i.id];
    return {
      price_data: {
        currency:"mxn",
        product_data:{ name:p.name, description:`Talla ${i.size}` },
        unit_amount: p.baseMXN * 100
      },
      quantity:i.qty
    };
  });

  let discounts = [];
  if (promo && promo.type !== "free_shipping") {
    const coupon = await stripe.coupons.create(
      promo.type==="percent"
        ? { percent_off: promo.value*100, duration:"once" }
        : { amount_off: promo.value*100, currency:"mxn", duration:"once" }
    );
    discounts.push({ coupon: coupon.id });
  }

  let shipping_options = [];
  if (body.mode === "mx" && !(promo?.type==="free_shipping")) {
    let cost = 250;
    const zip = digitsOnly(body.to?.postal_code);
    const q = await getEnviaQuote(zip, cartCheck.items.length);
    if (q) cost = q.mxn;
    shipping_options.push({
      shipping_rate_data:{
        type:"fixed_amount",
        fixed_amount:{ amount: cost*100, currency:"mxn" },
        display_name:"Envío Nacional"
      }
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode:"payment",
    payment_method_types:["card","oxxo"],
    line_items,
    discounts,
    shipping_options,
    success_url:"https://scorestore.netlify.app/?success=true",
    cancel_url:"https://scorestore.netlify.app/?cancel=true"
  });

  return jsonResponse(200,{ url: session.url });
};