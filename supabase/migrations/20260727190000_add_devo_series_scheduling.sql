-- DEVO series planner: series window, per-person post schedule, dual instructional pushes.

-- ---------------------------------------------------------------------------
-- 1. Series table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devo_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  resource_app_key text NOT NULL DEFAULT 'worship',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  default_permission_days integer NOT NULL DEFAULT 7
    CHECK (default_permission_days > 0 AND default_permission_days <= 90),
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  ministry_type text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(title) <> ''),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS devo_series_app_starts_idx
  ON public.devo_series(resource_app_key, starts_at DESC);

CREATE OR REPLACE TRIGGER update_devo_series_updated_at
BEFORE UPDATE ON public.devo_series
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.devo_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can insert deo series" ON public.devo_series;
CREATE POLICY "Admins can insert deo series"
  ON public.devo_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Admins can update deo series" ON public.devo_series;
CREATE POLICY "Admins can update deo series"
  ON public.devo_series
  FOR UPDATE
  TO authenticated
  USING (public.has_capability(auth.uid(), 'admin_tools', resource_app_key))
  WITH CHECK (public.has_capability(auth.uid(), 'admin_tools', resource_app_key));

DROP POLICY IF EXISTS "Admins can delete deo series" ON public.devo_series;
CREATE POLICY "Admins can delete deo series"
  ON public.devo_series
  FOR DELETE
  TO authenticated
  USING (public.has_capability(auth.uid(), 'admin_tools', resource_app_key));

-- ---------------------------------------------------------------------------
-- 2. Assignment schedule + push tracking columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.devo_assignments
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.devo_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_post_at timestamptz,
  ADD COLUMN IF NOT EXISTS permission_duration_days integer
    CHECK (permission_duration_days IS NULL OR (permission_duration_days > 0 AND permission_duration_days <= 90)),
  ADD COLUMN IF NOT EXISTS assign_push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS devo_assignments_series_idx
  ON public.devo_assignments(series_id, scheduled_post_at);

CREATE INDEX IF NOT EXISTS devo_assignments_reminder_due_idx
  ON public.devo_assignments(scheduled_post_at)
  WHERE reminder_push_sent_at IS NULL
    AND status IN ('assigned', 'guide_uploaded')
    AND scheduled_post_at IS NOT NULL;

-- Series SELECT can reference series_id only after the column exists.
DROP POLICY IF EXISTS "Assignees and admins can view deo series" ON public.devo_series;
CREATE POLICY "Assignees and admins can view deo series"
  ON public.devo_series
  FOR SELECT
  TO authenticated
  USING (
    public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
    OR EXISTS (
      SELECT 1
      FROM public.devo_assignments a
      WHERE a.series_id = devo_series.id
        AND a.assignee_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Push definition seeds (instructional Feed how-to)
-- ---------------------------------------------------------------------------
INSERT INTO public.push_notification_definitions (
  key, label, category, description, trigger_description, recipients_description,
  title_template, body_template, deep_link_url, template_variables,
  enabled, content_from_db, is_system, sort_order
) VALUES
(
  'devo-assigned',
  'DEVO Assigned',
  'DEVO',
  'Sent when someone is assigned to write a devotion for The Feed.',
  'Creating a DEVO assignment in DEVO Admin',
  'The assigned team member',
  'You''re writing {{chapter}}',
  'Post by {{post_day}} at {{post_time}}. Open your profile badge → DEVO → upload your guide → tap Post to The Feed. The composer opens with your chapter ready.',
  '/devo',
  ARRAY['chapter', 'post_day', 'post_time', 'series_title'],
  true,
  true,
  true,
  210
),
(
  'devo-post-reminder',
  'DEVO Post Reminder',
  'DEVO',
  'Reminder at the scheduled post day/time with Feed posting instructions.',
  'Scheduled post time for a DEVO assignment (cron every 15 minutes)',
  'The assigned team member',
  'Time to post {{chapter}}',
  'It''s your DEVO day. Open The Feed, tap compose, add your reflection for {{chapter}}, and publish. Need the guide? Profile badge → DEVO.',
  '/feed?compose=scripture&reference={{chapter}}',
  ARRAY['chapter', 'post_day', 'post_time', 'series_title'],
  true,
  true,
  true,
  220
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  trigger_description = EXCLUDED.trigger_description,
  recipients_description = EXCLUDED.recipients_description,
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link_url = EXCLUDED.deep_link_url,
  template_variables = EXCLUDED.template_variables,
  content_from_db = EXCLUDED.content_from_db,
  sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 4. Cron: every 15 minutes → notify-devo-post-reminders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_devo_post_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key text;
BEGIN
  SELECT c.supabase_url, c.service_key
  INTO supabase_url, service_key
  FROM public.push_dispatch_config('run_devo_post_reminders') c;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-devo-post-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'devo-post-reminders'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'devo-post-reminders',
    '*/15 * * * *',
    $cron$SELECT public.run_devo_post_reminders();$cron$
  );
END
$$;

NOTIFY pgrst, 'reload schema';
