-- Extend tasks to support multiple assignees while preserving tasks.assignee_id
-- as the legacy/primary assignee for existing integrations.
create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists task_assignees_user_id_idx on public.task_assignees(user_id);

insert into public.task_assignees (task_id, user_id)
select id, assignee_id
from public.tasks
where assignee_id is not null
on conflict (task_id, user_id) do nothing;

alter table public.task_assignees enable row level security;

drop policy if exists "members manage tasks" on public.tasks;
drop policy if exists "workspace members read tasks" on public.tasks;
drop policy if exists "non-viewers manage tasks" on public.tasks;

create policy "workspace members read tasks" on public.tasks
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "non-viewers manage tasks" on public.tasks
for all to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tasks.workspace_id
      and wm.user_id = auth.uid()
      and wm.role <> 'viewer'
  )
)
with check (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = tasks.workspace_id
      and wm.user_id = auth.uid()
      and wm.role <> 'viewer'
  )
);

create policy "workspace members read task assignees" on public.task_assignees
for select to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_assignees.task_id and public.is_workspace_member(t.workspace_id)
  )
);

create policy "non-viewers manage task assignees" on public.task_assignees
for all to authenticated
using (
  exists (
    select 1 from public.tasks t
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    where t.id = task_assignees.task_id and wm.user_id = auth.uid() and wm.role <> 'viewer'
  )
)
with check (
  exists (
    select 1 from public.tasks t
    join public.workspace_members wm on wm.workspace_id = t.workspace_id
    join public.workspace_members assignee_member on assignee_member.workspace_id = t.workspace_id
    where t.id = task_assignees.task_id
      and wm.user_id = auth.uid()
      and wm.role <> 'viewer'
      and assignee_member.user_id = task_assignees.user_id
  )
);

grant select, insert, update, delete on table public.task_assignees to authenticated, service_role;
