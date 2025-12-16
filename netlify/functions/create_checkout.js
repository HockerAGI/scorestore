const fs=require('fs');
const path=require('path');
const Stripe=require('stripe');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9_-]/g,'').trim();

const catalog=read(path.join(__dirname,'..','..','data','catalog.json'));
const promos=read(path.join(__dirname,'..','..','data','promos.json'));

const discountPct=Number(catalog?.pricing?.discount_pct||0);
const markupPct=Number(catalog?.pricing?.markup_pct||0);
const products=Array.isArray(catalog?.products)?catalog.products:[];
const pIndex=new Map(products.map(p=>[String(p.id),p]));

const getPriceMXN=(p)=>{
  const was=Number(p.wasMXN||0);
  const base=Number(p.baseMXN||0);
  if(was>0) return Math.max(0,Math.round(was*(1-discountPct)));
  if(base>0) return Math.max(0,Math.round(base*(1+markupPct)*(1-discountPct)));
  return 0;
};

const ruleFor=(code)=>{
  const c=norm(code);
  if(!c) return null;
  const rules=Array.isArray(promos?.rules)?promos.rules:[];
  const r=rules.find(x=>norm(x.code)===c && x.active!==false);
  return r?{...r,code:c}:null;
};

const j=(s,b)=>({statusCode:s,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(b)});

exports.handler=async(event)=>{
  try{
    const key=process.env.STRIPE_SECRET_KEY;
    if(!key) return j(500,{error:'Missing STRIPE_SECRET_KEY'});
    const SITE_URL=process.env.SITE_URL||catalog?.site?.url||'https://scorestore.netlify.app';
    const stripe=new Stripe(key,{apiVersion:'2024-06-20'});

    const body=JSON.parse(event.body||'{}');
    const items=Array.isArray(body.items)?body.items:[];
    const shippingMXN=Math.max(0,Math.round(Number(body.shippingMXN||0)));
    const promoCode=norm(body?.promo?.code||'');

    if(!items.length) return j(400,{error:'No items'});

    const line_items=[];
    for(const it of items){
      const id=String(it.id||'');
      const p=pIndex.get(id);
      if(!p) return j(400,{error:`Unknown product: ${id}`});
      const qty=Math.max(1,Math.min(99,parseInt(it.qty,10)||1));
      const size=String(it.size||'').toUpperCase();
      const unit=getPriceMXN(p);
      line_items.push({
        quantity:qty,
        price_data:{
          currency:'mxn',
          unit_amount:unit*100,
          product_data:{
            name:`${p.name}${size?` · ${size}`:''}`,
            images:p.img?[new URL(p.img,SITE_URL).toString()]:undefined,
            metadata:{id,size}
          }
        }
      });
    }

    if(shippingMXN>0){
      line_items.push({
        quantity:1,
        price_data:{
          currency:'mxn',
          unit_amount:shippingMXN*100,
          product_data:{name:'Envío',metadata:{kind:'shipping'}}
        }
      });
    }

    const rule=ruleFor(promoCode);
    let discounts=undefined;

    if(rule){
      const t=String(rule.type||'');
      const coupon={duration:'once',name:`PROMO ${rule.code}`,metadata:{promo_code:rule.code}};

      if(t==='percent'){
        const v=Number(rule.value||0);
        const pct=(v>0 && v<=1)?Math.round(v*100):Math.round(v);
        if(pct>=1 && pct<=90) coupon.percent_off=pct;
      }else if(t==='fixed_mxn'){
        const off=Math.max(1,Math.round(Number(rule.value||0)));
        coupon.amount_off=off*100; coupon.currency='mxn';
      }else if(t==='free_shipping'){
        if(shippingMXN>0){ coupon.amount_off=shippingMXN*100; coupon.currency='mxn'; }
      }

      if(coupon.percent_off || coupon.amount_off){
        const created=await stripe.coupons.create(coupon);
        discounts=[{coupon:created.id}];
      }
    }

    const session=await stripe.checkout.sessions.create({
      mode:'payment',
      line_items,
      discounts,
      allow_promotion_codes:false,
      success_url:`${SITE_URL}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${SITE_URL}/?status=cancel`,
      metadata:{source:'score_store',promo_code:rule?rule.code:''}
    });

    return j(200,{url:session.url});
  }catch(err){
    console.error(err);
    return j(500,{error:err?.message||'Server error'});
  }
};