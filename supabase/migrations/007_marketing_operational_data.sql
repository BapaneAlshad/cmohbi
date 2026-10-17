create table if not exists public.marketing_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  sender text not null,
  request_date date not null default current_date,
  brand text not null default 'HBI',
  priority text not null default 'Sedang',
  status text not null default 'Baru',
  pic_id uuid references public.profiles(id) on delete set null,
  icon text not null default '✦',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_influencers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  platform text not null,
  niche text not null default 'Belum diisi',
  rate numeric(14,2) not null default 0,
  followers text not null default '—',
  engagement text not null default '—',
  status text not null default 'Review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.marketing_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vendor text not null,
  category text not null,
  transaction_date date not null default current_date,
  amount numeric(14,2) not null default 0,
  transaction_type text not null default 'Rencana',
  status text not null default 'Belum Dibayar',
  brand text not null default 'HBI',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_requests_workspace_date_idx
  on public.marketing_requests(workspace_id, request_date desc);
create index if not exists marketing_influencers_workspace_name_idx
  on public.marketing_influencers(workspace_id, name);
create index if not exists marketing_transactions_workspace_date_idx
  on public.marketing_transactions(workspace_id, transaction_date desc);

alter table public.marketing_requests enable row level security;
alter table public.marketing_influencers enable row level security;
alter table public.marketing_transactions enable row level security;

revoke all on public.marketing_requests from anon;
revoke all on public.marketing_influencers from anon;
revoke all on public.marketing_transactions from anon;

drop policy if exists "members manage marketing requests" on public.marketing_requests;
create policy "members manage marketing requests"
  on public.marketing_requests for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "members manage marketing influencers" on public.marketing_influencers;
create policy "members manage marketing influencers"
  on public.marketing_influencers for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "members manage marketing transactions" on public.marketing_transactions;
create policy "members manage marketing transactions"
  on public.marketing_transactions for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.marketing_requests to authenticated, service_role;
grant select, insert, update, delete on public.marketing_influencers to authenticated, service_role;
grant select, insert, update, delete on public.marketing_transactions to authenticated, service_role;
