-- =========================================================
-- SCORE STORE / UnicOs — SUPABASE MIGRATION (SAFE + IDEMPOTENT)
-- No borra datos. Solo crea lo faltante / agrega columnas faltantes /
-- crea índices y triggers si NO existen.
-- =========================================================

create extension if not exists pgcrypto;

-- updated_at helper (seguro: no rompe datos)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- TABLE: orders
-- =========================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid null,
  stripe_session_id text not null,
  stripe_payment_intent_id text null,
  status text not null default 'checkout_created',
  currency text null,
  amount_total_cents integer null,
  amount_subtotal_cents integer null,
  shipping_mode text null,
  postal_code text null,
  promo_code text null,
  items jsonb null,
  items_qty integer null,
  customer_email text null,
  customer_phone text null,
  shipping_name text null,
  shipping_address jsonb null,
  created_at timestamptz not null default now(),
  paid_at timestamptz null,
  updated_at timestamptz not null default now(),
  raw_stripe jsonb null
);

-- Agrega columnas faltantes (si tu tabla ya existía con menos campos)
alter table public.orders add column if not exists org_id uuid;
alter table public.orders add column if not exists stripe_session_id text;
alter table public.orders add column if not exists stripe_payment_intent_id text;
alter table public.orders add column if not exists status text;
alter table public.orders add column if not exists currency text;
alter table public.orders add column if not exists amount_total_cents integer;
alter table public.orders add column if not exists amount_subtotal_cents integer;
alter table public.orders add column if not exists shipping_mode text;
alter table public.orders add column if not exists postal_code text;
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists items jsonb;
alter table public.orders add column if not exists items_qty integer;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists shipping_name text;
alter table public.orders add column if not exists shipping_address jsonb;
alter table public.orders add column if not exists created_at timestamptz;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists updated_at timestamptz;
alter table public.orders add column if not exists raw_stripe jsonb;

-- Unique index UPSERT (no borra nada)
create unique index if not exists orders_stripe_session_id_key
on public.orders (stripe_session_id);

create index if not exists orders_org_id_idx on public.orders (org_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_paid_at_idx on public.orders (paid_at);

-- Trigger updated_at SOLO si no existe
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_orders_updated_at') then
    execute 'create trigger trg_orders_updated_at
             before update on public.orders
             for each row execute function public.set_updated_at()';
  end if;
end $$;

-- =========================================================
-- TABLE: shipping_labels
-- =========================================================
create table if not exists public.shipping_labels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid null,
  stripe_session_id text not null,
  provider text not null default 'envia',
  carrier text null,
  service text null,
  tracking_number text null,
  label_url text null,
  status text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw jsonb null
);

alter table public.shipping_labels add column if not exists org_id uuid;
alter table public.shipping_labels add column if not exists stripe_session_id text;
alter table public.shipping_labels add column if not exists provider text;
alter table public.shipping_labels add column if not exists carrier text;
alter table public.shipping_labels add column if not exists service text;
alter table public.shipping_labels add column if not exists tracking_number text;
alter table public.shipping_labels add column if not exists label_url text;
alter table public.shipping_labels add column if not exists status text;
alter table public.shipping_labels add column if not exists created_at timestamptz;
alter table public.shipping_labels add column if not exists updated_at timestamptz;
alter table public.shipping_labels add column if not exists raw jsonb;

create unique index if not exists shipping_labels_session_provider_key
on public.shipping_labels (stripe_session_id, provider);

create index if not exists shipping_labels_tracking_idx
on public.shipping_labels (tracking_number);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_shipping_labels_updated_at') then
    execute 'create trigger trg_shipping_labels_updated_at
             before update on public.shipping_labels
             for each row execute function public.set_updated_at()';
  end if;
end $$;

-- =========================================================
-- TABLE: shipping_webhooks  (dedupe por hash)
-- =========================================================
create table if not exists public.shipping_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text null,
  status text null,
  tracking_number text null,
  stripe_session_id text null,
  created_at timestamptz not null default now(),
  raw jsonb not null,
  raw_hash text generated always as (md5(raw::text)) stored
);

alter table public.shipping_webhooks add column if not exists provider text;
alter table public.shipping_webhooks add column if not exists event_type text;
alter table public.shipping_webhooks add column if not exists status text;
alter table public.shipping_webhooks add column if not exists tracking_number text;
alter table public.shipping_webhooks add column if not exists stripe_session_id text;
alter table public.shipping_webhooks add column if not exists created_at timestamptz;
alter table public.shipping_webhooks add column if not exists raw jsonb;

-- raw_hash (solo si no existe; si ya existe, NO lo toca)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shipping_webhooks' and column_name='raw_hash'
  ) then
    execute 'alter table public.shipping_webhooks
             add column raw_hash text generated always as (md5(raw::text)) stored';
  end if;
end $$;

create unique index if not exists shipping_webhooks_dedupe_key
on public.shipping_webhooks (provider, raw_hash);

create index if not exists shipping_webhooks_session_idx
on public.shipping_webhooks (stripe_session_id);

create index if not exists shipping_webhooks_tracking_idx
on public.shipping_webhooks (tracking_number);

-- =========================================================
-- RLS (habilita sin destruir policies existentes)
-- =========================================================
alter table public.orders enable row level security;
alter table public.shipping_labels enable row level security;
alter table public.shipping_webhooks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='orders' and policyname='orders_no_anon'
  ) then
    execute 'create policy orders_no_anon on public.orders for select using (false)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='shipping_labels' and policyname='labels_no_anon'
  ) then
    execute 'create policy labels_no_anon on public.shipping_labels for select using (false)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='shipping_webhooks' and policyname='webhooks_no_anon'
  ) then
    execute 'create policy webhooks_no_anon on public.shipping_webhooks for select using (false)';
  end if;
end $$;