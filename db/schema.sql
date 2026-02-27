-- =========================================================
-- SCORE STORE — SAFE SQL (IDEMPOTENT) v2026-02-26
-- Target: Supabase Postgres (public schema)
-- Objetivo:
-- - Multi-tenant REAL (Score Store + UnicOs + futuras marcas)
-- - Sin romper: crea lo faltante, respeta lo existente
-- =========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1) Organizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Score Store default org (ID fijo)
INSERT INTO public.organizations (id, name, slug, metadata)
VALUES (
  '1f3b9980-a1c5-4557-b4eb-a75bb9a8aaa6'::uuid,
  'Score Store',
  'score-store',
  jsonb_build_object('source','schema.sql','created','2026-02-26')
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  slug = COALESCE(NULLIF(public.organizations.slug,''), EXCLUDED.slug),
  metadata = public.organizations.metadata || EXCLUDED.metadata;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.organizations'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid) ILIKE '%(slug)%'
  ) THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_slug_uniq UNIQUE (slug);
  END IF;
EXCEPTION WHEN duplicate_object THEN
END $$;

-- -----------------------------------------------------------------------------
-- 2) Admin users (multi-tenant)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz NULL
);

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.admin_users'::regclass
    AND contype='u'
    AND pg_get_constraintdef(oid) ILIKE '%(email)%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%(organization_id, email)%'
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_users DROP CONSTRAINT %I', cname);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admin_users'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid) ILIKE '%(organization_id, email)%'
  ) THEN
    ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_org_email_uniq UNIQUE (organization_id, email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_users_email_norm ON public.admin_users ((lower(trim(email))));
CREATE INDEX IF NOT EXISTS idx_admin_users_org ON public.admin_users (organization_id);

-- -----------------------------------------------------------------------------
-- 3) Orders
-- -----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_org ON public.orders(organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid) ILIKE '%(stripe_session_id)%'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_stripe_session_id_uniq UNIQUE (stripe_session_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4) Shipping labels + webhooks
-- -----------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_shipping_labels_session ON public.shipping_labels(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_shipping_labels_org ON public.shipping_labels(org_id);
CREATE INDEX IF NOT EXISTS idx_shipping_labels_tracking ON public.shipping_labels(tracking_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.shipping_labels'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid) ILIKE '%(stripe_session_id)%'
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

-- -----------------------------------------------------------------------------
-- 5) RLS mínimo (backend)
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backend_orders_all" ON public.orders;
CREATE POLICY "backend_orders_all" ON public.orders FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "backend_shipping_labels_all" ON public.shipping_labels;
CREATE POLICY "backend_shipping_labels_all" ON public.shipping_labels FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "backend_shipping_webhooks_all" ON public.shipping_webhooks;
CREATE POLICY "backend_shipping_webhooks_all" ON public.shipping_webhooks FOR ALL USING (auth.role() = 'service_role');

COMMIT;