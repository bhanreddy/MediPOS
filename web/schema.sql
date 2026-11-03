-- PHASE: MEDICAL PROFILE
-- Authoritative Source: Supabase
-- This table stores formatting and legal details for the Medical Shop.

create table if not exists public.medical_profile (
    id uuid not null default gen_random_uuid() primary key,

    -- Identity & Login
    user_id uuid references auth.users(id) on delete cascade,
    email text not null,
    medical_name text not null,
    owner_name text not null,

    -- Legal
    gst_number text not null,
    drug_license_number text not null,

    -- Address
    address_line_1 text not null,
    address_line_2 text,
    city text not null,
    state text not null,
    pincode text not null,

    -- Branding & Contact
    logo_url text, -- Full public URL
    phone_number text not null, -- Editable by Client

    -- Meta
    verified boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- RLS Policies
alter table public.medical_profile enable row level security;

-- Make policy creation safe on re-runs
drop policy if exists "Allow read access to authenticated users"
on public.medical_profile;

create policy "Allow read access to authenticated users"
on public.medical_profile for select
to authenticated
using (true);

drop policy if exists "Allow update for authenticated users"
on public.medical_profile;

create policy "Allow update for authenticated users"
on public.medical_profile for update
to authenticated
using (true)
with check (true);