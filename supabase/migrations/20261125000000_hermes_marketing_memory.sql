create table if not exists public.hermes_marketing_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null default 'marketing' check (scope = 'marketing'),
  source_path text not null check (source_path in (
    'Business/Brief-Konten-Opening-Sukho.md',
    'Business/Brief_Konten_Influencer_Sukho_Ramen.md'
  )),
  title text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_path)
);

create index if not exists hermes_marketing_memory_workspace_idx
  on public.hermes_marketing_memory (workspace_id, updated_at desc);

alter table public.hermes_marketing_memory enable row level security;
alter table public.hermes_marketing_memory force row level security;

revoke all on public.hermes_marketing_memory from anon, authenticated;
grant select on public.hermes_marketing_memory to authenticated;
grant all on public.hermes_marketing_memory to service_role;

create policy hermes_marketing_memory_member_read
  on public.hermes_marketing_memory
  for select
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and scope = 'marketing'
    and source_path in (
      'Business/Brief-Konten-Opening-Sukho.md',
      'Business/Brief_Konten_Influencer_Sukho_Ramen.md'
    )
  );
