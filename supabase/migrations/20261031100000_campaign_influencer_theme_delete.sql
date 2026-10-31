-- Allow workspace managers to remove a theme from an active Campaign.
-- SECURITY INVOKER preserves RLS; the explicit role check also keeps this
-- operation manager-only if an older permissive table policy is still present.
create or replace function public.delete_campaign_influencer_theme(
  p_campaign_id uuid,
  p_theme_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_workspace uuid;
begin
  select c.workspace_id into target_workspace
  from public.campaigns c
  where c.id = p_campaign_id
    and c.lifecycle_status = 'active';

  if target_workspace is null then
    raise exception 'Campaign tidak ditemukan atau tidak aktif.' using errcode = '42501';
  end if;

  if not public.is_workspace_manager(target_workspace) then
    raise exception 'Hanya Super Admin yang dapat menghapus tema.' using errcode = '42501';
  end if;

  delete from public.campaign_influencer_themes t
  where t.id = p_theme_id
    and t.campaign_id = p_campaign_id
    and t.workspace_id = target_workspace;

  if not found then
    raise exception 'Tema tidak ditemukan pada Campaign ini.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_campaign_influencer_theme(uuid, uuid) from public, anon;
grant execute on function public.delete_campaign_influencer_theme(uuid, uuid) to authenticated;
