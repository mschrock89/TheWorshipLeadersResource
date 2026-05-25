alter table public.chat_messages
  add column if not exists resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index if not exists chat_messages_resource_app_campus_ministry_idx
  on public.chat_messages(resource_app_key, campus_id, ministry_type, created_at);

alter table public.message_read_status
  add column if not exists resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

alter table public.message_read_status
  drop constraint if exists message_read_status_user_id_campus_ministry_key;

alter table public.message_read_status
  add constraint message_read_status_user_id_campus_ministry_app_key
  unique (user_id, campus_id, ministry_type, resource_app_key);

create index if not exists message_read_status_resource_app_user_idx
  on public.message_read_status(resource_app_key, user_id, campus_id, ministry_type);

alter table public.swap_requests
  add column if not exists resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index if not exists swap_requests_resource_app_status_idx
  on public.swap_requests(resource_app_key, status, original_date);

create index if not exists swap_requests_resource_app_team_idx
  on public.swap_requests(resource_app_key, team_id, original_date);

alter table public.weekend_rundowns
  add column if not exists resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

alter table public.weekend_rundowns
  drop constraint if exists weekend_rundowns_user_campus_weekend_key;

alter table public.weekend_rundowns
  add constraint weekend_rundowns_user_campus_weekend_app_key
  unique (user_id, campus_id, weekend_date, resource_app_key);

create index if not exists weekend_rundowns_resource_app_campus_weekend_idx
  on public.weekend_rundowns(resource_app_key, campus_id, weekend_date desc);
