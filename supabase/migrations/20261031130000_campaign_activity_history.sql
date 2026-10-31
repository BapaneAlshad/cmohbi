-- Additive activity history for influencer cooperation status changes.
-- Apply only after review; do not backfill historical rows.

create table public.campaign_influencer_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null,
  booking_id uuid not null,
  influencer_name text not null,
  content_label text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  old_status text not null,
  new_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint campaign_influencer_status_history_changed check (old_status <> new_status)
);

create index campaign_influencer_status_history_campaign_idx
  on public.campaign_influencer_status_history(workspace_id, campaign_id, created_at desc, id desc);

alter table public.campaign_influencer_status_history enable row level security;
revoke all on public.campaign_influencer_status_history from public, anon, authenticated;
grant select on public.campaign_influencer_status_history to authenticated;
grant all on public.campaign_influencer_status_history to service_role;
create policy "workspace members read influencer status history"
  on public.campaign_influencer_status_history for select to authenticated
  using (public.is_workspace_member(workspace_id));

create or replace function private.record_campaign_influencer_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  snapshot_content text;
  snapshot_actor text;
begin
  if new.status is not distinct from old.status or new.campaign_id is null then
    return new;
  end if;

  select theme.name into snapshot_content
  from public.campaign_influencer_themes theme
  where theme.id = new.campaign_influencer_theme_id
    and theme.campaign_id = new.campaign_id
    and theme.workspace_id = new.workspace_id;

  select profile.full_name into snapshot_actor
  from public.profiles profile
  where profile.id = auth.uid();

  insert into public.campaign_influencer_status_history (
    workspace_id, campaign_id, booking_id, influencer_name, content_label,
    actor_id, actor_name, old_status, new_status
  ) values (
    new.workspace_id, new.campaign_id, new.id, coalesce(nullif(btrim(new.influencer_name), ''), 'Influencer'),
    coalesce(nullif(btrim(snapshot_content), ''), nullif(btrim(new.content_title), ''), 'Konten influencer'),
    auth.uid(), coalesce(nullif(btrim(snapshot_actor), ''), 'Sistem'), old.status, new.status
  );
  return new;
end;
$$;
revoke all on function private.record_campaign_influencer_status() from public, anon, authenticated;
drop trigger if exists record_campaign_influencer_status on public.influencer_bookings;
create trigger record_campaign_influencer_status
  after update of status on public.influencer_bookings
  for each row when (old.status is distinct from new.status)
  execute function private.record_campaign_influencer_status();

create or replace view public.campaign_activity_feed with (security_invoker = true) as
  select history.id, history.workspace_id, history.campaign_id,
    'task_status'::text as kind, ('Tugas: ' || history.task_title)::text as label,
    history.actor_id, history.actor_name,
    history.old_status::text as from_status, history.new_status::text as to_status,
    history.created_at
  from public.task_status_history history
  where history.campaign_id is not null
  union all
  select history.id, history.workspace_id, history.campaign_id,
    'influencer_status'::text as kind,
    ('Jadwal influencer: ' || history.influencer_name || ' · ' || history.content_label)::text as label,
    history.actor_id, history.actor_name, history.old_status as from_status, history.new_status as to_status,
    history.created_at
  from public.campaign_influencer_status_history history;

revoke all on public.campaign_activity_feed from public, anon;
grant select on public.campaign_activity_feed to authenticated;
