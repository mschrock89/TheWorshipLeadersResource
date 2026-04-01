-- Normalize Weekend Worship break requests to the canonical `weekend` ministry.
-- This removes the legacy `weekend_team` alias from break request storage.

UPDATE public.break_requests
SET ministry_type = 'weekend'
WHERE ministry_type IN ('weekend_team', 'sunday_am');

CREATE OR REPLACE FUNCTION public.normalize_break_request_ministry_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ministry_type IN ('weekend_team', 'sunday_am') THEN
    NEW.ministry_type := 'weekend';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_break_request_ministry_type ON public.break_requests;

CREATE TRIGGER normalize_break_request_ministry_type
BEFORE INSERT OR UPDATE ON public.break_requests
FOR EACH ROW
EXECUTE FUNCTION public.normalize_break_request_ministry_type();
