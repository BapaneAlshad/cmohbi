create table if not exists public.campaign_influencer_themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  code text not null,
  name text not null,
  phase text not null default '',
  objective text not null default '',
  required_content text not null default '',
  cta text not null default '',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, code)
);

create index if not exists campaign_influencer_themes_workspace_campaign_idx
  on public.campaign_influencer_themes(workspace_id, campaign_id);

alter table public.campaign_influencer_themes enable row level security;
revoke all on public.campaign_influencer_themes from anon;
drop policy if exists "members manage campaign influencer themes" on public.campaign_influencer_themes;
create policy "members manage campaign influencer themes"
  on public.campaign_influencer_themes for all to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.campaigns campaign where campaign.id = campaign_id and campaign.workspace_id = workspace_id)
  )
  with check (
    public.is_workspace_member(workspace_id)
    and exists (select 1 from public.campaigns campaign where campaign.id = campaign_id and campaign.workspace_id = workspace_id)
  );
grant select, insert, update, delete on public.campaign_influencer_themes to authenticated, service_role;

alter table public.influencer_bookings
  add column if not exists influencer_id uuid references public.marketing_influencers(id) on delete set null,
  add column if not exists campaign_influencer_theme_id uuid references public.campaign_influencer_themes(id) on delete set null,
  add column if not exists visit_date date,
  add column if not exists upload_date date;

update public.influencer_bookings
set upload_date = scheduled_at::date
where upload_date is null;

update public.influencer_bookings booking
set influencer_id = influencer.id
from public.marketing_influencers influencer
where booking.influencer_id is null
  and booking.workspace_id = influencer.workspace_id
  and lower(trim(booking.influencer_name)) = lower(trim(influencer.name));

create index if not exists influencer_bookings_influencer_idx
  on public.influencer_bookings(workspace_id, influencer_id);
create index if not exists influencer_bookings_theme_idx
  on public.influencer_bookings(campaign_id, campaign_influencer_theme_id);

create or replace function public.validate_influencer_booking_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1 from public.campaigns
    where id = new.campaign_id and workspace_id = new.workspace_id
  ) then
    raise exception 'Campaign booking must belong to the same workspace';
  end if;
  if new.influencer_id is not null and not exists (
    select 1 from public.marketing_influencers
    where id = new.influencer_id and workspace_id = new.workspace_id
  ) then
    raise exception 'Influencer booking must belong to the same workspace';
  end if;
  if new.campaign_influencer_theme_id is not null and not exists (
    select 1 from public.campaign_influencer_themes
    where id = new.campaign_influencer_theme_id
      and workspace_id = new.workspace_id
      and campaign_id = new.campaign_id
  ) then
    raise exception 'Influencer theme must belong to the booking campaign';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_influencer_booking_links() from public, anon, authenticated;
drop trigger if exists influencer_booking_validate_links on public.influencer_bookings;
create trigger influencer_booking_validate_links
  before insert or update of workspace_id, campaign_id, influencer_id, campaign_influencer_theme_id
  on public.influencer_bookings
  for each row execute function public.validate_influencer_booking_links();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'influencer_bookings_upload_not_before_visit'
      and conrelid = 'public.influencer_bookings'::regclass
  ) then
    alter table public.influencer_bookings
      add constraint influencer_bookings_upload_not_before_visit
      check (visit_date is null or upload_date is null or upload_date >= visit_date);
  end if;
end;
$$;
