-- Additive migration. Only the verified server-side user-management route calls this RPC.
create or replace function public.manage_workspace_user(p_workspace_id uuid,p_actor_id uuid,p_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare workspace_owner uuid; target record; next_role text; next_title text;
begin
  -- Serialize changes per workspace before checking the actor's current access.
  select owner_id into workspace_owner from public.workspaces where id=p_workspace_id for update;
  if not found then raise exception 'Workspace tidak ditemukan'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_actor_id and role='owner') then
    raise exception 'Hanya Super Admin dapat mengelola user dan akses' using errcode='42501';
  end if;
  select m.role,p.username into target from public.workspace_members m join public.profiles p on p.id=m.user_id where m.workspace_id=p_workspace_id and m.user_id=p_user_id;
  if not found then raise exception 'User tidak ditemukan di workspace ini'; end if;
  if p_input->>'username' is distinct from target.username then raise exception 'Username akun tidak dapat diubah'; end if;
  next_role := p_input->>'accessRole'; next_title := p_input->>'role';
  if next_role is null or next_role not in ('owner','admin','member','viewer') then raise exception 'Level akses tidak valid'; end if;
  if next_title is null or next_title not in ('Super Admin','CMO','Content Creator','Creative Designer','Support Marketing','Finance','Tim Konten','Guest') then raise exception 'Peran pekerjaan tidak valid'; end if;
  if length(btrim(coalesce(p_input->>'name',''))) < 2 or coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(btrim(coalesce(p_input->>'whatsapp',''))) < 8 then raise exception 'Profil user belum lengkap'; end if;
  if next_role<>'owner' and (p_user_id=p_actor_id or p_user_id=workspace_owner) then raise exception 'Akses Super Admin utama dan akun Anda sendiri tidak dapat diturunkan'; end if;
  if target.role='owner' and next_role<>'owner' and (select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='owner')<=1 then raise exception 'Workspace harus memiliki Super Admin'; end if;
  update public.profiles set full_name=btrim(p_input->>'name'),email=lower(btrim(p_input->>'email')),whatsapp=btrim(p_input->>'whatsapp'),job_title=next_title,updated_at=now() where id=p_user_id;
  update public.workspace_members set role=next_role::public.workspace_role where workspace_id=p_workspace_id and user_id=p_user_id;
  return (select jsonb_build_object('id',p.id,'name',p.full_name,'username',p.username,'email',p.email,'whatsapp',p.whatsapp,'role',p.job_title,'accessRole',next_role,'status','Aktif','avatarUrl',p.avatar_url) from public.profiles p where p.id=p_user_id);
end; $$;
revoke all on function public.manage_workspace_user(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_workspace_user(uuid,uuid,uuid,jsonb) to service_role;
