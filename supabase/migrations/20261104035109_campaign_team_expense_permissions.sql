-- Allow workspace team members to record expenses on active Campaigns.
-- Viewers remain read-only; budget-setting permission stays with Super Admin.

drop policy if exists "managers add campaign expenses" on public.campaign_expenses;
create policy "workspace team adds campaign expenses"
  on public.campaign_expenses for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = campaign_expenses.workspace_id
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin', 'member')
    )
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
  if auth.uid() is null or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = new.workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'Hanya Super Admin dan anggota tim yang dapat mencatat pengeluaran Campaign.' using errcode='42501';
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
  if auth.uid() is null or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'Hanya Super Admin dan anggota tim yang dapat mencatat pengeluaran Campaign.' using errcode='42501';
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
