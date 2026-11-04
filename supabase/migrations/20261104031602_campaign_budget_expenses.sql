-- Extend the Campaign content_config contract while preserving existing JSON records.
alter table public.campaigns alter column content_config set default '{"tagline":"","bigMessage":"","intro":"","instructions":"","instructionsPinned":false,"instructionsPinnedAt":null,"steps":[],"promos":[]}'::jsonb;

create or replace function private.save_campaign_record(p_workspace_id uuid,p_campaign_id uuid,p_expected_version bigint,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.campaigns; brand public.brands; content jsonb; promo jsonb; field text; member_ids uuid[];
begin
  if auth.uid() is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.role in ('owner','admin')) then
    raise exception 'Hanya Super Admin dapat menyimpan Campaign' using errcode='42501';
  end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch='{}'::jsonb then raise exception 'Perubahan Campaign kosong atau tidak valid'; end if;
  for field in select jsonb_object_keys(p_patch) loop
    if field not in ('name','brand_id','objective','start_date','end_date','avatar_url','content_config','member_ids','phase_mode','phases','budget') then raise exception 'Field Campaign tidak diizinkan: %',field; end if;
  end loop;
  -- Serialize same-ID creation as well as updates, without locking other campaigns.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_campaign_id::text,0));
  select * into saved from public.campaigns where id=p_campaign_id for update;
  if found then
    if saved.workspace_id <> p_workspace_id then raise exception 'Campaign tidak ditemukan' using errcode='42501'; end if;
    if saved.lifecycle_status <> 'active' then raise exception 'Campaign hanya dapat dibaca'; end if;
    -- Retry a create with the same client-generated ID after a lost acknowledgement.
    if p_expected_version is null and saved.created_by=auth.uid()
      and not exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('name','brand_id','objective','start_date','end_date','budget'))
      and btrim(p_patch->>'name')=saved.name and p_patch->>'brand_id'=saved.brand_id::text
      and coalesce(p_patch->>'objective','')=coalesce(saved.objective,'')
      and coalesce(p_patch->>'start_date','')=coalesce(saved.start_date::text,'')
      and coalesce(p_patch->>'end_date','')=coalesce(saved.end_date::text,'')
      and coalesce((p_patch->>'budget')::numeric,0)=coalesce(saved.budget,0) then return to_jsonb(saved); end if;
    if p_expected_version is null or saved.row_version <> p_expected_version then raise exception 'CAMPAIGN_CONFLICT: Campaign telah berubah. Muat ulang data sebelum menyimpan.' using errcode='40001'; end if;
  elsif p_expected_version is not null then
    raise exception 'Campaign tidak ditemukan';
  elsif not (p_patch ? 'name' and p_patch ? 'brand_id') then
    raise exception 'Nama dan Brand wajib diisi';
  end if;
  if p_patch ? 'name' and (jsonb_typeof(p_patch->'name') <> 'string' or char_length(btrim(p_patch->>'name')) not between 1 and 160) then raise exception 'Nama Campaign wajib diisi dan maksimal 160 karakter'; end if;
  if p_patch ? 'brand_id' or saved.id is null then
    select * into brand from public.brands where id=(p_patch->>'brand_id')::uuid and workspace_id=p_workspace_id;
    if not found then raise exception 'Pilih Brand dari workspace ini'; end if;
    if saved.id is not null and brand.id is distinct from saved.brand_id and exists(select 1 from public.tasks where campaign_id=saved.id) then raise exception 'Brand Campaign yang memiliki tugas tidak dapat diganti'; end if;
  else
    select * into brand from public.brands where id=saved.brand_id and workspace_id=p_workspace_id;
  end if;
  foreach field in array array['start_date','end_date'] loop
    if p_patch ? field and p_patch->>field is not null and (p_patch->>field !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Tanggal Campaign tidak valid'; end if;
  end loop;
  if p_patch ? 'avatar_url' and p_patch->>'avatar_url' is not null and (char_length(p_patch->>'avatar_url')>2048 or p_patch->>'avatar_url' !~ '^https?://') then raise exception 'URL foto Campaign tidak valid'; end if;
  if p_patch ? 'objective' and p_patch->>'objective' is not null and (jsonb_typeof(p_patch->'objective') <> 'string' or char_length(p_patch->>'objective')>20000) then raise exception 'Tujuan Campaign tidak valid atau terlalu panjang'; end if;
  if p_patch ? 'budget' and (jsonb_typeof(p_patch->'budget') is distinct from 'number' or (p_patch->>'budget') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' or (p_patch->>'budget')::numeric > 999999999999.99) then raise exception 'Budget Campaign harus berupa angka Rp0 sampai Rp999.999.999.999,99'; end if;
  if p_patch ? 'phases' and jsonb_typeof(p_patch->'phases') is distinct from 'array' then raise exception 'Daftar fase tidak valid'; end if;
  if p_patch ? 'phase_mode' and jsonb_typeof(p_patch->'phase_mode') is distinct from 'boolean' then raise exception 'Mode fase tidak valid'; end if;
  if p_patch ? 'content_config' then
    content := p_patch->'content_config';
    if jsonb_typeof(content) <> 'object' then raise exception 'Brief Campaign tidak valid'; end if;
    for field in select jsonb_object_keys(content) loop
      if field not in ('tagline','bigMessage','intro','instructions','instructionsPinned','instructionsPinnedAt','steps','promos') then raise exception 'Field brief tidak diizinkan'; end if;
    end loop;
    foreach field in array array['tagline','bigMessage','intro','instructions'] loop
      if content ? field and (jsonb_typeof(content->field) <> 'string' or char_length(content->>field)>20000) then raise exception 'Isi brief tidak valid atau terlalu panjang'; end if;
    end loop;
    if content ? 'instructionsPinned' and jsonb_typeof(content->'instructionsPinned') is distinct from 'boolean' then raise exception 'Status pin Instruksi penting tidak valid'; end if;
    if content ? 'instructionsPinnedAt' and jsonb_typeof(content->'instructionsPinnedAt') not in ('string','null') then raise exception 'Waktu pin Instruksi penting tidak valid'; end if;
    if jsonb_typeof(content->'instructionsPinnedAt')='string' then
      if content->>'instructionsPinnedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Waktu pin Instruksi penting tidak valid'; end if;
      begin perform (content->>'instructionsPinnedAt')::timestamptz;
      exception when others then raise exception 'Waktu pin Instruksi penting tidak valid'; end;
    end if;
    if coalesce((content->>'instructionsPinned')::boolean,false) then
      if coalesce(btrim(content->>'instructions'),'')='' then raise exception 'Isi Instruksi penting wajib diisi sebelum dipin'; end if;
      if jsonb_typeof(content->'instructionsPinnedAt') is distinct from 'string' then raise exception 'Waktu pin Instruksi penting wajib diisi'; end if;
    end if;
    if jsonb_typeof(content->'steps') is distinct from 'array' or jsonb_typeof(content->'promos') is distinct from 'array' then raise exception 'Daftar alur dan promo tidak valid'; end if;
    if jsonb_array_length(content->'steps')>100 or jsonb_array_length(content->'promos')>100 then raise exception 'Maksimal 100 alur dan promo'; end if;
    if exists(select 1 from jsonb_array_elements(content->'steps') s where jsonb_typeof(s)<>'string' or char_length(s#>>'{}')>4000) then raise exception 'Isi alur tidak valid'; end if;
    for promo in select * from jsonb_array_elements(content->'promos') loop
      if jsonb_typeof(promo)<>'object' or coalesce(btrim(promo->>'id'),'')='' or coalesce(btrim(promo->>'title'),'')='' then raise exception 'ID dan nama promo wajib diisi'; end if;
      if promo->>'startDate' is null or promo->>'endDate' is null or promo->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or promo->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$' or (promo->>'endDate')::date < (promo->>'startDate')::date then raise exception 'Periode promo tidak valid'; end if;
    end loop;
  end if;
  if p_patch ? 'member_ids' then
    if jsonb_typeof(p_patch->'member_ids')<>'array' then raise exception 'Anggota Campaign tidak valid'; end if;
    select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into member_ids from jsonb_array_elements_text(p_patch->'member_ids') v;
    if exists(select 1 from unnest(member_ids) u where not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=u)) then raise exception 'Anggota harus berasal dari workspace yang sama'; end if;
  end if;
  if saved.id is null then
    insert into public.campaigns(id,workspace_id,name,brand,brand_id,objective,start_date,end_date,status,progress,budget,spent,created_by,updated_by,lifecycle_status,avatar_url,content_config)
    values(p_campaign_id,p_workspace_id,btrim(p_patch->>'name'),brand.name,brand.id,p_patch->>'objective',(p_patch->>'start_date')::date,(p_patch->>'end_date')::date,'Rencana',0,coalesce((p_patch->>'budget')::numeric,0),0,auth.uid(),auth.uid(),'active',p_patch->>'avatar_url',coalesce(content,'{"tagline":"","bigMessage":"","intro":"","instructions":"","instructionsPinned":false,"instructionsPinnedAt":null,"steps":[],"promos":[]}'::jsonb)) returning * into saved;
  else
    update public.campaigns set
      name=case when p_patch ? 'name' then btrim(p_patch->>'name') else saved.name end,
      brand=case when p_patch ? 'brand_id' then brand.name else saved.brand end,
      brand_id=case when p_patch ? 'brand_id' then brand.id else saved.brand_id end,
      objective=case when p_patch ? 'objective' then p_patch->>'objective' else saved.objective end,
      start_date=case when p_patch ? 'start_date' then (p_patch->>'start_date')::date else saved.start_date end,
      end_date=case when p_patch ? 'end_date' then (p_patch->>'end_date')::date else saved.end_date end,
      budget=case when p_patch ? 'budget' then (p_patch->>'budget')::numeric else saved.budget end,
      avatar_url=case when p_patch ? 'avatar_url' then p_patch->>'avatar_url' else saved.avatar_url end,
      content_config=case when p_patch ? 'content_config' then content else saved.content_config end,
      timeline_config=case when p_patch ? 'phases' or p_patch ? 'phase_mode' then coalesce(saved.timeline_config,'{}'::jsonb)
        || case when p_patch ? 'phases' then jsonb_build_object('phases',p_patch->'phases') else '{}'::jsonb end
        || case when p_patch ? 'phase_mode' then jsonb_build_object('phaseMode',(p_patch->>'phase_mode')::boolean) else '{}'::jsonb end else saved.timeline_config end,
      updated_by=auth.uid(),updated_at=clock_timestamp()
    where id=p_campaign_id returning * into saved;
  end if;
  if member_ids is not null then
    delete from public.campaign_members where campaign_id=p_campaign_id and workspace_id=p_workspace_id and not(user_id=any(member_ids));
    insert into public.campaign_members(campaign_id,workspace_id,user_id) select p_campaign_id,p_workspace_id,u from unnest(member_ids) u on conflict do nothing;
  end if;
  return to_jsonb(saved);
end; $$;

revoke all on function private.save_campaign_record(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.save_campaign_record(uuid,uuid,bigint,jsonb) to authenticated;

create table public.campaign_expenses (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  category text not null check (category in ('promo_subsidy','ads','other')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  details text check (details is null or char_length(details) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index campaign_expenses_workspace_campaign_date_idx
  on public.campaign_expenses (workspace_id, campaign_id, expense_date desc, created_at desc);

alter table public.campaign_expenses enable row level security;
revoke all on table public.campaign_expenses from anon, authenticated;
grant select, insert on table public.campaign_expenses to authenticated;

create policy "workspace members read campaign expenses"
  on public.campaign_expenses for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "managers add campaign expenses"
  on public.campaign_expenses for insert to authenticated
  with check (
    public.is_workspace_manager(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_expenses.campaign_id
        and c.workspace_id = campaign_expenses.workspace_id
        and c.lifecycle_status = 'active'
    )
  );

create or replace function private.sync_campaign_expense_spent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_workspace_manager(new.workspace_id) then
    raise exception 'Hanya Super Admin dapat mencatat pengeluaran Campaign.' using errcode='42501';
  end if;
  update public.campaigns c
    set spent = coalesce(c.spent, 0) + new.amount,
        updated_by = auth.uid(),
        updated_at = clock_timestamp()
    where c.id = new.campaign_id
      and c.workspace_id = new.workspace_id
      and c.lifecycle_status = 'active';
  if not found then raise exception 'Campaign tidak ditemukan atau hanya dapat dibaca.'; end if;
  return new;
end;
$$;
revoke all on function private.sync_campaign_expense_spent() from public, anon, authenticated;
drop trigger if exists sync_campaign_expense_spent on public.campaign_expenses;
create trigger sync_campaign_expense_spent
  after insert on public.campaign_expenses
  for each row execute function private.sync_campaign_expense_spent();

create or replace function public.create_campaign_expense(
  p_expense_id uuid,
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_category text,
  p_title text,
  p_amount numeric,
  p_date date,
  p_details text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  campaign public.campaigns;
  saved public.campaign_expenses;
begin
  if auth.uid() is null or not public.is_workspace_manager(p_workspace_id) then
    raise exception 'Hanya Super Admin dapat mencatat pengeluaran Campaign.' using errcode='42501';
  end if;
  select * into campaign from public.campaigns c
    where c.id = p_campaign_id and c.workspace_id = p_workspace_id and c.lifecycle_status = 'active';
  if not found then raise exception 'Campaign tidak ditemukan atau hanya dapat dibaca.'; end if;
  if p_expense_id is null then raise exception 'ID pengeluaran tidak valid.'; end if;
  if p_category is null or p_category not in ('promo_subsidy','ads','other') then raise exception 'Kategori pengeluaran tidak valid.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then raise exception 'Nama pengeluaran wajib diisi dan maksimal 160 karakter.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or scale(p_amount) > 2 then raise exception 'Jumlah pengeluaran tidak valid.'; end if;
  if p_date is null then raise exception 'Tanggal pengeluaran wajib diisi.'; end if;
  if p_details is not null and char_length(p_details) > 2000 then raise exception 'Catatan pengeluaran maksimal 2.000 karakter.'; end if;

  insert into public.campaign_expenses(id, workspace_id, campaign_id, category, title, amount, expense_date, details, created_by)
    values(p_expense_id, p_workspace_id, p_campaign_id, p_category, btrim(p_title), p_amount, p_date, nullif(btrim(p_details),''), auth.uid())
    on conflict (id) do nothing
    returning * into saved;
  if not found then
    select * into saved from public.campaign_expenses e where e.id = p_expense_id;
    if not found
      or saved.workspace_id is distinct from p_workspace_id
      or saved.campaign_id is distinct from p_campaign_id
      or saved.created_by is distinct from auth.uid()
      or saved.category is distinct from p_category
      or saved.title is distinct from btrim(p_title)
      or saved.amount is distinct from p_amount
      or saved.expense_date is distinct from p_date
      or saved.details is distinct from nullif(btrim(p_details),'') then
      raise exception 'ID pengeluaran sudah digunakan untuk data lain.';
    end if;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_campaign_expense(uuid,uuid,uuid,text,text,numeric,date,text) from public, anon;
grant execute on function public.create_campaign_expense(uuid,uuid,uuid,text,text,numeric,date,text) to authenticated;
