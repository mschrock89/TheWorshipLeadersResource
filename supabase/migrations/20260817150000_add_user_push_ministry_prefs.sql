-- Per-user opt-out preferences for ministry-scoped push notifications.
-- Missing row = enabled (default). UI stores enabled = false when muted.

CREATE TABLE public.user_push_ministry_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ministry_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ministry_type)
);

CREATE INDEX user_push_ministry_prefs_user_id_idx
  ON public.user_push_ministry_prefs (user_id);

CREATE OR REPLACE FUNCTION public.set_user_push_ministry_prefs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_push_ministry_prefs_updated_at
  BEFORE UPDATE ON public.user_push_ministry_prefs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_push_ministry_prefs_updated_at();

ALTER TABLE public.user_push_ministry_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push ministry prefs"
  ON public.user_push_ministry_prefs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push ministry prefs"
  ON public.user_push_ministry_prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push ministry prefs"
  ON public.user_push_ministry_prefs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push ministry prefs"
  ON public.user_push_ministry_prefs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
