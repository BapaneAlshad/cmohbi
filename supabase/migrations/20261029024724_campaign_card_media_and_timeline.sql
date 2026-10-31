alter table public.campaigns
  add column if not exists avatar_url text,
  add column if not exists timeline_config jsonb not null default '{"phaseMode": false, "phases": [], "taskPhase": {}}'::jsonb;

comment on column public.campaigns.avatar_url is
  'Optional campaign-specific profile image; null falls back to the linked brand logo.';
comment on column public.campaigns.timeline_config is
  'Persisted optional timeline phase mode, phases, and task-to-phase assignments.';
