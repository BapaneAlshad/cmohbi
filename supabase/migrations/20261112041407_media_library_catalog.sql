-- Catalog only: original media stays in the selected user's PC or Google Drive.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  storage_source text not null check (storage_source in ('pc', 'drive')),
  folder_path text not null default '',
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  original_location text not null,
  original_file_id text,
  compressed_location text,
  compressed_file_id text,
  compressed_byte_size bigint check (compressed_byte_size is null or compressed_byte_size >= 0),
  compression_status text not null default 'original'
    check (compression_status in ('original', 'queued', 'compressed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_workspace_created_idx on public.media_assets(workspace_id, created_at desc);
create index media_assets_workspace_folder_idx on public.media_assets(workspace_id, folder_path);
create index media_assets_campaign_idx on public.media_assets(campaign_id) where campaign_id is not null;

alter table public.media_assets enable row level security;
create policy "workspace members read media catalog" on public.media_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace members add media catalog" on public.media_assets
  for insert to authenticated with check (
    public.is_workspace_member(workspace_id)
    and (created_by is null or created_by = (select auth.uid()))
    and (campaign_id is null or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.workspace_id = media_assets.workspace_id
    ))
  );
create policy "workspace members update media catalog" on public.media_assets
  for update to authenticated using (exists (
    select 1 from public.workspace_members m
    where m.workspace_id = media_assets.workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ))
  with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = media_assets.workspace_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
    and (campaign_id is null or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.workspace_id = media_assets.workspace_id
    ))
  );
create policy "workspace members remove media catalog" on public.media_assets
  for delete to authenticated using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.media_assets to authenticated;
