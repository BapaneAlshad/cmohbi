-- Notifications for changes to tasks/campaigns where the recipient is involved.
-- Prepare only: review and apply this migration to the target database separately.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('task_created','task_changed','campaign_changed')),
  title text not null,
  body text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_workspace_created_idx
  on public.notifications(workspace_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
create policy "members read own notifications" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid() and public.is_workspace_member(workspace_id));

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_id = auth.uid()
    and public.is_workspace_member(workspace_id);
  return found;
end; $$;

create or replace function public.mark_all_notifications_read(p_workspace_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  update public.notifications
  set read_at = now()
  where workspace_id = p_workspace_id
    and recipient_id = auth.uid()
    and read_at is null
    and public.is_workspace_member(workspace_id);
  get diagnostics changed = row_count;
  return changed;
end; $$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

create or replace function public.notify_task_change()
returns trigger language plpgsql security definer set search_path='public','pg_catalog' as $$
declare recipient uuid; notification_kind text; notification_title text; notification_body text;
begin
  if tg_op = 'INSERT' then
    notification_kind := 'task_created';
    notification_title := 'Tugas baru untuk Anda';
    notification_body := new.title;
  elsif old.title is distinct from new.title
     or old.status is distinct from new.status
     or old.due_date is distinct from new.due_date
     or old.campaign_id is distinct from new.campaign_id
     or old.priority is distinct from new.priority
     or old.assignee_id is distinct from new.assignee_id then
    notification_kind := 'task_changed';
    notification_title := case when old.status is distinct from new.status then 'Status tugas berubah' else 'Tugas diperbarui' end;
    notification_body := case when old.status is distinct from new.status then new.title || ' · ' || old.status::text || ' → ' || new.status::text else new.title end;
  else
    return new;
  end if;

  for recipient in
    select distinct people.user_id from (
      select new.assignee_id as user_id
      union all select a.user_id from public.task_assignees a where a.task_id = new.id
      union all select new.created_by as user_id
    ) people
    where people.user_id is not null and people.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    insert into public.notifications(workspace_id,recipient_id,kind,title,body,task_id,campaign_id)
    values(new.workspace_id,recipient,notification_kind,notification_title,notification_body,new.id,new.campaign_id);
  end loop;
  return new;
end; $$;

create or replace function public.notify_task_assignee()
returns trigger language plpgsql security definer set search_path='public','pg_catalog' as $$
declare task_row record;
begin
  select t.workspace_id,t.title,t.campaign_id into task_row from public.tasks t where t.id=new.task_id;
  if task_row.workspace_id is null or new.user_id = coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then return new; end if;
  insert into public.notifications(workspace_id,recipient_id,kind,title,body,task_id,campaign_id)
  values(task_row.workspace_id,new.user_id,'task_created','Anda ditugaskan ke tugas',task_row.title,new.task_id,task_row.campaign_id);
  return new;
end; $$;

create or replace function public.notify_campaign_change()
returns trigger language plpgsql security definer set search_path='public','pg_catalog' as $$
declare recipient uuid; changed boolean;
begin
  changed := tg_op = 'INSERT' or old.name is distinct from new.name or old.brand is distinct from new.brand or old.status is distinct from new.status or old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date;
  if not changed then return new; end if;
  for recipient in
    select distinct people.user_id from (
      select new.owner_id as user_id
      union all select t.assignee_id from public.tasks t where t.campaign_id = new.id
      union all select a.user_id from public.task_assignees a join public.tasks t on t.id=a.task_id where t.campaign_id = new.id
    ) people
    where people.user_id is not null and people.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  loop
    insert into public.notifications(workspace_id,recipient_id,kind,title,body,campaign_id)
    values(new.workspace_id,recipient, 'campaign_changed', case when tg_op='INSERT' then 'Campaign baru' else 'Campaign diperbarui' end, new.name || ' · ' || new.brand, new.id);
  end loop;
  return new;
end; $$;

revoke all on function public.notify_task_change() from public, anon, authenticated;
revoke all on function public.notify_task_assignee() from public, anon, authenticated;
revoke all on function public.notify_campaign_change() from public, anon, authenticated;

drop trigger if exists notify_task_change_after_write on public.tasks;
create trigger notify_task_change_after_write after insert or update on public.tasks
  for each row execute function public.notify_task_change();
drop trigger if exists notify_task_assignee_after_insert on public.task_assignees;
create trigger notify_task_assignee_after_insert after insert on public.task_assignees
  for each row execute function public.notify_task_assignee();
drop trigger if exists notify_campaign_change_after_write on public.campaigns;
create trigger notify_campaign_change_after_write after insert or update on public.campaigns
  for each row execute function public.notify_campaign_change();
