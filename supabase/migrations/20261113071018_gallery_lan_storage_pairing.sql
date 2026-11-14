alter table public.workspace_media_settings
  add column lan_storage_id uuid not null default gen_random_uuid(),
  drop constraint workspace_media_settings_lan_storage_url_check,
  add constraint workspace_media_settings_lan_storage_url_check
    check (
      case
        when lan_storage_url = '' then true
        when length(lan_storage_url) <= 267 and lan_storage_url ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?:[1-9][0-9]{3,4}$'
          then split_part(lan_storage_url, ':', 3)::integer between 1024 and 65535
        else false
      end
    );
