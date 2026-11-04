-- Add social accounts and reusable rate-card packages to influencer master data.
-- Existing booking snapshots (name, platform, rate, spent, and payment status) remain intact.

alter table public.marketing_influencers
  add column if not exists collaboration_type text not null default 'Influencer',
  add column if not exists niches text[] not null default '{}',
  add column if not exists custom_niche text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_influencers_collaboration_type_check' and conrelid = 'public.marketing_influencers'::regclass) then
    alter table public.marketing_influencers add constraint marketing_influencers_collaboration_type_check
      check (collaboration_type in ('Influencer','Barter Endorse'));
  end if;
end $$;

update public.marketing_influencers
set niches = case
      when niche is null or btrim(niche) = '' or lower(btrim(niche)) = 'belum diisi' then '{}'::text[]
      when lower(niche) ~ '(food|kuliner|makan|beverage|resto)' then array_remove(array[
        case when lower(niche) ~ '(food|kuliner|makan|beverage|resto)' then 'Food & Beverage' end,
        case when lower(niche) ~ '(travel|traveler|wisata|jalan.?jalan)' then 'Travel' end,
        case when lower(niche) ~ '(media|publisher|portal|news)' then 'Media' end,
        case when lower(niche) ~ 'lifestyle' then 'Lifestyle' end,
        case when lower(niche) ~ '(beauty|fashion|make.?up|skincare)' then 'Beauty/Fashion' end,
        case when lower(niche) ~ '(parent|family|keluarga|mom|kids)' then 'Parenting/Family' end,
        case when lower(niche) ~ '(entertainment|hiburan|music|film)' then 'Entertainment' end,
        case when lower(niche) ~ '(komunitas|community|local|lokal)' then 'Komunitas/Lokal' end
      ], null)
      else array_remove(array[
        case when lower(niche) ~ '(travel|traveler|wisata|jalan.?jalan)' then 'Travel' end,
        case when lower(niche) ~ '(media|publisher|portal|news)' then 'Media' end,
        case when lower(niche) ~ 'lifestyle' then 'Lifestyle' end,
        case when lower(niche) ~ '(beauty|fashion|make.?up|skincare)' then 'Beauty/Fashion' end,
        case when lower(niche) ~ '(parent|family|keluarga|mom|kids)' then 'Parenting/Family' end,
        case when lower(niche) ~ '(entertainment|hiburan|music|film)' then 'Entertainment' end,
        case when lower(niche) ~ '(komunitas|community|local|lokal)' then 'Komunitas/Lokal' end,
        case when lower(niche) !~ '(travel|traveler|wisata|jalan.?jalan|media|publisher|portal|news|lifestyle|beauty|fashion|make.?up|skincare|parent|family|keluarga|mom|kids|entertainment|hiburan|music|film|komunitas|community|local|lokal)' then 'Lainnya' end
      ], null)
    end,
    custom_niche = case
      when niche is null or btrim(niche) = '' or lower(btrim(niche)) = 'belum diisi' then null
      when lower(niche) !~ '(food|kuliner|makan|beverage|resto|travel|traveler|wisata|jalan.?jalan|media|publisher|portal|news|lifestyle|beauty|fashion|make.?up|skincare|parent|family|keluarga|mom|kids|entertainment|hiburan|music|film|komunitas|community|local|lokal)' then left(btrim(niche),80)
      else custom_niche
    end
where cardinality(niches) = 0;

create unique index if not exists marketing_influencers_workspace_id_id_idx
  on public.marketing_influencers(workspace_id, id);

create table if not exists public.marketing_influencer_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid not null,
  platform text not null check (platform in ('Instagram','TikTok')),
  username text,
  followers bigint not null default 0 check (followers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (influencer_id, platform),
  constraint marketing_influencer_accounts_profile_workspace_fk
    foreign key (workspace_id, influencer_id) references public.marketing_influencers(workspace_id, id) on delete cascade,
  check (username is null or (btrim(username) <> '' and char_length(username) <= 80))
);

create table if not exists public.marketing_influencer_rate_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  influencer_id uuid not null,
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  platform text not null check (platform in ('Instagram','TikTok','Lainnya')),
  details text not null default '' check (char_length(details) <= 2000),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_influencer_rate_cards_profile_workspace_fk
    foreign key (workspace_id, influencer_id) references public.marketing_influencers(workspace_id, id) on delete cascade
);

create index if not exists marketing_influencer_accounts_workspace_profile_idx
  on public.marketing_influencer_accounts(workspace_id, influencer_id);
