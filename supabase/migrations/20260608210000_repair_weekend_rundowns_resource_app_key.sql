-- Repair: weekend_rundowns.resource_app_key was missing despite 20260525103000 being recorded.
alter table public.weekend_rundowns
  add column if not exists resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

alter table public.weekend_rundowns
  drop constraint if exists weekend_rundowns_user_campus_weekend_key;

alter table public.weekend_rundowns
  drop constraint if exists weekend_rundowns_user_campus_weekend_app_key;

alter table public.weekend_rundowns
  add constraint weekend_rundowns_user_campus_weekend_app_key
  unique (user_id, campus_id, weekend_date, resource_app_key);

create index if not exists weekend_rundowns_resource_app_campus_weekend_idx
  on public.weekend_rundowns(resource_app_key, campus_id, weekend_date desc);

notify pgrst, 'reload schema';
