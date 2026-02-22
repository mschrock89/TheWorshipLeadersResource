-- Google Calendar OAuth connection + sync mapping

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text,
  calendar_id text NOT NULL DEFAULT 'primary',
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.google_calendar_event_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('setlist', 'event')),
  source_id uuid NOT NULL,
  google_event_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_event_syncs_source
  ON public.google_calendar_event_syncs(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_google_calendar_event_syncs_user
  ON public.google_calendar_event_syncs(user_id);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_event_syncs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage Google calendar connections" ON public.google_calendar_connections;
CREATE POLICY "Service role can manage Google calendar connections"
ON public.google_calendar_connections
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can delete own Google calendar connection" ON public.google_calendar_connections;
CREATE POLICY "Users can delete own Google calendar connection"
ON public.google_calendar_connections
FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage Google calendar syncs" ON public.google_calendar_event_syncs;
CREATE POLICY "Service role can manage Google calendar syncs"
ON public.google_calendar_event_syncs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own Google calendar syncs" ON public.google_calendar_event_syncs;
CREATE POLICY "Users can view own Google calendar syncs"
ON public.google_calendar_event_syncs
FOR SELECT
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_google_calendar_connections_updated_at ON public.google_calendar_connections;
CREATE TRIGGER update_google_calendar_connections_updated_at
  BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_google_calendar_event_syncs_updated_at ON public.google_calendar_event_syncs;
CREATE TRIGGER update_google_calendar_event_syncs_updated_at
  BEFORE UPDATE ON public.google_calendar_event_syncs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_my_google_calendar_connection()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  google_email text,
  calendar_id text,
  token_expires_at timestamptz,
  connected_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gcc.id,
    gcc.user_id,
    gcc.google_email,
    gcc.calendar_id,
    gcc.token_expires_at,
    gcc.connected_at,
    gcc.updated_at
  FROM public.google_calendar_connections gcc
  WHERE gcc.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_google_calendar_connection() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_google_calendar_connection() TO authenticated;
