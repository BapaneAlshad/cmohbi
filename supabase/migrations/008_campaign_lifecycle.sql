do $$
begin
  if not exists (select 1 from pg_type where typname = 'campaign_lifecycle_status' and typnamespace = 'public'::regnamespace) then
    create type public.campaign_lifecycle_status as enum ('active', 'archived', 'trashed');
  end if;
end
$$;

alter table public.campaigns
  add column if not exists lifecycle_status public.campaign_lifecycle_status not null default 'active',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists previous_lifecycle_status public.campaign_lifecycle_status;

update public.campaigns set lifecycle_status = 'active' where lifecycle_status is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_previous_lifecycle_check') then
    alter table public.campaigns add constraint campaigns_previous_lifecycle_check
      check (previous_lifecycle_status is null or previous_lifecycle_status in ('active', 'archived'));
  end if;
end
$$;

create index if not exists campaigns_workspace_lifecycle_created_idx
  on public.campaigns(workspace_id, lifecycle_status, created_at desc);

create or replace function public.is_workspace_manager(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

revoke execute on function public.is_workspace_manager(uuid) from public, anon;
grant execute on function public.is_workspace_manager(uuid) to authenticated, service_role;

create or replace function public.protect_campaign_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.lifecycle_status is distinct from new.lifecycle_status
    and auth.uid() is not null
    and not public.is_workspace_manager(new.workspace_id) then
    raise exception 'Only workspace managers can change campaign lifecycle';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_campaign_lifecycle() from public, anon, authenticated;
grant execute on function public.protect_campaign_lifecycle() to service_role;

drop trigger if exists protect_campaign_lifecycle_trigger on public.campaigns;
create trigger protect_campaign_lifecycle_trigger
  before update on public.campaigns
  for each row execute function public.protect_campaign_lifecycle();

drop policy if exists "members manage campaigns" on public.campaigns;
drop policy if exists "members read campaigns" on public.campaigns;
drop policy if exists "members create campaigns" on public.campaigns;
drop policy if exists "members update campaigns" on public.campaigns;

create policy "members read campaigns"
  on public.campaigns for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "members create campaigns"
  on public.campaigns for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and lifecycle_status = 'active');

create policy "members update campaigns"
  on public.campaigns for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create table if not exists public.campaign_delete_pin_attempts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.campaign_delete_pin_attempts enable row level security;
revoke all on public.campaign_delete_pin_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_delete_pin_attempts to service_role;

create table if not exists public.campaign_audit_logs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null,
  campaign_name text not null,
  action text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_audit_logs_workspace_created_idx
  on public.campaign_audit_logs(workspace_id, created_at desc);

alter table public.campaign_audit_logs enable row level security;
revoke all on public.campaign_audit_logs from public, anon, authenticated;
grant select, insert on public.campaign_audit_logs to service_role;
grant usage, select on sequence public.campaign_audit_logs_id_seq to service_role;

create policy "managers read campaign audit logs"
  on public.campaign_audit_logs for select to authenticated
  using (public.is_workspace_manager(workspace_id));

grant select on public.campaign_audit_logs to authenticated;

comment on column public.campaigns.lifecycle_status is
  'Operational lifecycle, kept separate from the campaign execution status.';
comment on table public.campaign_delete_pin_attempts is
  'Server-only failed verification counters. No PIN or PIN hash is stored here.';
comment on table public.campaign_audit_logs is
  'Immutable lifecycle audit records. campaign_id intentionally has no foreign key so hard-delete history is retained.';
