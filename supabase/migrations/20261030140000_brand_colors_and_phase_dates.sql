-- Additive development migration; requires brands and campaign timeline migrations.
alter table public.brands add column if not exists primary_color text;
alter table public.brands add constraint brands_primary_color_check
check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$');

create or replace function private.validate_campaign_timeline() returns trigger
language plpgsql security invoker set search_path='' as $$
declare phases jsonb; phase jsonb; original jsonb; first_date date; last_date date; previous_end date; item record;
begin
  if tg_op='UPDATE' and auth.uid() is not null
    and (new.timeline_config->'phases' is distinct from old.timeline_config->'phases' or new.timeline_config->'phaseMode' is distinct from old.timeline_config->'phaseMode')
    and not public.is_workspace_manager(new.workspace_id) then
    raise exception 'Hanya CMO/Super Admin dapat mengatur fase' using errcode='42501';
  end if;
  if new.start_date is not null and new.end_date is not null and new.end_date < new.start_date then raise exception 'Tanggal selesai Campaign tidak boleh sebelum tanggal mulai'; end if;
  phases := coalesce(new.timeline_config->'phases','[]'::jsonb);
  if jsonb_typeof(phases) <> 'array' then raise exception 'Daftar fase tidak valid'; end if;
  if tg_op='INSERT' and jsonb_array_length(phases)>0 and auth.uid() is not null and not public.is_workspace_manager(new.workspace_id) then
    raise exception 'Hanya CMO/Super Admin dapat mengatur fase' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_array_elements(phases) p group by p->>'id' having count(*) > 1) then raise exception 'ID fase duplikat'; end if;
  for phase in select * from jsonb_array_elements(phases) loop
    if coalesce(btrim(phase->>'id'),'')='' or coalesce(btrim(phase->>'name'),'')='' then raise exception 'ID dan nama fase wajib diisi'; end if;
    if phase->>'color' is not null and phase->>'color' !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Warna fase tidak valid'; end if;
    if phase->>'startDate' is null and phase->>'endDate' is null then
      -- Legacy text periods remain readable and unchanged; no date is inferred.
      original := null;
      if tg_op='UPDATE' then
        select p into original from jsonb_array_elements(coalesce(old.timeline_config->'phases','[]'::jsonb)) p where p->>'id'=phase->>'id';
      end if;
      if original is null or original->>'startDate' is not null or original->>'endDate' is not null then raise exception 'Tanggal mulai dan selesai fase wajib diisi'; end if;
      continue;
    end if;
    if phase->>'startDate' is null or phase->>'endDate' is null or phase->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or phase->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Tanggal fase tidak valid'; end if;
    first_date := (phase->>'startDate')::date; last_date := (phase->>'endDate')::date;
    if last_date < first_date then raise exception 'Tanggal selesai fase tidak boleh sebelum tanggal mulai'; end if;
    if (new.start_date is not null and first_date < new.start_date) or (new.end_date is not null and last_date > new.end_date) then raise exception 'Tanggal fase harus berada dalam periode Campaign'; end if;
  end loop;
  previous_end := null;
  for item in select (p->>'startDate')::date as starts,(p->>'endDate')::date as ends from jsonb_array_elements(phases) p where p->>'startDate' is not null order by starts loop
    if previous_end is not null and item.starts <= previous_end then raise exception 'Tanggal fase tidak boleh bertumpang tindih'; end if;
    previous_end := item.ends;
  end loop;
  return new;
end; $$;
revoke all on function private.validate_campaign_timeline() from public,anon,authenticated;
create trigger validate_campaign_timeline before insert or update of timeline_config,start_date,end_date on public.campaigns
for each row execute function private.validate_campaign_timeline();

create or replace function public.save_campaign_timeline(p_campaign_id uuid,p_phase_mode boolean,p_phases jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_phases) <> 'array' then raise exception 'Daftar fase tidak valid'; end if;
  if not exists(select 1 from public.campaigns c join public.workspace_members m on m.workspace_id=c.workspace_id
    where c.id=p_campaign_id and c.lifecycle_status='active' and m.user_id=auth.uid() and m.role in ('owner','admin')) then
    raise exception 'Hanya CMO/Super Admin dapat mengatur fase' using errcode='42501';
  end if;
  update public.campaigns set timeline_config=coalesce(timeline_config,'{}'::jsonb) || jsonb_build_object('phaseMode',p_phase_mode,'phases',p_phases) where id=p_campaign_id;
end; $$;
revoke all on function public.save_campaign_timeline(uuid,boolean,jsonb) from public,anon;
grant execute on function public.save_campaign_timeline(uuid,boolean,jsonb) to authenticated;
