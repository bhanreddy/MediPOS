-- Clinic subscription billing: PhonePe Standard Checkout (merchant order + provider order id)

alter table public.clinic_subscriptions
  add column if not exists payment_merchant_order_id text,
  add column if not exists payment_provider_order_id text;

create unique index if not exists clinic_subscriptions_payment_merchant_order_id_key
  on public.clinic_subscriptions (payment_merchant_order_id)
  where payment_merchant_order_id is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'clinic_subscriptions_status_check'
      and conrelid = 'public.clinic_subscriptions'::regclass
  ) then
    alter table public.clinic_subscriptions drop constraint clinic_subscriptions_status_check;
  end if;
end $$;

alter table public.clinic_subscriptions add constraint clinic_subscriptions_status_check
  check (status in (
    'created', 'authenticated', 'active', 'paused', 'cancelled', 'expired', 'trial', 'pending'
  ));
