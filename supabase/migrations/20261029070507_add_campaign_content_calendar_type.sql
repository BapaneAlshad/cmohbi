alter table public.tasks
  add column if not exists content_calendar_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_content_calendar_type_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_content_calendar_type_check
      check (content_calendar_type is null or content_calendar_type in ('feed_carousel', 'reels'));
  end if;
end;
$$;
