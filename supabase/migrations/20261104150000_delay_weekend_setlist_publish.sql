-- Weekend services that are approved more than 10 days out stay in
-- status 'scheduled' until publish_on (plan_date minus 10 days). An hourly
-- job then posts them and notifies the team. Other ministries are unchanged.

alter table public.draft_sets
  add column if not exists publish_on date;

create index if not exists idx_draft_sets_scheduled_publish
  on public.draft_sets (publish_on)
  where status = 'scheduled';

create or replace function public.run_publish_scheduled_setlists()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_hour int;
  supabase_url text;
  service_key text;
begin
  local_hour := extract(hour from timezone('America/Chicago', now()));
  -- Post on the morning the set is due, and keep retrying through the day
  -- if an earlier attempt did not clear the row. Skip overnight hours.
  if local_hour < 8 or local_hour > 20 then
    return;
  end if;

  if not exists (
    select 1
    from public.draft_sets
    where status = 'scheduled'
      and publish_on <= (timezone('America/Chicago', now()))::date
  ) then
    return;
  end if;

  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('run_publish_scheduled_setlists') c;

  if supabase_url is null or service_key is null then
    return;
  end if;

  perform net.http_post(
    url := supabase_url || '/functions/v1/publish-scheduled-setlists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'publish-scheduled-setlists'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'publish-scheduled-setlists',
    '0 * * * *',
    $cron$select public.run_publish_scheduled_setlists();$cron$
  );
end
$$;
