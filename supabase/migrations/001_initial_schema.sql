create extension if not exists "pgcrypto";

create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.social_platform as enum ('instagram', 'facebook', 'tiktok');
create type public.task_status as enum ('backlog', 'todo', 'in_progress', 'review', 'revision', 'done');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  job_title text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  brand text not null,
  objective text,
  kpi text,
  budget numeric(14,2) not null default 0,
  spent numeric(14,2) not null default 0,
  status text not null default 'Rencana',
  progress smallint not null default 0 check (progress between 0 and 100),
  owner_id uuid references public.profiles(id),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  status public.task_status not null default 'backlog',
  priority text not null default 'Sedang',
  due_date date,
  assignee_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.social_platform not null,
  external_account_id text not null,
  display_name text not null,
  handle text,
  status text not null default 'connected',
  token_reference text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_account_id)
);

comment on column public.social_accounts.token_reference is
  'Reference to a server-side secret. Never store raw provider access tokens in this table or in the browser.';

create table public.social_metric_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  captured_at timestamptz not null,
  followers bigint not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  views bigint not null default 0,
  engagement_rate numeric(8,4) not null default 0,
  raw_payload jsonb,
  unique (social_account_id, captured_at)
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  external_post_id text,
  title text not null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index tasks_workspace_status_idx on public.tasks(workspace_id, status);
create index metric_snapshots_account_date_idx on public.social_metric_snapshots(social_account_id, captured_at desc);
create index social_posts_workspace_publish_idx on public.social_posts(workspace_id, published_at desc);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.tasks enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_metric_snapshots enable row level security;
alter table public.social_posts enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace and user_id = auth.uid()
  );
$$;

create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members read membership" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "members manage campaigns" on public.campaigns for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members manage tasks" on public.tasks for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read social accounts" on public.social_accounts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read social metrics" on public.social_metric_snapshots for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members manage social posts" on public.social_posts for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
