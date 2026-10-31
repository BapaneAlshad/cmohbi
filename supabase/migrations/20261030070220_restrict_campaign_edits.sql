-- Restrict Campaign-owned writes to Super Admin/owner roles. Members retain
-- read access and may still request status changes through the task workflow.
drop policy if exists "members create campaigns" on public.campaigns;
drop policy if exists "members update campaigns" on public.campaigns;
create policy "managers create campaigns"
  on public.campaigns for insert to authenticated
  with check (public.is_workspace_manager(workspace_id) and lifecycle_status = 'active');
create policy "managers update campaigns"
  on public.campaigns for update to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

drop policy if exists "members manage campaign references" on public.campaign_references;
create policy "managers manage campaign references"
  on public.campaign_references for all to authenticated
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

drop policy if exists "members manage campaign influencer themes" on public.campaign_influencer_themes;
create policy "managers manage campaign influencer themes"
  on public.campaign_influencer_themes for all to authenticated
  using (
    public.is_workspace_manager(workspace_id)
    and exists (select 1 from public.campaigns campaign where campaign.id = campaign_id and campaign.workspace_id = workspace_id)
  )
  with check (
    public.is_workspace_manager(workspace_id)
    and exists (select 1 from public.campaigns campaign where campaign.id = campaign_id and campaign.workspace_id = workspace_id)
  );

drop policy if exists "members manage influencer bookings" on public.influencer_bookings;
create policy "members manage unlinked influencer bookings"
  on public.influencer_bookings for all to authenticated
  using (public.is_workspace_member(workspace_id) and (campaign_id is null or public.is_workspace_manager(workspace_id)))
  with check (public.is_workspace_member(workspace_id) and (campaign_id is null or public.is_workspace_manager(workspace_id)));

drop policy if exists "members upload campaign references" on storage.objects;
create policy "managers upload campaign references"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-references'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists "members update campaign references" on storage.objects;
create policy "managers update campaign references"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-references'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid() and role in ('owner','admin')
    )
  )
  with check (
    bucket_id = 'campaign-references'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid() and role in ('owner','admin')
    )
  );
