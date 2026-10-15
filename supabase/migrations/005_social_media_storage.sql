insert into storage.buckets (id, name, public)
values ('social-media', 'social-media', true)
on conflict (id) do update set public = true;

drop policy if exists "members upload social media" on storage.objects;
create policy "members upload social media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "public read social media" on storage.objects;
create policy "public read social media"
  on storage.objects for select to public
  using (bucket_id = 'social-media');

drop policy if exists "members update social media" on storage.objects;
create policy "members update social media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );
