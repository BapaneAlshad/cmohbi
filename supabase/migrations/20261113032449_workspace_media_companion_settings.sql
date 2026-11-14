-- Shared LAN companion settings are visible only to authenticated workspace members.
-- The compression PIN stays in the Super Admin browser session and is never stored here.
create table public.workspace_media_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  companion_url text not null default ''
    check (companion_url = '' or companion_url ~ '^https?://[^[:space:]]+$'),
  companion_access_pin text not null default ''
    check (companion_access_pin = '' or length(companion_access_pin) between 6 and 64),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.workspace_media_settings enable row level security;

create policy "workspace members read media companion settings"
  on public.workspace_media_settings
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "workspace managers insert media companion settings"
  on public.workspace_media_settings
  for insert to authenticated
  with check (
    public.is_workspace_manager(workspace_id)
    and (updated_by is null or updated_by = (select auth.uid()))
  );

create policy "workspace managers update media companion settings"
  on public.workspace_media_settings
  for update to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (
    public.is_workspace_manager(workspace_id)
    and (updated_by is null or updated_by = (select auth.uid()))
  );

revoke all on public.workspace_media_settings from anon, authenticated;
grant select, insert, update on public.workspace_media_settings to authenticated;
