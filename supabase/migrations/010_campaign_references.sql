create table if not exists public.campaign_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  url text not null check (char_length(url) between 1 and 2048),
  kind text not null default 'Link' check (kind in ('Link', 'Gambar', 'Dokumen')),
  start_date date not null,
  end_date date not null,
  mime_type text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaign_references
  drop constraint if exists campaign_references_date_order_check;

alter table public.campaign_references
  add constraint campaign_references_date_order_check check (end_date >= start_date);

create index if not exists campaign_references_campaign_created_idx
  on public.campaign_references(campaign_id, created_at desc);

alter table public.campaign_references enable row level security;

grant select, insert, update, delete on table public.campaign_references to authenticated, service_role;

drop policy if exists "members read campaign references" on public.campaign_references;
create policy "members read campaign references"
  on public.campaign_references for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "members manage campaign references" on public.campaign_references;
create policy "members manage campaign references"
  on public.campaign_references for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public)
values ('campaign-references', 'campaign-references', true)
on conflict (id) do update set public = true;

drop policy if exists "members upload campaign references" on storage.objects;
create policy "members upload campaign references"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-references'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

drop policy if exists "public read campaign references" on storage.objects;
create policy "public read campaign references"
  on storage.objects for select to public
  using (bucket_id = 'campaign-references');

drop policy if exists "members update campaign references" on storage.objects;
create policy "members update campaign references"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'campaign-references'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'campaign-references'
    and (storage.foldername(name))[1] in (
      select workspace_id::text from public.workspace_members where user_id = auth.uid()
    )
  );

comment on table public.campaign_references is
  'Creative links and images attached to a campaign. Image binaries are stored in the campaign-references Storage bucket.';
