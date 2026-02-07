-- Create reference tracks table for Practice Playlists
CREATE TABLE public.setlist_playlist_reference_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.setlist_playlists(id) ON DELETE CASCADE,
  title text NOT NULL,
  audio_url text NOT NULL,
  sequence_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX idx_reference_tracks_playlist 
  ON public.setlist_playlist_reference_tracks(playlist_id);

-- RLS policies
ALTER TABLE public.setlist_playlist_reference_tracks ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reference tracks
CREATE POLICY "Authenticated users can view reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert reference tracks
CREATE POLICY "Admins can insert reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update reference tracks
CREATE POLICY "Admins can update reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR UPDATE TO authenticated
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

-- Only admins can delete reference tracks
CREATE POLICY "Admins can delete reference tracks"
  ON public.setlist_playlist_reference_tracks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );