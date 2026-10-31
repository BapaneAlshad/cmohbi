-- Persistent campaign discussion, campaign participants and Super Admin notices.
-- Additive only. Review and apply to production separately.

create table public.campaign_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, user_id)
);
create index campaign_members_workspace_user_idx on public.campaign_members(workspace_id, user_id, campaign_id);
alter table public.campaign_members enable row level security;
revoke all on public.campaign_members from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_members to authenticated;
grant all on public.campaign_members to service_role;
create policy "workspace members read campaign participants" on public.campaign_members
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "managers manage campaign participants" on public.campaign_members
  for all to authenticated
  using (public.is_workspace_manager(workspace_id) and exists (
    select 1 from public.campaigns campaign
    where campaign.id=campaign_members.campaign_id and campaign.workspace_id=campaign_members.workspace_id and campaign.lifecycle_status='active'
  ))
  with check (public.is_workspace_manager(workspace_id) and exists (
    select 1 from public.campaigns campaign
    where campaign.id=campaign_members.campaign_id and campaign.workspace_id=campaign_members.workspace_id and campaign.lifecycle_status='active'
  ) and exists (
    select 1 from public.workspace_members member
    where member.workspace_id=campaign_members.workspace_id and member.user_id=campaign_members.user_id
  ));

-- Seed existing task PICs as campaign participants, preserving historical involvement.
insert into public.campaign_members(workspace_id, campaign_id, user_id)
select distinct task.workspace_id, task.campaign_id, task.assignee_id
from public.tasks task
where task.campaign_id is not null and task.assignee_id is not null
on conflict (campaign_id, user_id) do nothing;
insert into public.campaign_members(workspace_id, campaign_id, user_id)
select distinct task.workspace_id, task.campaign_id, assignee.user_id
from public.tasks task join public.task_assignees assignee on assignee.task_id = task.id
where task.campaign_id is not null
on conflict (campaign_id, user_id) do nothing;

