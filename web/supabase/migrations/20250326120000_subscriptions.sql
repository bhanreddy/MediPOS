-- Subscriptions + payment gateway linkage (PhonePe PG; MedPOS Pro)
-- Assumption: one logical subscription row per checkout; latest row wins in app logic.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null check (status in ('active', 'expired', 'pending')),
  payment_merchant_order_id text unique,
  payment_provider_order_id text,
  payment_transaction_id text,
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_created_at_idx
  on public.subscriptions (user_id, created_at desc);

create index if not exists subscriptions_payment_merchant_order_id_idx
  on public.subscriptions (payment_merchant_order_id);

alter table public.subscriptions enable row level security;

-- Authenticated users may read only their own rows (dashboards, debugging).
create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts/updates are performed with the service role from Edge Functions only.

comment on table public.subscriptions is 'Subscription lifecycle; payments via PhonePe PG; writes via Edge Functions (service role).';
