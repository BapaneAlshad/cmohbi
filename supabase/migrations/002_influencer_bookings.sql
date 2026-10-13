create table if not exists public.influencer_bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_name text not null,
  platform public.social_platform not null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_title text not null,
  scheduled_at timestamptz not null,
  status text not null default 'Terjadwal',
  rate numeric(14,2) not null default 0,
  spent numeric(14,2) not null default 0,
  payment_status text not null default 'Belum dibayar',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists influencer_bookings_workspace_date_idx
  on public.influencer_bookings(workspace_id, scheduled_at desc);

alter table public.influencer_bookings enable row level security;

drop policy if exists "members manage influencer bookings" on public.influencer_bookings;
create policy "members manage influencer bookings"
  on public.influencer_bookings for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
