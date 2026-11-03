-- Add the published content URL to influencer bookings.
-- The field is optional and is only retained while cooperation status is Selesai.

alter table public.influencer_bookings
  add column if not exists content_link text;

create or replace function public.normalize_campaign_influencer_content_link()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.content_link := nullif(btrim(new.content_link), '');
  if new.content_link is not null then
    if char_length(new.content_link) > 2048 or new.content_link !~* '^https?://[^[:space:]]+$' then
      raise exception 'Link konten harus berupa URL http:// atau https:// yang valid.';
    end if;
  end if;
  if new.status <> 'Selesai' then
    new.content_link := null;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_campaign_influencer_content_link() from public, anon, authenticated;
drop trigger if exists normalize_campaign_influencer_content_link on public.influencer_bookings;
create trigger normalize_campaign_influencer_content_link
  before insert or update of content_link, status on public.influencer_bookings
  for each row execute function public.normalize_campaign_influencer_content_link();

create or replace function public.save_campaign_influencer_booking(p_campaign_id uuid, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campaign public.campaigns;
  saved public.influencer_bookings;
  master public.marketing_influencers;
  theme public.campaign_influencer_themes;
  chosen_theme uuid;
  visit date;
  upload date;
  schedule_time time;
  next_status text;
  next_content_link text;
  allowed_statuses constant text[] := array[
    'Menunggu konfirmasi','Terjadwal','Sudah visit','Revisi','Selesai','Dibatalkan'
  ];
begin
  if not public.can_edit_campaign_influencers(p_campaign_id) then raise exception 'Akun tidak dapat mengedit influencer pada Campaign ini.'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_input) k where k not in ('influencerId','themeId','visitDate','uploadDate','notes','status','contentLink')
  ) then raise exception 'Field jadwal tidak valid.'; end if;
  if p_input ? 'status' and not ((p_input->>'status') = any(allowed_statuses)) then raise exception 'Status kerja sama tidak valid.'; end if;
  if p_id is null and p_input ? 'status' then raise exception 'Status awal booking ditetapkan sebagai Terjadwal.'; end if;

  select * into strict campaign from public.campaigns where id = p_campaign_id;
  if p_id is not null then
    select * into saved from public.influencer_bookings
      where id = p_id and workspace_id = campaign.workspace_id and (campaign_id = p_campaign_id or campaign_id is null) for update;
    if not found then raise exception 'Jadwal tidak ditemukan pada Campaign ini.'; end if;
    if p_input ? 'influencerId' and nullif(p_input->>'influencerId','')::uuid is distinct from saved.influencer_id then
      raise exception 'Influencer pada jadwal existing tidak dapat diganti.';
    end if;
  else
    select * into master from public.marketing_influencers where id = nullif(p_input->>'influencerId','')::uuid and workspace_id = campaign.workspace_id;
    if not found then raise exception 'Pilih influencer dari master workspace ini.'; end if;
  end if;

  chosen_theme := case when p_input ? 'themeId' then nullif(p_input->>'themeId','')::uuid else saved.campaign_influencer_theme_id end;
  if chosen_theme is not null then
    select * into theme from public.campaign_influencer_themes where id = chosen_theme and campaign_id = p_campaign_id and workspace_id = campaign.workspace_id;
    if not found then raise exception 'Tema harus berasal dari Campaign yang sama.'; end if;
  elsif p_id is null then raise exception 'Pilih tema konten Campaign.';
  end if;

  visit := case when p_input ? 'visitDate' then nullif(p_input->>'visitDate','')::date else saved.visit_date end;
  upload := case when p_input ? 'uploadDate' then nullif(p_input->>'uploadDate','')::date else saved.upload_date end;
  if visit is not null and upload is not null and upload < visit then raise exception 'Tanggal upload tidak boleh lebih awal dari tanggal visit.'; end if;
  next_status := case when p_input ? 'status' then p_input->>'status' else coalesce(saved.status, 'Terjadwal') end;
  next_content_link := case when p_input ? 'contentLink' then nullif(btrim(p_input->>'contentLink'),'') else saved.content_link end;
  if p_input ? 'contentLink' and next_content_link is not null and next_status <> 'Selesai' then raise exception 'Link konten hanya dapat diisi ketika status kerja sama Selesai.'; end if;
  schedule_time := coalesce((saved.scheduled_at at time zone 'Asia/Jakarta')::time, '00:00'::time);
  if p_id is null then
    insert into public.influencer_bookings (workspace_id,campaign_id,influencer_id,influencer_name,platform,campaign_influencer_theme_id,content_title,content_link,visit_date,upload_date,scheduled_at,status,rate,spent,payment_status,notes,created_by)
      values (campaign.workspace_id,p_campaign_id,master.id,master.name,lower(master.platform)::public.social_platform,chosen_theme,theme.name,next_content_link,visit,upload,(coalesce(upload,visit,(now() at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta','Terjadwal',master.rate,0,'Belum dibayar',p_input->>'notes',auth.uid()) returning * into saved;
  else
    update public.influencer_bookings set campaign_id = p_campaign_id,campaign_influencer_theme_id = chosen_theme,
      content_title = coalesce(theme.name,saved.content_title),content_link = next_content_link,visit_date = visit,upload_date = upload,
      scheduled_at = (coalesce(upload,visit,(saved.scheduled_at at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta',
      notes = case when p_input ? 'notes' then p_input->>'notes' else saved.notes end,status = next_status,updated_at = now()
      where id = p_id and workspace_id = campaign.workspace_id returning * into saved;
  end if;
  return to_jsonb(saved) || jsonb_build_object('theme_name',theme.name,'scheduled_time',to_char(saved.scheduled_at at time zone 'Asia/Jakarta','HH24:MI'));
end;
$$;

revoke all on function public.save_campaign_influencer_booking(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_campaign_influencer_booking(uuid,uuid,jsonb) to authenticated, service_role;
