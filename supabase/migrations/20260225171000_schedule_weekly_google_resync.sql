-- Auto-run Google Calendar resync for all connected users every Wednesday at 5:00 PM America/Chicago.
create or replace function public.run_google_calendar_weekly_resync()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp;
  local_dow int;
  local_hour int;
  local_minute int;
  supabase_url text;
  service_role_key text;
begin
  local_now := timezone('America/Chicago', now());
  local_dow := extract(isodow from local_now);
  local_hour := extract(hour from local_now);
  local_minute := extract(minute from local_now);

  -- Guard clause because cron runs hourly.
  if local_dow <> 3 or local_hour <> 17 or local_minute <> 0 then
    return;
  end if;

  select decrypted_secret
    into supabase_url
  from vault.decrypted_secrets
  where name = 'supabase_url'
  limit 1;

  select decrypted_secret
    into service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if supabase_url is null or service_role_key is null then
    raise warning 'run_google_calendar_weekly_resync missing vault secrets (supabase_url/service_role_key)';
    return;
  end if;

  perform net.http_post(
    url := supabase_url || '/functions/v1/google-calendar-resync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'run_all', true
    )
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
  where jobname = 'google-calendar-weekly-resync'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'google-calendar-weekly-resync',
    '0 * * * *',
    $cron$select public.run_google_calendar_weekly_resync();$cron$
  );
end
$$;
