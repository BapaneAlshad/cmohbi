-- Additive migration; requires campaign overview, multi-PIC, content type and brands.
alter table public.tasks add column if not exists is_priority boolean;
update public.tasks set is_priority = (priority = 'Tinggi') where is_priority is null;
alter table public.tasks alter column is_priority set default false, alter column is_priority set not null;

-- Restrictive boundaries also protect databases retaining older permissive policies.
create policy "task visibility boundary" on public.tasks as restrictive for select to authenticated
using (public.is_workspace_member(workspace_id) and (public.is_workspace_manager(workspace_id) or status <> 'backlog'));
create policy "task members read" on public.tasks for select to authenticated using(public.is_workspace_member(workspace_id));
create policy "task managers write" on public.tasks for all to authenticated
using(public.is_workspace_manager(workspace_id)) with check(public.is_workspace_manager(workspace_id));
create policy "task insert boundary" on public.tasks as restrictive for insert to authenticated with check (
  public.is_workspace_manager(workspace_id)
  and (campaign_id is null or exists(select 1 from public.campaigns c where c.id=campaign_id and c.workspace_id=tasks.workspace_id and c.lifecycle_status='active'))
  and (brand_id is null or exists(select 1 from public.brands b where b.id=brand_id and b.workspace_id=tasks.workspace_id))
);
create policy "task update boundary" on public.tasks as restrictive for update to authenticated
using(public.is_workspace_manager(workspace_id) and (campaign_id is null or exists(select 1 from public.campaigns c where c.id=campaign_id and c.lifecycle_status='active')))
with check(public.is_workspace_manager(workspace_id)
  and (campaign_id is null or exists(select 1 from public.campaigns c where c.id=campaign_id and c.workspace_id=tasks.workspace_id and c.lifecycle_status='active'))
  and (brand_id is null or exists(select 1 from public.brands b where b.id=brand_id and b.workspace_id=tasks.workspace_id)));
create policy "task delete boundary" on public.tasks as restrictive for delete to authenticated using(public.is_workspace_manager(workspace_id));

create policy "task assignee insert boundary" on public.task_assignees as restrictive for insert to authenticated
with check(exists(select 1 from public.tasks t join public.workspace_members m on m.workspace_id=t.workspace_id and m.user_id=task_assignees.user_id where t.id=task_id and public.is_workspace_manager(t.workspace_id)));
create policy "task assignee update boundary" on public.task_assignees as restrictive for update to authenticated
using(exists(select 1 from public.tasks t where t.id=task_id and public.is_workspace_manager(t.workspace_id)))
with check(exists(select 1 from public.tasks t join public.workspace_members m on m.workspace_id=t.workspace_id and m.user_id=task_assignees.user_id where t.id=task_id and public.is_workspace_manager(t.workspace_id)));
create policy "task assignee delete boundary" on public.task_assignees as restrictive for delete to authenticated
using(exists(select 1 from public.tasks t where t.id=task_id and public.is_workspace_manager(t.workspace_id)));

create table public.task_status_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_status public.task_status not null,
  requested_status public.task_status not null,
  requested_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check(state in ('pending','approved','rejected','cancelled','stale')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  check(from_status <> requested_status)
);
create unique index task_status_requests_one_pending_idx on public.task_status_requests(task_id) where state='pending';
create index task_status_requests_workspace_idx on public.task_status_requests(workspace_id,state,created_at desc);
alter table public.task_status_requests enable row level security;
revoke all on public.task_status_requests from public, anon, authenticated;
grant select on public.task_status_requests to authenticated;
grant all on public.task_status_requests to service_role;
create policy "read visible task requests" on public.task_status_requests for select to authenticated
using(public.is_workspace_member(workspace_id) and exists(select 1 from public.tasks t where t.id=task_id and t.workspace_id=task_status_requests.workspace_id));
create policy "task history visibility boundary" on public.task_status_history as restrictive for select to authenticated
using(public.is_workspace_member(workspace_id) and (public.is_workspace_manager(workspace_id) or exists(select 1 from public.tasks t where t.id=task_id and t.workspace_id=task_status_history.workspace_id)));

create function private.task_transition_allowed(old_status public.task_status, next_status public.task_status) returns boolean
language sql immutable set search_path='' as $$
select case old_status
  when 'todo' then next_status='in_progress'
  when 'in_progress' then next_status='review'
  when 'review' then next_status in ('done','revision')
  when 'revision' then next_status in ('in_progress','review')
  else false end;
$$;
revoke all on function private.task_transition_allowed(public.task_status,public.task_status) from public,anon,authenticated;

