-- ==========================================
-- SCORE STORE DATABASE SCHEMA (Supabase)
-- ==========================================

-- 1. Respaldo de seguridad automático (si la tabla ya existe)
DO $$
DECLARE
    ts text := to_char(now(), 'YYYYMMDD_HH24MISS');
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='products') THEN
        EXECUTE format('ALTER TABLE public.products RENAME TO products__backup_%s', ts);
    END IF;
END $$;

-- 2. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3. Tabla de Organizaciones (Multi-tenant ready)
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 4. Tabla de Productos
CREATE TABLE IF NOT EXISTS public.products (
    id text PRIMARY KEY, -- ID tipo 'b1k-jacket'
    org_id uuid REFERENCES public.organizations(id),
    sku text,
    name text NOT NULL,
    price numeric NOT NULL,
    image_url text,
    stock integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 5. Insertar Organización Base
INSERT INTO public.organizations (slug, name)
VALUES ('score-store', 'Score Store / Único Uniformes')
ON CONFLICT (slug) DO NOTHING;

-- 6. Insertar Productos (Seed Data)
DO $$
DECLARE
    target_org_id uuid;
BEGIN
    -- Obtener el ID de la organización recién creada o existente
    SELECT id INTO target_org_id FROM public.organizations WHERE slug = 'score-store';

    INSERT INTO public.products (id, org_id, sku, name, price, image_url, stock, active)
    VALUES
    ('b1k-jacket', target_org_id, 'B1K-JKT-25', 'Chamarra Oficial Baja 1000', 1890, '/assets/EDICION_2025/chamarra-baja1000.webp', 10, true),
    ('b1k-hoodie-ng', target_org_id, 'B1K-HOOD-NG', 'Hoodie Oficial Negro / Gris', 1100, '/assets/EDICION_2025/hoodie-negro-gris-baja1000.webp', 10, true),
    ('b1k-hoodie-blk', target_org_id, 'B1K-HOOD-BLK', 'Hoodie Clásica Negra', 1100, '/assets/OTRAS_EDICIONES/hoodie-negra-baja1000.webp', 10, true),
    ('b1k-hoodie-red-blk', target_org_id, 'B1K-HOOD-RB', 'Hoodie Contrast Rojo / Negro', 1100, '/assets/OTRAS_EDICIONES/hoodie-negra-roja-baja1000.webp', 10, true),
    ('b1k-tee-black', target_org_id, 'B1K-TEE-BLK', 'Camiseta Negra Oficial Baja 1000', 480, '/assets/EDICION_2025/camiseta-negra-baja1000.webp', 10, true),
    ('b1k-tee-brown', target_org_id, 'B1K-TEE-BRN', 'Camiseta Café Baja 1000', 480, '/assets/EDICION_2025/camiseta-cafe-baja1000.jpg.webp', 10, true),
    ('b1k-shirt-pits-grey', target_org_id, 'B1K-SHIRT-GRY', 'Camisa Pits Gris Baja 1000', 690, '/assets/EDICION_2025/camisa-gris-pits-baja1000.jpg.webp', 10, true),
    ('b1k-shirt-pits-black', target_org_id, 'B1K-SHIRT-BLK', 'Camisa Pits Negra Baja 1000', 690, '/assets/EDICION_2025/camisa-negra-pits-baja1000.webp', 10, true),
    ('b1k-cap', target_org_id, 'B1K-CAP-RG', 'Gorra Oficial Roja / Gris', 650, '/assets/EDICION_2025/gorras-roja-gris.webp', 10, true),
    ('b500-tee-grey', target_org_id, 'B500-TEE-GRY', 'Camiseta Oficial Baja 500', 480, '/assets/BAJA500/camiseta-gris-baja500.webp', 10, true),
    ('b400-tee-brown', target_org_id, 'B400-TEE-BRN', 'Camiseta Café Baja 400', 480, '/assets/BAJA400/camiseta-cafe- oscuro-baja400.webp', 10, true),
    ('sf250-tank', target_org_id, 'SF250-TNK-BLK', 'Tank Top San Felipe 250', 440, '/assets/SF250/camiseta-negra-sinmangas-SF250.webp', 10, true)
    ON CONFLICT (id) DO UPDATE
    SET price = EXCLUDED.price, name = EXCLUDED.name, stock = 10;
END $$;

-- 7. Índices y Verificación
CREATE INDEX IF NOT EXISTS idx_products_org_id ON public.products(org_id);

-- Verificar inserción
SELECT 'products_count' as label, COUNT(*) as count
FROM public.products
WHERE org_id = (SELECT id FROM public.organizations WHERE slug='score-store');
