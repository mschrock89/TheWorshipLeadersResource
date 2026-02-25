-- Allow Google Calendar mappings for schedule-only entries (no published setlist yet).
do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
  from pg_constraint c
  join pg_class t
    on t.oid = c.conrelid
  join pg_namespace n
    on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'google_calendar_mappings'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%source_type%'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.google_calendar_mappings drop constraint %I',
      constraint_name
    );
  end if;

  alter table public.google_calendar_mappings
    add constraint google_calendar_mappings_source_type_check
    check (source_type in ('event', 'setlist', 'schedule'));
end
$$;