-- These private SECURITY DEFINER functions are the only request writers. They
-- need row locking while members have no UPDATE privilege through task RLS.
create function private.request_task_status(p_task_id uuid, p_status public.task_status) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tasks; request public.task_status_requests;
begin
  select tasks.* into t from public.tasks tasks join public.workspace_members m on m.workspace_id=tasks.workspace_id
  where tasks.id=p_task_id and m.user_id=auth.uid() and m.role='member' and tasks.status <> 'backlog'
    and (tasks.campaign_id is null or exists(select 1 from public.campaigns c where c.id=tasks.campaign_id and c.workspace_id=tasks.workspace_id and c.lifecycle_status='active'))
    and (tasks.assignee_id=auth.uid() or exists(select 1 from public.task_assignees a where a.task_id=tasks.id and a.user_id=auth.uid()))
  for update of tasks;
  if not found then raise exception 'Only assigned members can request this task status' using errcode='42501'; end if;
  if not private.task_transition_allowed(t.status,p_status) then raise exception 'Invalid task status transition'; end if;
  if exists(select 1 from public.task_status_requests where task_id=p_task_id and state='pending') then raise exception 'Task already awaits approval'; end if;
  insert into public.task_status_requests(workspace_id,task_id,from_status,requested_status,requested_by)
  values(t.workspace_id,t.id,t.status,p_status,auth.uid()) returning * into request;
  return to_jsonb(request) || jsonb_build_object('requested_by_name',coalesce((select full_name from public.profiles where id=auth.uid()),'Anggota tim'));
end; $$;

create function private.decide_task_status(p_request_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.tasks; request public.task_status_requests; target_task uuid;
begin
  select r.task_id into target_task from public.task_status_requests r join public.workspace_members m on m.workspace_id=r.workspace_id
  where r.id=p_request_id and m.user_id=auth.uid() and m.role in ('owner','admin');
  if not found then raise exception 'Only CMO can decide task status' using errcode='42501'; end if;
  select * into t from public.tasks where id=target_task for update;
  select * into request from public.task_status_requests where id=p_request_id for update;
  if request.state <> 'pending' then raise exception 'Request has already been decided'; end if;
  if t.campaign_id is not null and not exists(select 1 from public.campaigns c where c.id=t.campaign_id and c.lifecycle_status='active') then raise exception 'Campaign is read-only'; end if;
  if t.status <> request.from_status or not exists(select 1 from public.workspace_members m where m.workspace_id=t.workspace_id and m.user_id=request.requested_by and m.role='member')
    or not (coalesce(t.assignee_id=request.requested_by,false) or exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id=request.requested_by)) then
    update public.task_status_requests set state='stale',decided_by=auth.uid(),decided_at=clock_timestamp() where id=p_request_id returning * into request;
    return to_jsonb(request);
  end if;
  update public.task_status_requests set state=case when p_approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=clock_timestamp() where id=p_request_id returning * into request;
  if p_approve then update public.tasks set status=request.requested_status,updated_at=clock_timestamp() where id=t.id; end if;
  return to_jsonb(request);
end; $$;

