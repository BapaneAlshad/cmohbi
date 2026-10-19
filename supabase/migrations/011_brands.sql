create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  opening_date date,
  description text not null default '',
  target_customer text not null default '',
  vision text not null default '',
  mission text not null default '',
  logo_url text,
  outlet_image_url text,
  website_url text,
  proposal_url text,
  important_data_url text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.brand_menus (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  hpp numeric(14,2) not null default 0 check (hpp >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create index if not exists brands_workspace_name_idx on public.brands(workspace_id, name);
create index if not exists brand_menus_brand_idx on public.brand_menus(brand_id, name);

insert into public.brands (workspace_id, name)
select distinct source.workspace_id, trim(source.brand)
from (
  select workspace_id, brand from public.campaigns
  union all
  select workspace_id, brand from public.marketing_transactions
  union all
  select workspace_id, brand from public.marketing_requests
) as source
where trim(source.brand) <> ''
on conflict (workspace_id, name) do nothing;

alter table public.campaigns
  add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.tasks
  add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.marketing_transactions
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

update public.campaigns campaign
set brand_id = brand.id
from public.brands brand
where campaign.brand_id is null
  and campaign.workspace_id = brand.workspace_id
  and trim(campaign.brand) = brand.name;
update public.tasks task
set brand_id = brand.id
from public.brands brand
join public.campaigns campaign on campaign.id = task.campaign_id
where task.brand_id is null
  and task.workspace_id = brand.workspace_id
  and trim(campaign.brand) = brand.name;
update public.marketing_transactions transaction_row
set brand_id = brand.id
from public.brands brand
where transaction_row.brand_id is null
  and transaction_row.workspace_id = brand.workspace_id
  and trim(transaction_row.brand) = brand.name;

create index if not exists campaigns_workspace_brand_idx on public.campaigns(workspace_id, brand_id);
create index if not exists tasks_workspace_brand_idx on public.tasks(workspace_id, brand_id);
create index if not exists marketing_transactions_workspace_brand_idx on public.marketing_transactions(workspace_id, brand_id);

alter table public.brands enable row level security;
alter table public.brand_menus enable row level security;

drop policy if exists "members manage brands" on public.brands;
create policy "members manage brands"
  on public.brands for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "members manage brand menus" on public.brand_menus;
create policy "members manage brand menus"
  on public.brand_menus for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on table public.brands, public.brand_menus to authenticated, service_role;

insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "members upload brand assets" on storage.objects;
create policy "members upload brand assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "public read brand assets" on storage.objects;
create policy "public read brand assets"
  on storage.objects for select to public
  using (bucket_id = 'brand-assets');

drop policy if exists "members update brand assets" on storage.objects;
create policy "members update brand assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

comment on table public.brands is
  'Canonical brand profile used as the selectable brand reference across campaign, tasks, content, and transactions.';
comment on table public.brand_menus is
  'Menu cost and selling price by brand. Margin is calculated by the application as selling_price minus hpp.';
