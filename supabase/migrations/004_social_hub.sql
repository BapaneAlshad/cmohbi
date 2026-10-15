alter type public.social_platform add value if not exists 'threads';

do $$
begin
  create type public.social_inbox_kind as enum ('comment', 'message');
exception
  when duplicate_object then null;
end $$;

alter table public.social_accounts
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists token_expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.social_posts
  add column if not exists caption text,
  add column if not exists media_url text,
  add column if not exists media_type text not null default 'feed',
  add column if not exists provider_status text not null default 'pending',
  add column if not exists error_message text,
  add column if not exists created_by uuid references public.profiles(id);

create table if not exists public.social_inbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete cascade,
  platform public.social_platform not null,
  kind public.social_inbox_kind not null,
  external_id text not null,
  external_parent_id text,
  author text not null,
  body text not null,
  post_title text,
  occurred_at timestamptz not null,
  status text not null default 'unread',
  can_reply boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, external_id)
);

create index if not exists social_inbox_workspace_occurred_idx
  on public.social_inbox(workspace_id, occurred_at desc);
create index if not exists social_inbox_workspace_status_idx
  on public.social_inbox(workspace_id, status);

alter table public.social_inbox enable row level security;

drop policy if exists "members manage social inbox" on public.social_inbox;
create policy "members manage social inbox"
  on public.social_inbox for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

comment on column public.social_accounts.token_reference is
  'Reference to an encrypted server-side secret; raw provider tokens never reach the browser.';
