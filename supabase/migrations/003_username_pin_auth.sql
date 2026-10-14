alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists whatsapp text;

comment on column public.profiles.username is
  'Unique login identifier. The PIN is managed by Supabase Auth and is never stored in this table.';
comment on column public.profiles.email is
  'Contact email shown in the user profile; it is separate from the internal Supabase Auth email.';
comment on column public.profiles.whatsapp is
  'Contact WhatsApp number shown in the user profile.';

do $$
declare
  profile_row record;
  candidate text;
  fallback_username text;
begin
  for profile_row in
    select p.id, p.username, u.email, u.raw_user_meta_data
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.username is null
  loop
    fallback_username := 'user_' || left(replace(profile_row.id::text, '-', ''), 8);
    candidate := lower(regexp_replace(
      coalesce(profile_row.raw_user_meta_data ->> 'username', split_part(profile_row.email, '@', 1), fallback_username),
      '[^a-z0-9._-]', '', 'g'
    ));
    if candidate = '' or left(candidate, 1) !~ '[a-z]' then
      candidate := fallback_username;
    end if;
    if exists (select 1 from public.profiles p2 where p2.username = candidate and p2.id <> profile_row.id) then
      candidate := left(candidate, 22) || '_' || left(replace(profile_row.id::text, '-', ''), 8);
    end if;
    update public.profiles
      set username = candidate,
          email = coalesce(email, profile_row.email)
      where id = profile_row.id;
  end loop;
end $$;

update public.profiles p
set email = coalesce(p.email, u.email)
from auth.users u
where u.id = p.id and p.email is null;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

-- Existing accounts keep their real contact email in profiles. Supabase Auth uses
-- the internal identifier below so all existing users can also move to username login.
update auth.users u
set email = p.username || '@auth.ngapaya.local',
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('username', p.username, 'full_name', p.full_name, 'email', p.email, 'whatsapp', p.whatsapp)
from public.profiles p
where p.id = u.id
  and p.username is not null
  and u.email <> (p.username || '@auth.ngapaya.local');
