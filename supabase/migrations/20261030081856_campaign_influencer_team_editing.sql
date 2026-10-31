-- Members may manage operational influencer data on active Campaigns.
-- Campaign settings, tasks, phases and financial values keep their existing permissions.
create or replace function public.can_edit_campaign_influencers(target_campaign uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.campaigns c
    join public.workspace_members m on m.workspace_id = c.workspace_id
    where c.id = target_campaign and c.lifecycle_status = 'active'
      and m.user_id = (select auth.uid()) and m.role in ('owner','admin','member')
  );
$$;
revoke all on function public.can_edit_campaign_influencers(uuid) from public, anon;
grant execute on function public.can_edit_campaign_influencers(uuid) to authenticated, service_role;

alter table public.campaign_influencer_themes enable row level security;
alter table public.influencer_bookings enable row level security;
drop policy if exists "members manage campaign influencer themes" on public.campaign_influencer_themes;
drop policy if exists "managers manage campaign influencer themes" on public.campaign_influencer_themes;
create policy "workspace reads campaign influencer themes" on public.campaign_influencer_themes
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "team creates campaign influencer themes" on public.campaign_influencer_themes
  for insert to authenticated with check (
    public.can_edit_campaign_influencers(campaign_id)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = campaign_influencer_themes.workspace_id)
  );
create policy "team updates campaign influencer themes" on public.campaign_influencer_themes
  for update to authenticated using (public.can_edit_campaign_influencers(campaign_id))
  with check (public.can_edit_campaign_influencers(campaign_id)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = campaign_influencer_themes.workspace_id));
create policy "managers delete campaign influencer themes" on public.campaign_influencer_themes
  for delete to authenticated using (public.is_workspace_manager(workspace_id) and public.can_edit_campaign_influencers(campaign_id));

drop policy if exists "members manage influencer bookings" on public.influencer_bookings;
drop policy if exists "members manage unlinked influencer bookings" on public.influencer_bookings;
create policy "workspace reads influencer bookings" on public.influencer_bookings
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "team manages legacy unlinked bookings" on public.influencer_bookings
  for all to authenticated using (campaign_id is null and exists (
    select 1 from public.workspace_members m where m.workspace_id = influencer_bookings.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin','member')
  )) with check (campaign_id is null and exists (
    select 1 from public.workspace_members m where m.workspace_id = influencer_bookings.workspace_id and m.user_id = (select auth.uid()) and m.role in ('owner','admin','member')
  ));
create policy "team creates campaign influencer bookings" on public.influencer_bookings
  for insert to authenticated with check (public.can_edit_campaign_influencers(campaign_id)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = influencer_bookings.workspace_id));
create policy "team updates campaign influencer bookings" on public.influencer_bookings
  for update to authenticated using (public.can_edit_campaign_influencers(campaign_id))
  with check (public.can_edit_campaign_influencers(campaign_id)
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.workspace_id = influencer_bookings.workspace_id));
create policy "managers delete campaign influencer bookings" on public.influencer_bookings
  for delete to authenticated using (public.is_workspace_manager(workspace_id) and public.can_edit_campaign_influencers(campaign_id));
grant select, insert, update, delete on public.campaign_influencer_themes, public.influencer_bookings to authenticated, service_role;

create or replace function public.protect_campaign_influencer_edits()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare master_rate numeric;
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
  if tg_table_name = 'campaign_influencer_themes' then
    if nullif(btrim(new.name), '') is null then raise exception 'Nama tema wajib diisi.'; end if;
    new.name := btrim(new.name);
    new.updated_by := auth.uid();
    if tg_op = 'UPDATE' and new.code is distinct from old.code then raise exception 'Kode tema tidak dapat diubah.'; end if;
  else
    if not public.is_workspace_manager(new.workspace_id) then
      if tg_op = 'UPDATE' then
        if new.rate is distinct from old.rate or new.spent is distinct from old.spent
          or new.status is distinct from old.status or new.payment_status is distinct from old.payment_status
          or new.influencer_id is distinct from old.influencer_id or new.influencer_name is distinct from old.influencer_name
          or new.platform is distinct from old.platform then
          raise exception 'Anggota hanya dapat mengubah tema, tanggal dan catatan jadwal.';
        end if;
      else
        select i.rate into master_rate from public.marketing_influencers i where i.id = new.influencer_id and i.workspace_id = new.workspace_id;
        if master_rate is null or new.rate is distinct from master_rate or new.spent <> 0
          or new.status <> 'Terjadwal' or new.payment_status <> 'Belum dibayar' then
          raise exception 'Nilai biaya awal harus mengikuti master influencer.';
        end if;
      end if;
    end if;
    if new.visit_date is not null and new.upload_date is not null and new.upload_date < new.visit_date then
      raise exception 'Tanggal upload tidak boleh lebih awal dari tanggal visit.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_campaign_influencer_edits() from public, anon, authenticated;
drop trigger if exists protect_campaign_influencer_theme_edits on public.campaign_influencer_themes;
create trigger protect_campaign_influencer_theme_edits before insert or update on public.campaign_influencer_themes
  for each row execute function public.protect_campaign_influencer_edits();
