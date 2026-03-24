module.exports = async (req, res) => {
  const { jsonResponse, handleOptions, supabaseAdmin } = require("./_shared.js");

  const origin = req.headers.origin || "*";

  // 1. Manejo de CORS
  if (req.method === "OPTIONS") {
    const optionsRes = handleOptions({ headers: { origin } });
    Object.keys(optionsRes.headers).forEach(key => res.setHeader(key, optionsRes.headers[key]));
    res.status(optionsRes.statusCode).send(optionsRes.body);
    return;
  }

  const withNoStore = (resp) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return resp;
  };

  // 2. Configuración de Categorías
  const CATEGORY_CONFIG = [
    { id: "BAJA1000", title: "BAJA 1000", logo: "/assets/logo-baja1000.webp", mapFrom: ["BAJA1000", "BAJA_1000"] },
    { id: "BAJA500", title: "BAJA 500", logo: "/assets/logo-baja500.webp", mapFrom: ["BAJA500", "BAJA_500"] },
    { id: "BAJA400", title: "BAJA 400", logo: "/assets/logo-baja400.webp", mapFrom: ["BAJA400", "BAJA_400"] },
    { id: "SF250", title: "SAN FELIPE 250", logo: "/assets/logo-sf250.webp", mapFrom: ["SF250", "SF_250"] },
  ];

  // 3. Helpers de validación
  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || "").trim());
  
  const resolveOrgId = async () => {
    const envId = process.env.SCORE_ORG_ID || process.env.DEFAULT_ORG_ID;
    return (envId && isUuid(envId)) ? String(envId).trim() : "1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6";
  };

  // 4. Lógica Principal
  const sb = supabaseAdmin();
  const fallbackRaw = { store: { name: "SCORE STORE", currency: "MXN", locale: "es-MX" }, products: [] };

  try {
    const orgId = await resolveOrgId();
    
    if (!sb) throw new Error("No Supabase client");

    const { data, error } = await sb
      .from("products")
      .select("id,sku,name,description,price_cents,price_mxn,base_mxn,images,sizes,section_id,sub_section,rank,img,image_url,stock,active,is_active,deleted_at,org_id,organization_id")
      .or(`org_id.eq.${orgId},organization_id.eq.${orgId}`)
      .is("deleted_at", null)
      .or("active.eq.true,is_active.eq.true")
      .order("rank", { ascending: true });

    if (error) throw error;

    const products = data || [];
    const sections = CATEGORY_CONFIG.map(cfg => ({
      ...cfg,
      count: products.filter(p => p.section_id === cfg.id).length
    }));

    const response = jsonResponse(200, { ok: true, store: fallbackRaw.store, sections, products }, origin);
    withNoStore(response);
    Object.keys(response.headers).forEach(key => res.setHeader(key, response.headers[key]));
    res.status(response.statusCode).send(response.body);

  } catch (e) {
    // Fallback en caso de error
    const response = jsonResponse(200, { ok: true, store: fallbackRaw.store, error: e.message, products: [] }, origin);
    res.status(response.statusCode).send(response.body);
  }
};
