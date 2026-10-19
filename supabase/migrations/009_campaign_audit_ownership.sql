alter table public.campaigns
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.campaigns
set created_by = owner_id
where created_by is null and owner_id is not null;

comment on column public.campaigns.owner_id is
  'Legacy campaign owner retained for historical compatibility. It is not presented as a Campaign PIC.';
comment on column public.campaigns.created_by is
  'User who created the campaign. Backfilled from legacy owner_id when available.';
comment on column public.campaigns.updated_by is
  'Most recent user who updated the campaign through Ngapaya.';