grant usage on schema private to authenticated;
revoke all on function private.request_task_status(uuid,public.task_status) from public,anon;
revoke all on function private.decide_task_status(uuid,boolean) from public,anon;
grant execute on function private.request_task_status(uuid,public.task_status),private.decide_task_status(uuid,boolean) to authenticated;
create function public.request_task_status(p_task_id uuid,p_status public.task_status) returns jsonb
language sql security invoker set search_path='' as $$ select private.request_task_status(p_task_id,p_status); $$;
create function public.decide_task_status(p_request_id uuid,p_approve boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.decide_task_status(p_request_id,p_approve); $$;
revoke all on function public.request_task_status(uuid,public.task_status),public.decide_task_status(uuid,boolean) from public,anon;
grant execute on function public.request_task_status(uuid,public.task_status),public.decide_task_status(uuid,boolean) to authenticated;

create function private.invalidate_task_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='tasks' then
    if old.status is distinct from new.status or old.campaign_id is distinct from new.campaign_id then
      update public.task_status_requests set state='cancelled',decided_by=auth.uid(),decided_at=clock_timestamp() where task_id=new.id and state='pending';
    elsif old.assignee_id is distinct from new.assignee_id then
      update public.task_status_requests r set state='cancelled',decided_by=auth.uid(),decided_at=clock_timestamp()
      where r.task_id=new.id and r.state='pending' and r.requested_by is distinct from new.assignee_id
        and not exists(select 1 from public.task_assignees a where a.task_id=new.id and a.user_id=r.requested_by);
    end if;
    return new;
  end if;
  update public.task_status_requests r set state='cancelled',decided_by=auth.uid(),decided_at=clock_timestamp()
  where r.task_id=old.task_id and r.requested_by=old.user_id and r.state='pending'
    and not exists(select 1 from public.tasks t where t.id=old.task_id and t.assignee_id=old.user_id)
    and not exists(select 1 from public.task_assignees a where a.task_id=old.task_id and a.user_id=old.user_id);
  return old;
end; $$;
revoke all on function private.invalidate_task_request() from public,anon,authenticated;
create trigger invalidate_task_request after update of status,campaign_id,assignee_id on public.tasks for each row execute function private.invalidate_task_request();
create trigger invalidate_unassigned_request after delete on public.task_assignees for each row execute function private.invalidate_task_request();

create or replace function public.update_marketing_task(p_task_id uuid, p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.tasks; selected_ids uuid[]; k text; config jsonb; phase_map jsonb; target_campaign uuid; target_brand uuid; campaign_brand uuid;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found or access denied'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = t.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin')) then
    raise exception 'Read-only access' using errcode = '42501';
  end if;
  if t.campaign_id is not null and not exists (select 1 from public.campaigns c where c.id = t.campaign_id and c.workspace_id = t.workspace_id and c.lifecycle_status = 'active') then
    raise exception 'Campaign is read-only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid task patch'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('title','due_date','priority','status','content_calendar_type','assignee_ids','phase_id','campaign_id','brand_id','is_priority') then raise exception 'Unsupported task field'; end if;
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
  target_campaign := case when p_patch ? 'campaign_id' then (p_patch->>'campaign_id')::uuid else t.campaign_id end;
  target_brand := case when p_patch ? 'brand_id' then (p_patch->>'brand_id')::uuid else t.brand_id end;
  if p_patch ? 'is_priority' and jsonb_typeof(p_patch->'is_priority') <> 'boolean' then raise exception 'Invalid priority flag'; end if;
  if target_campaign is not null then
    select coalesce(c.brand_id,b.id) into campaign_brand from public.campaigns c left join public.brands b on b.workspace_id=c.workspace_id and b.name=c.brand
    where c.id=target_campaign and c.workspace_id=t.workspace_id and c.lifecycle_status='active' limit 1;
    if not found then raise exception 'Campaign not available in workspace'; end if;
    if p_patch ? 'brand_id' and target_brand is distinct from campaign_brand then raise exception 'Campaign and brand do not match'; end if;
    target_brand := campaign_brand;
  end if;
  if (p_patch ? 'brand_id' or p_patch ? 'campaign_id') and (target_brand is null or not exists(select 1 from public.brands b where b.id=target_brand and b.workspace_id=t.workspace_id)) then raise exception 'Brand not found in workspace'; end if;
  if t.campaign_id is distinct from target_campaign and t.campaign_id is not null then
    update public.campaigns set timeline_config=jsonb_set(coalesce(timeline_config,'{}'::jsonb),'{taskPhase}',coalesce(timeline_config->'taskPhase','{}'::jsonb) - t.id::text) where id=t.campaign_id;
  end if;
  if p_patch ? 'phase_id' then
    if target_campaign is null or jsonb_typeof(p_patch->'phase_id') <> 'string' then raise exception 'Invalid phase assignment'; end if;
    select coalesce(timeline_config, '{}'::jsonb) into config from public.campaigns where id = target_campaign for update;
    if p_patch->>'phase_id' <> '' and not exists (select 1 from jsonb_array_elements(coalesce(config->'phases', '[]'::jsonb)) as phase where phase->>'id' = p_patch->>'phase_id') then raise exception 'Phase not found in campaign'; end if;
    phase_map := coalesce(config->'taskPhase', '{}'::jsonb);
    if p_patch->>'phase_id' = '' then phase_map := phase_map - t.id::text;
    else phase_map := phase_map || jsonb_build_object(t.id::text, p_patch->>'phase_id'); end if;
    update public.campaigns set timeline_config = jsonb_set(config, '{taskPhase}', phase_map) where id = target_campaign;
  end if;
  update public.tasks set
    campaign_id = target_campaign, brand_id = target_brand,
    is_priority = case when p_patch ? 'is_priority' then (p_patch->>'is_priority')::boolean else is_priority end,
    title = case when p_patch ? 'title' then btrim(p_patch->>'title') else title end,
    due_date = case when p_patch ? 'due_date' then (p_patch->>'due_date')::date else due_date end,
    priority = case when p_patch ? 'is_priority' then case when (p_patch->>'is_priority')::boolean then 'Tinggi' else 'Rendah' end when p_patch ? 'priority' then p_patch->>'priority' else priority end,
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


create function public.create_marketing_task(p_workspace_id uuid,p_task_id uuid,p_values jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  if not public.is_workspace_manager(p_workspace_id) then raise exception 'Only CMO can create tasks' using errcode='42501'; end if;
  if jsonb_typeof(p_values) <> 'object' or not (p_values ? 'title') or not (p_values ? 'due_date') or not (p_values ? 'brand_id') then raise exception 'Task name, brand and deadline are required'; end if;
  insert into public.tasks(id,workspace_id,campaign_id,brand_id,title,status,priority,is_priority,created_by)
  values(p_task_id,p_workspace_id,(p_values->>'campaign_id')::uuid,(p_values->>'brand_id')::uuid,p_values->>'title',coalesce((p_values->>'status')::public.task_status,'backlog'),'Rendah',false,auth.uid());
  return public.update_marketing_task(p_task_id,p_values);
end; $$;
revoke all on function public.create_marketing_task(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_marketing_task(uuid,uuid,jsonb) to authenticated;
