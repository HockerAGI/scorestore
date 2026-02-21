-- =========================================================
-- UnicOs / SCORE STORE — SAFE SQL (IDEMPOTENT) v2026-02-21
-- Target: Supabase Postgres (public schema)
-- MEJORAS: Índices de alto rendimiento para el panel UnicOs,
-- tablas de auditoría y roles de administrador.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO public.organizations (id, name, metadata)
VALUES (
  '1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6'::uuid,
  'SCORE STORE (Default)',
  jsonb_build_object('source','schema.sql','created','2026-02-21')
)
ON CONFLICT (id) DO NOTHING;

-- Tabla preparada para los roles mencionados en el PDF de UnicOs
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES public.organizations(id),
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'staff', -- 'owner', 'marketing', 'inventory'
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text NULL,
  customer_name text NULL,
  phone text NULL,
  currency text NOT NULL DEFAULT 'MXN',
  amount_subtotal_mxn numeric(12,2) NULL,
  amount_shipping_mxn numeric(12,2) NULL,
  amount_discount_mxn numeric(12,2) NULL,
  amount_total_mxn numeric(12,2) NULL,
  promo_code text NULL,
  items_summary text NULL, 
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipping_mode text NULL,
  postal_code text NULL,
  stripe_session_id text NULL,
  stripe_payment_intent_id text NULL,
  stripe_customer_id text NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Asegurar columnas si la tabla ya existe
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items_summary text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organization_id uuid NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- ÍNDICES DE ALTO RENDIMIENTO PARA EL PANEL UnicOs (Aceleración de queries)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON public.orders(email);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='orders' AND c.contype='u' AND pg_get_constraintdef(c.oid) ILIKE '%(stripe_session_id)%'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_stripe_session_id_uniq UNIQUE (stripe_session_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.shipping_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stripe_session_id text NULL,
  carrier text NULL,
  tracking_number text NULL,
  label_url text NULL,
  status text NOT NULL DEFAULT 'pending',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_shipping_labels_session ON public.shipping_labels(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_shipping_labels_tracking ON public.shipping_labels(tracking_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='shipping_labels' AND c.contype='u' AND pg_get_constraintdef(c.oid) ILIKE '%(stripe_session_id)%'
  ) THEN
    ALTER TABLE public.shipping_labels ADD CONSTRAINT shipping_labels_stripe_session_id_uniq UNIQUE (stripe_session_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.shipping_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'envia',
  status text NULL,
  tracking_number text NULL,
  stripe_session_id text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_shipping_webhooks_tracking ON public.shipping_webhooks(tracking_number);