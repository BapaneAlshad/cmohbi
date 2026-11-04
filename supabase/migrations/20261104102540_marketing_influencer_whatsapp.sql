begin;

alter table public.marketing_influencers
  add column if not exists whatsapp text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'marketing_influencers_whatsapp_format_check'
      and conrelid = 'public.marketing_influencers'::regclass
  ) then
    alter table public.marketing_influencers
      add constraint marketing_influencers_whatsapp_format_check
      check (whatsapp is null or whatsapp ~ '^[+][1-9][0-9]{7,14}$');
  end if;
end;
$$;

create or replace function public.save_marketing_influencer_profile_with_whatsapp(
  p_workspace_id uuid,
  p_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  raw_number text;
  digits text;
  normalized_number text;
  profile_result jsonb;
  saved_id uuid;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or exists (
    select 1
    from jsonb_object_keys(coalesce(p_input, '{}'::jsonb)) as input_key(value)
    where input_key.value not in ('name','collaborationType','niches','customNiche','accounts','rateCards','whatsapp')
  ) then
    raise exception 'Field profil influencer tidak valid.';
  end if;

  raw_number := btrim(coalesce(p_input->>'whatsapp', ''));
  if raw_number = '' then
    normalized_number := null;
  else
    if raw_number !~ '^[+]?[0-9][0-9(). -]*$' then
      raise exception 'Nomor WhatsApp tidak valid.';
    end if;

    digits := regexp_replace(raw_number, '[^0-9]', '', 'g');
    if left(digits, 2) = '00' then
      normalized_number := '+' || substr(digits, 3);
    elsif left(digits, 1) = '0' then
      normalized_number := '+62' || substr(digits, 2);
    elsif left(digits, 1) = '8' and length(digits) <= 13 then
      normalized_number := '+62' || digits;
    else
      normalized_number := '+' || digits;
    end if;

    if normalized_number !~ '^[+][1-9][0-9]{7,14}$' then
      raise exception 'Nomor WhatsApp harus berisi 8 sampai 15 digit termasuk kode negara.';
    end if;
  end if;

  profile_result := public.save_marketing_influencer_profile(
    p_workspace_id,
    p_id,
    p_input - 'whatsapp'
  );
  saved_id := nullif(profile_result->>'id', '')::uuid;

  update public.marketing_influencers
  set whatsapp = normalized_number,
      updated_at = now()
  where id = saved_id
    and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Profil influencer tidak ditemukan pada workspace ini.';
  end if;

  return profile_result || jsonb_build_object('whatsapp', normalized_number);
end;
$$;

revoke all on function public.save_marketing_influencer_profile_with_whatsapp(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_marketing_influencer_profile_with_whatsapp(uuid,uuid,jsonb) to authenticated;

commit;