create or replace function private.sync_campaign_member_from_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.campaign_id is not null and new.assignee_id is not null then
    insert into public.campaign_members(workspace_id,campaign_id,user_id)
    values (new.workspace_id,new.campaign_id,new.assignee_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_campaign_member_from_task() from public, anon, authenticated;
create trigger sync_campaign_member_from_task after insert or update of campaign_id,assignee_id on public.tasks
  for each row execute function private.sync_campaign_member_from_task();

create or replace function private.sync_campaign_member_from_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks;
begin
  select * into task_row from public.tasks where id = new.task_id;
  if task_row.campaign_id is not null then
    insert into public.campaign_members(workspace_id,campaign_id,user_id)
    values (task_row.workspace_id,task_row.campaign_id,new.user_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_campaign_member_from_assignee() from public, anon, authenticated;
create trigger sync_campaign_member_from_assignee after insert on public.task_assignees
  for each row execute function private.sync_campaign_member_from_assignee();

create or replace function public.save_campaign_members(p_campaign_id uuid, p_member_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare target_workspace uuid;
begin
  select campaign.workspace_id into target_workspace from public.campaigns campaign
  where campaign.id = p_campaign_id and campaign.lifecycle_status = 'active' for update;
  if target_workspace is null or not public.is_workspace_manager(target_workspace) then
    raise exception 'Hanya Super Admin dapat mengatur anggota Campaign.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_member_ids,1),0) > 200 or exists (
    select 1 from unnest(coalesce(p_member_ids,'{}'::uuid[])) selected(id)
    where not exists (select 1 from public.workspace_members member where member.workspace_id=target_workspace and member.user_id=selected.id)
  ) then raise exception 'Anggota harus berasal dari workspace ini.'; end if;
  delete from public.campaign_members where campaign_id=p_campaign_id and workspace_id=target_workspace;
  insert into public.campaign_members(workspace_id,campaign_id,user_id)
  select target_workspace,p_campaign_id,selected.id from unnest(coalesce(p_member_ids,'{}'::uuid[])) selected(id)
  on conflict (campaign_id,user_id) do nothing;
end;
$$;
revoke all on function public.save_campaign_members(uuid,uuid[]) from public,anon;
grant execute on function public.save_campaign_members(uuid,uuid[]) to authenticated,service_role;

create or replace function public.can_edit_campaign_discussion(target_campaign uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.campaigns campaign
    join public.workspace_members member on member.workspace_id=campaign.workspace_id
    where campaign.id=target_campaign and campaign.lifecycle_status='active'
      and member.user_id=(select auth.uid()) and member.role in ('owner','admin','member')
  );
$$;
revoke all on function public.can_edit_campaign_discussion(uuid) from public,anon;
grant execute on function public.can_edit_campaign_discussion(uuid) to authenticated,service_role;

create table public.campaign_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  reply_to uuid references public.campaign_notes(id) on delete set null,
  pinned_to_dashboard boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index campaign_notes_feed_idx on public.campaign_notes(workspace_id,campaign_id,created_at desc,id desc);
alter table public.campaign_notes enable row level security;
revoke all on public.campaign_notes from public,anon,authenticated;
grant select on public.campaign_notes to authenticated;
grant insert (workspace_id,campaign_id,body,reply_to) on public.campaign_notes to authenticated;
grant update (pinned_to_dashboard) on public.campaign_notes to authenticated;
grant all on public.campaign_notes to service_role;
create policy "workspace members read campaign notes" on public.campaign_notes
  for select to authenticated using (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.campaigns campaign where campaign.id=campaign_notes.campaign_id and campaign.workspace_id=campaign_notes.workspace_id)
  );
create policy "campaign members write discussion notes" on public.campaign_notes
  for insert to authenticated with check (
    author_id=(select auth.uid())
    and public.can_edit_campaign_discussion(campaign_id)
    and exists (select 1 from public.campaigns campaign where campaign.id=campaign_notes.campaign_id and campaign.workspace_id=campaign_notes.workspace_id and campaign.lifecycle_status='active')
  );
create policy "authors or managers pin campaign notes" on public.campaign_notes
  for update to authenticated
  using (
    public.can_edit_campaign_discussion(campaign_id)
    and (author_id=(select auth.uid()) or public.is_workspace_manager(workspace_id))
  )
  with check (
    public.can_edit_campaign_discussion(campaign_id)
    and (author_id=(select auth.uid()) or public.is_workspace_manager(workspace_id))
  );

create or replace function private.stamp_campaign_note_author()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sesi pengguna diperlukan.' using errcode='42501'; end if;
  new.author_id := auth.uid();
  select profile.full_name into new.author_name from public.profiles profile where profile.id=auth.uid();
  new.author_name := coalesce(nullif(btrim(new.author_name),''),'Anggota tim');
  new.pinned_to_dashboard := false;
  new.created_at := clock_timestamp();
  if new.reply_to is not null and not exists (
    select 1 from public.campaign_notes parent
    where parent.id=new.reply_to and parent.campaign_id=new.campaign_id and parent.workspace_id=new.workspace_id
  ) then raise exception 'Catatan balasan tidak ditemukan pada Campaign ini.'; end if;
  return new;
end;
$$;
revoke all on function private.stamp_campaign_note_author() from public,anon,authenticated;
create trigger stamp_campaign_note_author before insert on public.campaign_notes
  for each row execute function private.stamp_campaign_note_author();

create or replace function public.create_campaign_note(p_campaign_id uuid,p_body text,p_reply_to uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.campaigns; saved public.campaign_notes;
begin
  if not public.can_edit_campaign_discussion(p_campaign_id) then
    raise exception 'Akun tidak dapat menulis pada Diskusi Campaign ini.' using errcode='42501';
  end if;
  if nullif(btrim(p_body),'') is null or length(p_body)>4000 then raise exception 'Catatan wajib diisi dan maksimal 4.000 karakter.'; end if;
  select * into strict target from public.campaigns where id=p_campaign_id and lifecycle_status='active';
  insert into public.campaign_notes(workspace_id,campaign_id,body,reply_to)
    values(target.workspace_id,p_campaign_id,btrim(p_body),p_reply_to)
    returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_campaign_note(uuid,text,uuid) from public,anon;
grant execute on function public.create_campaign_note(uuid,text,uuid) to authenticated,service_role;

create or replace function public.set_campaign_note_pinned(p_campaign_id uuid,p_note_id uuid,p_pinned boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_note public.campaign_notes;
begin
  if not public.can_edit_campaign_discussion(p_campaign_id) then raise exception 'Campaign hanya dapat dibaca.' using errcode='42501'; end if;
  select * into target_note from public.campaign_notes where id=p_note_id and campaign_id=p_campaign_id for update;
  if not found then raise exception 'Catatan tidak ditemukan pada Campaign ini.'; end if;
  if target_note.author_id is distinct from auth.uid() and not public.is_workspace_manager(target_note.workspace_id) then
    raise exception 'Hanya penulis atau Super Admin yang dapat mengubah pin catatan.' using errcode='42501';
  end if;
  update public.campaign_notes set pinned_to_dashboard=p_pinned where id=p_note_id;
end;
$$;
revoke all on function public.set_campaign_note_pinned(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_campaign_note_pinned(uuid,uuid,boolean) to authenticated,service_role;

create table public.admin_dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  expires_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id,id)
);
create index admin_dashboard_notes_workspace_date_idx on public.admin_dashboard_notes(workspace_id,is_active,created_at desc);
create table public.admin_dashboard_note_recipients (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  note_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(note_id,user_id),
  foreign key(workspace_id,note_id) references public.admin_dashboard_notes(workspace_id,id) on delete cascade,
  foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id) on delete cascade
);
create index admin_dashboard_note_recipients_user_idx on public.admin_dashboard_note_recipients(workspace_id,user_id,note_id);
alter table public.admin_dashboard_notes enable row level security;
alter table public.admin_dashboard_note_recipients enable row level security;
revoke all on public.admin_dashboard_notes,public.admin_dashboard_note_recipients from public,anon,authenticated;
grant select on public.admin_dashboard_notes,public.admin_dashboard_note_recipients to authenticated;
grant insert (workspace_id,title,body,expires_at), update (title,body,expires_at), delete on public.admin_dashboard_notes to authenticated;
grant insert (workspace_id,note_id,user_id), delete on public.admin_dashboard_note_recipients to authenticated;
grant all on public.admin_dashboard_notes,public.admin_dashboard_note_recipients to service_role;
create policy "admins manage dashboard notes" on public.admin_dashboard_notes for all to authenticated
  using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy "recipients read assigned dashboard notes" on public.admin_dashboard_notes for select to authenticated
  using (exists (select 1 from public.admin_dashboard_note_recipients recipient where recipient.note_id=admin_dashboard_notes.id and recipient.workspace_id=admin_dashboard_notes.workspace_id and recipient.user_id=(select auth.uid())));
create policy "admins manage dashboard note recipients" on public.admin_dashboard_note_recipients for all to authenticated
  using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy "users read own dashboard note assignment" on public.admin_dashboard_note_recipients for select to authenticated
  using (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));

