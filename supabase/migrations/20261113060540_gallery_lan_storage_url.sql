alter table public.workspace_media_settings
  add column lan_storage_url text not null default ''
  check (
    lan_storage_url = ''
    or (length(lan_storage_url) <= 265 and lan_storage_url ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?:8766$')
  );
