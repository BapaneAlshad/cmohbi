-- Prepare only: apply to production after a separate migration review.
-- The old enum value remains valid for compatibility, but has one meaning.
update public.workspace_members set role='owner' where role='admin';
update public.profiles p set job_title='Super Admin',updated_at=now()
where p.job_title in ('CMO','Admin','CMO / Admin')
and exists(select 1 from public.workspace_members m where m.user_id=p.id and m.role='owner');

-- Profiles are immutable to client credentials, including the current user.
drop policy if exists "users update own profile" on public.profiles;
revoke update on public.profiles from anon,authenticated;

create or replace function public.manage_workspace_user(p_workspace_id uuid,p_actor_id uuid,p_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare workspace_owner uuid; target record; next_role text; next_title text; next_avatar text;
begin
  select owner_id into workspace_owner from public.workspaces where id=p_workspace_id for update;
  if not found then raise exception 'Workspace tidak ditemukan'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role in ('owner','admin')) then
    raise exception 'Hanya Super Admin dapat mengelola user dan akses' using errcode='42501';
  end if;
  select m.role,p.username,p.avatar_url into target from public.workspace_members m join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace_id and m.user_id=p_user_id;
  if not found then raise exception 'User tidak ditemukan di workspace ini'; end if;
  if p_input->>'username' is distinct from target.username then raise exception 'Username akun tidak dapat diubah'; end if;
  next_role:=p_input->>'accessRole'; next_title:=p_input->>'role';
  if next_role is null or next_role not in ('owner','member','viewer') then raise exception 'Level akses tidak valid'; end if;
  if next_title is null or next_title not in ('Super Admin','Content Creator','Creative Designer','Support Marketing','Finance','Tim Konten','Guest','Anggota tim') then raise exception 'Jabatan tidak valid'; end if;
  if length(btrim(coalesce(p_input->>'name',''))) < 2 then raise exception 'Nama lengkap minimal 2 karakter'; end if;
  if coalesce(p_input->>'email','')<>'' and p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email profil tidak valid'; end if;
  if coalesce(p_input->>'whatsapp','')<>'' and length(btrim(p_input->>'whatsapp'))<8 then raise exception 'Nomor WhatsApp tidak valid'; end if;
  if next_role<>'owner' and (p_user_id=p_actor_id or p_user_id=workspace_owner) then raise exception 'Akses Super Admin utama dan akun Anda sendiri tidak dapat diturunkan'; end if;
  if target.role in ('owner','admin') and next_role<>'owner' and (select count(*) from public.workspace_members where workspace_id=p_workspace_id and role in ('owner','admin'))<=1 then raise exception 'Workspace harus memiliki Super Admin'; end if;
  next_avatar:=case when p_input ? 'avatarUrl' then nullif(p_input->>'avatarUrl','') else target.avatar_url end;
  if next_avatar is distinct from target.avatar_url and next_avatar is not null and next_avatar !~ ('^https?://[^/]+/storage/v1/object/public/user-avatars/'||p_workspace_id||'/'||p_user_id||'/[a-f0-9-]{36}\.(png|jpg|webp)$') then raise exception 'Foto profil tidak valid'; end if;
  update public.profiles set full_name=btrim(p_input->>'name'),
    email=case when p_input ? 'email' then lower(btrim(p_input->>'email')) else email end,
    whatsapp=case when p_input ? 'whatsapp' then btrim(p_input->>'whatsapp') else whatsapp end,
    job_title=next_title,avatar_url=next_avatar,updated_at=now() where id=p_user_id;
  update public.workspace_members set role=next_role::public.workspace_role where workspace_id=p_workspace_id and user_id=p_user_id;
  return (select jsonb_build_object('id',p.id,'name',p.full_name,'username',p.username,'email',coalesce(p.email,''),'whatsapp',coalesce(p.whatsapp,''),'role',p.job_title,'accessRole',next_role,'status','Aktif','avatarUrl',p.avatar_url) from public.profiles p where p.id=p_user_id);
end; $$;
revoke all on function public.manage_workspace_user(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_workspace_user(uuid,uuid,uuid,jsonb) to service_role;

-- All writes to this bucket go through the verified server upload endpoint.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('user-avatars','user-avatars',true,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "public read user avatars" on storage.objects;
create policy "public read user avatars" on storage.objects for select to public using(bucket_id='user-avatars');
