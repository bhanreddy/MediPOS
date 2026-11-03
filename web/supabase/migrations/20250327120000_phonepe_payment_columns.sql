-- Upgrade path: older DBs used razorpay_* column names. New installs already have payment_* from 20250326120000.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'razorpay_order_id'
  ) then
    alter table public.subscriptions rename column razorpay_order_id to payment_merchant_order_id;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'razorpay_payment_id'
  ) then
    alter table public.subscriptions rename column razorpay_payment_id to payment_transaction_id;
  end if;
end $$;

alter table public.subscriptions add column if not exists payment_provider_order_id text;

drop index if exists subscriptions_razorpay_order_id_idx;
create index if not exists subscriptions_payment_merchant_order_id_idx
  on public.subscriptions (payment_merchant_order_id);
