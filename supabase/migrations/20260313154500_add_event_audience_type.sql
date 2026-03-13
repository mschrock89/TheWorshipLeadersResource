alter table public.events
  add column if not exists audience_type text;

update public.events
set audience_type = coalesce(audience_type, 'volunteers_only')
where audience_type is null;

alter table public.events
  alter column audience_type set default 'volunteers_only';
