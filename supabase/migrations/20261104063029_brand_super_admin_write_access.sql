-- Restrict brand and brand-menu writes to workspace Super Admins.
-- Workspace members keep read access. Existing rows and assets are untouched.

drop policy if exists "members manage brands" on public.brands;
drop policy if exists "workspace reads brands" on public.brands;
drop policy if exists "super admins manage brands" on public.brands;

create policy "workspace reads brands"
  on public.brands for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "super admins manage brands"
  on public.brands for all to authenticated
  using (
    exists (
      select 1 from public.workspace_members member
      where member.workspace_id = brands.workspace_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members member
      where member.workspace_id = brands.workspace_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  );

drop policy if exists "members manage brand menus" on public.brand_menus;
drop policy if exists "workspace reads brand menus" on public.brand_menus;
drop policy if exists "super admins manage brand menus" on public.brand_menus;

create policy "workspace reads brand menus"
  on public.brand_menus for select to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.brands brand
      where brand.id = brand_menus.brand_id
        and brand.workspace_id = brand_menus.workspace_id
    )
  );

create policy "super admins manage brand menus"
  on public.brand_menus for all to authenticated
  using (
    exists (
      select 1 from public.workspace_members member
      where member.workspace_id = brand_menus.workspace_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
    and exists (
      select 1 from public.brands brand
      where brand.id = brand_menus.brand_id
        and brand.workspace_id = brand_menus.workspace_id
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members member
      where member.workspace_id = brand_menus.workspace_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
    and exists (
      select 1 from public.brands brand
      where brand.id = brand_menus.brand_id
        and brand.workspace_id = brand_menus.workspace_id
    )
  );

-- Keep public reads for published brand images, but only Super Admins in the
-- asset's workspace may create, replace, or delete them.
drop policy if exists "members upload brand assets" on storage.objects;
drop policy if exists "members update brand assets" on storage.objects;
drop policy if exists "super admins upload brand assets" on storage.objects;
drop policy if exists "super admins update brand assets" on storage.objects;
drop policy if exists "super admins delete brand assets" on storage.objects;

create policy "super admins upload brand assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  );

create policy "super admins update brand assets"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  )
  with check (
    bucket_id = 'brand-assets'
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  );

create policy "super admins delete brand assets"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and exists (
      select 1 from public.workspace_members member
      where member.workspace_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.role in ('owner', 'admin')
    )
  );
