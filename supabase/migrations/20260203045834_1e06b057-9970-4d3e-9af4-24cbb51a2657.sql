CREATE TABLE public.reference_track_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_track_id uuid NOT NULL 
    REFERENCES public.setlist_playlist_reference_tracks(id) ON DELETE CASCADE,
  title text NOT NULL,
  timestamp_seconds int NOT NULL DEFAULT 0,
  sequence_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_markers_reference_track 
  ON public.reference_track_markers(reference_track_id);

ALTER TABLE public.reference_track_markers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read markers
CREATE POLICY "Authenticated users can view markers"
  ON public.reference_track_markers
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can manage markers
CREATE POLICY "Admins can manage markers"
  ON public.reference_track_markers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );