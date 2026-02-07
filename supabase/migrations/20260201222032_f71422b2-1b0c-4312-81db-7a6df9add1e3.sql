-- Create setlist_playlists table for auto-generated practice playlists
CREATE TABLE public.setlist_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  ministry_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draft_set_id)
);

-- Enable RLS
ALTER TABLE public.setlist_playlists ENABLE ROW LEVEL SECURITY;

-- Create a security definer function to check if user is scheduled for a service
CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(_user_id UUID, _service_date DATE, _campus_id UUID, _ministry_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      AND ts.campus_id = _campus_id
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
      AND rp.campus_id = _campus_id
      AND _service_date BETWEEN rp.start_date AND rp.end_date
      AND (tm.ministry_types IS NULL OR _ministry_type = ANY(tm.ministry_types))
  )
$$;

-- RLS Policy: Users can only view playlists for services they're scheduled on (and service date >= today)
CREATE POLICY "Users can view their scheduled playlists"
ON public.setlist_playlists
FOR SELECT
USING (
  service_date >= CURRENT_DATE
  AND is_scheduled_for_service(auth.uid(), service_date, campus_id, ministry_type)
);

-- RLS Policy: Admins can view all playlists
CREATE POLICY "Admins can view all playlists"
ON public.setlist_playlists
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to cleanup expired playlists (service_date < today)
CREATE OR REPLACE FUNCTION public.cleanup_expired_setlist_playlists()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.setlist_playlists
  WHERE service_date < CURRENT_DATE;
END;
$$;