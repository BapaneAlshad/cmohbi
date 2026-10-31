-- Allow the active Campaign team to update cooperation status and remove bookings.
-- Financial values, influencer identity and payment status remain protected from members.

drop policy if exists "managers delete campaign influencer bookings" on public.influencer_bookings;
drop policy if exists "team deletes active campaign influencer bookings" on public.influencer_bookings;
create policy "team deletes active campaign influencer bookings" on public.influencer_bookings
  for delete to authenticated using (
    public.can_edit_campaign_influencers(campaign_id)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = influencer_bookings.workspace_id)
  );

create or replace function public.protect_campaign_influencer_booking_actions()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  master_rate numeric;
  allowed_statuses constant text[] := array[
    'Menunggu konfirmasi','Terjadwal','Sudah visit','Menunggu upload','Revisi','Selesai','Dibatalkan'
  ];
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id or new.id is distinct from old.id
       or (old.campaign_id is not null and new.campaign_id is distinct from old.campaign_id) then
      raise exception 'Relasi Campaign dan workspace tidak dapat dipindahkan.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_by := auth.uid();
  end if;
  if new.campaign_id is null then return new; end if;
  if not public.can_edit_campaign_influencers(new.campaign_id) then
    raise exception 'Campaign hanya dapat dibaca atau akun tidak memiliki izin.';
  end if;
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if not (new.status = any(allowed_statuses)) then raise exception 'Status kerja sama tidak valid.'; end if;
    if not public.is_workspace_manager(new.workspace_id) then
      select i.rate into master_rate from public.marketing_influencers i where i.id = new.influencer_id and i.workspace_id = new.workspace_id;
      if master_rate is null or new.rate is distinct from master_rate or new.spent <> 0
        or new.status <> 'Terjadwal' or new.payment_status <> 'Belum dibayar' then
        raise exception 'Nilai biaya awal harus mengikuti master influencer.';
      end if;
    end if;
  else
    if new.status is distinct from old.status and not (new.status = any(allowed_statuses)) then
      raise exception 'Status kerja sama tidak valid.';
    end if;
    if not public.is_workspace_manager(new.workspace_id) then
      if new.rate is distinct from old.rate or new.spent is distinct from old.spent
        or new.payment_status is distinct from old.payment_status
        or new.influencer_id is distinct from old.influencer_id or new.influencer_name is distinct from old.influencer_name
        or new.platform is distinct from old.platform then
        raise exception 'Anggota hanya dapat mengubah tema, tanggal, catatan, dan status kerja sama.';
      end if;
    end if;
  end if;

  if new.visit_date is not null and new.upload_date is not null and new.upload_date < new.visit_date then
    raise exception 'Tanggal upload tidak boleh lebih awal dari tanggal visit.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_campaign_influencer_booking_actions() from public, anon, authenticated;
drop trigger if exists protect_campaign_influencer_booking_edits on public.influencer_bookings;
create trigger protect_campaign_influencer_booking_edits before insert or update on public.influencer_bookings
  for each row execute function public.protect_campaign_influencer_booking_actions();

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
  allowed_statuses constant text[] := array[
    'Menunggu konfirmasi','Terjadwal','Sudah visit','Menunggu upload','Revisi','Selesai','Dibatalkan'
  ];
begin
  if not public.can_edit_campaign_influencers(p_campaign_id) then raise exception 'Akun tidak dapat mengedit influencer pada Campaign ini.'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_input) k where k not in ('influencerId','themeId','visitDate','uploadDate','notes','status')
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
  schedule_time := coalesce((saved.scheduled_at at time zone 'Asia/Jakarta')::time, '00:00'::time);
  if p_id is null then
    insert into public.influencer_bookings (workspace_id,campaign_id,influencer_id,influencer_name,platform,campaign_influencer_theme_id,content_title,visit_date,upload_date,scheduled_at,status,rate,spent,payment_status,notes,created_by)
      values (campaign.workspace_id,p_campaign_id,master.id,master.name,lower(master.platform)::public.social_platform,chosen_theme,theme.name,visit,upload,(coalesce(upload,visit,(now() at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta','Terjadwal',master.rate,0,'Belum dibayar',p_input->>'notes',auth.uid()) returning * into saved;
  else
    next_status := case when p_input ? 'status' then p_input->>'status' else saved.status end;
    update public.influencer_bookings set campaign_id = p_campaign_id,campaign_influencer_theme_id = chosen_theme,
      content_title = coalesce(theme.name,saved.content_title),visit_date = visit,upload_date = upload,
      scheduled_at = (coalesce(upload,visit,(saved.scheduled_at at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta',
      notes = case when p_input ? 'notes' then p_input->>'notes' else saved.notes end,status = next_status,updated_at = now()
      where id = p_id and workspace_id = campaign.workspace_id returning * into saved;
  end if;
  return to_jsonb(saved) || jsonb_build_object('theme_name',theme.name,'scheduled_time',to_char(saved.scheduled_at at time zone 'Asia/Jakarta','HH24:MI'));
end;
$$;

create or replace function public.delete_campaign_influencer_booking(p_campaign_id uuid, p_booking_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_workspace uuid;
begin
  select c.workspace_id into target_workspace from public.campaigns c
  where c.id = p_campaign_id and c.lifecycle_status = 'active';
  if target_workspace is null or not public.can_edit_campaign_influencers(p_campaign_id) then
    raise exception 'Akun tidak dapat menghapus jadwal pada Campaign ini.' using errcode = '42501';
  end if;
  delete from public.influencer_bookings b
  where b.id = p_booking_id and b.campaign_id = p_campaign_id and b.workspace_id = target_workspace;
  if not found then raise exception 'Jadwal tidak ditemukan pada Campaign ini.' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.save_campaign_influencer_booking(uuid,uuid,jsonb), public.delete_campaign_influencer_booking(uuid,uuid) from public, anon;
grant execute on function public.save_campaign_influencer_booking(uuid,uuid,jsonb), public.delete_campaign_influencer_booking(uuid,uuid) to authenticated, service_role;