drop trigger if exists protect_campaign_influencer_booking_edits on public.influencer_bookings;
create trigger protect_campaign_influencer_booking_edits before insert or update on public.influencer_bookings
  for each row execute function public.protect_campaign_influencer_edits();

create or replace function public.save_campaign_influencer_theme(p_campaign_id uuid, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare campaign public.campaigns; saved public.campaign_influencer_themes; next_code integer;
begin
  if not public.can_edit_campaign_influencers(p_campaign_id) then raise exception 'Akun tidak dapat mengedit influencer pada Campaign ini.'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or exists (select 1 from jsonb_object_keys(p_input) k where k not in ('name','phase','objective','requiredContent','cta')) then
    raise exception 'Field tema tidak valid.';
  end if;
  if nullif(btrim(p_input->>'name'), '') is null then raise exception 'Nama tema wajib diisi.'; end if;
  select * into strict campaign from public.campaigns where id = p_campaign_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('campaign-influencer-theme:' || p_campaign_id::text, 0));
  if p_id is null then
    select coalesce(max(substring(code from '^T([0-9]+)$')::integer), 0) + 1 into next_code
      from public.campaign_influencer_themes where campaign_id = p_campaign_id;
    insert into public.campaign_influencer_themes (workspace_id,campaign_id,code,name,phase,objective,required_content,cta,created_by,updated_by)
      values (campaign.workspace_id,p_campaign_id,'T' || lpad(next_code::text,greatest(2,length(next_code::text)),'0'),btrim(p_input->>'name'),coalesce(p_input->>'phase',''),coalesce(p_input->>'objective',''),coalesce(p_input->>'requiredContent',''),coalesce(p_input->>'cta',''),auth.uid(),auth.uid()) returning * into saved;
  else
    perform 1 from public.campaign_influencer_themes where id = p_id and campaign_id = p_campaign_id and workspace_id = campaign.workspace_id for update;
    if not found then raise exception 'Tema tidak ditemukan pada Campaign ini.'; end if;
    update public.campaign_influencer_themes set name=btrim(p_input->>'name'),phase=coalesce(p_input->>'phase',''),objective=coalesce(p_input->>'objective',''),required_content=coalesce(p_input->>'requiredContent',''),cta=coalesce(p_input->>'cta',''),updated_by=auth.uid(),updated_at=now()
      where id=p_id and campaign_id=p_campaign_id returning * into saved;
    update public.influencer_bookings set content_title=saved.name,updated_at=now()
      where campaign_id=p_campaign_id and campaign_influencer_theme_id=saved.id;
  end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.save_campaign_influencer_booking(p_campaign_id uuid, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare campaign public.campaigns; saved public.influencer_bookings; master public.marketing_influencers;
  theme public.campaign_influencer_themes; chosen_theme uuid; visit date; upload date; schedule_time time;
begin
  if not public.can_edit_campaign_influencers(p_campaign_id) then raise exception 'Akun tidak dapat mengedit influencer pada Campaign ini.'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or exists (select 1 from jsonb_object_keys(p_input) k where k not in ('influencerId','themeId','visitDate','uploadDate','notes')) then raise exception 'Field jadwal tidak valid.'; end if;
  select * into strict campaign from public.campaigns where id=p_campaign_id;
  if p_id is not null then
    select * into saved from public.influencer_bookings where id=p_id and workspace_id=campaign.workspace_id and (campaign_id=p_campaign_id or campaign_id is null) for update;
    if not found then raise exception 'Jadwal tidak ditemukan pada Campaign ini.'; end if;
    if p_input ? 'influencerId' and nullif(p_input->>'influencerId','')::uuid is distinct from saved.influencer_id then raise exception 'Influencer pada jadwal existing tidak dapat diganti.'; end if;
  else
    select * into master from public.marketing_influencers where id=nullif(p_input->>'influencerId','')::uuid and workspace_id=campaign.workspace_id;
    if not found then raise exception 'Pilih influencer dari master workspace ini.'; end if;
  end if;
  chosen_theme := case when p_input ? 'themeId' then nullif(p_input->>'themeId','')::uuid else saved.campaign_influencer_theme_id end;
  if chosen_theme is not null then
    select * into theme from public.campaign_influencer_themes where id=chosen_theme and campaign_id=p_campaign_id and workspace_id=campaign.workspace_id;
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
    update public.influencer_bookings set campaign_id=p_campaign_id,campaign_influencer_theme_id=chosen_theme,content_title=coalesce(theme.name,saved.content_title),visit_date=visit,upload_date=upload,
      scheduled_at=(coalesce(upload,visit,(saved.scheduled_at at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta',
      notes=case when p_input ? 'notes' then p_input->>'notes' else saved.notes end,updated_at=now()
      where id=p_id and workspace_id=campaign.workspace_id returning * into saved;
  end if;
  return to_jsonb(saved) || jsonb_build_object('theme_name',theme.name,'scheduled_time',to_char(saved.scheduled_at at time zone 'Asia/Jakarta','HH24:MI'));
end;
$$;
revoke all on function public.save_campaign_influencer_theme(uuid,uuid,jsonb), public.save_campaign_influencer_booking(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_campaign_influencer_theme(uuid,uuid,jsonb), public.save_campaign_influencer_booking(uuid,uuid,jsonb) to authenticated, service_role;
