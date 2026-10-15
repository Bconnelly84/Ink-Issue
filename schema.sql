-- Comic Collector cloud schema draft.
-- Apply only after creating a Supabase project and reviewing source licensing.
create extension if not exists pgcrypto;

create table if not exists public.publishers (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  name text not null,
  country_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers(id),
  source_key text unique,
  title text not null,
  volume_label text,
  start_year integer,
  end_year integer,
  created_at timestamptz not null default now()
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id),
  source_key text unique,
  issue_number text not null,
  issue_title text,
  cover_date date,
  release_date date,
  plot_summary text,
  summary_source text,
  summary_source_url text,
  record_status text not null default 'unverified'
    check (record_status in ('unverified','announced','verified','delayed','cancelled','released')),
  updated_at timestamptz not null default now()
);

create table if not exists public.variants (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id),
  source_key text unique,
  cover_label text,
  cover_artist text,
  variant_type text,
  incentive_ratio text,
  retailer_or_event text,
  image_url text,
  image_source_url text,
  image_attribution text,
  image_license text,
  image_status text not null default 'missing'
    check (image_status in ('missing','available','needs_review','restricted')),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references public.variants(id),
  copy_count integer not null default 1 check (copy_count > 0),
  condition_note text,
  grade text,
  purchase_price numeric(10,2),
  purchase_date date,
  storage_location text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, variant_id)
);

create table if not exists public.pull_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, series_id)
);

alter table public.publishers enable row level security;
alter table public.series enable row level security;
alter table public.issues enable row level security;
alter table public.variants enable row level security;
alter table public.collection_items enable row level security;
alter table public.pull_list_items enable row level security;

create policy "published catalog is readable" on public.publishers for select using (true);
create policy "series catalog is readable" on public.series for select using (true);
create policy "issue catalog is readable" on public.issues for select using (true);
create policy "variant catalog is readable" on public.variants for select using (true);

create policy "users manage own collection" on public.collection_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own pull list" on public.pull_list_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
