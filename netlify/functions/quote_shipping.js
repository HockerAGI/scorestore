const FALLBACK=Math.max(0,Math.round(Number(process.env.FALLBACK_SHIPPING_MXN||180)));
const j=(s,b)=>({statusCode:s,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(b)});
exports.handler=async(e)=>{
 try{
  const body=JSON.parse(e.body||'{}');
  const zip=String(body.zip||'').trim();
  if(!/^\d{5}$/.test(zip)) return j(400,{error:'ZIP inválido'});
  return j(200,{mxn:FALLBACK,note:'Envío estimado (fallback). Conecta Envia.com para cotización exacta.'});
 }catch(_){ return j(500,{error:'Server error'}); }
};