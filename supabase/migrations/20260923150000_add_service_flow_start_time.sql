alter table public.service_flows
  add column if not exists start_time time;

comment on column public.service_flows.start_time is
  'Service start entered on this service flow. Used for the calendar rundown clock and does not change other dates.';
