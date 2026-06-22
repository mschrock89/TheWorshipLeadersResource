-- Add an optional time-of-day designation to team schedule entries.
-- Used for ministries like student camp where a single date can have
-- separate morning and evening sessions. NULL means "all day" / unspecified.
ALTER TABLE public.team_schedule
  ADD COLUMN IF NOT EXISTS time_of_day TEXT;

ALTER TABLE public.team_schedule
  DROP CONSTRAINT IF EXISTS team_schedule_time_of_day_check;

ALTER TABLE public.team_schedule
  ADD CONSTRAINT team_schedule_time_of_day_check
  CHECK (time_of_day IS NULL OR time_of_day IN ('morning', 'evening'));
