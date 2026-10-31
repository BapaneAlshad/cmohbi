-- Additive development migration. Apply after task_assignees and content_calendar_type.
create schema if not exists private;

create table public.campaign_kpis (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  unit text not null check (length(btrim(unit)) between 1 and 40),
  baseline numeric(18,4) not null default 0 check (baseline >= 0 and baseline <> 'NaN'::numeric),
  target_increase numeric(18,4) not null check (target_increase > 0 and target_increase <> 'NaN'::numeric),
  current_value numeric(18,4) not null default 0 check (current_value >= 0 and current_value <> 'NaN'::numeric),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_kpis_campaign_idx on public.campaign_kpis(workspace_id, campaign_id, created_at);
alter table public.campaign_kpis enable row level security;
revoke all on public.campaign_kpis from public, anon, authenticated;
grant select, insert, update on public.campaign_kpis to authenticated;
grant all on public.campaign_kpis to service_role;
create policy "members read campaign kpis" on public.campaign_kpis for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "managers insert campaign kpis" on public.campaign_kpis for insert to authenticated
with check (public.is_workspace_manager(workspace_id) and exists (
  select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = campaign_kpis.workspace_id and c.lifecycle_status = 'active'
));
create policy "managers update campaign kpis" on public.campaign_kpis for update to authenticated
using (public.is_workspace_manager(workspace_id))
with check (public.is_workspace_manager(workspace_id) and exists (
  select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = campaign_kpis.workspace_id and c.lifecycle_status = 'active'
));

create or replace function private.stamp_campaign_kpi() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id or new.campaign_id <> old.campaign_id then raise exception 'KPI campaign cannot be reassigned'; end if;
    new.created_at := old.created_at; new.created_by := old.created_by;
  else new.created_by := auth.uid(); end if;
  new.updated_by := auth.uid(); new.updated_at := clock_timestamp();
  return new;
end; $$;
revoke all on function private.stamp_campaign_kpi() from public, anon, authenticated;
create trigger stamp_campaign_kpi before insert or update on public.campaign_kpis for each row execute function private.stamp_campaign_kpi();

create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid,
  task_id uuid not null,
  task_title text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  old_status public.task_status not null,
  new_status public.task_status not null,
  created_at timestamptz not null default clock_timestamp()
);
create index task_status_history_campaign_idx on public.task_status_history(workspace_id, campaign_id, created_at desc, id desc);
alter table public.task_status_history enable row level security;
revoke all on public.task_status_history from public, anon, authenticated;
grant select on public.task_status_history to authenticated;
grant all on public.task_status_history to service_role;
create policy "members read task status history" on public.task_status_history for select to authenticated
using (public.is_workspace_member(workspace_id));

create or replace function private.record_task_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.task_status_history (workspace_id, campaign_id, task_id, task_title, actor_id, actor_name, old_status, new_status)
  values (new.workspace_id, new.campaign_id, new.id, new.title, auth.uid(),
    coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), 'Sistem'), old.status, new.status);
  return new;
end; $$;
revoke all on function private.record_task_status() from public, anon, authenticated;
create trigger record_task_status after update of status on public.tasks for each row
when (old.status is distinct from new.status) execute function private.record_task_status();

