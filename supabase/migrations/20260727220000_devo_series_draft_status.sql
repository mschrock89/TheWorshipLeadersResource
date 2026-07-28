-- Draft DEVO series: save roster/work-in-progress without notifying or granting access.

ALTER TABLE public.devo_series
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  ADD COLUMN IF NOT EXISTS weeks_to_run integer
    CHECK (weeks_to_run IS NULL OR (weeks_to_run > 0 AND weeks_to_run <= 52));

CREATE INDEX IF NOT EXISTS devo_series_status_idx
  ON public.devo_series(resource_app_key, status, updated_at DESC);

-- Existing rows stay published (default).
UPDATE public.devo_series
SET status = 'published'
WHERE status IS NULL;

NOTIFY pgrst, 'reload schema';
