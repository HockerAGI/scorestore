-- =========================================================
-- UnicOs / SCORE STORE — SAFE SQL (IDEMPOTENT) v2026-02-18
-- Target: Supabase Postgres (public schema)
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
  jsonb_build_object('source','schema.sql','created','2026-02-18')
)
ON CONFLICT (id) DO NOTHING;

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

  items jsonb NOT NULL DEFAULT '[]'::jsonb,

  shipping_mode text NULL,
  postal_code text NULL,

  stripe_session_id text NULL,
  stripe_payment_intent_id text NULL,
  stripe_customer_id text NULL,

  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organization_id uuid NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS phone text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MXN';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_subtotal_mxn numeric(12,2) NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_shipping_mxn numeric(12,2) NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_discount_mxn numeric(12,2) NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_total_mxn numeric(12,2) NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_mode text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS postal_code text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_customer_id text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'orders' AND c.contype = 'f' AND pg_get_constraintdef(c.oid) ILIKE '%(organization_id)%references public.organizations%'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='orders' AND c.contype='u' AND pg_get_constraintdef(c.oid) ILIKE '%(stripe_session_id)%'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_stripe_session_id_uniq UNIQUE (stripe_session_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_org_idx ON public.orders (organization_id);

CREATE TABLE IF NOT EXISTS public.shipping_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  stripe_session_id text NULL,
  carrier text NULL,
  tracking_number text NULL,
  label_url text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS org_id uuid NULL;
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS stripe_session_id text NULL;
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS carrier text NULL;
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS tracking_number text NULL;
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS label_url text NULL;
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb;

-- CORRECCIÓN: AGREGADAS COLUMNAS FALTANTES PARA WEBHOOK DE ENVÍA
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.shipping_labels ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='shipping_labels' AND c.contype='u' AND pg_get_constraintdef(c.oid) ILIKE '%(stripe_session_id)%'
  ) THEN
    ALTER TABLE public.shipping_labels ADD CONSTRAINT shipping_labels_stripe_session_id_uniq UNIQUE (stripe_session_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shipping_labels_org_idx ON public.shipping_labels (org_id);
CREATE INDEX IF NOT EXISTS shipping_labels_tracking_idx ON public.shipping_labels (tracking_number);

CREATE TABLE IF NOT EXISTS public.shipping_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'envia',
  status text NULL,
  tracking_number text NULL,
  stripe_session_id text NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.shipping_webhooks ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.shipping_webhooks ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'envia';
ALTER TABLE public.shipping_webhooks ADD COLUMN IF NOT EXISTS status text NULL;
ALTER TABLE public.shipping_webhooks ADD COLUMN IF NOT EXISTS tracking_number text NULL;
ALTER TABLE public.shipping_webhooks ADD COLUMN IF NOT EXISTS stripe_session_id text NULL;
ALTER TABLE public.shipping_webhooks ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS shipping_webhooks_created_at_idx ON public.shipping_webhooks (created_at DESC);
CREATE INDEX IF NOT EXISTS shipping_webhooks_tracking_idx ON public.shipping_webhooks (tracking_number);
CREATE INDEX IF NOT EXISTS shipping_webhooks_stripe_session_idx ON public.shipping_webhooks (stripe_session_id);