create index if not exists marketing_influencer_rate_cards_workspace_profile_idx
  on public.marketing_influencer_rate_cards(workspace_id, influencer_id, position, created_at);
create unique index if not exists marketing_influencer_accounts_handle_idx
  on public.marketing_influencer_accounts(workspace_id, platform, lower(username)) where username is not null;

alter table public.marketing_influencer_accounts enable row level security;
alter table public.marketing_influencer_rate_cards enable row level security;
drop policy if exists "members manage marketing influencers" on public.marketing_influencers;
drop policy if exists "workspace reads marketing influencers" on public.marketing_influencers;
drop policy if exists "team manages marketing influencers" on public.marketing_influencers;
create policy "workspace reads marketing influencers" on public.marketing_influencers
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "team manages marketing influencers" on public.marketing_influencers
  for all to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id=marketing_influencers.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member')))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id=marketing_influencers.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member')));
revoke all on public.marketing_influencer_accounts, public.marketing_influencer_rate_cards from anon;
drop policy if exists "members manage influencer social accounts" on public.marketing_influencer_accounts;
drop policy if exists "workspace reads influencer social accounts" on public.marketing_influencer_accounts;
drop policy if exists "team manages influencer social accounts" on public.marketing_influencer_accounts;
create policy "workspace reads influencer social accounts" on public.marketing_influencer_accounts
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "team manages influencer social accounts" on public.marketing_influencer_accounts
  for all to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id=marketing_influencer_accounts.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member')))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id=marketing_influencer_accounts.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member')));
drop policy if exists "members manage influencer rate cards" on public.marketing_influencer_rate_cards;
drop policy if exists "workspace reads influencer rate cards" on public.marketing_influencer_rate_cards;
drop policy if exists "team manages influencer rate cards" on public.marketing_influencer_rate_cards;
create policy "workspace reads influencer rate cards" on public.marketing_influencer_rate_cards
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "team manages influencer rate cards" on public.marketing_influencer_rate_cards
  for all to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id=marketing_influencer_rate_cards.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member')))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id=marketing_influencer_rate_cards.workspace_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin','member')));
grant select, insert, update, delete on public.marketing_influencer_accounts, public.marketing_influencer_rate_cards to authenticated, service_role;

