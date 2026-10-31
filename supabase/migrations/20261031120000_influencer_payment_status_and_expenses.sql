-- Standardize influencer cooperation/payment labels and synchronize paid booking
-- amounts with the Campaign realized-spend total.

update public.influencer_bookings set status = 'Sudah visit'
where lower(btrim(status)) = 'menunggu upload';
update public.influencer_bookings set payment_status = 'Belum dibayar'
where lower(btrim(payment_status)) = 'belum dibayar';
update public.influencer_bookings set payment_status = 'DP dibayar'
where lower(btrim(payment_status)) = 'dp dibayar';
update public.influencer_bookings set payment_status = 'Lunas'
where lower(btrim(payment_status)) in ('lunas','sudah dibayar');

create or replace function public.protect_campaign_influencer_booking_actions()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  master_rate numeric;
  cooperation_statuses constant text[] := array[
    'Menunggu konfirmasi','Terjadwal','Sudah visit','Revisi','Selesai','Dibatalkan'
  ];
  payment_statuses constant text[] := array['Belum dibayar','DP dibayar','Lunas'];
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
    if not (new.status = any(cooperation_statuses)) then raise exception 'Status kerja sama tidak valid.'; end if;
    if not (new.payment_status = any(payment_statuses)) then raise exception 'Status pembayaran tidak valid.'; end if;
    if (new.payment_status = 'Belum dibayar' and new.spent <> 0)
      or (new.payment_status = 'DP dibayar' and (new.spent <= 0 or new.spent >= new.rate))
      or (new.payment_status = 'Lunas' and new.spent is distinct from new.rate) then
      raise exception 'Status pembayaran dan jumlah spent tidak sesuai.';
    end if;
    if not public.is_workspace_manager(new.workspace_id) then
      select i.rate into master_rate from public.marketing_influencers i where i.id = new.influencer_id and i.workspace_id = new.workspace_id;
      if master_rate is null or new.rate is distinct from master_rate or new.spent <> 0
        or new.status <> 'Terjadwal' or new.payment_status <> 'Belum dibayar' then
        raise exception 'Nilai awal booking harus mengikuti master influencer.';
      end if;
    end if;
  else
    if new.status is distinct from old.status and not (new.status = any(cooperation_statuses)) then
      raise exception 'Status kerja sama tidak valid.';
    end if;
    if new.payment_status is distinct from old.payment_status and not (new.payment_status = any(payment_statuses)) then raise exception 'Status pembayaran tidak valid.'; end if;
    if new.payment_status is distinct from old.payment_status or new.spent is distinct from old.spent or new.rate is distinct from old.rate then
      if (new.payment_status = 'Belum dibayar' and new.spent <> 0)
        or (new.payment_status = 'DP dibayar' and (new.spent <= 0 or new.spent >= new.rate))
        or (new.payment_status = 'Lunas' and new.spent is distinct from new.rate) then
        raise exception 'Status pembayaran dan jumlah spent tidak sesuai.';
      end if;
    end if;
    if not public.is_workspace_manager(new.workspace_id) then
      if new.rate is distinct from old.rate
        or new.spent is distinct from old.spent
        or new.payment_status is distinct from old.payment_status
        or new.influencer_id is distinct from old.influencer_id or new.influencer_name is distinct from old.influencer_name
        or new.platform is distinct from old.platform then
        raise exception 'Hanya Super Admin yang dapat mengubah nominal dan status pembayaran.';
      end if;
    end if;
  end if;

  if new.visit_date is not null and new.upload_date is not null and new.upload_date < new.visit_date then
    raise exception 'Tanggal upload tidak boleh lebih awal dari tanggal visit.';
  end if;
  return new;
end;
$$;

create or replace function public.sync_campaign_influencer_spent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare delta numeric;
begin
  if tg_op = 'INSERT' then
    if new.campaign_id is not null and new.spent <> 0 then
      update public.campaigns set spent = greatest(coalesce(spent,0) + new.spent, 0) where id = new.campaign_id and workspace_id = new.workspace_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.campaign_id is not null and old.spent <> 0 then
      update public.campaigns set spent = greatest(coalesce(spent,0) - old.spent, 0) where id = old.campaign_id and workspace_id = old.workspace_id;
    end if;
    return old;
  end if;

  if old.campaign_id is not distinct from new.campaign_id then
    delta := new.spent - old.spent;
    if new.campaign_id is not null and delta <> 0 then
      update public.campaigns set spent = greatest(coalesce(spent,0) + delta, 0) where id = new.campaign_id and workspace_id = new.workspace_id;
    end if;
  else
    if old.campaign_id is not null and old.spent <> 0 then
      update public.campaigns set spent = greatest(coalesce(spent,0) - old.spent, 0) where id = old.campaign_id and workspace_id = old.workspace_id;
    end if;
    if new.campaign_id is not null and new.spent <> 0 then
      update public.campaigns set spent = greatest(coalesce(spent,0) + new.spent, 0) where id = new.campaign_id and workspace_id = new.workspace_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_campaign_influencer_spent() from public, anon, authenticated;
drop trigger if exists sync_campaign_influencer_spent on public.influencer_bookings;
create trigger sync_campaign_influencer_spent after insert or update of spent, campaign_id or delete on public.influencer_bookings
  for each row execute function public.sync_campaign_influencer_spent();

create or replace function public.set_campaign_influencer_payment(
  p_campaign_id uuid,
  p_booking_id uuid,
  p_payment_status text,
  p_amount numeric default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campaign public.campaigns;
  saved public.influencer_bookings;
  next_amount numeric;
begin
  if p_payment_status is null or p_payment_status not in ('Belum dibayar','DP dibayar','Lunas') then
    raise exception 'Status pembayaran tidak valid.';
  end if;
  select * into strict campaign from public.campaigns where id = p_campaign_id and lifecycle_status = 'active';
  if not public.is_workspace_manager(campaign.workspace_id) then
    raise exception 'Hanya Super Admin yang dapat mengubah pembayaran influencer.' using errcode = '42501';
  end if;
  select * into saved from public.influencer_bookings
    where id = p_booking_id and campaign_id = p_campaign_id and workspace_id = campaign.workspace_id for update;
  if not found then raise exception 'Jadwal tidak ditemukan pada Campaign ini.' using errcode = 'P0002'; end if;

  if p_payment_status = 'Belum dibayar' then
    next_amount := 0;
  elsif p_payment_status = 'Lunas' then
    next_amount := greatest(saved.rate, 0);
  else
    if p_amount is null or p_amount <= 0 or p_amount >= saved.rate then
      raise exception 'Nominal DP harus lebih dari Rp0 dan lebih kecil dari rate influencer.';
    end if;
    next_amount := p_amount;
  end if;

  update public.influencer_bookings set payment_status = p_payment_status, spent = next_amount, updated_at = now()
    where id = p_booking_id and campaign_id = p_campaign_id and workspace_id = campaign.workspace_id returning * into saved;
  return to_jsonb(saved) || jsonb_build_object(
    'campaign_name', campaign.name,
    'theme_name', (select t.name from public.campaign_influencer_themes t where t.id = saved.campaign_influencer_theme_id),
    'scheduled_time', to_char(saved.scheduled_at at time zone 'Asia/Jakarta','HH24:MI')
  );
end;
$$;

revoke all on function public.set_campaign_influencer_payment(uuid,uuid,text,numeric) from public, anon;
grant execute on function public.set_campaign_influencer_payment(uuid,uuid,text,numeric) to authenticated;