create or replace function private.stamp_admin_dashboard_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sesi pengguna diperlukan.' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.created_by := auth.uid();
    select profile.full_name into new.created_by_name from public.profiles profile where profile.id=auth.uid();
    new.created_by_name := coalesce(nullif(btrim(new.created_by_name),''),'Super Admin');
    new.created_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.stamp_admin_dashboard_note() from public,anon,authenticated;
create trigger stamp_admin_dashboard_note before insert or update on public.admin_dashboard_notes
  for each row execute function private.stamp_admin_dashboard_note();

create or replace function public.save_admin_dashboard_note(p_workspace_id uuid,p_id uuid,p_title text,p_body text,p_expires_at date,p_recipient_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target_workspace uuid; saved public.admin_dashboard_notes;
begin
  target_workspace := p_workspace_id;
  if target_workspace is null or not public.is_workspace_manager(target_workspace) then raise exception 'Hanya Super Admin dapat mengelola Catatan.' using errcode='42501'; end if;
  if nullif(btrim(p_title),'') is null or length(p_title)>160 or nullif(btrim(p_body),'') is null or length(p_body)>4000 then raise exception 'Judul dan isi catatan wajib diisi.'; end if;
  if coalesce(array_length(p_recipient_ids,1),0)=0 or array_length(p_recipient_ids,1)>500 or exists(
    select 1 from unnest(coalesce(p_recipient_ids,'{}'::uuid[])) selected(id)
    where not exists(select 1 from public.workspace_members member where member.workspace_id=target_workspace and member.user_id=selected.id)
  ) then raise exception 'Pilih minimal satu penerima dari workspace ini.'; end if;
  if p_id is null then
    insert into public.admin_dashboard_notes(workspace_id,title,body,expires_at)
    values(target_workspace,btrim(p_title),btrim(p_body),p_expires_at) returning * into saved;
  else
    update public.admin_dashboard_notes set title=btrim(p_title),body=btrim(p_body),expires_at=p_expires_at
    where id=p_id and workspace_id=target_workspace returning * into saved;
    if not found then raise exception 'Catatan tidak ditemukan.'; end if;
  end if;
  delete from public.admin_dashboard_note_recipients where note_id=saved.id;
  insert into public.admin_dashboard_note_recipients(workspace_id,note_id,user_id)
  select target_workspace,saved.id,selected.id from unnest(p_recipient_ids) selected(id) on conflict do nothing;
  return to_jsonb(saved) || jsonb_build_object('recipient_ids',to_jsonb(p_recipient_ids));
end;
$$;
revoke all on function public.save_admin_dashboard_note(uuid,uuid,text,text,date,uuid[]) from public,anon;
grant execute on function public.save_admin_dashboard_note(uuid,uuid,text,text,date,uuid[]) to authenticated,service_role;

create or replace function public.delete_admin_dashboard_note(p_workspace_id uuid,p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_workspace uuid;
begin
  target_workspace := p_workspace_id;
  if target_workspace is null or not public.is_workspace_manager(target_workspace) then raise exception 'Hanya Super Admin dapat menghapus Catatan.' using errcode='42501'; end if;
  delete from public.admin_dashboard_notes where id=p_id and workspace_id=target_workspace;
  if not found then raise exception 'Catatan tidak ditemukan.'; end if;
end;
$$;
revoke all on function public.delete_admin_dashboard_note(uuid,uuid) from public,anon;
grant execute on function public.delete_admin_dashboard_note(uuid,uuid) to authenticated,service_role;