-- Backfill a legacy platform account and package without inventing usernames.
insert into public.marketing_influencer_accounts (workspace_id, influencer_id, platform, username, followers)
select i.workspace_id, i.id,
  case when lower(i.platform) = 'tiktok' then 'TikTok' else 'Instagram' end,
  null,
  case
    when lower(btrim(i.followers)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*m$'
      then least(round(replace(regexp_replace(lower(btrim(i.followers)), '[[:space:]]*m$', ''), ',', '.')::numeric * 1000000),1000000000)::bigint
    when lower(btrim(i.followers)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*k$'
      then least(round(replace(regexp_replace(lower(btrim(i.followers)), '[[:space:]]*k$', ''), ',', '.')::numeric * 1000),1000000000)::bigint
    when regexp_replace(coalesce(i.followers,''), '[^0-9]', '', 'g') <> ''
      then least(regexp_replace(i.followers, '[^0-9]', '', 'g')::numeric, 1000000000)::bigint
    else 0
  end
from public.marketing_influencers i
where lower(i.platform) in ('instagram','tiktok')
on conflict (influencer_id, platform) do nothing;

insert into public.marketing_influencer_rate_cards (workspace_id, influencer_id, name, platform, details, amount, position)
select i.workspace_id, i.id, 'Paket awal',
  case when lower(i.platform) = 'instagram' then 'Instagram' when lower(i.platform) = 'tiktok' then 'TikTok' else 'Lainnya' end,
  'Rate card lama', greatest(coalesce(i.rate,0),0), 0
from public.marketing_influencers i
where coalesce(i.rate,0) >= 0
  and lower(i.platform) <> 'facebook'
  and not exists (select 1 from public.marketing_influencer_rate_cards r where r.influencer_id = i.id);

-- Booking rows have independent influencer/platform/rate/payment snapshots. ON DELETE SET NULL
-- preserves those rows and keeps campaign spent unchanged when the legacy Facebook master is removed.
delete from public.marketing_influencers where lower(platform) = 'facebook';

alter table public.influencer_bookings
  add column if not exists collaboration_type text not null default 'Influencer',
  add column if not exists rate_card_id uuid references public.marketing_influencer_rate_cards(id) on delete set null,
  add column if not exists rate_card_name_snapshot text,
  add column if not exists rate_card_platform_snapshot text,
  add column if not exists rate_card_details_snapshot text,
  add column if not exists username_snapshot text,
  add column if not exists barter_value numeric(14,2) not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'influencer_bookings_collaboration_type_check' and conrelid = 'public.influencer_bookings'::regclass) then
    alter table public.influencer_bookings add constraint influencer_bookings_collaboration_type_check
      check (collaboration_type in ('Influencer','Barter Endorse'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'influencer_bookings_barter_value_check' and conrelid = 'public.influencer_bookings'::regclass) then
    alter table public.influencer_bookings add constraint influencer_bookings_barter_value_check check (barter_value >= 0);
  end if;
end $$;
create index if not exists influencer_bookings_rate_card_idx on public.influencer_bookings(workspace_id, rate_card_id);

-- Profiles and packages are written together. Existing child IDs are kept so bookings retain
-- their live master relation; immutable package details are separately copied to each booking.
create or replace function public.save_marketing_influencer_profile(p_workspace_id uuid, p_id uuid, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved public.marketing_influencers;
  account_item jsonb;
  package_item jsonb;
  account_id uuid;
  package_id uuid;
  account_platform text;
  package_platform text;
  account_ids uuid[] := '{}'::uuid[];
  package_ids uuid[] := '{}'::uuid[];
  account_count integer := 0;
  package_count integer := 0;
  primary_account jsonb;
  legacy_niche text;
  primary_platform text;
  primary_followers bigint;
  legacy_rate numeric;
  next_type text;
  next_niches text[];
  next_custom_niche text;
begin
  if auth.uid() is null or p_workspace_id is null or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.role in ('owner','admin','member')
  ) then
    raise exception 'Akun bukan anggota workspace ini.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_input) key where key not in ('name','collaborationType','niches','customNiche','accounts','rateCards')
  ) then raise exception 'Field profil influencer tidak valid.'; end if;
  if nullif(btrim(p_input->>'name'),'') is null or char_length(btrim(p_input->>'name')) > 160 then raise exception 'Nama influencer wajib diisi (maksimal 160 karakter).'; end if;
  next_type := p_input->>'collaborationType';
  if next_type not in ('Influencer','Barter Endorse') then raise exception 'Jenis kolaborasi tidak valid.'; end if;
  if jsonb_typeof(p_input->'niches') is distinct from 'array' or jsonb_array_length(p_input->'niches') = 0 then raise exception 'Pilih minimal satu niche.'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_input->'niches') niche(value)
    where niche.value not in ('Food & Beverage','Travel','Media','Lifestyle','Beauty/Fashion','Parenting/Family','Entertainment','Komunitas/Lokal','Lainnya')) then raise exception 'Pilihan niche tidak valid.'; end if;
  if 'Lainnya' = any(array(select jsonb_array_elements_text(p_input->'niches'))) and nullif(btrim(p_input->>'customNiche'),'') is null then raise exception 'Isi niche lainnya.'; end if;
  if char_length(coalesce(p_input->>'customNiche','')) > 80 then raise exception 'Niche lainnya maksimal 80 karakter.'; end if;
  if jsonb_typeof(p_input->'accounts') is distinct from 'array' or jsonb_typeof(p_input->'rateCards') is distinct from 'array' then raise exception 'Akun dan paket rate card harus berupa daftar.'; end if;
  if jsonb_array_length(p_input->'accounts') < 1 or jsonb_array_length(p_input->'accounts') > 2 then raise exception 'Tambahkan satu atau dua akun sosial.'; end if;
  if jsonb_array_length(p_input->'rateCards') < 1 or jsonb_array_length(p_input->'rateCards') > 30 then raise exception 'Tambahkan 1 sampai 30 paket.'; end if;
  if exists (select 1 from jsonb_array_elements(p_input->'accounts') a(item) group by a.item->>'platform' having count(*) > 1) then raise exception 'Setiap profil hanya dapat memiliki satu akun per platform.'; end if;
  if exists (select 1 from jsonb_array_elements(p_input->'accounts') a(item) where nullif(a.item->>'id','') is not null group by a.item->>'id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_input->'rateCards') r(item) where nullif(r.item->>'id','') is not null group by r.item->>'id' having count(*) > 1) then
    raise exception 'ID akun atau paket tidak boleh digunakan lebih dari sekali.';
  end if;
  if p_id is not null then
    select * into saved from public.marketing_influencers where id=p_id and workspace_id=p_workspace_id for update;
    if not found then raise exception 'Profil influencer tidak ditemukan pada workspace ini.'; end if;
  end if;

  for account_item in select value from jsonb_array_elements(p_input->'accounts') loop
    account_platform := account_item->>'platform';
    if account_platform not in ('Instagram','TikTok') or nullif(btrim(account_item->>'username'),'') is null then raise exception 'Setiap akun harus berisi platform dan username.'; end if;
    if char_length(btrim(account_item->>'username')) > 80 then raise exception 'Username maksimal 80 karakter.'; end if;
    if coalesce((account_item->>'followers')::numeric,-1) < 0 or coalesce((account_item->>'followers')::numeric,0) > 1000000000 or (account_item->>'followers') !~ '^[0-9]+$' then raise exception 'Jumlah followers tidak valid.'; end if;
    account_count := account_count + 1;
    if primary_account is null then primary_account := account_item; end if;
  end loop;
  if account_count = 0 then raise exception 'Tambahkan minimal satu akun sosial.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_input->'rateCards') r(item)
    where r.item->>'platform' in ('Instagram','TikTok')
      and not exists (select 1 from jsonb_array_elements(p_input->'accounts') a(item) where a.item->>'platform'=r.item->>'platform')
  ) then raise exception 'Tambahkan akun sosial untuk setiap platform yang digunakan oleh paket.'; end if;

  next_niches := array(select distinct jsonb_array_elements_text(p_input->'niches'));
  next_custom_niche := nullif(btrim(p_input->>'customNiche'),'');
  legacy_niche := array_to_string(array_remove(next_niches,'Lainnya'),', ');
  if 'Lainnya' = any(next_niches) then legacy_niche := concat_ws(', ', nullif(legacy_niche,''), next_custom_niche); end if;
  primary_platform := lower(primary_account->>'platform');
  primary_followers := (primary_account->>'followers')::bigint;
  select min((value->>'amount')::numeric) into legacy_rate from jsonb_array_elements(p_input->'rateCards') value;
  if next_type = 'Barter Endorse' then legacy_rate := 0; end if;

  if p_id is null then
    insert into public.marketing_influencers (workspace_id,name,platform,niche,rate,followers,engagement,status,collaboration_type,niches,custom_niche)
      values (p_workspace_id,btrim(p_input->>'name'),primary_platform,coalesce(nullif(legacy_niche,''),'Belum diisi'),coalesce(legacy_rate,0),primary_followers::text,'—','Aktif',next_type,next_niches,next_custom_niche)
      returning * into saved;
  else
    update public.marketing_influencers set name=btrim(p_input->>'name'),platform=primary_platform,niche=coalesce(nullif(legacy_niche,''),'Belum diisi'),rate=coalesce(legacy_rate,0),followers=primary_followers::text,collaboration_type=next_type,niches=next_niches,custom_niche=next_custom_niche,updated_at=now()
      where id=p_id and workspace_id=p_workspace_id returning * into saved;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_input->'accounts') a(item)
    where nullif(a.item->>'id','') is not null and not exists (
      select 1 from public.marketing_influencer_accounts current_account
      where current_account.id=(a.item->>'id')::uuid and current_account.influencer_id=saved.id and current_account.workspace_id=p_workspace_id
    )
  ) then raise exception 'Akun sosial bukan bagian dari profil ini.'; end if;
  -- Account IDs are not referenced by bookings; replacing the small account set first
  -- also allows Instagram and TikTok rows to swap positions without unique-key conflicts.
  delete from public.marketing_influencer_accounts where influencer_id=saved.id and workspace_id=p_workspace_id;
  for account_item in select value from jsonb_array_elements(p_input->'accounts') loop
    account_id := nullif(account_item->>'id','')::uuid;
    if account_id is null then account_id := gen_random_uuid(); end if;
    insert into public.marketing_influencer_accounts (id,workspace_id,influencer_id,platform,username,followers,updated_at)
      values (account_id,p_workspace_id,saved.id,account_item->>'platform',regexp_replace(btrim(account_item->>'username'),'^[[:space:]]*@+',''),(account_item->>'followers')::bigint,now())
      on conflict (id) do update set platform=excluded.platform, username=excluded.username, followers=excluded.followers, updated_at=now();
    account_ids := array_append(account_ids,account_id);
  end loop;
  for package_item in select value from jsonb_array_elements(p_input->'rateCards') loop
    if nullif(btrim(package_item->>'name'),'') is null or char_length(btrim(package_item->>'name')) > 100 then raise exception 'Nama paket wajib diisi (maksimal 100 karakter).'; end if;
    package_platform := package_item->>'platform';
    if package_platform not in ('Instagram','TikTok','Lainnya') then raise exception 'Platform paket tidak valid.'; end if;
    if coalesce((package_item->>'amount')::numeric,-1) < 0 or coalesce((package_item->>'amount')::numeric,1000000000000) > 999999999999 then raise exception 'Nilai paket tidak valid.'; end if;
    if char_length(coalesce(package_item->>'details','')) > 2000 then raise exception 'Detail paket maksimal 2.000 karakter.'; end if;
    package_id := nullif(package_item->>'id','')::uuid;
    if package_id is not null and not exists (select 1 from public.marketing_influencer_rate_cards where id=package_id and influencer_id=saved.id and workspace_id=p_workspace_id) then raise exception 'Paket bukan bagian dari profil ini.'; end if;
    if package_id is null then package_id := gen_random_uuid(); end if;
    insert into public.marketing_influencer_rate_cards (id,workspace_id,influencer_id,name,platform,details,amount,position,updated_at)
      values (package_id,p_workspace_id,saved.id,btrim(package_item->>'name'),package_platform,coalesce(package_item->>'details',''),(package_item->>'amount')::numeric,package_count,now())
      on conflict (id) do update set name=excluded.name, platform=excluded.platform, details=excluded.details, amount=excluded.amount, position=excluded.position, updated_at=now();
    package_ids := array_append(package_ids,package_id);
    package_count := package_count + 1;
  end loop;
  delete from public.marketing_influencer_accounts where influencer_id=saved.id and not (id=any(account_ids));
  delete from public.marketing_influencer_rate_cards where influencer_id=saved.id and not (id=any(package_ids));
  return to_jsonb(saved) || jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by a.platform) from public.marketing_influencer_accounts a where a.influencer_id=saved.id),'[]'::jsonb),
    'rate_cards',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.created_at) from public.marketing_influencer_rate_cards r where r.influencer_id=saved.id),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.save_marketing_influencer_profile(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_marketing_influencer_profile(uuid,uuid,jsonb) to authenticated;

-- Keep the legacy trigger's theme checks, while booking authorization and financial snapshots
-- are enforced by the dedicated booking trigger below.
create or replace function public.protect_campaign_influencer_edits()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'campaign_influencer_themes' then
    if not public.can_edit_campaign_influencers(new.campaign_id) then raise exception 'Campaign hanya dapat dibaca atau akun tidak memiliki izin.'; end if;
    if nullif(btrim(new.name),'') is null then raise exception 'Nama tema wajib diisi.'; end if;
    new.name := btrim(new.name); new.updated_by := auth.uid(); new.updated_at := now();
    if tg_op='UPDATE' and new.code is distinct from old.code then raise exception 'Kode tema tidak dapat diubah.'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_campaign_influencer_booking_actions()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  is_manager boolean;
  allowed_cooperation constant text[] := array['Menunggu konfirmasi','Terjadwal','Sudah visit','Revisi','Selesai','Dibatalkan'];
  allowed_payment constant text[] := array['Belum dibayar','DP dibayar','Lunas'];
begin
  if auth.uid() is null then return new; end if;
  is_manager := public.is_workspace_manager(new.workspace_id);
  if tg_op='UPDATE' then
    if new.workspace_id is distinct from old.workspace_id or new.id is distinct from old.id
      or (old.campaign_id is not null and new.campaign_id is distinct from old.campaign_id) then raise exception 'Relasi Campaign dan workspace tidak dapat dipindahkan.'; end if;
    new.created_by := old.created_by; new.created_at := old.created_at;
    if not is_manager and (
      new.rate is distinct from old.rate or new.barter_value is distinct from old.barter_value or new.spent is distinct from old.spent
      or new.payment_status is distinct from old.payment_status or new.influencer_id is distinct from old.influencer_id
      or new.influencer_name is distinct from old.influencer_name or new.platform is distinct from old.platform
      or new.collaboration_type is distinct from old.collaboration_type or new.rate_card_id is distinct from old.rate_card_id
      or new.rate_card_name_snapshot is distinct from old.rate_card_name_snapshot
      or new.rate_card_platform_snapshot is distinct from old.rate_card_platform_snapshot
      or new.rate_card_details_snapshot is distinct from old.rate_card_details_snapshot
      or new.username_snapshot is distinct from old.username_snapshot
    ) then raise exception 'Anggota tidak dapat mengubah snapshot paket dan data pembayaran.'; end if;
  else new.created_by := auth.uid(); end if;
  if new.campaign_id is null then return new; end if;
  if not public.can_edit_campaign_influencers(new.campaign_id) then raise exception 'Campaign hanya dapat dibaca atau akun tidak memiliki izin.'; end if;
  if new.status is null or (not (new.status=any(allowed_cooperation)) and not (tg_op='UPDATE' and old.status='Draft' and new.status='Draft')) then raise exception 'Status kerja sama tidak valid.'; end if;
  if new.payment_status is null or not (new.payment_status=any(allowed_payment)) then raise exception 'Status pembayaran tidak valid.'; end if;
  if new.collaboration_type not in ('Influencer','Barter Endorse') then raise exception 'Jenis kerja sama tidak valid.'; end if;
  if new.rate < 0 or new.spent < 0 or new.barter_value < 0 then raise exception 'Nilai booking tidak boleh negatif.'; end if;
  if new.influencer_id is not null and not exists (
    select 1 from public.marketing_influencers i where i.id=new.influencer_id and i.workspace_id=new.workspace_id
  ) then raise exception 'Influencer tidak berasal dari workspace booking.'; end if;
  if new.rate_card_id is not null and not exists (
    select 1 from public.marketing_influencer_rate_cards r where r.id=new.rate_card_id and r.workspace_id=new.workspace_id and r.influencer_id=new.influencer_id
  ) then raise exception 'Snapshot paket tidak berasal dari profil influencer booking.'; end if;
  if new.collaboration_type='Barter Endorse' then
    if new.rate <> 0 or new.spent <> 0 or new.payment_status <> 'Belum dibayar' then raise exception 'Booking barter tidak menggunakan pembayaran tunai.'; end if;
  else
    if new.barter_value <> 0 then raise exception 'Booking Influencer tidak dapat menyimpan nilai barter.'; end if;
    if (new.payment_status='Belum dibayar' and new.spent<>0)
      or (new.payment_status='DP dibayar' and (new.spent<=0 or new.spent>=new.rate))
      or (new.payment_status='Lunas' and new.spent is distinct from new.rate) then raise exception 'Status pembayaran dan jumlah spent tidak sesuai.'; end if;
  end if;
  if tg_op='INSERT' and not is_manager then
    if new.rate_card_id is null or new.spent<>0 or new.status<>'Terjadwal' or new.payment_status<>'Belum dibayar' then raise exception 'Nilai booking harus mengikuti paket master.'; end if;
    if new.collaboration_type='Influencer' and not exists(select 1 from public.marketing_influencer_rate_cards r where r.id=new.rate_card_id and r.workspace_id=new.workspace_id and r.influencer_id=new.influencer_id and r.amount=new.rate) then raise exception 'Harga harus mengikuti paket master.'; end if;
    if new.collaboration_type='Barter Endorse' and not exists(select 1 from public.marketing_influencer_rate_cards r where r.id=new.rate_card_id and r.workspace_id=new.workspace_id and r.influencer_id=new.influencer_id and r.amount=new.barter_value) then raise exception 'Estimasi harus mengikuti paket master.'; end if;
  end if;
  if new.visit_date is not null and new.upload_date is not null and new.upload_date<new.visit_date then raise exception 'Tanggal upload tidak boleh lebih awal dari tanggal visit.'; end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.save_campaign_influencer_booking(p_campaign_id uuid,p_id uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campaign public.campaigns;
  saved public.influencer_bookings;
  master public.marketing_influencers;
  package public.marketing_influencer_rate_cards;
  account public.marketing_influencer_accounts;
  theme public.campaign_influencer_themes;
  chosen_theme uuid;
  visit date;
  upload date;
  schedule_time time;
  theme_name_snapshot text;
  next_status text;
  next_content_link text;
  agreed numeric;
  next_rate numeric;
  next_barter numeric;
  next_platform text;
begin
  if not public.can_edit_campaign_influencers(p_campaign_id) then raise exception 'Akun tidak dapat mengedit influencer pada Campaign ini.'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(p_input) k where k not in ('influencerId','accountId','rateCardId','agreedRate','themeId','visitDate','uploadDate','notes','status','contentLink')
  ) then raise exception 'Field jadwal tidak valid.'; end if;
  if p_input ? 'status' and (p_input->>'status') not in ('Menunggu konfirmasi','Terjadwal','Sudah visit','Revisi','Selesai','Dibatalkan') then raise exception 'Status kerja sama tidak valid.'; end if;
  if p_id is null and p_input ? 'status' then raise exception 'Status awal booking ditetapkan sebagai Terjadwal.'; end if;
  select * into strict campaign from public.campaigns where id=p_campaign_id;
  if p_id is not null then
    select * into saved from public.influencer_bookings where id=p_id and workspace_id=campaign.workspace_id and (campaign_id=p_campaign_id or campaign_id is null) for update;
    if not found then raise exception 'Jadwal tidak ditemukan pada Campaign ini.'; end if;
    if p_input ? 'influencerId' and nullif(p_input->>'influencerId','')::uuid is distinct from saved.influencer_id then raise exception 'Influencer pada jadwal existing tidak dapat diganti.'; end if;
    if p_input ? 'rateCardId' or p_input ? 'accountId' or p_input ? 'agreedRate' then raise exception 'Snapshot paket pada booking lama tidak dapat diganti.'; end if;
  else
    select * into master from public.marketing_influencers where id=nullif(p_input->>'influencerId','')::uuid and workspace_id=campaign.workspace_id;
    if not found then raise exception 'Pilih influencer dari master workspace ini.'; end if;
    select * into package from public.marketing_influencer_rate_cards where id=nullif(p_input->>'rateCardId','')::uuid and influencer_id=master.id and workspace_id=campaign.workspace_id;
    if not found then raise exception 'Pilih paket rate card milik influencer ini.'; end if;
    if p_input ? 'agreedRate' then
      if not public.is_workspace_manager(campaign.workspace_id) then raise exception 'Hanya Super Admin dapat menyesuaikan harga paket.' using errcode='42501'; end if;
      if coalesce((p_input->>'agreedRate')::numeric,-1)<0 or (p_input->>'agreedRate')::numeric>999999999999 then raise exception 'Harga yang disepakati tidak valid.'; end if;
      agreed := (p_input->>'agreedRate')::numeric;
    else agreed := package.amount; end if;
    if nullif(p_input->>'accountId','') is not null then
      select * into account from public.marketing_influencer_accounts where id=(p_input->>'accountId')::uuid and influencer_id=master.id and workspace_id=campaign.workspace_id;
      if not found then raise exception 'Pilih akun sosial dari profil influencer ini.'; end if;
      if package.platform in ('Instagram','TikTok') and account.platform<>package.platform then raise exception 'Platform akun harus sama dengan paket yang dipilih.'; end if;
    end if;
    if account.id is null then raise exception 'Pilih akun sosial untuk jadwal influencer.'; end if;
    if master.collaboration_type='Barter Endorse' then next_rate:=0; next_barter:=agreed;
    else next_rate:=agreed; next_barter:=0; end if;
    next_platform := coalesce(account.platform,case when package.platform in ('Instagram','TikTok') then package.platform else initcap(master.platform) end);
  end if;

  chosen_theme := case when p_input ? 'themeId' then nullif(p_input->>'themeId','')::uuid else saved.campaign_influencer_theme_id end;
  if chosen_theme is not null then
    select * into theme from public.campaign_influencer_themes where id=chosen_theme and campaign_id=p_campaign_id and workspace_id=campaign.workspace_id;
    if not found then raise exception 'Tema harus berasal dari Campaign yang sama.'; end if;
    theme_name_snapshot := theme.name;
  elsif p_id is null then raise exception 'Pilih tema konten Campaign.'; end if;
  if chosen_theme is null then theme_name_snapshot := saved.content_title; end if;
  visit := case when p_input ? 'visitDate' then nullif(p_input->>'visitDate','')::date else saved.visit_date end;
  upload := case when p_input ? 'uploadDate' then nullif(p_input->>'uploadDate','')::date else saved.upload_date end;
  if visit is not null and upload is not null and upload<visit then raise exception 'Tanggal upload tidak boleh lebih awal dari tanggal visit.'; end if;
  next_status := case when p_input ? 'status' then p_input->>'status' else coalesce(saved.status,'Terjadwal') end;
  next_content_link := case when p_input ? 'contentLink' then nullif(btrim(p_input->>'contentLink'),'') else saved.content_link end;
  if p_input ? 'contentLink' and next_content_link is not null and next_status<>'Selesai' then raise exception 'Link konten hanya dapat diisi ketika status kerja sama Selesai.'; end if;
  if next_content_link is not null and (char_length(next_content_link)>2048 or next_content_link !~* '^https?://[^[:space:]]+$') then raise exception 'Link konten harus berupa URL http:// atau https:// yang valid.'; end if;
  schedule_time := case when p_id is null then '00:00'::time else coalesce((saved.scheduled_at at time zone 'Asia/Jakarta')::time,'00:00'::time) end;
  if p_id is null then
    insert into public.influencer_bookings (workspace_id,campaign_id,influencer_id,influencer_name,platform,campaign_influencer_theme_id,content_title,content_link,visit_date,upload_date,scheduled_at,status,rate,spent,payment_status,notes,created_by,collaboration_type,rate_card_id,rate_card_name_snapshot,rate_card_platform_snapshot,rate_card_details_snapshot,username_snapshot,barter_value)
      values (campaign.workspace_id,p_campaign_id,master.id,master.name,lower(next_platform)::public.social_platform,chosen_theme,theme_name_snapshot,next_content_link,visit,upload,(coalesce(upload,visit,(now() at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta','Terjadwal',next_rate,0,'Belum dibayar',p_input->>'notes',auth.uid(),master.collaboration_type,package.id,package.name,package.platform,package.details,account.username,next_barter) returning * into saved;
  else
    update public.influencer_bookings set campaign_id=p_campaign_id,campaign_influencer_theme_id=chosen_theme,content_title=coalesce(theme_name_snapshot,saved.content_title),content_link=next_content_link,visit_date=visit,upload_date=upload,
      scheduled_at=(coalesce(upload,visit,(saved.scheduled_at at time zone 'Asia/Jakarta')::date)+schedule_time) at time zone 'Asia/Jakarta',
      notes=case when p_input ? 'notes' then p_input->>'notes' else saved.notes end,status=next_status,updated_at=now()
      where id=p_id and workspace_id=campaign.workspace_id returning * into saved;
  end if;
  return to_jsonb(saved) || jsonb_build_object('campaign_name',campaign.name,'theme_name',theme_name_snapshot,'scheduled_time',to_char(saved.scheduled_at at time zone 'Asia/Jakarta','HH24:MI'));
end;
$$;
revoke all on function public.save_campaign_influencer_booking(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_campaign_influencer_booking(uuid,uuid,jsonb) to authenticated, service_role;

create or replace function public.set_campaign_influencer_payment(p_campaign_id uuid,p_booking_id uuid,p_payment_status text,p_amount numeric default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare campaign public.campaigns; saved public.influencer_bookings; next_amount numeric;
begin
  if p_payment_status not in ('Belum dibayar','DP dibayar','Lunas') then raise exception 'Status pembayaran tidak valid.'; end if;
  select * into strict campaign from public.campaigns where id=p_campaign_id and lifecycle_status='active';
  if not public.is_workspace_manager(campaign.workspace_id) then raise exception 'Hanya Super Admin yang dapat mengubah pembayaran influencer.' using errcode='42501'; end if;
  select * into saved from public.influencer_bookings where id=p_booking_id and campaign_id=p_campaign_id and workspace_id=campaign.workspace_id for update;
  if not found then raise exception 'Jadwal tidak ditemukan pada Campaign ini.' using errcode='P0002'; end if;
  if saved.collaboration_type='Barter Endorse' then raise exception 'Booking barter tidak memiliki pembayaran tunai.'; end if;
  if p_payment_status='Belum dibayar' then next_amount:=0;
  elsif p_payment_status='Lunas' then next_amount:=greatest(saved.rate,0);
  else
    if p_amount is null or p_amount<=0 or p_amount>=saved.rate then raise exception 'Nominal DP harus lebih dari Rp0 dan lebih kecil dari rate influencer.'; end if;
    next_amount:=p_amount;
  end if;
  update public.influencer_bookings set payment_status=p_payment_status,spent=next_amount,updated_at=now() where id=p_booking_id returning * into saved;
  return to_jsonb(saved) || jsonb_build_object('campaign_name',campaign.name,'theme_name',(select t.name from public.campaign_influencer_themes t where t.id=saved.campaign_influencer_theme_id),'scheduled_time',to_char(saved.scheduled_at at time zone 'Asia/Jakarta','HH24:MI'));
end;
$$;
revoke all on function public.set_campaign_influencer_payment(uuid,uuid,text,numeric) from public, anon;
grant execute on function public.set_campaign_influencer_payment(uuid,uuid,text,numeric) to authenticated;

comment on table public.marketing_influencer_accounts is 'Instagram and TikTok accounts belonging to influencer master profiles.';
comment on table public.marketing_influencer_rate_cards is 'Reusable influencer service packages; booking fields store immutable package snapshots.';
comment on column public.influencer_bookings.barter_value is 'Estimated barter value; excluded from campaign cash spent.';
