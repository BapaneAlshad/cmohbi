grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table
  public.profiles,
  public.workspaces,
  public.workspace_members,
  public.campaigns,
  public.tasks,
  public.social_accounts,
  public.social_metric_snapshots,
  public.social_posts,
  public.influencer_bookings,
  public.social_inbox
to authenticated, service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

revoke execute on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
