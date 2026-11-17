-- Google Drive OAuth credentials are server-only. Workspace members can read
-- the catalog through RLS, while every write goes through a verified API route.
create table if not exists public.workspace_google_drive_connections (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  google_subject text not null,
  account_email text not null,
  account_name text not null default '',
  root_folder_id text not null,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_google_drive_connections enable row level security;
revoke all on public.workspace_google_drive_connections from anon, authenticated;
grant all on public.workspace_google_drive_connections to service_role;

drop policy if exists "workspace members add media catalog" on public.media_assets;
drop policy if exists "workspace members update media catalog" on public.media_assets;
drop policy if exists "workspace members remove media catalog" on public.media_assets;
drop policy if exists "active workspace members add media catalog" on public.media_assets;
drop policy if exists "workspace managers update media catalog" on public.media_assets;
drop policy if exists "active workspace members remove media catalog" on public.media_assets;

revoke insert, update, delete on public.media_assets from authenticated;
grant select on public.media_assets to authenticated;
grant all on public.media_assets to service_role;

create unique index if not exists media_assets_workspace_source_file_uidx
  on public.media_assets(workspace_id, storage_source, original_file_id);