-- A single transactional mutation for task fields and multi-assignee changes.
create or replace function public.update_marketing_task(p_task_id uuid, p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.tasks; selected_ids uuid[]; k text; config jsonb; phase_map jsonb;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found or access denied'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = t.workspace_id and m.user_id = auth.uid() and m.role <> 'viewer') then
    raise exception 'Read-only access' using errcode = '42501';
  end if;
  if t.campaign_id is not null and not exists (select 1 from public.campaigns c where c.id = t.campaign_id and c.workspace_id = t.workspace_id and c.lifecycle_status = 'active') then
    raise exception 'Campaign is read-only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid task patch'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('title','due_date','priority','status','content_calendar_type','assignee_ids','phase_id') then raise exception 'Unsupported task field'; end if;
  end loop;
  if p_patch ? 'title' and (p_patch->>'title' is null or length(btrim(p_patch->>'title')) = 0) then raise exception 'Title is required'; end if;
  if p_patch ? 'due_date' and (p_patch->>'due_date' is null or p_patch->>'due_date' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'A valid deadline is required'; end if;
  if p_patch ? 'priority' and (p_patch->>'priority' is null or p_patch->>'priority' not in ('Rendah','Sedang','Tinggi')) then raise exception 'Invalid priority'; end if;
  if p_patch ? 'status' and p_patch->>'status' is null then raise exception 'Invalid status'; end if;
  if p_patch ? 'content_calendar_type' and p_patch->>'content_calendar_type' is not null and p_patch->>'content_calendar_type' not in ('feed_carousel','reels') then raise exception 'Invalid content type'; end if;
  if p_patch ? 'assignee_ids' then
    if jsonb_typeof(p_patch->'assignee_ids') <> 'array' then raise exception 'Invalid assignees'; end if;
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into selected_ids from jsonb_array_elements_text(p_patch->'assignee_ids');
    if exists (select 1 from unnest(selected_ids) as assigned(id) where not exists (
      select 1 from public.workspace_members m where m.workspace_id = t.workspace_id and m.user_id = assigned.id
    )) then raise exception 'Assignee must belong to task workspace'; end if;
  end if;
  if p_patch ? 'phase_id' then
    if t.campaign_id is null or jsonb_typeof(p_patch->'phase_id') <> 'string' then raise exception 'Invalid phase assignment'; end if;
    select coalesce(timeline_config, '{}'::jsonb) into config from public.campaigns where id = t.campaign_id for update;
    if p_patch->>'phase_id' <> '' and not exists (select 1 from jsonb_array_elements(coalesce(config->'phases', '[]'::jsonb)) as phase where phase->>'id' = p_patch->>'phase_id') then raise exception 'Phase not found in campaign'; end if;
    phase_map := coalesce(config->'taskPhase', '{}'::jsonb);
    if p_patch->>'phase_id' = '' then phase_map := phase_map - t.id::text;
    else phase_map := phase_map || jsonb_build_object(t.id::text, p_patch->>'phase_id'); end if;
    update public.campaigns set timeline_config = jsonb_set(config, '{taskPhase}', phase_map) where id = t.campaign_id;
  end if;
  update public.tasks set
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else due_date end,
    priority = case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
    status = case when p_patch ? 'status' then (p_patch->>'status')::public.task_status else status end,
    content_calendar_type = case when p_patch ? 'content_calendar_type' then p_patch->>'content_calendar_type' else content_calendar_type end,
    assignee_id = case when p_patch ? 'assignee_ids' then selected_ids[1] else assignee_id end,
    updated_at = clock_timestamp()
  where id = p_task_id returning * into t;
  if p_patch ? 'assignee_ids' then
    delete from public.task_assignees where task_id = p_task_id and not (user_id = any(selected_ids));
    insert into public.task_assignees(task_id, user_id) select p_task_id, assigned.id from unnest(selected_ids) as assigned(id) on conflict do nothing;
  end if;
  return to_jsonb(t);
end; $$;
revoke all on function public.update_marketing_task(uuid,jsonb) from public, anon;
grant execute on function public.update_marketing_task(uuid,jsonb) to authenticated;

-- Workspace autosave may edit phase definitions, but must preserve assignments
-- committed by update_marketing_task in another request.
create or replace function public.save_campaign_timeline(p_campaign_id uuid, p_phase_mode boolean, p_phases jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_phases) <> 'array' then raise exception 'Invalid phases'; end if;
  if not exists (select 1 from public.campaigns c join public.workspace_members m on m.workspace_id = c.workspace_id
    where c.id = p_campaign_id and c.lifecycle_status = 'active' and m.user_id = auth.uid() and m.role <> 'viewer') then
    raise exception 'Campaign is read-only' using errcode = '42501';
  end if;
  update public.campaigns set timeline_config = coalesce(timeline_config, '{}'::jsonb) || jsonb_build_object('phaseMode', p_phase_mode, 'phases', p_phases) where id = p_campaign_id;
end; $$;
revoke all on function public.save_campaign_timeline(uuid,boolean,jsonb) from public, anon;
grant execute on function public.save_campaign_timeline(uuid,boolean,jsonb) to authenticated;
