-- One-off service builder: add sound check / call time to custom services.
ALTER TABLE public.custom_services
  ADD COLUMN IF NOT EXISTS sound_check_time TIME;
